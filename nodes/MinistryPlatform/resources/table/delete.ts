import type { INodeProperties } from 'n8n-workflow';
import { auditUserField } from '../../shared/descriptions';

const show = {
	operation: ['delete'],
	resource: ['table'],
};

export const tableDeleteDescription: INodeProperties[] = [
	{
		displayName: 'Record ID(s)',
		name: 'recordId',
		type: 'string',
		displayOptions: { show },
		default: '',
		required: true,
		description:
			'The primary key value(s) to delete. For a single record, enter the ID. For bulk delete, enter comma-separated IDs (e.g. 123, 456, 789). This action is permanent and cannot be undone.',
	},
	{
		...auditUserField,
		displayOptions: { show },
	},
];
