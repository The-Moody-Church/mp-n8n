import type { INodeProperties } from 'n8n-workflow';
import { tableSelect } from '../../shared/descriptions';
import { fileGetDescription } from './get';
import { fileGetManyDescription } from './getMany';
import { fileUploadDescription } from './upload';

const showOnlyForFile = {
	resource: ['file'],
};

/** Get Many and Upload address files by table + record; Get uses a unique file ID. */
const showForRecordFileOps = {
	operation: ['getAll', 'upload'],
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
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many file attachments',
				description: 'List file attachment metadata for a record',
			},
			{
				name: 'Upload',
				value: 'upload',
				action: 'Upload file attachments',
				description: 'Attach one or more files to a record',
			},
		],
		default: 'get',
	},
	{
		...tableSelect,
		description: 'The Ministry Platform table the record belongs to',
		displayOptions: { show: showForRecordFileOps },
	},
	...fileGetDescription,
	...fileGetManyDescription,
	...fileUploadDescription,
];
