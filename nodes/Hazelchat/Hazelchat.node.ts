import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

// Reads enquiries only. Nothing in this package creates, changes or deletes
// anything in Hazelchat apart from the trigger's own subscription.
export class Hazelchat implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hazelchat',
		name: 'hazelchat',
		icon: { light: 'file:../../icons/hazelchat.svg', dark: 'file:../../icons/hazelchat.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read the enquiries visitors left with your Hazelchat website agent',
		defaults: {
			name: 'Hazelchat',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'hazelchatApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Enquiry',
						value: 'enquiry',
					},
				],
				default: 'enquiry',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['enquiry'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many enquiries',
						description: 'Get the newest enquiries from the last 30 days',
						routing: {
							request: {
								method: 'GET',
								url: '/api/v1/enquiries',
							},
						},
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['enquiry'],
						operation: ['getAll'],
					},
				},
				routing: {
					send: {
						type: 'query',
						property: 'limit',
					},
				},
			},
		],
	};
}
