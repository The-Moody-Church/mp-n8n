import type { INodeProperties } from 'n8n-workflow';
import { communicationSendDescription } from './send';

const showOnlyForCommunication = {
	resource: ['communication'],
};

export const communicationDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForCommunication,
		},
		options: [
			{
				name: 'Send',
				value: 'send',
				action: 'Send a communication',
				description: 'Create and send an email or SMS message',
			},
		],
		default: 'send',
	},
	...communicationSendDescription,
];
