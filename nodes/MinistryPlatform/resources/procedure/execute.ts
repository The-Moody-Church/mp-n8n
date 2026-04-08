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
			'JSON object of parameter names and values to pass to the stored procedure',
	},
];
