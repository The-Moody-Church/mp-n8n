# 2026-08-26 — File Upload, Get Many, and the multipart encoder

## Problem

Workflow ezq1Omm71ACQjxtw ("Mandated Reporter IL Certification Intake") uploaded certificate PDFs to MP through a raw `n8n-nodes-base.httpRequest` node with free-text `nodeCredentialType`. The 0.2.0 credential rename (a70f187) silently broke it — n8n's editor shows no error badge for an unregistered credential type — and no migration tooling can catch that parameter. It was the last raw HTTP Request node pointed at MP. Two latent transport bugs also surfaced during planning:

- **File → Get threw on every use.** `mpApiRequestBinary` set `returnFullResponse: true`, so `helpers.httpRequest` resolved to a `{ body, headers, statusCode, statusMessage }` envelope; the `as Buffer` cast compiled (the helper is typed `Promise<any>`) and `Buffer.from(<envelope>)` in the node then threw `ERR_INVALID_ARG_TYPE`.
- **The IDX10223 half of the expired-token retry was dead code.** `isTokenExpiredError` read the error body at `error.cause.response.data`, but `helpers.httpRequest` rethrows raw AxiosErrors with the body at `error.response.data` (the shape `extractMpErrorDetail` already used). Only the 401 path ever triggered a retry.

## Fixes

- **File → Upload** (`POST /files/{table}/{recordId}`) and **File → Get Many** (`GET /files/{table}/{recordId}`) added; both reuse `tableSelect`/`getTables` for the table picker and `recordIdField` (previously a dead export). Upload takes comma-separated Input Binary Field names → multipart parts `file-0`, `file-1`, …, and Additional Fields for `$description`/`$default`/`$longestDimension`/Audit User ID → `$userId`. Both path segments are `encodeURIComponent`-ed after `validatePathSegment` (which only validates — and note mp-charts' own `uploadFiles()` skips encoding; its `getFilesByRecord()` has the security comment explaining the `../..` dot-segment risk).
- **`shared/multipart.ts`**: hand-rolled multipart/form-data encoder — the `@n8n/eslint-plugin-community-nodes` import allowlist bans the `form-data` package and `n8n.strict: true` forbids eslint overrides. Boundary is `----n8nMpFormBoundary` + 128 bits of `node:crypto` hex; filenames/names get WHATWG-style escaping (`"`→`%22`, CR→`%0D`, LF→`%0A`) as a header-injection guard (they come from workflow-controlled `IBinaryData`); part Content-Types are validated with an `application/octet-stream` fallback; a `filename=` attribute is always emitted because ASP.NET treats parts without one as form fields, not files.
- **`mpApiRequestMultipart`** added as a transport sibling (it must live in `transport.ts`: the token internals are module-private and the file-scoped manual-auth eslint-disable covers it). Buffer body + explicit multipart Content-Type + `json: true` — in n8n's `httpRequest`, `json` only sets the Accept header; axios passes Buffers raw and JSON-parses the response (in-repo precedent: `getAccessToken` sends a pre-serialized string body with `json: true`). No `encoding`, no `returnFullResponse`. The Buffer replays safely on the expired-token retry — unlike the binary streams n8n's HTTP Request node re-uses under filesystem/S3 binary mode, which was one reason to stop using it for MP uploads. Uploads are pre-checked against MP's ~20 MB request limit, and the URL against the ~4096-char IIS limit (a long `$description` can hit it; the GET-only POST fallback doesn't apply).
- `returnFullResponse: true` removed from `mpApiRequestBinary`; `isTokenExpiredError` widened to `error.response.data` (decoding Buffer bodies); `buildQueryString` and `isTokenExpiredError` exported for tests. Suite grew 53 → 71 (`tests/multipart.test.ts` pins the framing byte-for-byte; `tests/transport.test.ts` pins the skip semantics the upload params rely on).

## Contract discovery

Neither the repo's ACST swagger nor MP's PowerAutomate connector spec documents `POST /files/{table}/{recordId}`. The **live tenant swagger** (`{baseUrl}/ministryplatformapi/swagger/docs/v1`) does — it settled the `$userId` question: `/files` operations take `$userId` for audit attribution, while `/tables` writes use `$User`, and the `$userId` in table Query Options is a third thing entirely (Global Filter evaluation on reads).

## Live verification (scratch Contacts record 227752, created and deleted same-session)

Through the actual built encoder (`dist/.../multipart.js`) against live MP:

- Single- and multi-file uploads returned correct `FileDescription[]`; `$description` applies to **every** part of a multi-file request.
- `$default=true` set `IsDefaultImage`, and `GET …?$default=true` filtered to just that file.
- `$longestDimension=64` resized a 200×160 PNG to 64×51 server-side.
- `$userId` was accepted; actual audit attribution could not be independently confirmed — the API service account cannot read `dp_Files` ("User 'apiuser' does not have access"), and the table is outside the MP-MCP allowlist.
- Cleanup verified: all five files deleted via `DELETE /files/{fileId}`, then the contact deleted; final listing returned `[]`.

Deliberately deferred: PUT/DELETE `/files/{fileId}` operations (zero production callers; PUT's multipart field is `file`, singular, not `file-0`).

## Rollout

0.3.0 via the Release workflow (`channel=latest`, explicit `version=0.3.0` — the workflow bumps package.json itself). TMC1's `/home/node/.n8n/nodes/package.json` pins `^0.2.1`, which a 0.x caret will not resolve to 0.3.0 — update through the n8n UI (Settings → Community Nodes), restart from `/srv/n8n`, then swap the raw HTTP node in ezq1Omm71ACQjxtw for File → Upload (Input Binary Field `Certificate`, preserved retry settings) via MCP `update_workflow` + `publish_workflow`.
