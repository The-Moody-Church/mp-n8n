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
import { mpApiRequest, mpApiRequestBinary } from './shared/transport';

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

export class MinistryPlatform implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ministry Platform',
		name: 'ministryPlatform',
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
				name: 'ministryPlatformApi',
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

						let fetched = 0;
						let hasMore = true;

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

							for (const record of records) {
								returnData.push({ json: record, pairedItem: i });
							}

							fetched += records.length;
							skip += records.length;
							hasMore = records.length === batchSize;
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
						const contactsStr = this.getNodeParameter('contacts', i) as string;
						const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;

						const contacts = contactsStr.split(',').map((idStr) => {
							const parsed = parseInt(idStr.trim(), 10);
							if (isNaN(parsed) || parsed < 1) {
								throw new NodeOperationError(
									this.getNode(),
									`Invalid contact ID: "${idStr.trim()}"`,
									{ itemIndex: i },
								);
							}
							return parsed;
						});

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
						const paramsJson = this.getNodeParameter('parameters', i, '{}') as string;
						const body = safeJsonParse<IDataObject>(paramsJson, 'Parameters (JSON)', i, this);

						const response = await mpApiRequest.call(
							this,
							'POST',
							`/procs/${procName}`,
							{},
							body,
						);

						for (const record of toRecordArray(response)) {
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
