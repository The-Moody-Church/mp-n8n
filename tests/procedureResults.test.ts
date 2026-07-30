/* eslint-disable @n8n/community-nodes/no-restricted-imports --
 * vitest is a dev-only dependency; the community-nodes import allowlist is
 * meant for shipped node code, and this test file is never published.
 */
import { describe, expect, it } from 'vitest';

import {
	prefixProcParams,
	shapeProcResults,
} from '../nodes/MinistryPlatform/shared/procedureResults';

const rs1 = [
	{ Contact_ID: 1, Display_Name: 'Anna' },
	{ Contact_ID: 2, Display_Name: 'Ben' },
];
const rs2 = [{ Total: 42 }];

describe('shapeProcResults', () => {
	describe('firstResultSet', () => {
		it('emits one item per row of the first result set', () => {
			expect(shapeProcResults([rs1], 'firstResultSet')).toEqual(rs1);
		});

		it('ignores later result sets', () => {
			expect(shapeProcResults([rs1, rs2], 'firstResultSet')).toEqual(rs1);
		});

		it('returns no items for an empty envelope', () => {
			expect(shapeProcResults([], 'firstResultSet')).toEqual([]);
		});

		it('returns no items for an empty first result set', () => {
			expect(shapeProcResults([[], rs2], 'firstResultSet')).toEqual([]);
		});
	});

	describe('allFlattened', () => {
		it('emits one item per row across all result sets with _resultSetIndex', () => {
			expect(shapeProcResults([rs1, rs2], 'allFlattened')).toEqual([
				{ Contact_ID: 1, Display_Name: 'Anna', _resultSetIndex: 0 },
				{ Contact_ID: 2, Display_Name: 'Ben', _resultSetIndex: 0 },
				{ Total: 42, _resultSetIndex: 1 },
			]);
		});

		it('annotates a single result set too', () => {
			expect(shapeProcResults([rs2], 'allFlattened')).toEqual([
				{ Total: 42, _resultSetIndex: 0 },
			]);
		});

		it('skips empty result sets without breaking the index', () => {
			expect(shapeProcResults([[], rs2], 'allFlattened')).toEqual([
				{ Total: 42, _resultSetIndex: 1 },
			]);
		});
	});

	describe('allGrouped', () => {
		it('emits one item per result set with index and rows', () => {
			expect(shapeProcResults([rs1, rs2], 'allGrouped')).toEqual([
				{ resultSetIndex: 0, rows: rs1 },
				{ resultSetIndex: 1, rows: rs2 },
			]);
		});

		it('includes empty result sets', () => {
			expect(shapeProcResults([[], rs2], 'allGrouped')).toEqual([
				{ resultSetIndex: 0, rows: [] },
				{ resultSetIndex: 1, rows: rs2 },
			]);
		});
	});

	describe('non-object rows', () => {
		it('wraps scalar rows as { value }', () => {
			expect(shapeProcResults([[1, 'two', null]], 'firstResultSet')).toEqual([
				{ value: 1 },
				{ value: 'two' },
				{ value: null },
			]);
		});

		it('wraps array rows as { value }', () => {
			expect(shapeProcResults([[[1, 2]], rs2], 'allFlattened')).toEqual([
				{ value: [1, 2], _resultSetIndex: 0 },
				{ Total: 42, _resultSetIndex: 1 },
			]);
		});
	});

	describe('fallback for non-envelope responses', () => {
		it('passes through a plain array of objects', () => {
			expect(shapeProcResults(rs1, 'firstResultSet')).toEqual(rs1);
		});

		it('treats a mixed array as a plain record list', () => {
			expect(shapeProcResults([rs2, { error: 'x' }], 'allGrouped')).toEqual([
				{ value: rs2 },
				{ error: 'x' },
			]);
		});

		it('wraps a bare object', () => {
			expect(shapeProcResults({ Message: 'error' }, 'allFlattened')).toEqual([
				{ Message: 'error' },
			]);
		});

		it('returns no items for null or undefined', () => {
			expect(shapeProcResults(null, 'firstResultSet')).toEqual([]);
			expect(shapeProcResults(undefined, 'allFlattened')).toEqual([]);
		});

		it('wraps a scalar response', () => {
			expect(shapeProcResults('ok', 'firstResultSet')).toEqual([{ value: 'ok' }]);
		});
	});
});

describe('prefixProcParams', () => {
	it('adds @ to bare parameter names', () => {
		expect(prefixProcParams({ ContactID: 1, StartDate: '2026-01-01' })).toEqual({
			'@ContactID': 1,
			'@StartDate': '2026-01-01',
		});
	});

	it('keeps already-prefixed names unchanged', () => {
		expect(prefixProcParams({ '@ContactID': 1 })).toEqual({ '@ContactID': 1 });
	});

	it('handles a mix of bare and prefixed names', () => {
		expect(prefixProcParams({ '@A': 1, B: 2 })).toEqual({ '@A': 1, '@B': 2 });
	});

	it('lets an explicit @-key win over a bare key of the same name', () => {
		expect(prefixProcParams({ '@ContactID': 1, ContactID: 2 })).toEqual({ '@ContactID': 1 });
	});

	it('returns an empty object unchanged', () => {
		expect(prefixProcParams({})).toEqual({});
	});
});
