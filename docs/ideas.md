# Ideas & Improvements

## Features

### Dynamic field mapping
Instead of raw JSON input for create/update, provide a UI that maps fields dynamically based on the selected table's schema.
**Status: Implemented** — Input Mode toggle with Field Mapping option using searchable column dropdowns.

### GUI filter/select/sort builders
Add guided UI for building $filter, $select, and $orderby without writing raw SQL.
**Status: Implemented** — Filter builder (field + operator + smart quoting), column picker (multiOptions checkboxes), sort builder (field + ASC/DESC). All merge with raw Query Options for advanced use.

### MP type generation
Port the MPNext `generate-mp-types` pattern so users can generate TypeScript types from their MP instance's schema.

### Custom API Call
Add a catch-all operation that lets users make arbitrary API requests with custom method, endpoint, query params, and body. Useful for edge cases or new API features. (Less pressing since 0.3.0 — file upload, the main workload that forced raw HTTP Request nodes, is now native.)

### File upload
Native File → Upload so workflows stop using raw HTTP Request nodes against `/files` (free-text `nodeCredentialType` broke silently on the 0.2.0 credential rename).
**Status: Implemented** — 0.3.0 adds Upload (multipart `POST /files/{table}/{recordId}`, multi-file, $description/$default/$longestDimension/$userId) and Get Many (metadata listing). PUT/DELETE `/files/{fileId}` deliberately deferred: zero production callers, and PUT's multipart field is `file` (singular), not `file-0`.

## Improvements

### Token caching
Currently the OAuth2 client credentials token is fetched on every API request. Cache the token and reuse it until expiry.
**Status: Implemented** — Proactive module-level cache with 5-min refresh buffer before expiry. Detects both 401 and MP's non-standard 500-with-IDX10223 for expired tokens.

### Pagination support
Implement automatic pagination for large result sets on Get Many operations.
**Status: Implemented** — Always auto-paginates in 1000-record batches. $top respected as max records limit. Since 0.2.0, a primary-key sort tiebreaker is appended to every multi-page fetch so pages come from one deterministic order (SQL Server guarantees none without it).

### File download as binary
The File > Get operation should return binary data that can be passed to downstream nodes (e.g., save to disk, attach to email).
**Status: Implemented** — Returns n8n binary data via prepareBinaryData.

### Postman collection
Add a Postman collection for testing the MP API directly, independent of n8n.
**Status: Implemented** — Covers all endpoints with auto-saving token exchange.

## Technical Debt

### multiOptions column picker refresh
The Columns to Return (multiOptions) field requires closing and reopening the node after selecting a table to populate. This is an n8n framework limitation with `loadOptionsDependsOn` on `multiOptions` type fields.

### POST /tables/{table}/get fallback drops $userId / $globalFilterId
The long-URL fallback in `shared/transport.ts` maps only Select/Filter/OrderBy/GroupBy/Having/Top/Skip/Distinct/Search into the POST body — `$userId` and `$globalFilterId` are silently dropped when a query crosses the ~4096-char threshold. Map them in the POST body (or refuse the fallback when they're set). Pre-existing gap, surfaced by the 2026-07-29 review.

### continueOnFail emits partial pages before a mid-pagination error
Get Many pushes each page into the output as it arrives, so any failure on page N (network error, unsafe-order guard) under "On Error: Continue" leaves pages 1..N-1 in the output alongside the error item. Buffering rows per item before emitting would make error output all-or-nothing. Pre-existing pattern, surfaced by the 2026-07-29 review.
