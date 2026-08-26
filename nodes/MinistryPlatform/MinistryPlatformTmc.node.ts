import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { tableDescription } from './resources/table';
import { procedureDescription } from './resources/procedure';
import { communicationDescription } from './resources/communication';
import { fileDescription } from './resources/file';
import { getTables } from './listSearch/getTables';
import { getProcedures } from './listSearch/getProcedures';
import { getTableFields } from './listSearch/getTableFields';
import { mpApiRequest, mpApiRequestBinary, mpApiRequestMultipart } from './shared/transport';
import { encodeMultipart } from './shared/multipart';
import { appendPkTiebreaker, planPaginationOrder } from './shared/pagination';
import { prefixProcParams, shapeProcResults } from './shared/procedureResults';
import type { MultipartPart } from './shared/multipart';
import type { ResultSetHandling } from './shared/procedureResults';

/** MP's API rejects request bodies over ~20 MB; check before sending. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Validates that a path segment is safe for URL interpolation.
 * Rejects traversal sequences, slashes, and non-printable characters.
 */
function validatePathSegment(value: string, label: string, itemIndex: number, node: IExecuteFunctions): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new NodeOperationError(node.getNode(), `${label} is required and must not be empty`, {
			itemIndex,
		});
	}
	if (/[/\\]|\.\./.test(trimmed)) {
		throw new NodeOperationError(
			node.getNode(),
			`${label} contains invalid characters (slashes or path traversal sequences are not allowed)`,
			{ itemIndex },
		);
	}
	return trimmed;
}

/**
 * Extract the string value from a resourceLocator parameter.
 */
function resolveLocator(locator: IDataObject | string): string {
	if (typeof locator === 'string') {
		return locator;
	}
	if (locator && typeof locator === 'object' && 'value' in locator) {
		return String(locator.value ?? '');
	}
	return '';
}

/**
 * Read and validate the table + record ID pair shared by the record-scoped
 * file operations (Get Many, Upload). Returns URL-safe raw segments — callers
 * still encodeURIComponent them at interpolation.
 */
function getFileRecordTarget(
	node: IExecuteFunctions,
	itemIndex: number,
): { tableName: string; recordId: string } {
	const tableLocator = node.getNodeParameter('tableName', itemIndex) as IDataObject | string;
	const tableName = validatePathSegment(
		resolveLocator(tableLocator),
		'Table name',
		itemIndex,
		node,
	);
	const recordId = String(node.getNodeParameter('recordId', itemIndex)).trim();
	if (!/^\d+$/.test(recordId) || Number(recordId) < 1) {
		throw new NodeOperationError(node.getNode(), 'Record ID must be a positive integer', {
			itemIndex,
		});
	}
	return { tableName, recordId };
}

/**
 * Safely parse a JSON string, returning a typed result or throwing a clear error.
 */
function safeJsonParse<T>(json: string, label: string, itemIndex: number, node: IExecuteFunctions): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		throw new NodeOperationError(
			node.getNode(),
			`Invalid JSON in "${label}": check syntax and try again`,
			{ itemIndex },
		);
	}
}

/**
 * Wrap API response into an array of IDataObject, guarding against null/primitive responses.
 */
function toRecordArray(response: unknown): IDataObject[] {
	if (response == null) {
		return [];
	}
	if (Array.isArray(response)) {
		return response as IDataObject[];
	}
	if (typeof response === 'object') {
		return [response as IDataObject];
	}
	return [{ value: response } as IDataObject];
}

/**
 * Coerce a query option value to a string for clause inspection — n8n
 * expressions can resolve non-string values into string-typed options
 * (e.g. an $orderby of 1).
 */
function toOptionalString(value: unknown): string | undefined {
	if (value == null || value === '') {
		return undefined;
	}
	return typeof value === 'string' ? value : String(value);
}

/**
 * Discover a table's primary key by fetching a single default-select record:
 * MP returns columns in schema order and the first column is the PK. Returns
 * null (never throws) for empty tables or API errors — pagination proceeds
 * without a sort tiebreaker in that case.
 */
async function probeTablePrimaryKey(
	context: IExecuteFunctions,
	tableName: string,
): Promise<string | null> {
	try {
		const response = await mpApiRequest.call(context, 'GET', `/tables/${tableName}`, {
			$top: 1,
		});
		if (Array.isArray(response) && response.length > 0) {
			return Object.keys(response[0] as IDataObject)[0] ?? null;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Redact sensitive values from error messages before exposing them in workflow data.
 */
function sanitizeErrorMessage(message: string): string {
	return message
		.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
		.replace(/client_secret[=:]\s*\S+/gi, 'client_secret=[REDACTED]')
		.replace(/access_token[=:]\s*\S+/gi, 'access_token=[REDACTED]');
}

// ── Filter builder helpers ───────────────────────────────────────────────────

function escapeFilterValue(value: string): string {
	return value.replace(/'/g, "''");
}

/**
 * Format a value for a SQL WHERE clause.
 * Numbers stay unquoted, booleans become 1/0, everything else is single-quoted.
 */
function formatFilterValue(value: string): string {
	const trimmed = value.trim();
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
	if (trimmed.toLowerCase() === 'true') return '1';
	if (trimmed.toLowerCase() === 'false') return '0';
	return `'${escapeFilterValue(trimmed)}'`;
}

/**
 * Build a SQL WHERE clause from the GUI filter conditions.
 */
function buildFilterString(
	conditions: Array<{ field: string; operator: string; value?: string }>,
	combine: string,
): string {
	const parts: string[] = [];

	for (const { field, operator, value } of conditions) {
		if (!field) continue;
		const v = value ?? '';

		switch (operator) {
			case 'eq':
				parts.push(`${field} = ${formatFilterValue(v)}`);
				break;
			case '<>':
			case '>':
			case '>=':
			case '<':
			case '<=':
				parts.push(`${field} ${operator} ${formatFilterValue(v)}`);
				break;
			case 'LIKE':
				parts.push(`${field} LIKE '%${escapeFilterValue(v)}%'`);
				break;
			case 'NOT LIKE':
				parts.push(`${field} NOT LIKE '%${escapeFilterValue(v)}%'`);
				break;
			case 'STARTS_WITH':
				parts.push(`${field} LIKE '${escapeFilterValue(v)}%'`);
				break;
			case 'ENDS_WITH':
				parts.push(`${field} LIKE '%${escapeFilterValue(v)}'`);
				break;
			case 'IS NULL':
				parts.push(`${field} IS NULL`);
				break;
			case 'IS NOT NULL':
				parts.push(`${field} IS NOT NULL`);
				break;
			case 'IN':
			case 'NOT IN': {
				const items = v.split(',').map((item) => formatFilterValue(item));
				parts.push(`${field} ${operator} (${items.join(', ')})`);
				break;
			}
		}
	}

	return parts.join(` ${combine} `);
}

// ── Column qualification ────────────────────────────────────────────────────
//
// MP's API generates SQL that joins related tables when $select uses FK syntax
// (e.g. `Foo_ID_Table.Bar`). If any other clause then references a bare column
// name that exists on both the base table and a joined table, SQL Server throws
// "Ambiguous column name". We pre-qualify bare identifiers with the selected
// table name so the user can keep filters/sorts simple.

const SQL_RESERVED = new Set([
	'AND', 'OR', 'NOT', 'NULL', 'IS', 'LIKE', 'IN', 'BETWEEN',
	'AS', 'ASC', 'DESC', 'TRUE', 'FALSE',
	'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
	'EXISTS', 'ALL', 'ANY', 'SOME', 'UNION', 'INTERSECT', 'EXCEPT',
	'DISTINCT', 'TOP', 'OVER',
]);

function qualifyIdentifiersInSegment(segment: string, tableName: string): string {
	return segment.replace(
		/(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)(?![\w(.])/g,
		(match, _g1: string, offset: number, full: string) => {
			if (SQL_RESERVED.has(match.toUpperCase())) return match;
			// Skip aliases — identifier following an `AS` keyword is a label, not a column.
			const before = full.substring(0, offset).replace(/\s+$/, '');
			if (/\bAS$/i.test(before)) return match;
			return `${tableName}.${match}`;
		},
	);
}

/**
 * Prefix bare column references in a SQL-shaped expression with the given table
 * name. Skips already-prefixed identifiers, SQL keywords, function calls,
 * string literals, and AS aliases.
 */
function qualifyColumnNames(expr: string | undefined, tableName: string): string | undefined {
	if (!expr || !tableName) return expr;
	const result: string[] = [];
	let i = 0;
	while (i < expr.length) {
		if (expr[i] === "'") {
			// Copy through the closing quote, honoring '' as an escaped single quote.
			let j = i + 1;
			while (j < expr.length) {
				if (expr[j] === "'") {
					if (expr[j + 1] === "'") {
						j += 2;
						continue;
					}
					j++;
					break;
				}
				j++;
			}
			result.push(expr.substring(i, j));
			i = j;
		} else {
			let j = i;
			while (j < expr.length && expr[j] !== "'") j++;
			result.push(qualifyIdentifiersInSegment(expr.substring(i, j), tableName));
			i = j;
		}
	}
	return result.join('');
}

/**
 * Apply column qualification to clauses where SQL Server ambiguity actually
 * fires. We deliberately skip `$select`: MP resolves bare select columns
 * flexibly (including columns that live on joined tables), and forcibly
 * prefixing them with the base table can produce "Invalid column name" errors.
 */
function qualifyQueryClauses(qs: IDataObject, tableName: string): void {
	for (const key of ['$filter', '$orderby', '$groupby', '$having'] as const) {
		const value = qs[key];
		if (typeof value === 'string' && value.length > 0) {
			qs[key] = qualifyColumnNames(value, tableName);
		}
	}
}

export class MinistryPlatformTmc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ministry Platform (Moody)',
		name: 'ministryPlatformTmc',
		icon: 'file:../../icons/ministry-platform.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read and write data from Ministry Platform, a church management database. Common tables: Contacts, Events, Groups, Participants, Group_Participants, Households, Activities, Event_Participants. Filter syntax is SQL WHERE (e.g. Display_Name LIKE \'%Smith%\'). Limit concurrency to ~6.',
		defaults: {
			name: 'Ministry Platform',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'ministryPlatformTmcApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Communication',
						value: 'communication',
					},
					{
						name: 'File',
						value: 'file',
					},
					{
						name: 'Stored Procedure',
						value: 'procedure',
					},
					{
						name: 'Table',
						value: 'table',
					},
				],
				default: 'table',
			},
			...communicationDescription,
			...fileDescription,
			...procedureDescription,
			...tableDescription,
		],
	};

	methods = {
		listSearch: {
			getTables,
			getProcedures,
			getTableFields,
		},
		loadOptions: {
			async getFieldsForFilter(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				try {
					const tableParam = this.getNodeParameter('tableName') as
						| IDataObject
						| string;
					const tableName =
						typeof tableParam === 'string'
							? tableParam
							: String((tableParam as IDataObject).value ?? '');

					if (!tableName || /[/\\]|\.\./.test(tableName)) return [];

					const response = await mpApiRequest.call(this, 'GET', `/tables/${tableName}`, {
						$top: 1,
					});

					if (Array.isArray(response) && response.length > 0) {
						return Object.keys(response[0] as IDataObject)
							.sort()
							.map((field) => ({ name: field, value: field }));
					}
					return [];
				} catch {
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Primary keys probed for pagination sort tiebreakers, cached per
		// execution (null = empty table or failed probe; not re-probed per item).
		const pkCache = new Map<string, string | null>();

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'table') {
					const tableLocator = this.getNodeParameter('tableName', i) as IDataObject | string;
					const tableName = validatePathSegment(
						resolveLocator(tableLocator),
						'Table name',
						i,
						this,
					);

					if (operation === 'getAll') {
						// Build filter from GUI conditions
						const filterData = this.getNodeParameter(
							'filterConditions',
							i,
							{},
						) as IDataObject;
						const conditions = (
							(filterData.conditions ?? []) as IDataObject[]
						).map((c) => ({
							field: c.field as string,
							operator: c.operator as string,
							value: c.value as string | undefined,
						}));
						const filterCombine = this.getNodeParameter(
							'filterCombine',
							i,
							'AND',
						) as string;
						const builderFilter =
							conditions.length > 0
								? buildFilterString(conditions, filterCombine)
								: '';

						const queryOpts = this.getNodeParameter('queryOptions', i, {}) as IDataObject;
						const qs: IDataObject = {};

						for (const [key, value] of Object.entries(queryOpts)) {
							if (value !== '' && value !== 0 && value !== false) {
								qs[key] = value;
							}
						}

						// Merge builder filter with any raw $filter from Query Options
						if (builderFilter) {
							if (qs['$filter']) {
								qs['$filter'] = `(${builderFilter}) AND (${qs['$filter']})`;
							} else {
								qs['$filter'] = builderFilter;
							}
						}

						// Merge column picker with any raw $select
						const selectColumns = this.getNodeParameter(
							'selectColumns',
							i,
							[],
						) as string[];
						if (selectColumns.length > 0) {
							const pickerSelect = selectColumns.join(', ');
							qs['$select'] = qs['$select']
								? `${pickerSelect}, ${qs['$select']}`
								: pickerSelect;
						}

						// Merge sort builder with any raw $orderby
						const orderByData = this.getNodeParameter(
							'orderByConditions',
							i,
							{},
						) as IDataObject;
						const sorts = ((orderByData.sorts ?? []) as IDataObject[])
							.filter((s) => s.field)
							.map((s) => `${s.field} ${s.direction ?? 'ASC'}`)
							.join(', ');
						if (sorts) {
							qs['$orderby'] = qs['$orderby']
								? `${sorts}, ${qs['$orderby']}`
								: sorts;
						}

						// Auto-paginate in 1000-record batches.
						// If $top is set, respect it as the max records to return.
						const PAGE_SIZE = 1000;
						const maxRecords = qs['$top'] ? Number(qs['$top']) : 0;
						let skip = qs['$skip'] ? Number(qs['$skip']) : 0;
						delete qs['$top'];
						delete qs['$skip'];

						// $skip/$top paging has no ordering guarantee without a
						// deterministic ORDER BY — SQL Server may order each page's scan
						// differently, silently duplicating rows on one page and dropping
						// them from another. Append the table's primary key as a sort
						// tiebreaker whenever the fetch can span multiple pages or uses a
						// $skip offset window (whose contents are equally undefined
						// without a total order).
						const plan = planPaginationOrder({
							orderby: toOptionalString(qs['$orderby']),
							groupby: toOptionalString(qs['$groupby']),
							having: toOptionalString(qs['$having']),
							select: toOptionalString(qs['$select']),
							distinct: qs['$distinct'] === true || qs['$distinct'] === 'true',
							maxRecords,
							skip,
							pageSize: PAGE_SIZE,
						});
						if (plan.kind === 'unsafe-order' && !plan.hasUserOrderBy && skip > 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Query on "${tableName}" uses $skip together with $groupby, $having, aggregates, or $distinct but has no $orderby. ` +
									'An offset window is not deterministic without an explicit sort — add $orderby on the grouped/selected columns in Query Options.',
								{ itemIndex: i },
							);
						}
						if (plan.kind === 'tiebreaker') {
							if (!pkCache.has(tableName)) {
								pkCache.set(tableName, await probeTablePrimaryKey(this, tableName));
							}
							const primaryKey = pkCache.get(tableName);
							if (primaryKey) {
								qs['$orderby'] = appendPkTiebreaker(
									toOptionalString(qs['$orderby']),
									primaryKey,
									tableName,
								);
							}
						}

						// Pre-qualify bare column references against the selected table so
						// queries with FK joins don't trigger SQL Server "Ambiguous column"
						// errors when MP wraps the query for pagination/aggregation.
						qualifyQueryClauses(qs, tableName);

						let fetched = 0;
						let hasMore = true;
						let pageIndex = 0;

						while (hasMore) {
							const batchSize =
								maxRecords > 0
									? Math.min(PAGE_SIZE, maxRecords - fetched)
									: PAGE_SIZE;

							if (batchSize <= 0) break;

							const pageQs = { ...qs, $top: batchSize, $skip: skip };
							const response = await mpApiRequest.call(
								this,
								'GET',
								`/tables/${tableName}`,
								pageQs,
							);
							const records = toRecordArray(response);

							// Grouped/distinct queries can't take the PK tiebreaker, so a
							// result that actually spans pages is nondeterministic without
							// an explicit sort — fail instead of returning corrupt data.
							if (
								pageIndex > 0 &&
								records.length > 0 &&
								plan.kind === 'unsafe-order' &&
								!plan.hasUserOrderBy
							) {
								throw new NodeOperationError(
									this.getNode(),
									`Query on "${tableName}" uses $groupby, $having, aggregates, or $distinct and returned more than ${PAGE_SIZE} rows. ` +
										'Pagination is not deterministic without an explicit sort — add $orderby on the grouped/selected columns ' +
										`in Query Options, or set $top to ${PAGE_SIZE} or less.`,
									{ itemIndex: i },
								);
							}

							for (const record of records) {
								returnData.push({ json: record, pairedItem: i });
							}

							fetched += records.length;
							skip += records.length;
							hasMore = records.length === batchSize;
							pageIndex++;
						}
					} else if (operation === 'get') {
						const recordId = validatePathSegment(
							this.getNodeParameter('recordId', i) as string,
							'Record ID',
							i,
							this,
						);
						const selectColumns = this.getNodeParameter('selectColumns', i, '') as string;
						const qs: IDataObject = {};

						if (selectColumns) {
							qs['$select'] = selectColumns;
						}

						const response = await mpApiRequest.call(
							this,
							'GET',
							`/tables/${tableName}/${recordId}`,
							qs,
						);

						const records = toRecordArray(response);
						returnData.push({
							json: records[0] ?? {},
							pairedItem: i,
						});
					} else if (operation === 'create') {
						const inputMode = this.getNodeParameter('inputMode', i) as string;
						const responseSelect = this.getNodeParameter('responseSelect', i, '') as string;
						const auditUserId = this.getNodeParameter('auditUserId', i, 0) as number;
						const qs: IDataObject = {};
						let body: IDataObject[];

						if (responseSelect) {
							qs['$select'] = responseSelect;
						}
						if (auditUserId > 0) {
							qs['$User'] = auditUserId;
						}

						if (inputMode === 'fieldMapping') {
							const mappings = this.getNodeParameter(
								'fieldMappings.field',
								i,
								[],
							) as Array<{ fieldName: IDataObject | string; fieldValue: string }>;

							const record: IDataObject = {};
							for (const mapping of mappings) {
								const name = resolveLocator(mapping.fieldName);
								if (name) {
									record[name] = mapping.fieldValue;
								}
							}
							body = [record];
						} else {
							const fieldsJson = this.getNodeParameter('fields', i) as string;
							body = safeJsonParse<IDataObject[]>(fieldsJson, 'Fields (JSON)', i, this);
						}

						const response = await mpApiRequest.call(
							this,
							'POST',
							`/tables/${tableName}`,
							qs,
							body,
						);

						for (const record of toRecordArray(response)) {
							returnData.push({ json: record, pairedItem: i });
						}
					} else if (operation === 'delete') {
						const recordIdStr = this.getNodeParameter('recordId', i) as string;
						const auditUserId = this.getNodeParameter('auditUserId', i, 0) as number;
						const ids = recordIdStr.split(',').map((s) => s.trim()).filter((s) => s);

						if (ids.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one Record ID is required for delete',
								{ itemIndex: i },
							);
						}

						if (ids.length === 1) {
							// Single delete: DELETE /tables/{table}/{id}
							const singleId = validatePathSegment(ids[0], 'Record ID', i, this);
							const qs: IDataObject = {};
							if (auditUserId > 0) {
								qs['$User'] = auditUserId;
							}

							await mpApiRequest.call(
								this,
								'DELETE',
								`/tables/${tableName}/${singleId}`,
								qs,
							);

							returnData.push({
								json: { success: true, deleted: singleId, table: tableName },
								pairedItem: i,
							});
						} else {
							// Bulk delete: POST /tables/{table}/delete
							const numericIds = ids.map((id) => {
								const parsed = parseInt(id, 10);
								if (isNaN(parsed) || parsed < 1) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid ID for bulk delete: "${id}"`,
										{ itemIndex: i },
									);
								}
								return parsed;
							});

							const deleteBody: IDataObject = { Ids: numericIds };
							if (auditUserId > 0) {
								deleteBody.User = auditUserId;
							}

							await mpApiRequest.call(
								this,
								'POST',
								`/tables/${tableName}/delete`,
								{},
								deleteBody,
							);

							returnData.push({
								json: {
									success: true,
									deleted: numericIds,
									count: numericIds.length,
									table: tableName,
								},
								pairedItem: i,
							});
						}
					} else if (operation === 'update') {
						const inputMode = this.getNodeParameter('inputMode', i) as string;
						const responseSelect = this.getNodeParameter('responseSelect', i, '') as string;
						const auditUserId = this.getNodeParameter('auditUserId', i, 0) as number;
						const allowCreate = this.getNodeParameter('allowCreate', i, false) as boolean;
						const qs: IDataObject = {};
						let body: IDataObject[];

						if (responseSelect) {
							qs['$select'] = responseSelect;
						}
						if (auditUserId > 0) {
							qs['$User'] = auditUserId;
						}
						if (allowCreate) {
							qs['$allowCreate'] = 'true';
						}

						if (inputMode === 'fieldMapping') {
							const recordId = this.getNodeParameter('recordId', i) as string;
							const pkLocator = this.getNodeParameter('primaryKeyField', i, '') as
								| IDataObject
								| string;
							const pkField = resolveLocator(pkLocator);
							const mappings = this.getNodeParameter(
								'fieldMappings.field',
								i,
								[],
							) as Array<{ fieldName: IDataObject | string; fieldValue: string }>;

							const record: IDataObject = {};
							for (const mapping of mappings) {
								const name = resolveLocator(mapping.fieldName);
								if (name) {
									record[name] = mapping.fieldValue;
								}
							}

							if (!pkField) {
								throw new NodeOperationError(
									this.getNode(),
									'Primary Key Field is required when using Field Mapping mode for updates',
									{ itemIndex: i },
								);
							}
							record[pkField] = recordId;

							body = [record];
						} else {
							const fieldsJson = this.getNodeParameter('fields', i) as string;
							body = safeJsonParse<IDataObject[]>(fieldsJson, 'Fields (JSON)', i, this);
						}

						const response = await mpApiRequest.call(
							this,
							'PUT',
							`/tables/${tableName}`,
							qs,
							body,
						);

						for (const record of toRecordArray(response)) {
							returnData.push({ json: record, pairedItem: i });
						}
					}
				} else if (resource === 'communication') {
					if (operation === 'send') {
						const communicationType = this.getNodeParameter('communicationType', i) as string;
						const authorUserId = this.getNodeParameter('authorUserId', i) as number;
						const fromContactId = this.getNodeParameter('fromContactId', i) as number;
						const replyToContactId = this.getNodeParameter('replyToContactId', i) as number;
						const subject = this.getNodeParameter('subject', i) as string;
						const bodyContent = this.getNodeParameter('body', i) as string;
						const contactsRaw = this.getNodeParameter('contacts', i) as
							| string
							| number
							| Array<string | number>;
						const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

						// Accept a number (single ID via expression), an array of IDs, or
						// a comma-separated string typed by hand. Normalize into number[].
						const rawTokens: Array<string | number> = Array.isArray(contactsRaw)
							? contactsRaw
							: typeof contactsRaw === 'string'
								? contactsRaw.split(',')
								: [contactsRaw];

						const contacts = rawTokens
							.map((token) => String(token).trim())
							.filter((token) => token.length > 0)
							.map((token) => {
								const parsed = parseInt(token, 10);
								if (isNaN(parsed) || parsed < 1) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid contact ID: "${token}"`,
										{ itemIndex: i },
									);
								}
								return parsed;
							});

						if (contacts.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one Recipient Contact ID is required',
								{ itemIndex: i },
							);
						}

						const communicationBody: IDataObject = {
							CommunicationType: communicationType,
							AuthorUserId: authorUserId,
							FromContactId: fromContactId,
							ReplyToContactId: replyToContactId,
							Subject: subject,
							Body: bodyContent,
							Contacts: contacts,
						};

						if (additionalOptions.isBulkEmail !== undefined) {
							communicationBody.IsBulkEmail = additionalOptions.isBulkEmail;
						}
						if (additionalOptions.startDate) {
							communicationBody.StartDate = additionalOptions.startDate;
						}
						if (additionalOptions.textPhoneNumberId) {
							communicationBody.TextPhoneNumberId = additionalOptions.textPhoneNumberId;
						}

						const response = await mpApiRequest.call(
							this,
							'POST',
							'/communications',
							{},
							communicationBody,
						);

						const records = toRecordArray(response);
						returnData.push({
							json: records[0] ?? { success: true },
							pairedItem: i,
						});
					}
				} else if (resource === 'file') {
					if (operation === 'get') {
						const uniqueFileId = validatePathSegment(
							this.getNodeParameter('uniqueFileId', i) as string,
							'Unique File ID',
							i,
							this,
						);
						const thumbnail = this.getNodeParameter('thumbnail', i, false) as boolean;
						const qs: IDataObject = {};

						if (thumbnail) {
							qs['$thumbnail'] = true;
						}

						const binaryData = await mpApiRequestBinary.call(
							this,
							`/files/${uniqueFileId}`,
							qs,
						);

						const buffer = Buffer.isBuffer(binaryData)
							? binaryData
							: Buffer.from(binaryData);

						const binary = await this.helpers.prepareBinaryData(buffer, uniqueFileId);

						returnData.push({
							json: { fileId: uniqueFileId, thumbnail },
							binary: { data: binary },
							pairedItem: i,
						});
					} else if (operation === 'getAll') {
						const { tableName, recordId } = getFileRecordTarget(this, i);
						// Expressions can resolve booleans as the string 'true'/'false'.
						const defaultOnly = this.getNodeParameter('defaultOnly', i, false);

						const qs: IDataObject = {};
						if (defaultOnly === true || defaultOnly === 'true') {
							qs['$default'] = true;
						}

						const response = await mpApiRequest.call(
							this,
							'GET',
							`/files/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
							qs,
						);

						for (const record of toRecordArray(response)) {
							returnData.push({ json: record, pairedItem: i });
						}
					} else if (operation === 'upload') {
						const { tableName, recordId } = getFileRecordTarget(this, i);

						const binaryFieldsRaw = String(this.getNodeParameter('binaryPropertyName', i));
						const binaryFields = [
							...new Set(
								binaryFieldsRaw
									.split(',')
									.map((s) => s.trim())
									.filter((s) => s),
							),
						];
						if (binaryFields.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'At least one input binary field name is required',
								{ itemIndex: i },
							);
						}

						// MP expects the parts of one upload request to be named file-0, file-1, ...
						const parts: MultipartPart[] = [];
						for (const [index, fieldName] of binaryFields.entries()) {
							const binaryData = this.helpers.assertBinaryData(i, fieldName);
							const buffer = await this.helpers.getBinaryDataBuffer(i, fieldName);
							parts.push({
								name: `file-${index}`,
								// ASP.NET only treats parts carrying a filename attribute as files.
								filename: binaryData.fileName || `file-${index}`,
								contentType: binaryData.mimeType || 'application/octet-stream',
								data: buffer,
							});
						}

						// Check size before encoding: Buffer.concat would hold a second full
						// copy of an oversized payload just to throw afterwards.
						const totalBytes = parts.reduce((sum, part) => sum + part.data.length, 0);
						if (totalBytes > MAX_UPLOAD_BYTES) {
							throw new NodeOperationError(
								this.getNode(),
								`Upload is ~${Math.round(totalBytes / (1024 * 1024))} MB, which exceeds the MP API's ~20 MB request limit. Split the files across multiple upload operations.`,
								{ itemIndex: i },
							);
						}

						// Expression values can arrive as the "wrong" primitive (string "96"
						// for a number field, etc.) — coerce instead of silently dropping.
						const additionalFields = this.getNodeParameter(
							'additionalFields',
							i,
							{},
						) as IDataObject;
						const qs: IDataObject = {};
						if (additionalFields.description != null && additionalFields.description !== '') {
							qs['$description'] = String(additionalFields.description);
						}
						// No-op values are omitted rather than sent: buildQueryString would
						// drop a boolean false or numeric 0 anyway, and MP's behavior for an
						// explicit $default=false is unverified.
						if (
							additionalFields.setAsDefaultImage === true ||
							additionalFields.setAsDefaultImage === 'true'
						) {
							qs['$default'] = true;
						}
						const longestDimension = Number(additionalFields.longestDimension);
						if (Number.isFinite(longestDimension) && longestDimension > 0) {
							qs['$longestDimension'] = Math.floor(longestDimension);
						}
						// The /files endpoints take $userId for audit attribution — unlike
						// /tables writes ($User) and the table read Query Options $userId
						// (Global Filter evaluation), which are different things.
						const auditUserId = Number(additionalFields.auditUserId);
						if (Number.isInteger(auditUserId) && auditUserId > 0) {
							qs['$userId'] = auditUserId;
						}

						const { body, contentType } = encodeMultipart(parts);
						const response = await mpApiRequestMultipart.call(
							this,
							`/files/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
							qs,
							body,
							contentType,
						);

						// One item per returned FileDescription; keep the item visible even
						// if a tenant variation returns an empty success body.
						const records = toRecordArray(response);
						if (records.length === 0) {
							returnData.push({ json: { success: true }, pairedItem: i });
						}
						for (const record of records) {
							returnData.push({ json: record, pairedItem: i });
						}
					}
				} else if (resource === 'procedure') {
					if (operation === 'list') {
						const procSearch = this.getNodeParameter('procSearch', i, '') as string;
						const qs: IDataObject = {};

						if (procSearch) {
							qs['$search'] = procSearch;
						}

						const response = await mpApiRequest.call(this, 'GET', '/procs', qs);

						for (const record of toRecordArray(response)) {
							returnData.push({ json: record, pairedItem: i });
						}
					} else if (operation === 'execute') {
						const procLocator = this.getNodeParameter('procedureName', i) as IDataObject | string;
						const procName = validatePathSegment(
							resolveLocator(procLocator),
							'Stored procedure name',
							i,
							this,
						);
						// A json-type parameter is normally a string, but an expression can
						// resolve to an object directly — accept both.
						const rawParams = this.getNodeParameter('parameters', i, '{}');
						const parsedParams =
							typeof rawParams === 'string'
								? safeJsonParse<IDataObject>(rawParams, 'Parameters (JSON)', i, this)
								: (rawParams as IDataObject);
						if (
							parsedParams === null ||
							typeof parsedParams !== 'object' ||
							Array.isArray(parsedParams)
						) {
							throw new NodeOperationError(
								this.getNode(),
								'Parameters (JSON) must be a JSON object of parameter names and values',
								{ itemIndex: i },
							);
						}
						// MP requires @-prefixed parameter names; add the prefix when omitted.
						const body = prefixProcParams(parsedParams);

						const resultSetHandling = this.getNodeParameter(
							'resultSetHandling',
							i,
							'firstResultSet',
						) as ResultSetHandling;

						const response = await mpApiRequest.call(
							this,
							'POST',
							`/procs/${procName}`,
							{},
							body,
						);

						for (const record of shapeProcResults(response, resultSetHandling)) {
							returnData.push({ json: record, pairedItem: i });
						}
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: sanitizeErrorMessage((error as Error).message) },
						pairedItem: i,
					});
				} else {
					if ((error as NodeOperationError).context) {
						(error as NodeOperationError).context.itemIndex = i;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}
		}

		return [returnData];
	}
}
