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
	description: 'The Ministry Platform table to operate on',
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
				"OData-style filter expression. Escape single quotes by doubling them (e.g. O''Brien). IIS has a ~4096 char URL limit — large IN() clauses may need to be split across multiple requests.",
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
				'Comma-separated list of columns to return. Use FK_ID_Table.Column for joins (e.g. Member_Status_ID_Table.Member_Status). Contributes to URL length (~4096 char IIS limit).',
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
