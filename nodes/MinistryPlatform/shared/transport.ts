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
 * Tracks whether we've already retried after a 401 for a given credential.
 * On 401, we retry once — n8n's preAuthentication will fetch a fresh token.
 */
const retried401 = new Map<string, boolean>();

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
 * Includes:
 * - Automatic POST /tables/{table}/get fallback for long URLs
 * - 401 auto-retry with fresh token
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
	const url = `${baseUrl}/ministryplatformapi${endpoint}`;

	// If a GET request would exceed the IIS ~4096 char URL limit,
	// automatically switch to POST /tables/{table}/get which accepts
	// query parameters in the request body instead of the URL.
	let actualMethod = method;
	let actualUrl = url;
	let actualQs = qs;
	let actualBody = body;

	if (method === 'GET') {
		const estimatedLength = estimateUrlLength(url, qs);
		if (estimatedLength > MAX_URL_LENGTH) {
			const tableMatch = endpoint.match(/^\/tables\/([^/]+)$/);
			if (tableMatch) {
				actualMethod = 'POST';
				actualUrl = `${baseUrl}/ministryplatformapi/tables/${tableMatch[1]}/get`;
				actualQs = {};

				// Convert query string params to POST body format
				const postBody: IDataObject = {};
				if (qs['$select']) postBody.Select = qs['$select'];
				if (qs['$filter']) postBody.Filter = qs['$filter'];
				if (qs['$orderby']) postBody.OrderBy = qs['$orderby'];
				if (qs['$groupby']) postBody.GroupBy = qs['$groupby'];
				if (qs['$having']) postBody.Having = qs['$having'];
				if (qs['$top']) postBody.Top = qs['$top'];
				if (qs['$skip']) postBody.Skip = qs['$skip'];
				if (qs['$distinct']) postBody.Distinct = qs['$distinct'];
				if (qs['$search']) postBody.Search = qs['$search'];

				actualBody = postBody;
			} else {
				throw new Error(
					`Request URL is ~${estimatedLength} characters, which exceeds the IIS limit of ~${MAX_URL_LENGTH}. ` +
						'Try reducing the filter size, removing unnecessary $select columns, or splitting into multiple requests.',
				);
			}
		}
	}

	const options: IHttpRequestOptions = {
		method: actualMethod,
		url: actualUrl,
		qs: actualQs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		json: true,
	};

	if (actualBody !== undefined) {
		options.body = actualBody;
	}

	const cacheKey = `${credentials.clientId}:${baseUrl}`;

	try {
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			'ministryPlatformApi',
			options,
		);
	} catch (error) {
		const errorMessage = (error as Error).message || '';

		// On 401, retry once — preAuthentication will fetch a fresh token
		if (errorMessage.includes('401') && !retried401.get(cacheKey)) {
			retried401.set(cacheKey, true);
			try {
				const result = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'ministryPlatformApi',
					options,
				);
				retried401.delete(cacheKey);
				return result;
			} catch (retryError) {
				retried401.delete(cacheKey);
				throw retryError;
			}
		}

		throw error;
	}
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
			url: `${baseUrl}/ministryplatformapi${endpoint}`,
			qs,
			encoding: 'arraybuffer',
			returnFullResponse: true,
			json: false,
		},
	);

	return response as Buffer;
}
