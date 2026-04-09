# Session: Token Cache & GUI Builders (2026-04-09)

## Token Management Rewrite
- **Problem**: MP API returns HTTP 500 (not 401) for expired tokens with .NET `IDX10223` error. n8n's `preAuthentication` only retries on 401, so stale tokens were never refreshed.
- **Fix**: Replaced n8n's `preAuthentication`-based auth with a proactive token cache (ACST pattern). Tokens refresh 5 minutes before expiry. Safety retry catches edge cases (clock skew) by detecting both 401 and IDX10223 in 500 errors.
- **Files**: `shared/transport.ts` (full rewrite), credential `preAuthentication` kept only for credential test button.

## GUI Builders for Get Many
- **Filter Builder**: `fixedCollection` with field dropdown (from `loadOptions`), operator picker, and value input. Smart quoting: numbers unquoted, text single-quoted, booleans → 1/0. Operators: equals, not equals, greater/less than, contains, starts/ends with, IS NULL, IN list.
- **Columns to Return**: `multiOptions` with checkboxes populated from table fields. Known limitation: requires node close/reopen after table selection to populate.
- **Sort By**: `fixedCollection` with field dropdown and ASC/DESC direction.
- All three merge with raw Query Options ($filter, $select, $orderby) for advanced use.

## Pagination Simplification
- Removed Return All toggle and Limit field.
- Always auto-paginates in 1000-record batches.
- `$top` in Query Options respected as max records to return.
- `$skip` respected as starting offset.

## Bug Fixes
- Equals operator value changed from `=` to `eq` (n8n interprets `=` as expression prefix).
- Operator dropdown set to `noDataExpression: true` to lock to Fixed mode.

## ACST Comparison
- Compared with ACST-Innovation/ministryplatform-n8n (v1.1.0, published).
- Our node has more resources (Communication, File), GUI builders, URL length protection, error redaction, and path traversal validation.
- Adopted ACST's proactive token cache approach (more reliable than n8n preAuthentication for MP).
