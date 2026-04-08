import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

/**
 * Module-level token cache keyed by clientId + baseUrl.
 * Prevents cross-tenant token reuse when multiple credentials exist.
 * Tokens are reused until 60 seconds before expiry.
 */
const tokenCache = new Map<string, CachedToken>();

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export class MinistryPlatformApi implements ICredentialType {
	name = 'ministryPlatformApi';

	displayName = 'Ministry Platform API';

	icon: Icon = 'file:../icons/ministry-platform.svg';

	documentationUrl = 'https://mpwiki.skylineict.com/wiki/rest-api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://my.ministryplatform.com/ministryplatformapi',
			description:
				'The base URL of your Ministry Platform API (must use HTTPS, e.g. https://my.ministryplatform.com/ministryplatformapi)',
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
	 * OAuth2 client credentials token exchange with caching.
	 * Called by n8n before each authenticated request via httpRequestWithAuthentication.
	 * Tokens are cached per clientId+baseUrl and reused until 60s before expiry.
	 */
	authenticate = async function (
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const clientId = credentials.clientId as string;
		const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

		// Validate base URL is parseable
		try {
			new URL(baseUrl);
		} catch {
			throw new Error(
				'Invalid Base URL format. Expected: https://my.ministryplatform.com/ministryplatformapi',
			);
		}

		// Cache key includes both clientId and baseUrl to prevent cross-tenant reuse
		const cacheKey = `${clientId}:${baseUrl}`;
		const now = Date.now();
		const cached = tokenCache.get(cacheKey);

		if (cached && cached.expiresAt > now) {
			requestOptions.headers = {
				...requestOptions.headers,
				Authorization: `Bearer ${cached.accessToken}`,
			};
			return requestOptions;
		}

		const tokenResponse = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/oauth/connect/token`,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				scope: credentials.scope as string,
				client_id: clientId,
				client_secret: credentials.clientSecret as string,
			}).toString(),
			json: true,
		})) as TokenResponse;

		if (!tokenResponse.access_token) {
			throw new Error('OAuth2 token exchange failed: no access_token in response');
		}

		tokenCache.set(cacheKey, {
			accessToken: tokenResponse.access_token,
			expiresAt: now + tokenResponse.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS,
		});

		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${tokenResponse.access_token}`,
		};

		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{$credentials.baseUrl}}/tables',
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
