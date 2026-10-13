import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HazelchatApi implements ICredentialType {
	name = 'hazelchatApi';

	displayName = 'Hazelchat API';

	icon: Icon = {
		light: 'file:../icons/hazelchat.svg',
		dark: 'file:../icons/hazelchat.dark.svg',
	};

	documentationUrl = 'https://hazelchat.co/docs/api/#authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'An owner API key from Settings in your Hazelchat workspace. It starts with hzk_ and only reads enquiries.',
		},
		// Not shown to users: every Hazelchat workspace lives at this address.
		// Local tests import a credential that points at a local server.
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://app.hazelchat.co',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/me',
		},
	};
}
