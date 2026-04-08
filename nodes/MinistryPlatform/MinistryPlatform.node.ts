import type {
	IExecuteFunctions,
	INodeExecutionData,
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

export class MinistryPlatform implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ministry Platform',
		name: 'ministryPlatform',
		icon: 'file:../../icons/ministry-platform.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read and write data from Ministry Platform via the REST API. Tip: avoid firing many MP nodes in parallel — the API supports ~6 concurrent connections before timing out.',
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
						const queryOpts = this.getNodeParameter('queryOptions', i, {}) as IDataObject;
						const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
						const qs: IDataObject = {};

						for (const [key, value] of Object.entries(queryOpts)) {
							if (value !== '' && value !== 0 && value !== false) {
								qs[key] = value;
							}
						}

						if (returnAll) {
							// Auto-paginate in 1000-record batches
							const PAGE_SIZE = 1000;
							let skip = 0;
							let hasMore = true;

							while (hasMore) {
								const pageQs = { ...qs, $top: PAGE_SIZE, $skip: skip };
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

								hasMore = records.length === PAGE_SIZE;
								skip += PAGE_SIZE;
							}
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;

							// Override user's $top if they set one, use the limit field instead
							qs['$top'] = limit;

							const response = await mpApiRequest.call(
								this,
								'GET',
								`/tables/${tableName}`,
								qs,
							);

							for (const record of toRecordArray(response)) {
								returnData.push({ json: record, pairedItem: i });
							}
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
