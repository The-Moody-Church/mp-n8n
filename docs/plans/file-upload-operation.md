# Plan: File → Upload operation

Written 2026-08-25 against v0.2.1. Paste the prompt below into a Claude Code session
started in this repo, or work through it by hand.

---

Add a native File → Upload operation (plus File → Get Many) to this n8n community node.

## Why

n8n workflow ezq1Omm71ACQjxtw ("Mandated Reporter IL Certification Intake") uploads a
PDF to MP via a raw n8n-nodes-base.httpRequest node with
`"nodeCredentialType": "ministryPlatformApi"`. Commit a70f187 renamed our credential to
`ministryPlatformTmcApi`, so that node broke — and n8n's editor swallowed the error
(getNodeCredentialIssues returns null for an unregistered credential type, so no red badge).
The credential has since been re-pointed by hand, but nodeCredentialType is a free-text
parameter that no migration tooling can catch. This node is the last raw HTTP Request node
we have pointed at MP; adding a native upload operation closes the class of bug.

Our own transport is also a better path than n8n's HTTP Request node for MP uploads:
transport.ts:1-6 explains that MP returns HTTP 500 / IDX10223 (not 401) for expired tokens,
so we cache tokens proactively. n8n's HttpRequestV3 auth-retry re-uses a getBinaryStream()
for the multipart part when N8N_DEFAULT_BINARY_DATA_MODE is filesystem/s3, and a replayed
consumed stream fails.

## Reference implementation (read it first, do not redesign)

/Users/jonathon.huff/Claude/Code/mp-charts/src/lib/providers/ministry-platform/services/file.service.ts
  — uploadFiles() at ~:46-87 is the MPNext reference, production-proven at TMC against
    Participant_Certifications. Note it appends parts as `file-${index}` with the filename,
    and sends $description / $default / $longestDimension / $userId as QUERY params.
    It also dual-sends three of them as unprefixed form fields — do NOT copy that;
    query-only is proven to work (our live n8n node does exactly that).
  — http-client.ts postFormData() deliberately does not set Content-Type (lets the
    serializer own the boundary).

## API contract

POST /files/{table}/{recordId}    multipart, parts named file-0, file-1, …
  query: $description, $default, $longestDimension, $userId
  returns FileDescription[] — required fields FileId, FileName, FileSize, IsImage,
  IsDefaultImage, TableName, RecordId, UniqueFileId, LastUpdated, InclusionType;
  optional FileExtension, Description, ImageHeight, ImageWidth.

GET /files/{table}/{recordId}     optional $default, returns FileDescription[] metadata

CONFIRMED against live MP: the POST path, multipart, `file-0`, and $description.
NOT confirmed: $default, $longestDimension, $userId. Fire a one-off call against a
throwaway record for each before exposing them as node fields — and settle $userId vs
$User while you're there (we use $User on /tables writes and $userId on /tables reads
with a *different* meaning; see shared/descriptions.ts:156-160).

Skip PUT/DELETE /files/{fileId} this round — zero non-test callers in mp-charts, the
integer-FileId signature is an untested annotation, and PUT's multipart field is `file`
(singular, unindexed), not file-0.

## Hard constraints

- You CANNOT use the `form-data` npm package. @n8n/eslint-plugin-community-nodes allows
  only n8n-workflow, lodash, moment, p-limit, luxon, zod, node:crypto — and
  package.json has n8n.strict: true, which forbids editing eslint.config.mjs.
  Hand-encode multipart into a Buffer. Boundary from node:crypto.
- Tabs, single quotes, trailing commas. Node options alphabetical; `action` strings
  sentence-cased (lint enforces both).
- Never touch MP production data without asking — see .claude/rules/security.md.

## Files

ADD
  nodes/MinistryPlatform/shared/multipart.ts   pure encodeMultipart(parts) →
                                               { body: Buffer; contentType: string }
  nodes/MinistryPlatform/resources/file/upload.ts
  nodes/MinistryPlatform/resources/file/getMany.ts
  tests/multipart.test.ts

EDIT
  shared/transport.ts — add mpApiRequestMultipart() as a SIBLING of mpApiRequest /
    mpApiRequestBinary. Do not refactor mpApiRequest: it hard-sets
    Content-Type: application/json whenever a body exists (~:306-308), forces json: true
    (~:314), and types body as IDataObject|IDataObject[]. The new helper should reuse
    getAccessToken/tokenCache, set only Authorization + Accept + the encoder's boundary
    Content-Type, pass a Buffer body with json: false, and mirror the retry loop
    (~:321-345) using isTokenExpiredError + the retriedAuth guard. Skip the
    MAX_URL_LENGTH block — it's GET-gated and dead weight for a POST.
    ⚠ buildQueryString (~:215-224) drops undefined, null, '', boolean false, and numeric 0
    (except $skip). Stringify booleans/numbers BEFORE they reach it or $default=false and
    $longestDimension=0 silently never send. Confirm these line anchors before editing.
  resources/file/index.ts — rewrite the operation list (get, getMany, upload)
  MinistryPlatformTmc.node.ts — extend the resource === 'file' branch (existing Get is
    ~:856-887). Reuse validatePathSegment (~:28-43) — it only VALIDATES and returns the raw
    string, so encodeURIComponent on both path segments is a separate, required step.
  CLAUDE.md endpoint table, docs/status.md, CHANGELOG.md,
  postman/MinistryPlatform-API.postman_collection.json + postman/README.md
  Leave docs/MinistryPlatform.swagger.json alone — third-party ACST spec.

## Fields — File → Upload

Table              resourceLocator, reuse listSearch/getTables.ts, required
Record ID          number, required
Input Binary Field string, default 'data', comma-separated for multi-file → file-0, file-1, …
Additional Fields:
  Description        → $description
  Set as Default Image (boolean) → $default as 'true'/'false'
  Longest Dimension  (number)    → $longestDimension as string
  Audit User ID      (number)    → $userId   (pending the $userId/$User check above)

Output: one n8n item per returned FileDescription. Surface FileId (for later PUT/DELETE)
and UniqueFileId (GUID, for the download URL). Note the ~20 MB per-file limit in a field
description, matching the wording at resources/file/get.ts:17.

## Tests

tests/multipart.test.ts, pure-function style matching the existing suite (direct shared/
import, no mocks): boundary uniqueness, CRLF framing, Content-Disposition with name and
filename, indexed naming across multiple binaries, byte-for-byte binary passthrough,
closing --boundary--. Add a buildQueryString case pinning the stringified-'false' behaviour.

## Also check (likely one-line fix, fold in if real)

mpApiRequestBinary sets returnFullResponse: true (~:369-371) and then casts the result to
Buffer. In that mode n8n returns a { body, headers, statusCode, statusMessage } envelope,
so Buffer.from(<object>) should throw — meaning File → Get may be broken today. Verify
against a live file before deciding.

## Ship it

- Branch → PR → merge commit (never direct to main for code).
- Bump 0.2.1 → 0.3.0 (additive). Rebuild first — dist/package.json says 0.2.0 while
  package.json says 0.2.1, so dist/ is stale.
- npm run build, npm run lint (strict mode), npm test, then npm publish --access public.
- TMC1's /home/node/.n8n/nodes/package.json pins ^0.2.1, which will NOT pick up 0.3.0.
  Update via the n8n UI (Settings → Community Nodes), which rewrites the pin, then restart
  from /srv/n8n. A prior uninstall through that UI hit EACCES before succeeding.
- Finally, swap the httpRequest node in workflow ezq1Omm71ACQjxtw for the native node,
  keeping "Re-Attach Certificate Binary" feeding it. Publish reads the workflow_history
  draft row, so if you go the SQL route update both it and workflow_entity.nodes.

Start by reading CLAUDE.md, docs/status.md, transport.ts, resources/file/, and the
mp-charts reference above. Confirm every line anchor in this prompt before you edit —
they were read at 0.2.1 and may have drifted.
