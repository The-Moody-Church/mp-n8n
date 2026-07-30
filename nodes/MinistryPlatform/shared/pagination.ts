// ── Pagination ordering helpers ──────────────────────────────────────────────
//
// MP's /tables endpoint pages with $top/$skip, but SQL Server gives no ordering
// guarantee without an ORDER BY — and MP wraps each page request independently,
// so page N and page N+1 come from independently-ordered scans. Rows can
// silently duplicate on one page and vanish from another. These helpers decide
// whether a deterministic total order is needed for a fetch and build it by
// appending the table's primary key as a sort tiebreaker.

/**
 * T-SQL aggregate functions. Their presence in $select implies grouped output,
 * where ordering by a non-grouped primary key would be invalid SQL.
 */
const AGGREGATE_FUNCTION =
	/\b(SUM|COUNT|COUNT_BIG|AVG|MIN|MAX|STDEV|STDEVP|VAR|VARP|STRING_AGG|CHECKSUM_AGG|GROUPING|GROUPING_ID|APPROX_COUNT_DISTINCT)\s*\(/i;

export type PaginationOrderPlan =
	| { kind: 'single-page' }
	| { kind: 'tiebreaker' }
	| {
			kind: 'unsafe-order';
			reason: 'groupby' | 'having' | 'aggregate' | 'distinct';
			hasUserOrderBy: boolean;
	  };

export interface PaginationOrderInput {
	orderby?: string;
	groupby?: string;
	having?: string;
	select?: string;
	distinct?: boolean;
	/** User-requested max records ($top); 0 or less means unlimited. */
	maxRecords: number;
	/** User-requested starting offset ($skip); 0 or less means none. */
	skip: number;
	/** Auto-pagination batch size. */
	pageSize: number;
}

/**
 * Decide how the auto-pagination loop must handle result ordering.
 *
 * - 'single-page': the fetch cannot depend on ordering ($top fits in one batch
 *   AND no rows are skipped), so no ordering guarantee is needed. A user-set
 *   $skip disqualifies this: an OFFSET window's contents are undefined without
 *   a total order, even for a single request.
 * - 'tiebreaker': append the table's primary key to $orderby to guarantee a
 *   deterministic total order across pages.
 * - 'unsafe-order': the query is grouped ($groupby/$having/aggregates) or
 *   DISTINCT over an explicit $select — ordering by a non-grouped/unselected
 *   primary key would be invalid SQL, so no tiebreaker can be appended. If such
 *   a query actually spans multiple pages without a user-supplied $orderby, the
 *   caller must fail rather than return nondeterministically-ordered pages.
 */
export function planPaginationOrder(input: PaginationOrderInput): PaginationOrderPlan {
	if (input.maxRecords > 0 && input.maxRecords <= input.pageSize && input.skip <= 0) {
		return { kind: 'single-page' };
	}

	const hasUserOrderBy = Boolean(input.orderby && input.orderby.trim().length > 0);

	if (input.groupby && input.groupby.trim().length > 0) {
		return { kind: 'unsafe-order', reason: 'groupby', hasUserOrderBy };
	}
	if (input.having && input.having.trim().length > 0) {
		return { kind: 'unsafe-order', reason: 'having', hasUserOrderBy };
	}
	if (input.select && AGGREGATE_FUNCTION.test(input.select)) {
		return { kind: 'unsafe-order', reason: 'aggregate', hasUserOrderBy };
	}
	// DISTINCT + explicit $select: ORDER BY items must appear in the select
	// list, and the PK is virtually never selected (it would defeat DISTINCT).
	// DISTINCT without $select returns all columns including the PK, so the
	// tiebreaker stays legal there.
	if (input.distinct && input.select && input.select.trim().length > 0) {
		return { kind: 'unsafe-order', reason: 'distinct', hasUserOrderBy };
	}

	return { kind: 'tiebreaker' };
}

/**
 * Split a SQL expression list on top-level commas, ignoring commas inside
 * parentheses and single-quoted string literals (with '' escapes).
 */
function splitTopLevelTerms(expr: string): string[] {
	const terms: string[] = [];
	let current = '';
	let depth = 0;
	let i = 0;
	while (i < expr.length) {
		const ch = expr[i];
		if (ch === "'") {
			// Copy through the closing quote, honoring '' as an escaped quote.
			let j = i + 1;
			while (j < expr.length) {
				if (expr[j] === "'") {
					if (expr[j + 1] === "'") {
						j += 2;
						continue;
					}
					j++;
					break;
				}
				j++;
			}
			current += expr.substring(i, j);
			i = j;
			continue;
		}
		if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			depth = Math.max(0, depth - 1);
		} else if (ch === ',' && depth === 0) {
			terms.push(current);
			current = '';
			i++;
			continue;
		}
		current += ch;
		i++;
	}
	terms.push(current);
	return terms;
}

/**
 * Normalize a single ORDER BY term for comparison: trim, drop a trailing
 * ASC/DESC keyword, strip [brackets] from each dot-delimited segment, and
 * lowercase.
 */
function normalizeSortTerm(term: string): string {
	const withoutDirection = term.trim().replace(/\s+(ASC|DESC)\s*$/i, '');
	return withoutDirection
		.split('.')
		.map((segment) => {
			const s = segment.trim();
			return s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1).trim() : s;
		})
		.join('.')
		.toLowerCase();
}

/**
 * Append the table's primary key to an ORDER BY expression as a total-order
 * tiebreaker for pagination.
 *
 * If the PK already appears as any sort term — bare or qualified with the base
 * table name, with or without ASC/DESC — the expression is returned unchanged:
 * a unique key anywhere in the sort yields a total order, and SQL Server
 * rejects duplicate ORDER BY columns. A term qualified with a different prefix
 * (e.g. a joined table's same-named column) is a different column, so the PK
 * is still appended. The PK is appended bare; callers that qualify query
 * clauses against the base table should do so after calling this.
 */
export function appendPkTiebreaker(
	orderby: string | undefined,
	pk: string,
	tableName: string,
): string {
	if (!orderby || orderby.trim().length === 0) {
		return pk;
	}

	const pkLower = pk.toLowerCase();
	const qualifiedPkLower = `${tableName.toLowerCase()}.${pkLower}`;
	const alreadyPresent = splitTopLevelTerms(orderby).some((term) => {
		const normalized = normalizeSortTerm(term);
		return normalized === pkLower || normalized === qualifiedPkLower;
	});
	if (alreadyPresent) {
		return orderby;
	}

	const trimmed = orderby.replace(/[\s,]+$/, '');
	if (trimmed.length === 0) {
		return pk;
	}
	return `${trimmed}, ${pk}`;
}
