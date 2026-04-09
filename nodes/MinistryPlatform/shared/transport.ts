/* eslint-disable @n8n/community-nodes/no-http-request-with-manual-auth --
 * We manage OAuth2 tokens ourselves instead of using httpRequestWithAuthentication
 * because MP returns HTTP 500 (not 401) for expired tokens. n8n's built-in
 * preAuthentication refresh only triggers on 401, so stale tokens never get replaced.
 * Our approach: proactive token cache with 5-minute refresh buffer before expiry.
 */
import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IDataObject,
	IHttpRequestOptions,
	ICredentialDataDecryptedObject,
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

// ── Token cache ──────────────────────────────────────────────────────────────

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

/** Module-level cache shared across all workflow executions in the n8n process. */
const tokenCache = new Map<string, CachedToken>();

/** Refresh tokens 5 minutes before they expire to avoid sending stale tokens. */
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

function tokenCacheKey(credentials: ICredentialDataDecryptedObject): string {
	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');
	return `${credentials.clientId}:${baseUrl}`;
}

/**
 * Get a valid access token, fetching a new one only when the cached token
 * is missing or within 5 minutes of expiry.
 */
async function getAccessToken(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	credentials: ICredentialDataDecryptedObject,
): Promise<string> {
	const key = tokenCacheKey(credentials);
	const cached = tokenCache.get(key);

	if (cached && Date.now() < cached.expiresAt - TOKEN_BUFFER_MS) {
		return cached.accessToken;
	}

	const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');
	const response = (await context.helpers.httpRequest({
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
	})) as { access_token: string; expires_in: number };

	tokenCache.set(key, {
		accessToken: response.access_token,
		expiresAt: Date.now() + response.expires_in * 1000,
	});

	return response.access_token;
}

// ── Token-expiry detection (safety net for clock skew) ───────────────────────

/**
 * Check if an error indicates an expired token.
 * MP returns 401 for some auth failures but 500 with .NET IDX10223 for expired tokens.
 */
function isTokenExpiredError(error: unknown): boolean {
	const err = error as Record<string, unknown>;
	const httpCode = String(err?.httpCode ?? '');
	const message = String(err?.message ?? '');

	// Standard 401
	if (httpCode === '401' || /\b401\b/.test(message)) return true;

	// MP wraps expired-token as 500 with .NET IDX10223 error.
	// Check message, description, and response body.
	const texts: string[] = [
		message,
		String(err?.description ?? ''),
		String((err?.cause as Record<string, unknown>)?.message ?? ''),
	];

	// AxiosError shape: cause.response.data may contain the MP error body
	const cause = err?.cause as Record<string, unknown> | undefined;
	const response = cause?.response as Record<string, unknown> | undefined;
	const data = response?.data;
	if (data) {
		texts.push(typeof data === 'string' ? data : JSON.stringify(data));
	}

	return texts.some((t) => t.includes('IDX10223'));
}

/** Tracks whether we've already retried for a credential (prevents loops). */
const retriedAuth = new Map<string, boolean>();

// ── URL length helpers ───────────────────────────────────────────────────────

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Make an authenticated JSON request to the Ministry Platform API.
 * Includes:
 * - Proactive token refresh (5-min buffer before expiry)
 * - Automatic POST /tables/{table}/get fallback for long URLs
 * - Expired-token retry for clock skew edge cases
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

	const token = await getAccessToken(this, credentials);
	const key = tokenCacheKey(credentials);

	const options: IHttpRequestOptions = {
		method: actualMethod,
		url: actualUrl,
		qs: actualQs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		json: true,
	};

	if (actualBody !== undefined) {
		options.body = actualBody;
	}

	try {
		return await this.helpers.httpRequest(options);
	} catch (error) {
		// Safety net: if the token expired despite the 5-min buffer (clock skew,
		// cold start, etc.), clear the cache and retry once with a fresh token.
		if (isTokenExpiredError(error) && !retriedAuth.get(key)) {
			retriedAuth.set(key, true);
			tokenCache.delete(key);
			try {
				const freshToken = await getAccessToken(this, credentials);
				options.headers = {
					...options.headers,
					Authorization: `Bearer ${freshToken}`,
				};
				const result = await this.helpers.httpRequest(options);
				retriedAuth.delete(key);
				return result;
			} catch (retryError) {
				retriedAuth.delete(key);
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
	const token = await getAccessToken(this, credentials);
	const key = tokenCacheKey(credentials);

	const options: IHttpRequestOptions = {
		method: 'GET',
		url: `${baseUrl}/ministryplatformapi${endpoint}`,
		qs,
		headers: {
			Authorization: `Bearer ${token}`,
		},
		encoding: 'arraybuffer',
		returnFullResponse: true,
		json: false,
	};

	try {
		return (await this.helpers.httpRequest(options)) as Buffer;
	} catch (error) {
		if (isTokenExpiredError(error) && !retriedAuth.get(key)) {
			retriedAuth.set(key, true);
			tokenCache.delete(key);
			try {
				const freshToken = await getAccessToken(this, credentials);
				options.headers = { ...options.headers, Authorization: `Bearer ${freshToken}` };
				const result = (await this.helpers.httpRequest(options)) as Buffer;
				retriedAuth.delete(key);
				return result;
			} catch (retryError) {
				retriedAuth.delete(key);
				throw retryError;
			}
		}
		throw error;
	}
}
