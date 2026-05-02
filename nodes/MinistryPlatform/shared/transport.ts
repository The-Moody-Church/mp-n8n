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

// ── Error enrichment ─────────────────────────────────────────────────────────

/**
 * Extract the MP error response body (if any) from an axios-shaped error.
 * MP usually returns useful detail in the response body — surfacing it
 * turns a generic "Request failed with status code 500" into something
 * actionable like "Invalid column name 'Foo_Bar'".
 */
function extractMpErrorDetail(error: unknown): string | undefined {
	const err = error as Record<string, unknown>;

	// Try multiple shapes since n8n's helpers.httpRequest lets the raw AxiosError
	// propagate (body at error.response.data) while the legacy request helper
	// wraps it differently (body at error.cause.response.data or error.error).
	const directResponse = err?.response as Record<string, unknown> | undefined;
	const cause = err?.cause as Record<string, unknown> | undefined;
	const causeResponse = cause?.response as Record<string, unknown> | undefined;
	const data =
		directResponse?.data ??
		directResponse?.body ??
		causeResponse?.data ??
		causeResponse?.body ??
		err?.error;

	if (data == null) return undefined;
	if (typeof data === 'string') return data.slice(0, 2000);

	if (typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		// MP sometimes returns { Message: "..." } or { error: "...", error_description: "..." }
		const candidates = [
			obj.Message,
			obj.message,
			obj.error_description,
			obj.error,
			obj.detail,
			obj.title,
		].filter((v) => typeof v === 'string' && v.length > 0) as string[];

		if (candidates.length > 0) return candidates.join(' — ').slice(0, 2000);

		try {
			return JSON.stringify(obj).slice(0, 2000);
		} catch {
			return undefined;
		}
	}
	return undefined;
}

/**
 * Wrap an httpRequest error so the thrown Error includes the MP API's actual
 * error message (when available) plus the request method and endpoint path.
 * Token-expiry errors are passed through untouched so the retry path can detect them.
 */
function enrichRequestError(error: unknown, method: string, endpoint: string): Error {
	const err = error as Record<string, unknown>;
	const directResponse = err?.response as Record<string, unknown> | undefined;
	const httpCode =
		err?.httpCode ??
		err?.statusCode ??
		err?.status ??
		directResponse?.status ??
		directResponse?.statusCode ??
		'';
	const detail = extractMpErrorDetail(error);
	const baseMessage = String(err?.message ?? 'Request failed');
	const parts = [`MP ${method} ${endpoint} failed`];
	if (httpCode) parts.push(`(HTTP ${httpCode})`);
	if (detail) {
		parts.push(`: ${detail}`);
	} else {
		parts.push(`: ${baseMessage}`);
	}
	const wrapped = new Error(parts.join(' '));
	(wrapped as unknown as { cause?: unknown }).cause = error;
	(wrapped as unknown as { httpCode?: unknown }).httpCode = httpCode;
	return wrapped;
}

// ── URL length helpers ───────────────────────────────────────────────────────

/**
 * Known Ministry Platform API limits.
 * IIS has a ~4096 character URL limit. Exceeding it returns a cryptic 404
 * instead of a clear error. We check before sending and give a helpful message.
 */
const MAX_URL_LENGTH = 4096;

/**
 * Build the query string with explicit percent-encoding (matches what Swagger sends).
 * Skips empty/zero/false values to avoid sending no-op params.
 *
 * We build this ourselves rather than letting n8n/axios serialize `qs` because
 * axios's default builder leaves `$`, `,`, and `.` unencoded, and some MP query
 * shapes (e.g. FK joins like `Foo_ID_Table.Bar`) only parse correctly when the
 * separator commas are percent-encoded as Swagger does.
 */
function buildQueryString(qs: IDataObject): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === null || value === '' || value === false) continue;
		// $skip=0 is a meaningful pagination value; drop other zeros (no-op flags).
		if (value === 0 && key !== '$skip') continue;
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	}
	return parts.join('&');
}

/**
 * Estimate the full URL length (used for the IIS 4096-char limit check).
 */
function estimateUrlLength(url: string, qs: IDataObject): number {
	const queryString = buildQueryString(qs);
	return url.length + (queryString ? queryString.length + 1 : 0);
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

	// Build the full URL ourselves so the query string encoding matches Swagger
	// (e.g. commas as %2C). This avoids axios's default builder leaving them
	// unencoded, which MP rejects for some query shapes.
	const queryString = buildQueryString(actualQs);
	const finalUrl = queryString ? `${actualUrl}?${queryString}` : actualUrl;

	const headers: Record<string, string> = {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`,
	};
	if (actualBody !== undefined) {
		headers['Content-Type'] = 'application/json';
	}

	const options: IHttpRequestOptions = {
		method: actualMethod,
		url: finalUrl,
		headers,
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
				throw enrichRequestError(retryError, actualMethod, endpoint);
			}
		}

		throw enrichRequestError(error, actualMethod, endpoint);
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

	const queryString = buildQueryString(qs);
	const url = `${baseUrl}/ministryplatformapi${endpoint}`;
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: queryString ? `${url}?${queryString}` : url,
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
				throw enrichRequestError(retryError, 'GET', endpoint);
			}
		}
		throw enrichRequestError(error, 'GET', endpoint);
	}
}
