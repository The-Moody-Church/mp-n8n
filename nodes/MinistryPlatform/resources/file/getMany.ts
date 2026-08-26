import type { INodeProperties } from 'n8n-workflow';
import { recordIdField } from '../../shared/descriptions';

const show = {
	operation: ['getAll'],
	resource: ['file'],
};

export const fileGetManyDescription: INodeProperties[] = [
	{
		...recordIdField,
		displayOptions: { show },
		description: 'The ID of the record whose file attachments to list',
	},
	{
		displayName: 'Default Only',
		name: 'defaultOnly',
		type: 'boolean',
		displayOptions: { show },
		default: false,
		description:
			'Whether to return only the default file (such as the default image) instead of all attached files',
	},
];
