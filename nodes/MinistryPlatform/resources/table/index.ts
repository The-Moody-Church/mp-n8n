import type { INodeProperties } from 'n8n-workflow';
import { tableSelect } from '../../shared/descriptions';
import { tableGetAllDescription } from './getAll';
import { tableGetDescription } from './get';
import { tableCreateDescription } from './create';
import { tableUpdateDescription } from './update';
import { tableDeleteDescription } from './delete';

const showOnlyForTable = {
	resource: ['table'],
};

export const tableDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForTable,
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create records',
				description: 'Create one or more new records in a table',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a record',
				description: 'Permanently delete a record by its ID',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a record by ID',
				description: 'Retrieve a single record by its ID',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get records from a table',
				description: 'Query records from a table with filters, column selection, and sorting. Returns many matching records by default; set $top to limit.',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update records',
				description: 'Update one or more existing records in a table',
			},
		],
		default: 'getAll',
	},
	{
		...tableSelect,
		displayOptions: {
			show: showOnlyForTable,
		},
	},
	...tableGetAllDescription,
	...tableGetDescription,
	...tableCreateDescription,
	...tableUpdateDescription,
	...tableDeleteDescription,
];
