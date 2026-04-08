import type { INodeProperties } from 'n8n-workflow';
import { fileGetDescription } from './get';

const showOnlyForFile = {
	resource: ['file'],
};

export const fileDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForFile,
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a file attachment',
				description: 'Retrieve a file attachment by its unique ID',
			},
		],
		default: 'get',
	},
	...fileGetDescription,
];
