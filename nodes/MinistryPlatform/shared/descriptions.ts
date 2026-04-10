import type { INodeProperties } from 'n8n-workflow';

/**
 * Table name selector — populated dynamically via listSearch.
 */
export const tableSelect: INodeProperties = {
	displayName: 'Table Name',
	name: 'tableName',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Ministry Platform table to query. Common tables: Contacts (people), Events, Groups, Participants, Group_Participants, Households, Activities, Event_Participants, Communication_Messages.',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'getTables',
				searchable: true,
			},
		},
		{
			displayName: 'By Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. Contacts',
		},
	],
};

/**
 * Stored procedure selector — populated dynamically via listSearch.
 */
export const procedureSelect: INodeProperties = {
	displayName: 'Stored Procedure',
	name: 'procedureName',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The stored procedure to execute',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'getProcedures',
				searchable: true,
			},
		},
		{
			displayName: 'By Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. api_MPP_MyProcedure',
		},
	],
};

/**
 * Record ID input.
 */
export const recordIdField: INodeProperties = {
	displayName: 'Record ID',
	name: 'recordId',
	type: 'string',
	default: '',
	required: true,
	description: 'The primary key value of the record',
};

/**
 * Common query options for GET /tables/{table} requests.
 * Matches the MP REST API swagger spec.
 */
export const queryOptions: INodeProperties = {
	displayName: 'Query Options',
	name: 'queryOptions',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	options: [
		{
			displayName: '$Filter',
			name: '$filter',
			type: 'string',
			default: '',
			placeholder: "Contacts.Display_Name = 'Smith'",
			description:
				"SQL WHERE clause. Examples: Display_Name LIKE '%Smith%', Contact_ID = 12345, Event_Start_Date >= '2026-01-01', Email_Address IS NOT NULL, Status_ID IN (1,2). Single-quote strings, no quotes on numbers. Escape apostrophes by doubling: O''Brien.",
		},
		{
			displayName: '$Globalfilterid',
			name: '$globalFilterId',
			type: 'number',
			default: 0,
			description: 'Global Filter record ID',
		},
		{
			displayName: '$Groupby',
			name: '$groupby',
			type: 'string',
			default: '',
			placeholder: 'Group_Name',
			description: 'Columns to group by',
		},
		{
			displayName: '$Having',
			name: '$having',
			type: 'string',
			default: '',
			placeholder: 'COUNT(*) > 1',
			description: 'Having clause for use with $groupby aggregates',
		},
		{
			displayName: '$Orderby',
			name: '$orderby',
			type: 'string',
			default: '',
			placeholder: 'Display_Name ASC',
			description: 'Columns to sort by',
		},
		{
			displayName: '$Search',
			name: '$search',
			type: 'string',
			default: '',
			placeholder: 'Smith',
			description: 'Search across all searchable fields. Supports * wildcard.',
		},
		{
			displayName: '$Select',
			name: '$select',
			type: 'string',
			default: '',
			placeholder: 'Contact_ID, Display_Name, Email_Address',
			description:
				'Comma-separated columns to return. Use specific columns to reduce response size: Contact_ID, Display_Name, Email_Address. FK joins: Congregation_ID_Table.Congregation_Name. Leave empty for all columns.',
		},
		{
			displayName: '$Skip',
			name: '$skip',
			type: 'number',
			default: 0,
			description: 'Number of records to skip (for paging)',
		},
		{
			displayName: '$Top',
			name: '$top',
			type: 'number',
			default: 0,
			description: 'Maximum number of records to return (0 = no limit)',
		},
		{
			displayName: '$Userid',
			name: '$userId',
			type: 'number',
			default: 0,
			description: 'UserId for Global Filter evaluation',
		},
		{
			displayName: 'Distinct',
			name: '$distinct',
			type: 'boolean',
			default: false,
			description: 'Whether to return only distinct records',
		},
	],
};

/**
 * $select option for POST/PUT responses — controls which fields are returned after create/update.
 */
export const responseSelectField: INodeProperties = {
	displayName: '$Select (Response)',
	name: 'responseSelect',
	type: 'string',
	default: '',
	placeholder: 'Contact_ID, Display_Name',
	description: 'Comma-separated list of columns to return in the response after create/update',
};

/**
 * $User option for write operations — controls which MP user appears in the audit log.
 */
export const auditUserField: INodeProperties = {
	displayName: 'Audit User ID',
	name: 'auditUserId',
	type: 'number',
	default: 0,
	description:
		'MP User ID to record in the audit log for this operation. If 0, uses the API client\'s default user. Useful for attributing changes to the correct person.',
};
