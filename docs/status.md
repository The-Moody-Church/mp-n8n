# Project Status

## Current State (2026-08-26)
- **File → Upload + File → Get Many** added (0.3.0): native multipart upload to `POST /files/{table}/{recordId}` (multi-file via comma-separated binary fields, `$description`/`$default`/`$longestDimension`/`$userId`) and metadata listing via `GET /files/{table}/{recordId}` (optional `$default`). Multipart body is hand-encoded into a Buffer in `shared/multipart.ts` — the community-nodes import allowlist bans the `form-data` package. All params verified against live MP on a scratch Contacts record (multi-file `$description` sharing, `IsDefaultImage`, 200×160→64px resize; `$userId` accepted but audit attribution unverifiable — the API user can't read `dp_Files`).
- **File → Get bug fixed**: `mpApiRequestBinary` set `returnFullResponse: true` and cast the response envelope to Buffer, so every File → Get threw `ERR_INVALID_ARG_TYPE`. Also fixed: `isTokenExpiredError` never saw MP's 500/IDX10223 body (it read `cause.response.data`; AxiosErrors carry it at `response.data`), so the expired-token retry only fired on 401s.
- **Contract source**: the live tenant swagger (`{baseUrl}/ministryplatformapi/swagger/docs/v1`) documents the `/files` endpoints that both the repo's ACST spec and the PowerAutomate connector spec lack — it settled `$userId` (files audit) vs `$User` (tables write audit) vs Query Options `$userId` (Global Filter on reads).
- Test suite now 71 tests across `shared/pagination.ts`, `shared/procedureResults.ts`, `shared/multipart.ts`, and `shared/transport.ts` (`buildQueryString` + `isTokenExpiredError` exported for tests).
- Purpose: workflow ezq1Omm71ACQjxtw ("Mandated Reporter IL Certification Intake") uploads via a raw HTTP Request node with free-text `nodeCredentialType` — the last raw HTTP node pointed at MP, silently broken once by the a70f187 credential rename. Swap to the native node after the 0.3.0 release + TMC1 update.

## Earlier (2026-07-29)
- **Deterministic pagination**: Get Many appends the table's PK to `$orderby` as a sort tiebreaker on multi-page fetches (probed via `$top=1` default-select, cached per execution, skipped when already present, table-qualified via the auto-qualifier). Grouped/aggregate/distinct+select queries can't take the tiebreaker — they now throw a clear error when they span pages without a user `$orderby`, instead of silently returning duplicated/missing rows.
- **Stored Procedure Execute fixed**: unwraps MP's array-of-result-sets envelope via a new Result Set Handling option (First Result Set default / All Flattened with `_resultSetIndex` / All Grouped). `@` auto-prefix on parameter names; parameters validated as a JSON object; expression-produced objects accepted.
- **Unit tests**: vitest suite in `tests/` (53 tests over the pure helpers `shared/pagination.ts` + `shared/procedureResults.ts`); `npm test` gates the Release workflow. Note: n8n strict mode forbids modifying `eslint.config.mjs`, so test files carry a file-level eslint-disable for the community-nodes import allowlist.
- Version bumped to 0.2.0 (unpublished); `CHANGELOG.md` added.

## Earlier (2026-05-06)
- v0.2.0 renames internal node `name` to `ministryPlatformTmc` and credential `name` to `ministryPlatformTmcApi` so the package can be installed alongside the official `n8n-nodes-ministryplatform` (ACST) for side-by-side comparison
- displayName updated to "Ministry Platform (Moody)" / "Ministry Platform (Moody) API" so users distinguish the two packages in the editor and Credentials list
- Note: credentials are NOT shared between packages — each MP package has its own credential type. Configure both with the same Client ID / Secret values to use both side-by-side.

## Earlier (2026-04-30)
- v0.1.1-beta.1 base + fixes for URL encoding, error visibility, and SQL ambiguity (deployed dist/ to TMC1 n8n instance pending new release tag)
- Manual URL builder with `encodeURIComponent` keys+values (matches Swagger encoding) — replaces axios's default which left `$`, `,`, and `.` unencoded and broke some FK-join shapes
- MP error response body now surfaces in n8n error messages (e.g. `MP GET /tables/X failed (HTTP 500): Ambiguous column name 'Y'`)
- Auto-qualifier prefixes bare column references in `$filter` / `$orderby` / `$groupby` / `$having` with the selected table name (skips already-prefixed identifiers, SQL keywords, function calls, AS aliases, string literals). `$select` deliberately untouched — MP routes bare columns flexibly across joined tables
- Drops `Content-Type: application/json` from GET requests (mirrors mp-charts production code)
- Proactive token cache replaces n8n preAuthentication (fixes MP 500-for-expired-token bug)
- GUI builders for Filter, Columns to Return, and Sort By on Get Many
- Auto-pagination always on; $top respected as max record limit
- Postman collection added for direct API testing (all endpoints + auto-save token)
- Build and lint pass clean on n8n strict mode

## Deployed Operations
- Table: Get Many (filter/select/sort builders, auto-pagination, POST fallback), Get, Create, Update, Delete (single + bulk)
- Stored Procedure: List (with $search), Execute
- Communication: Send (Email/SMS)
- File: Get (binary download with thumbnail), Get Many (metadata listing, optional default-only), Upload (multipart, multi-file, description/default/resize/audit params)

## Known Limitations
- Field mapping dropdown empty for tables with no records (use Manual mode)
- Columns to Return (multiOptions) requires close/reopen after selecting table to populate
- All operations shown regardless of per-table permissions (403 error explains what to fix)

## Released (2026-08-03)
- **0.2.1 is stable** (npm dist-tag `latest`; promoted from `0.2.1-beta.1` after a 5-day soak). TMC1's n8n runs the npm-managed 0.2.1.
- The old pre-rename `n8n-nodes-ministry-platform` package is fully retired from TMC1: all 5 dependent production workflows (17 nodes) were migrated to `ministryPlatformTmc` + the "Ministry Platform (Moody) account" credential via DB migration of the `workflow_history` draft rows + republish. See the 2026-07-29 session doc.

## Next Steps
- Release 0.3.0 (`gh workflow run release.yml -f channel=latest -f version=0.3.0`), update TMC1's community node via the n8n UI, restart, then swap the raw HTTP upload node in workflow ezq1Omm71ACQjxtw for File → Upload.
- Verify File → Get post-fix through n8n (it threw on every use before 0.3.0).
- Live-MP smoke of the 0.2.1 fixes: a >1000-row Get Many (e.g. Contacts) and a multi-result-set proc via Execute.
- Implement Custom API Call operation
- Test POST /tables/{table}/get fallback with large filter
