# Changelog

## 0.3.0 — 2026-08-26

### Fixed

- **File → Get was broken: it always threw `ERR_INVALID_ARG_TYPE`.** `mpApiRequestBinary` requested `returnFullResponse: true`, so n8n's `httpRequest` resolved to a `{ body, headers, statusCode, statusMessage }` envelope while the transport cast it to `Buffer` and the node then called `Buffer.from(<envelope object>)`, which throws. Nothing consumed the envelope's headers or status, so the option is simply removed and the helper now resolves to the actual file Buffer. No test could have caught it — the `httpRequest` helper is typed `Promise<any>`, which let the cast compile silently.
- **Expired-token retry now sees MP's 500/IDX10223 error body.** `isTokenExpiredError` looked for the response body at `error.cause.response.data`, but `helpers.httpRequest` rethrows the raw AxiosError with the body at `error.response.data` — so the IDX10223 detection never fired and only the 401 path triggered a retry. The check now reads both shapes and decodes Buffer bodies (from binary requests) before matching.

### Added

- **File → Upload** (`POST /files/{table}/{recordId}`): attach one or more files to any MP record, replacing raw HTTP Request nodes for MP uploads. Table picker reuses the dynamic table dropdown; comma-separated **Input Binary Field** names upload multiple files in one request as multipart parts `file-0`, `file-1`, …; **Additional Fields** cover `$description` (applies to every file in the request), `$default` (set as default image), `$longestDimension` (server-side image resize), and Audit User ID → `$userId` (note: the `/files` endpoints use `$userId` for audit attribution, unlike `$User` on `/tables` writes). Emits one item per returned FileDescription, surfacing `FileId` and `UniqueFileId`. All four query params verified against live MP, including multi-file behavior and the 200×160→64px resize.
- **File → Get Many** (`GET /files/{table}/{recordId}`): list file attachment metadata for a record, with a **Default Only** toggle (`$default=true`). Returns metadata only — pair with File → Get and the returned `UniqueFileId` to download content.
- **Hand-rolled multipart encoder** (`shared/multipart.ts`): the community-nodes import allowlist bans the `form-data` package, so the multipart body is encoded into a Buffer directly (boundary from `node:crypto`, WHATWG-style escaping of workflow-controlled filenames as a header-injection guard, per-part Content-Type validation). A Buffer body also replays safely on the expired-token retry, unlike the streams n8n's HTTP Request node re-uses under filesystem/S3 binary mode. Uploads are size-checked against MP's ~20 MB request limit before sending.
- **Transport tests**: `tests/multipart.test.ts` pins the encoder's framing byte-for-byte; `tests/transport.test.ts` pins `buildQueryString`'s skip semantics and the widened `isTokenExpiredError` (both now exported for tests).

## 0.2.1 — 2026-08-03

### Fixed

- **Deterministic pagination on Get Many.** Multi-page fetches previously paged with `$top`/`$skip` and no enforced `$orderby`. SQL Server gives no ordering guarantee without an `ORDER BY`, and MP evaluates each page request independently — so results over 1000 rows could silently duplicate rows on one page and drop them from another (the count looked right; the data was wrong). Get Many now appends the table's primary key to `$orderby` as a sort tiebreaker on every page request, including manual `$skip` offset windows (whose contents are equally undefined without a total order, even when `$top` fits in a single batch). The PK is discovered from a `$top=1` default-select probe (first column in schema order), cached per execution, skipped when it already appears in the sort, and qualified with the table name so FK-join queries stay unambiguous.
- **Stored procedure results now emit rows, not result sets.** `/procs/{name}` always returns an array of result sets (`[[...rows], [...rows]]`), even for single-result-set procs. Execute previously passed that envelope straight through, so every emitted item's `json` was an entire result-set array instead of a row object.

### Added

- **Result Set Handling** option on Stored Procedure → Execute: **First Result Set** (default, one item per row of result set 0), **All Result Sets (Flattened)** (one item per row across all result sets, annotated with `_resultSetIndex`), **All Result Sets (Grouped)** (one item per result set: `{ resultSetIndex, rows }`). Non-envelope responses (error bodies, older MP versions) fall back to plain record handling instead of throwing.
- **`@` auto-prefix on stored procedure parameter names** — `{ "ContactID": 1 }` and `{ "@ContactID": 1 }` both work now. Parameters must be a JSON object (clear error otherwise), and expressions that resolve to an object are accepted directly.
- **Guard for grouped multi-page queries**: with `$groupby`, `$having`, aggregate functions in `$select`, or `$distinct` + `$select`, the PK tiebreaker can't legally be applied — if such a query spans multiple pages without a user-supplied `$orderby`, Get Many now stops with a clear error instead of returning nondeterministically-ordered pages.
- **Unit test suite** (vitest): `npm test`. Tests now gate the Release workflow alongside lint and build.

## 0.2.0 — 2026-05-06

- Internal node name renamed to `ministryPlatformTmc` and credential name to `ministryPlatformTmcApi` (displayName "Ministry Platform (Moody)"), so this package can be installed alongside ACST's official `n8n-nodes-ministryplatform`.

## 0.1.0 — 2026-05-06

- Initial release: Table Get Many / Get / Create / Update / Delete (single + bulk), Stored Procedure List / Execute, Communication Send (email/SMS), File Get (binary + thumbnail).
- Dropdown-driven UI: table/procedure pickers, GUI filter/column/sort builders, dynamic field mapping.
- Proactive OAuth2 token cache with expired-token retry (401 and MP's 500-with-IDX10223).
- Auto-pagination in 1000-row batches; automatic `POST /tables/{table}/get` fallback for URLs over the ~4096-char IIS limit; column auto-qualification against the selected table.
