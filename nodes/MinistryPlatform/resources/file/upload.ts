import type { INodeProperties } from 'n8n-workflow';
import { auditUserField, recordIdField } from '../../shared/descriptions';

const show = {
	operation: ['upload'],
	resource: ['file'],
};

export const fileUploadDescription: INodeProperties[] = [
	{
		...recordIdField,
		displayOptions: { show },
		description: 'The ID of the record to attach the file(s) to',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		displayOptions: { show },
		default: 'data',
		required: true,
		placeholder: 'e.g. data or data,attachment2',
		description:
			'The name of the input item binary field containing the file to upload. Comma-separated names upload multiple files in one request. Note: very large files may be rejected by the API (~20 MB limit).',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show },
		default: {},
		options: [
			{
				...auditUserField,
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description:
					'A description to store with the uploaded file(s). Applies to every file in this request.',
			},
			{
				displayName: 'Longest Dimension',
				name: 'longestDimension',
				type: 'number',
				default: 0,
				description:
					'Maximum length in pixels for the longest dimension of an uploaded image. The server resizes larger images; 0 keeps the original size.',
			},
			{
				displayName: 'Set as Default Image',
				name: 'setAsDefaultImage',
				type: 'boolean',
				default: false,
				description: 'Whether to mark the uploaded file as the default image for the record',
			},
		],
	},
];
