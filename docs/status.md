# Project Status

## Current State (2026-04-30)
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
- File: Get (binary download with thumbnail)

## Known Limitations
- Field mapping dropdown empty for tables with no records (use Manual mode)
- Columns to Return (multiOptions) requires close/reopen after selecting table to populate
- All operations shown regardless of per-table permissions (403 error explains what to fix)

## Next Steps
- Implement Custom API Call operation
- Continue testing all operations against live MP
- Test POST /tables/{table}/get fallback with large filter
- Cut first beta to npm via the new Release workflow (`gh workflow run release.yml -f channel=beta`); requires `NPM_TOKEN` repo secret to be added first — see `RELEASING.md`
- After a beta soaks: cut first stable `0.1.x` to npm `latest` dist-tag
