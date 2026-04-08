import type { INodeProperties } from 'n8n-workflow';
import { recordIdField } from '../../shared/descriptions';

const show = {
	operation: ['get'],
	resource: ['table'],
};

export const tableGetDescription: INodeProperties[] = [
	{
		...recordIdField,
		displayOptions: { show },
	},
	{
		displayName: '$Select',
		name: 'selectColumns',
		type: 'string',
		displayOptions: { show },
		default: '',
		placeholder: 'Contact_ID, Display_Name, Email_Address',
		description: 'Comma-separated list of columns to return',
	},
];
