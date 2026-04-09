import type { INodeProperties } from 'n8n-workflow';
import { queryOptions } from '../../shared/descriptions';

const show = {
	operation: ['getAll'],
	resource: ['table'],
};

export const tableGetAllDescription: INodeProperties[] = [
	{
		displayName: 'Filter Conditions',
		name: 'filterConditions',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
			sortable: true,
		},
		default: {},
		description:
			'Build a filter with a guided UI. For FK joins or complex expressions, use $Filter in Query Options instead.',
		displayOptions: { show },
		placeholder: 'Add Condition',
		options: [
			{
				displayName: 'Conditions',
				name: 'conditions',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'field',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getFieldsForFilter',
							loadOptionsDependsOn: ['tableName'],
						},
						default: '',
						description:
							'Column to filter on. Switch to Expression mode to type a custom name (e.g. FK joins like Contact_ID_Table.Display_Name). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Operator',
						name: 'operator',
						type: 'options',
						noDataExpression: true,
						options: [
							{ name: 'Contains', value: 'LIKE' },
							{ name: 'Does Not Contain', value: 'NOT LIKE' },
							{ name: 'Ends With', value: 'ENDS_WITH' },
							{ name: 'Equals (=)', value: 'eq' },
							{ name: 'Greater or Equal (>=)', value: '>=' },
							{ name: 'Greater Than (>)', value: '>' },
							{ name: 'In List', value: 'IN' },
							{ name: 'Is Empty (NULL)', value: 'IS NULL' },
							{ name: 'Is Not Empty (NOT NULL)', value: 'IS NOT NULL' },
							{ name: 'Less or Equal (<=)', value: '<=' },
							{ name: 'Less Than (<)', value: '<' },
							{ name: 'Not Equals (<>)', value: '<>' },
							{ name: 'Not In List', value: 'NOT IN' },
							{ name: 'Starts With', value: 'STARTS_WITH' },
						],
						default: 'eq',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description:
							"Numbers are unquoted automatically; text is single-quoted. For In/Not In List, enter comma-separated values. Quotes are escaped (O'Brien → O''Brien).",
						displayOptions: {
							hide: {
								operator: ['IS NULL', 'IS NOT NULL'],
							},
						},
					},
				],
			},
		],
	},
	{
		displayName: 'Combine Conditions With',
		name: 'filterCombine',
		type: 'options',
		options: [
			{ name: 'AND — All Must Match', value: 'AND' },
			{ name: 'OR — Any Can Match', value: 'OR' },
		],
		default: 'AND',
		description: 'How to combine multiple filter conditions',
		displayOptions: { show },
	},
	{
		displayName: 'Columns to Return',
		name: 'selectColumns',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getFieldsForFilter',
			loadOptionsDependsOn: ['tableName'],
		},
		default: [],
		hint: 'If the list is empty, close and reopen the node after selecting a table.',
		description:
			'Choose which columns to include. Leave empty to return all. For FK joins or aggregates, use $Select in Query Options. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show },
	},
	{
		displayName: 'Sort By',
		name: 'orderByConditions',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
			sortable: true,
		},
		default: {},
		description:
			'Sort results by one or more columns. For expressions or FK joins, use $Orderby in Query Options instead.',
		displayOptions: { show },
		placeholder: 'Add Sort Field',
		options: [
			{
				displayName: 'Sort Fields',
				name: 'sorts',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'field',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getFieldsForFilter',
							loadOptionsDependsOn: ['tableName'],
						},
						default: '',
						description:
							'Column to sort by. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						noDataExpression: true,
						options: [
							{ name: 'Ascending (A→Z, 0→9)', value: 'ASC' },
							{ name: 'Descending (Z→A, 9→0)', value: 'DESC' },
						],
						default: 'ASC',
					},
				],
			},
		],
	},
	{
		...queryOptions,
		displayOptions: { show },
	},
];
