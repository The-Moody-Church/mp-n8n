# 2026-07-29 — Deterministic pagination, proc result-set shaping, vitest suite

## Problem

Two silent-data-corruption bugs:

1. **Get Many pagination without a stable sort.** The auto-pagination loop pages with `$top`/`$skip` but never enforced `$orderby`. SQL Server gives no ordering guarantee without ORDER BY, and MP evaluates each page request independently — on >1000-row tables the returned count looked right but rows silently duplicated on one page and vanished from another. Nondeterministic (plan/parallelism dependent), so it passed casual testing; hit in production.
2. **Stored proc responses emitted with the wrong shape.** `/procs/{name}` always returns an array of result sets (`[[...rows], [...rows]]`), even for single-result-set procs. `toRecordArray()` treated the outer array as the row list, so every emitted item's `json` was an entire result-set array. Broken for every proc.

## Fixes

- `nodes/MinistryPlatform/shared/pagination.ts` (new, pure): `planPaginationOrder` classifies a fetch as `single-page` (`$top` ≤ 1000 — skip everything), `tiebreaker` (append PK), or `unsafe-order` (`$groupby`/`$having`/aggregates/`$distinct`+`$select` — no tiebreaker possible). `appendPkTiebreaker` appends the PK unless it already appears as any sort term (bare, table-qualified, bracketed, any case — SQL error 169 forbids duplicate ORDER BY columns, and a PK anywhere already gives a total order); splits sort terms on top-level commas only (paren/quote aware).
- `MinistryPlatformTmc.node.ts`: `probeTablePrimaryKey` (a `$top=1` default-select; first key in schema order is the PK — same trick as `getTableFields`; returns null on empty table/API error, never throws), per-execution `pkCache`. Plan → probe → append runs **before** `qualifyQueryClauses` so the bare appended PK gets table-qualified for free. Unsafe-order queries that actually reach a non-empty page 2 without a user `$orderby` throw a clear `NodeOperationError` (checking `hasMore` after page 1 would false-positive on exactly-N×1000-row results).
- `nodes/MinistryPlatform/shared/procedureResults.ts` (new, pure): `shapeProcResults` with three modes — `firstResultSet` (default), `allFlattened` (rows annotated `_resultSetIndex`), `allGrouped` (`{ resultSetIndex, rows }`); non-envelope responses fall back to plain record handling. `prefixProcParams` auto-adds `@` to bare parameter names (explicit `@Foo` beats bare `Foo`).
- `resources/procedure/execute.ts`: new Result Set Handling options property. Execute handler validates parameters are a JSON object and accepts expression-produced objects directly (json-type params aren't always strings).
- vitest suite: `tests/pagination.test.ts` + `tests/procedureResults.test.ts` (53 tests); `npm test`; Test step added to `release.yml`.

## Surprises worth remembering

- **n8n strict mode (`"n8n": { "strict": true }`) forbids modifying `eslint.config.mjs`** — `n8n-node lint` diff-checks it against the default. The community-nodes import allowlist bans `import ... from 'vitest'`, so test files carry a file-level `eslint-disable @n8n/community-nodes/no-restricted-imports` instead (same pattern as `transport.ts`'s manual-auth disable).
- `tests/` stays out of the root tsconfig `include` on purpose — `n8n-node build` is bare `tsc`, and anything emitted under `dist/` ships to npm (`files: ["dist"]`). `tests/tsconfig.json` (noEmit) provides editor support.
- `$distinct` + `$select` joins the unsafe bucket (SQL error 145: DISTINCT + ORDER BY on unselected column); `$distinct` alone is safe (all columns incl. PK returned).
- A same-named column under a different prefix (`Household_ID_Table.Contact_ID`) is *not* the PK — the tiebreaker must still be appended.
- Release flow: package.json pre-bumped to 0.2.0; blank-version beta dispatch auto-suggests `0.2.0-beta.0`, latest-channel then promotes to `0.2.0`. Don't run `npm run release` locally (pushes tags outside the workflow).

## Verified working

- 53/53 unit tests, `npm run lint` clean (strict mode), `npm run build` clean, no test output in `dist/`.
- Live-MP smoke test pending (see status.md Next Steps).
