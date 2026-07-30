/* eslint-disable @n8n/community-nodes/no-restricted-imports --
 * vitest is a dev-only dependency; the community-nodes import allowlist is
 * meant for shipped node code, and this test file is never published.
 */
import { describe, expect, it } from 'vitest';

import {
	appendPkTiebreaker,
	planPaginationOrder,
} from '../nodes/MinistryPlatform/shared/pagination';

const base = { maxRecords: 0, skip: 0, pageSize: 1000 };

describe('planPaginationOrder', () => {
	it('plans a tiebreaker when no $top is set (unlimited fetch)', () => {
		expect(planPaginationOrder({ ...base })).toEqual({ kind: 'tiebreaker' });
	});

	it('plans a tiebreaker for a plain query with a user $orderby', () => {
		expect(planPaginationOrder({ ...base, orderby: 'Last_Name ASC' })).toEqual({
			kind: 'tiebreaker',
		});
	});

	it('skips everything when $top fits in a single page', () => {
		expect(planPaginationOrder({ ...base, maxRecords: 500 })).toEqual({ kind: 'single-page' });
		expect(planPaginationOrder({ ...base, maxRecords: 1000 })).toEqual({ kind: 'single-page' });
	});

	it('plans a tiebreaker when $top exceeds the page size', () => {
		expect(planPaginationOrder({ ...base, maxRecords: 1001 })).toEqual({ kind: 'tiebreaker' });
	});

	it('plans a tiebreaker for a $skip offset window even when $top fits one page', () => {
		expect(planPaginationOrder({ ...base, maxRecords: 1000, skip: 1000 })).toEqual({
			kind: 'tiebreaker',
		});
		expect(planPaginationOrder({ ...base, maxRecords: 500, skip: 500 })).toEqual({
			kind: 'tiebreaker',
		});
	});

	it('classifies a grouped $skip offset window as unsafe-order', () => {
		expect(
			planPaginationOrder({
				...base,
				maxRecords: 1000,
				skip: 1000,
				groupby: 'Congregation_ID',
			}),
		).toEqual({ kind: 'unsafe-order', reason: 'groupby', hasUserOrderBy: false });
	});

	it('single-page takes precedence over grouping (no probe, no error needed)', () => {
		expect(
			planPaginationOrder({ ...base, maxRecords: 100, groupby: 'Congregation_ID' }),
		).toEqual({ kind: 'single-page' });
	});

	it('classifies $groupby as unsafe-order', () => {
		expect(planPaginationOrder({ ...base, groupby: 'Congregation_ID' })).toEqual({
			kind: 'unsafe-order',
			reason: 'groupby',
			hasUserOrderBy: false,
		});
	});

	it('classifies $having as unsafe-order', () => {
		expect(planPaginationOrder({ ...base, having: 'COUNT(*) > 1' })).toEqual({
			kind: 'unsafe-order',
			reason: 'having',
			hasUserOrderBy: false,
		});
	});

	it('classifies aggregate functions in $select as unsafe-order', () => {
		expect(
			planPaginationOrder({ ...base, select: 'SUM(Donation_Amount) AS Total' }),
		).toEqual({ kind: 'unsafe-order', reason: 'aggregate', hasUserOrderBy: false });
	});

	it('detects aggregates with whitespace before the paren', () => {
		expect(planPaginationOrder({ ...base, select: 'MIN (Setup_Date)' })).toEqual({
			kind: 'unsafe-order',
			reason: 'aggregate',
			hasUserOrderBy: false,
		});
	});

	it('does not mistake FK-join columns for aggregates', () => {
		expect(
			planPaginationOrder({ ...base, select: 'Min_Age_Table.Description, Display_Name' }),
		).toEqual({ kind: 'tiebreaker' });
	});

	it('does not mistake aggregate-prefixed column names for aggregates', () => {
		expect(planPaginationOrder({ ...base, select: 'Maximum_Capacity, Count_Total' })).toEqual({
			kind: 'tiebreaker',
		});
	});

	it('classifies $distinct with an explicit $select as unsafe-order', () => {
		expect(
			planPaginationOrder({ ...base, distinct: true, select: 'City, State' }),
		).toEqual({ kind: 'unsafe-order', reason: 'distinct', hasUserOrderBy: false });
	});

	it('allows the tiebreaker for $distinct without $select (all columns returned)', () => {
		expect(planPaginationOrder({ ...base, distinct: true })).toEqual({ kind: 'tiebreaker' });
	});

	it('reports hasUserOrderBy on unsafe-order plans', () => {
		expect(
			planPaginationOrder({
				...base,
				groupby: 'Congregation_ID',
				orderby: 'Congregation_ID ASC',
			}),
		).toEqual({ kind: 'unsafe-order', reason: 'groupby', hasUserOrderBy: true });
	});

	it('treats a whitespace-only $orderby as absent', () => {
		expect(planPaginationOrder({ ...base, groupby: 'X', orderby: '   ' })).toEqual({
			kind: 'unsafe-order',
			reason: 'groupby',
			hasUserOrderBy: false,
		});
	});
});

describe('appendPkTiebreaker', () => {
	const pk = 'Contact_ID';
	const table = 'Contacts';

	it('uses the PK alone when there is no $orderby', () => {
		expect(appendPkTiebreaker(undefined, pk, table)).toBe('Contact_ID');
		expect(appendPkTiebreaker('', pk, table)).toBe('Contact_ID');
	});

	it('uses the PK alone for a whitespace-only $orderby', () => {
		expect(appendPkTiebreaker('   ', pk, table)).toBe('Contact_ID');
	});

	it('appends the PK after a user sort', () => {
		expect(appendPkTiebreaker('Last_Name ASC', pk, table)).toBe('Last_Name ASC, Contact_ID');
	});

	it('appends after multiple sort terms', () => {
		expect(appendPkTiebreaker('Last_Name ASC, First_Name DESC', pk, table)).toBe(
			'Last_Name ASC, First_Name DESC, Contact_ID',
		);
	});

	it('does not duplicate a PK that is already the last term', () => {
		expect(appendPkTiebreaker('Last_Name ASC, Contact_ID', pk, table)).toBe(
			'Last_Name ASC, Contact_ID',
		);
	});

	it('does not duplicate a PK that appears first (already a total order)', () => {
		expect(appendPkTiebreaker('Contact_ID DESC, Last_Name', pk, table)).toBe(
			'Contact_ID DESC, Last_Name',
		);
	});

	it('does not duplicate a PK in the middle of the list', () => {
		expect(appendPkTiebreaker('Last_Name, Contact_ID ASC, First_Name', pk, table)).toBe(
			'Last_Name, Contact_ID ASC, First_Name',
		);
	});

	it('matches the PK case-insensitively', () => {
		expect(appendPkTiebreaker('contact_id desc', pk, table)).toBe('contact_id desc');
	});

	it('matches a table-qualified PK', () => {
		expect(appendPkTiebreaker('Contacts.Contact_ID', pk, table)).toBe('Contacts.Contact_ID');
	});

	it('matches a bracketed PK', () => {
		expect(appendPkTiebreaker('[Contact_ID] DESC', pk, table)).toBe('[Contact_ID] DESC');
		expect(appendPkTiebreaker('[Contacts].[Contact_ID]', pk, table)).toBe(
			'[Contacts].[Contact_ID]',
		);
	});

	it('still appends when a same-named column belongs to a joined table', () => {
		expect(appendPkTiebreaker('Household_ID_Table.Contact_ID', pk, table)).toBe(
			'Household_ID_Table.Contact_ID, Contact_ID',
		);
	});

	it('does not split on commas inside function calls', () => {
		expect(appendPkTiebreaker("ISNULL(Last_Name, '') ASC", pk, table)).toBe(
			"ISNULL(Last_Name, '') ASC, Contact_ID",
		);
	});

	it('does not split on commas inside string literals', () => {
		expect(appendPkTiebreaker("ISNULL(Nickname, 'a,b') DESC", pk, table)).toBe(
			"ISNULL(Nickname, 'a,b') DESC, Contact_ID",
		);
	});

	it('handles escaped quotes and unbalanced parens inside literals', () => {
		expect(appendPkTiebreaker("ISNULL(Note, 'O''Brien,(x') , Last_Name", pk, table)).toBe(
			"ISNULL(Note, 'O''Brien,(x') , Last_Name, Contact_ID",
		);
	});

	it('does not treat an expression over the PK as the PK itself', () => {
		expect(appendPkTiebreaker('ISNULL(Contact_ID, 0)', pk, table)).toBe(
			'ISNULL(Contact_ID, 0), Contact_ID',
		);
	});

	it('cleans a trailing comma before appending', () => {
		expect(appendPkTiebreaker('Last_Name ASC,', pk, table)).toBe('Last_Name ASC, Contact_ID');
	});

	it('falls back to the PK alone when the $orderby is only commas', () => {
		expect(appendPkTiebreaker(',, ', pk, table)).toBe('Contact_ID');
	});
});
