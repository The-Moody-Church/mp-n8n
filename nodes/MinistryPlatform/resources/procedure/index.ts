import type { INodeProperties } from 'n8n-workflow';
import { procedureSelect } from '../../shared/descriptions';
import { procedureExecuteDescription } from './execute';

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
		],
		default: 'execute',
	},
	{
		...procedureSelect,
		displayOptions: {
			show: showOnlyForProcedure,
		},
	},
	...procedureExecuteDescription,
];
