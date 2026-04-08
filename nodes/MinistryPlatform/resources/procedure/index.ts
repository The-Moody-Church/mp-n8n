import type { INodeProperties } from 'n8n-workflow';
import { procedureSelect } from '../../shared/descriptions';
import { procedureExecuteDescription } from './execute';
import { procedureListDescription } from './list';

const showOnlyForProcedure = {
	resource: ['procedure'],
};

export const procedureDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForProcedure,
		},
		options: [
			{
				name: 'Execute',
				value: 'execute',
				action: 'Execute a stored procedure',
				description: 'Run a stored procedure with optional parameters',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List stored procedures',
				description: 'Get all available stored procedures and their parameters',
			},
		],
		default: 'execute',
	},
	{
		...procedureSelect,
		displayOptions: {
			show: {
				...showOnlyForProcedure,
				operation: ['execute'],
			},
		},
	},
	...procedureExecuteDescription,
	...procedureListDescription,
];
