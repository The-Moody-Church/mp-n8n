import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class MinistryPlatformApi implements ICredentialType {
	name = 'ministryPlatformApi';

	displayName = 'Ministry Platform API';

	icon: Icon = 'file:../icons/ministry-platform.svg';

	documentationUrl = 'https://mpwiki.skylineict.com/wiki/rest-api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Platform URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://churchname.ministryplatform.com',
			description:
				'Your Ministry Platform URL (e.g. https://churchname.ministryplatform.com). The /ministryplatformapi path is added automatically.',
			required: true,
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			description: 'The OAuth2 client ID for your API client',
			required: true,
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'The OAuth2 client secret for your API client',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: 'http://www.thinkministry.com/dataplatform/scopes/all',
			description: 'The OAuth2 scope to request',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			default: '',
			typeOptions: {
				expirable: true, password: true,
			},
		},
		{
			displayName: 'Server Timezone',
			name: 'serverTimezone',
			type: 'options',
			default: 'America/Chicago',
			description:
				'The timezone your Ministry Platform server runs in. All dates from the API are in this timezone. Set this so your workflows know what timezone the data represents.',
			options: [
				{ name: 'US Eastern (New York)', value: 'America/New_York' },
				{ name: 'US Central (Chicago)', value: 'America/Chicago' },
				{ name: 'US Mountain (Denver)', value: 'America/Denver' },
				{ name: 'US Mountain - No DST (Phoenix)', value: 'America/Phoenix' },
				{ name: 'US Pacific (Los Angeles)', value: 'America/Los_Angeles' },
				{ name: 'US Alaska (Anchorage)', value: 'America/Anchorage' },
				{ name: 'US Hawaii (Honolulu)', value: 'Pacific/Honolulu' },
				{ name: 'Canada Atlantic (Halifax)', value: 'America/Halifax' },
				{ name: 'Canada Newfoundland (St. Johns)', value: 'America/St_Johns' },
				{ name: 'UTC', value: 'UTC' },
			],
		},
	];

	/**
	 * Exchange client credentials for an access token before each request.
	 * n8n calls this before authenticate() and before credential tests.
	 * The returned accessToken is stored in $credentials.accessToken.
	 */
	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	) {
		const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

		const tokenResponse = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/ministryplatformapi/oauth/connect/token`,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				scope: credentials.scope as string,
				client_id: credentials.clientId as string,
				client_secret: credentials.clientSecret as string,
			}).toString(),
			json: true,
		})) as { access_token: string };

		return { accessToken: tokenResponse.access_token };
	}

	/**
	 * Add the Bearer token (from preAuthentication) to every request.
	 */
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}/ministryplatformapi',
			url: '/tables',
		},
	};
}
