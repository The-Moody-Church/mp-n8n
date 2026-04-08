import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IDataObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

/**
 * Retrieve the configured server timezone from credentials.
 */
export async function getServerTimezone(
	context: IExecuteFunctions | ILoadOptionsFunctions,
): Promise<string> {
	const credentials = await context.getCredentials('ministryPlatformApi');
	return (credentials.serverTimezone as string) || 'America/Chicago';
}

/**
 * Known Ministry Platform API limits.
 * IIS has a ~4096 character URL limit. Exceeding it returns a cryptic 404
 * instead of a clear error. We check before sending and give a helpful message.
 */
const MAX_URL_LENGTH = 4096;

/**
 * Estimate the full URL length including query string parameters.
 */
function estimateUrlLength(url: string, qs: IDataObject): number {
	const qsParts: string[] = [];
	for (const [key, value] of Object.entries(qs)) {
		if (value !== undefined && value !== '' && value !== 0 && value !== false) {
			qsParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	}
	const queryString = qsParts.length > 0 ? `?${qsParts.join('&')}` : '';
	return url.length + queryString.length;
}

/**
 * Make an authenticated JSON request to the Ministry Platform API.
 * Authentication is handled by the credential's `authenticate` method,
 * which performs the OAuth2 client credentials token exchange with caching.
 */
export async function mpApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: IDataObject | IDataObject[],
): Promise<unknown> {
	const credentials = await this.getCredentials('ministryPlatformApi');
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');
	const url = `${baseUrl}${endpoint}`;

	// Check URL length before sending — IIS returns a cryptic 404 when exceeded
	if (method === 'GET') {
		const estimatedLength = estimateUrlLength(url, qs);
		if (estimatedLength > MAX_URL_LENGTH) {
			throw new Error(
				`Request URL is ~${estimatedLength} characters, which exceeds the IIS limit of ~${MAX_URL_LENGTH}. ` +
					'This typically happens with large $filter expressions (e.g. many IDs in an IN clause). ' +
					'Try reducing the filter size, removing unnecessary $select columns, or splitting into multiple requests.',
			);
		}
	}

	const options: IHttpRequestOptions = {
		method,
		url,
		qs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		json: true,
	};

	if (body !== undefined) {
		options.body = body;
	}

	return this.helpers.httpRequestWithAuthentication.call(this, 'ministryPlatformApi', options);
}

/**
 * Make an authenticated request that returns raw binary data (for file downloads).
 */
export async function mpApiRequestBinary(
	this: IExecuteFunctions,
	endpoint: string,
	qs: IDataObject = {},
): Promise<Buffer> {
	const credentials = await this.getCredentials('ministryPlatformApi');
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

	const response = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'ministryPlatformApi',
		{
			method: 'GET',
			url: `${baseUrl}${endpoint}`,
			qs,
			encoding: 'arraybuffer',
			returnFullResponse: true,
			json: false,
		},
	);

	return response as Buffer;
}
