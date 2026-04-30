# 2026-04-30 — URL encoding fix, error visibility, SQL column qualifier

## Problem
A workflow node ("Get Most Recent MDR for each Participant") on `Participant_Certifications` was failing with a generic `Request failed with status code 500` error. The same query worked in Swagger.

## Root causes (uncovered iteratively)
1. **Hidden MP error**: the node was throwing axios's default error message and discarding the response body — the actual MP complaint never reached the user.
2. **URL encoding mismatch**: n8n's `helpers.httpRequest` passes `qs` through axios's default builder, which leaves `$`, `,`, and `.` unencoded. Some MP query shapes need the Swagger-style `%24`/`%2C` encoding to parse correctly.
3. **SQL ambiguity**: with FK joins in `$select`, a bare column name in `$filter` like `Participant_ID` triggered SQL Server `Ambiguous column name 'Participant_ID'` because the joined `Participants` table also has that column.

## Fixes (in `nodes/MinistryPlatform/shared/transport.ts` and `MinistryPlatform.node.ts`)
1. `extractMpErrorDetail` + `enrichRequestError` — wrap thrown axios errors with the MP response body and HTTP code (`MP GET /tables/X failed (HTTP 500): <real reason>`). Looks at `error.response.data` (modern `httpRequest`), `error.cause.response.data` (legacy), and `error.error` (n8n's `request` wrapper).
2. `buildQueryString` — pre-build the URL with `encodeURIComponent` on both keys and values, then pass the full URL to `httpRequest` with no `qs`. Matches Swagger byte-for-byte.
3. `qualifyColumnNames` / `qualifyQueryClauses` — prefix bare column references with the selected table on `$filter`, `$orderby`, `$groupby`, `$having`. Skips already-prefixed identifiers, SQL keywords (`AND`, `OR`, `IS`, `NULL`, `LIKE`, `IN`, `BETWEEN`, `ASC`, `DESC`, etc.), function calls (`MAX(...)`, `GETDATE()`), `AS` aliases, and string literals (with `''` escape handling). Deliberately **not** applied to `$select` — MP resolves bare select columns flexibly across joined tables, and forced base-table prefixing causes "Invalid column name" errors when the column actually lives on a joined table.
4. Drop `Content-Type: application/json` from GET requests — mirrors mp-charts production behavior.

## Surprises worth remembering
- n8n's modern `helpers.httpRequest` lets the raw AxiosError propagate; only the older `helpers.request` wraps with `error.cause.response.data`. The first attempt at the error extractor only checked the wrapped path and silently fell through.
- Don't qualify `$select`. Even when a bare column looks like a base-table column, MP may resolve it via a join. `Participant_Certifications.Certification_Expires` (correct table) can fail where bare `Certification_Expires` succeeds.
- `$skip=0` is fine to send — it doesn't trigger a different SQL plan than omitting it. The "ambiguous column" error in the original report had nothing to do with pagination.

## Deployment
Built `dist/` was copied directly into the running TMC1 n8n container (`docker --context tmc1 cp ... && docker --context tmc1 restart n8n`) for iterative testing. Source is committed on branch `fix/url-encoding-and-column-qualifier`; a new beta release should be cut to make the fix available via npm install.

## Verified working
User confirmed the Participant_Certifications query (filter on bare `Participant_ID`, FK joins in `$select`, sort on `Certification_Expires`) now runs through the node end-to-end after a typo unrelated to the node was corrected in the user's `$Select` field.
