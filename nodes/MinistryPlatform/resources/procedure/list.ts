import type { INodeProperties } from 'n8n-workflow';

const show = {
	operation: ['list'],
	resource: ['procedure'],
};

export const procedureListDescription: INodeProperties[] = [
	{
		displayName: 'Search',
		name: 'procSearch',
		type: 'string',
		displayOptions: { show },
		default: '',
		placeholder: 'api_*',
		description: 'Filter procedures by name. Supports * wildcard.',
	},
];
