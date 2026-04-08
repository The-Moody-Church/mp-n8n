import type { INodeProperties } from 'n8n-workflow';
import { responseSelectField } from '../../shared/descriptions';

const show = {
	operation: ['create'],
	resource: ['table'],
};

export const tableCreateDescription: INodeProperties[] = [
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
		default: '[\n\t{\n\t\t"Field_Name": "Value"\n\t}\n]',
		description:
			'JSON array of record objects to create. Each object should contain field names as keys.',
	},
	{
		...responseSelectField,
		displayOptions: { show },
	},
];
