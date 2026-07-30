import type { INodeProperties } from 'n8n-workflow';

const show = {
	operation: ['execute'],
	resource: ['procedure'],
};

export const procedureExecuteDescription: INodeProperties[] = [
	{
		displayName: 'Parameters (JSON)',
		name: 'parameters',
		type: 'json',
		displayOptions: { show },
		default: '{}',
		description:
			'JSON object of parameter names and values to pass to the stored procedure. The @ prefix MP requires is added automatically when omitted.',
	},
	{
		displayName: 'Result Set Handling',
		name: 'resultSetHandling',
		type: 'options',
		displayOptions: { show },
		options: [
			{
				name: 'All Result Sets (Flattened)',
				value: 'allFlattened',
				description:
					'One item per row across all result sets, each annotated with _resultSetIndex',
			},
			{
				name: 'All Result Sets (Grouped)',
				value: 'allGrouped',
				description: 'One item per result set, containing its index and rows array',
			},
			{
				name: 'First Result Set',
				value: 'firstResultSet',
				description: 'One item per row of the first result set',
			},
		],
		default: 'firstResultSet',
		description:
			'How to turn the stored procedure response (an array of result sets) into items',
	},
];
