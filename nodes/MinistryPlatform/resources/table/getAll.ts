import type { INodeProperties } from 'n8n-workflow';
import { queryOptions } from '../../shared/descriptions';

const show = {
	operation: ['getAll'],
	resource: ['table'],
};

export const tableGetAllDescription: INodeProperties[] = [
	{
		...queryOptions,
		displayOptions: { show },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: { show },
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: {
			show: {
				...show,
				returnAll: [false],
			},
		},
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
	},
];
