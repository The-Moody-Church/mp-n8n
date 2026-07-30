# Changelog

## 0.2.0 — Unreleased

### Fixed

- **Deterministic pagination on Get Many.** Multi-page fetches previously paged with `$top`/`$skip` and no enforced `$orderby`. SQL Server gives no ordering guarantee without an `ORDER BY`, and MP evaluates each page request independently — so results over 1000 rows could silently duplicate rows on one page and drop them from another (the count looked right; the data was wrong). Get Many now appends the table's primary key to `$orderby` as a sort tiebreaker on every page request. The PK is discovered from a `$top=1` default-select probe (first column in schema order), cached per execution, skipped when it already appears in the sort, and qualified with the table name so FK-join queries stay unambiguous.
- **Stored procedure results now emit rows, not result sets.** `/procs/{name}` always returns an array of result sets (`[[...rows], [...rows]]`), even for single-result-set procs. Execute previously passed that envelope straight through, so every emitted item's `json` was an entire result-set array instead of a row object.

### Added

- **Result Set Handling** option on Stored Procedure → Execute: **First Result Set** (default, one item per row of result set 0), **All Result Sets (Flattened)** (one item per row across all result sets, annotated with `_resultSetIndex`), **All Result Sets (Grouped)** (one item per result set: `{ resultSetIndex, rows }`). Non-envelope responses (error bodies, older MP versions) fall back to plain record handling instead of throwing.
- **`@` auto-prefix on stored procedure parameter names** — `{ "ContactID": 1 }` and `{ "@ContactID": 1 }` both work now. Parameters must be a JSON object (clear error otherwise), and expressions that resolve to an object are accepted directly.
- **Guard for grouped multi-page queries**: with `$groupby`, `$having`, aggregate functions in `$select`, or `$distinct` + `$select`, the PK tiebreaker can't legally be applied — if such a query spans multiple pages without a user-supplied `$orderby`, Get Many now stops with a clear error instead of returning nondeterministically-ordered pages.
- **Unit test suite** (vitest): `npm test`. Tests now gate the Release workflow alongside lint and build.

### Changed

- Internal node name is `ministryPlatformTmc` and credential name is `ministryPlatformTmcApi` (displayName "Ministry Platform (Moody)"), so this package can be installed alongside ACST's official `n8n-nodes-ministryplatform`. (Merged after 0.1.0 was cut; first released here.)

## 0.1.0 — 2026-04

- Initial release: Table Get Many / Get / Create / Update / Delete (single + bulk), Stored Procedure List / Execute, Communication Send (email/SMS), File Get (binary + thumbnail).
- Dropdown-driven UI: table/procedure pickers, GUI filter/column/sort builders, dynamic field mapping.
- Proactive OAuth2 token cache with expired-token retry (401 and MP's 500-with-IDX10223).
- Auto-pagination in 1000-row batches; automatic `POST /tables/{table}/get` fallback for URLs over the ~4096-char IIS limit; column auto-qualification against the selected table.
