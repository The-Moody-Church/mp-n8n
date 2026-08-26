/* eslint-disable @n8n/community-nodes/no-restricted-imports --
 * vitest is a dev-only dependency; the community-nodes import allowlist is
 * meant for shipped node code, and this test file is never published.
 */
import { describe, expect, it } from 'vitest';

import { buildQueryString, isTokenExpiredError } from '../nodes/MinistryPlatform/shared/transport';

describe('buildQueryString', () => {
	it('keeps a stringified false while dropping a boolean false', () => {
		expect(buildQueryString({ $default: 'false', $thumbnail: false })).toBe('%24default=false');
	});

	it('drops zero for every key except $skip', () => {
		expect(buildQueryString({ $longestDimension: 0, $skip: 0 })).toBe('%24skip=0');
	});

	it('percent-encodes keys and values', () => {
		expect(buildQueryString({ $description: 'a b,c' })).toBe('%24description=a%20b%2Cc');
	});
});

describe('isTokenExpiredError', () => {
	it('detects a 401 status code', () => {
		expect(isTokenExpiredError({ httpCode: '401', message: 'Unauthorized' })).toBe(true);
	});

	it('detects IDX10223 in an axios error response body', () => {
		expect(
			isTokenExpiredError({
				message: 'Request failed with status code 500',
				response: { data: 'IDX10223: Lifetime validation failed' },
			}),
		).toBe(true);
	});

	it('decodes a Buffer response body before matching', () => {
		expect(
			isTokenExpiredError({
				message: 'Request failed with status code 500',
				response: { data: Buffer.from('IDX10223: Lifetime validation failed') },
			}),
		).toBe(true);
	});

	it('returns false for an unrelated server error', () => {
		expect(
			isTokenExpiredError({
				message: 'Request failed with status code 500',
				response: { data: 'Invalid column name' },
			}),
		).toBe(false);
	});
});
