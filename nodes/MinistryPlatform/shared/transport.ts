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
 * Module-level token cache reference for 401 retry.
 * This must match the cache used in MinistryPlatformApi.credentials.ts.
 * On 401, we clear the entry so the credential's authenticate() fetches a fresh token.
 */
const tokenCacheForRetry = new Map<string, boolean>();

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
 * Enhance API error messages with actionable guidance.
 * MP API errors are often cryptic — this maps common HTTP status codes
 * to clear explanations so users don't have to guess.
 */
function enhanceApiError(error: Error, method: string, endpoint: string): Error {
	const message = error.message || '';
	const statusMatch = message.match(/\b(401|403|404|409|413|500|503)\b/);

	if (!statusMatch) return error;

	const status = statusMatch[1];
	const context = `${method} ${endpoint}`;

	switch (status) {
		case '401':
			error.message =
				`Unauthorized (401) on ${context}. ` +
				'The API client credentials may be invalid or expired. ' +
				'Check your Client ID and Client Secret in the credential settings.';
			break;
		case '403':
			error.message =
				`Forbidden (403) on ${context}. ` +
				'Your API client does not have permission for this operation. ' +
				'In Ministry Platform, go to Administration > API Clients and check ' +
				'that this client has the required page/table permissions. ' +
				'Tip: create a dedicated n8n API user and grant only the permissions your workflows need.';
			break;
		case '404':
			if (method === 'GET' && endpoint.includes('/tables/')) {
				error.message =
					`Not Found (404) on ${context}. ` +
					'The table name or record ID may be incorrect, or the URL may have exceeded ' +
					'the ~4096 character IIS limit (try reducing $filter or $select length).';
			} else {
				error.message = `Not Found (404) on ${context}. Check that the resource name and ID are correct.`;
			}
			break;
		case '409':
			error.message =
				`Conflict (409) on ${context}. ` +
				'The record may have been modified by another user. ' +
				'Re-read the record and try your update again.';
			break;
		case '413':
			error.message =
				`Payload Too Large (413) on ${context}. ` +
				'The request body exceeds the ~20 MB limit. Try sending fewer records per request.';
			break;
		case '500':
		case '503':
			error.message =
				`Server Error (${status}) on ${context}. ` +
				'The Ministry Platform server encountered an error. ' +
				'This may be temporary — try again in a few moments. ' +
				'If it persists, check the MP server logs or contact your MP administrator.';
			break;
	}

	return error;
}

/**
 * Make an authenticated JSON request to the Ministry Platform API.
 * Includes:
 * - URL length pre-check for GET requests
 * - 401 auto-retry with token cache clear
 * - Enhanced error messages for common HTTP status codes
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

	const cacheKey = `${credentials.clientId}:${baseUrl}`;

	try {
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			'ministryPlatformApi',
			options,
		);
	} catch (error) {
		const errorMessage = (error as Error).message || '';

		// On 401, the token may have been revoked server-side while our cache still has it.
		// Clear the cache flag so the credential's authenticate() fetches a fresh token,
		// then retry the request once.
		if (errorMessage.includes('401') && !tokenCacheForRetry.get(cacheKey)) {
			tokenCacheForRetry.set(cacheKey, true);
			try {
				const result = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'ministryPlatformApi',
					options,
				);
				tokenCacheForRetry.delete(cacheKey);
				return result;
			} catch (retryError) {
				tokenCacheForRetry.delete(cacheKey);
				throw enhanceApiError(retryError as Error, method, endpoint);
			}
		}

		throw enhanceApiError(error as Error, method, endpoint);
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

	try {
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
	} catch (error) {
		throw enhanceApiError(error as Error, 'GET', endpoint);
	}
}
