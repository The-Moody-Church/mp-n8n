import type { INodeProperties } from 'n8n-workflow';
import { recordIdField, responseSelectField } from '../../shared/descriptions';

const show = {
	operation: ['update'],
	resource: ['table'],
};

export const tableUpdateDescription: INodeProperties[] = [
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		displayOptions: { show },
		options: [
			{
				name: 'Field Mapping',
				value: 'fieldMapping',
				description: 'Map fields individually using dropdowns',
			},
			{
				name: 'Raw JSON',
				value: 'json',
				description: 'Provide a JSON array of record objects',
			},
		],
		default: 'fieldMapping',
	},
	{
		...recordIdField,
		displayOptions: {
			show: {
				...show,
				inputMode: ['fieldMapping'],
			},
		},
		description: 'The primary key value of the record to update',
	},
	{
		displayName: 'Primary Key Field',
		name: 'primaryKeyField',
		type: 'resourceLocator',
		required: true,
		displayOptions: {
			show: {
				...show,
				inputMode: ['fieldMapping'],
			},
		},
		default: { mode: 'list', value: '' },
		description:
			'The primary key column name (e.g. Contact_ID for the Contacts table)',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getTableFields',
					searchable: true,
				},
			},
			{
				displayName: 'Manual',
				name: 'manual',
				type: 'string',
				placeholder: 'e.g. Contact_ID',
			},
		],
	},
	{
		displayName: 'Fields',
		name: 'fieldMappings',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Field',
		},
		displayOptions: {
			show: {
				...show,
				inputMode: ['fieldMapping'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Field',
				name: 'field',
				values: [
					{
						displayName: 'Field Name',
						name: 'fieldName',
						type: 'resourceLocator',
						default: { mode: 'list', value: '' },
						description: 'The column name',
						modes: [
							{
								displayName: 'From List',
								name: 'list',
								type: 'list',
								typeOptions: {
									searchListMethod: 'getTableFields',
									searchable: true,
								},
							},
							{
								displayName: 'Manual',
								name: 'manual',
								type: 'string',
								placeholder: 'e.g. Display_Name',
							},
						],
					},
					{
						displayName: 'Value',
						name: 'fieldValue',
						type: 'string',
						default: '',
						description: 'The value to set',
					},
				],
			},
		],
	},
	{
		displayName: 'Fields (JSON)',
		name: 'fields',
		type: 'json',
		displayOptions: {
			show: {
				...show,
				inputMode: ['json'],
			},
		},
		default: '[\n\t{\n\t\t"Record_ID": 1,\n\t\t"Field_Name": "New Value"\n\t}\n]',
		description:
			'JSON array of record objects to update. Each object must include the primary key field.',
	},
	{
		...responseSelectField,
		displayOptions: { show },
	},
	{
		displayName: 'Allow Create',
		name: 'allowCreate',
		type: 'boolean',
		displayOptions: { show },
		default: false,
		description:
			'Whether to create the record if it does not exist (upsert behavior)',
	},
];
