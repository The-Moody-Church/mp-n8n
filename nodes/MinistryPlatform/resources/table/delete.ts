import type { INodeProperties } from 'n8n-workflow';
import { recordIdField } from '../../shared/descriptions';

const show = {
	operation: ['delete'],
	resource: ['table'],
};

export const tableDeleteDescription: INodeProperties[] = [
	{
		...recordIdField,
		displayOptions: { show },
		description:
			'The primary key value of the record to delete. This action is permanent and cannot be undone.',
	},
];
