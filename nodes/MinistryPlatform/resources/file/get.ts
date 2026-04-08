import type { INodeProperties } from 'n8n-workflow';

const show = {
	operation: ['get'],
	resource: ['file'],
};

export const fileGetDescription: INodeProperties[] = [
	{
		displayName: 'Unique File ID',
		name: 'uniqueFileId',
		type: 'string',
		displayOptions: { show },
		default: '',
		required: true,
		description:
			'The unique ID of the file attachment to retrieve. Note: very large files may be rejected by the API (~20 MB limit).',
	},
	{
		displayName: 'Thumbnail',
		name: 'thumbnail',
		type: 'boolean',
		displayOptions: { show },
		default: false,
		description: 'Whether to return a system-generated thumbnail instead of the full file',
	},
];
