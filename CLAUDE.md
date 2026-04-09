# CLAUDE.md — n8n-nodes-ministry-platform

n8n community node for Ministry Platform. Connects to the MP REST API to provide table CRUD, stored procedure execution, communications (email/SMS), and file retrieval — all with dropdown-driven UI so users don't need to write code.

## Safety

> **NEVER delete, update, or create MP records without explicit user confirmation.** Ministry Platform is a shared production database with real church member data. See `.claude/rules/security.md`.

## Commands

```bash
npm run build          # Compile TypeScript → dist/
npm run build:watch    # Watch mode
npm run dev            # Launch n8n with this node loaded for local testing
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run release        # Bump version and publish
```

## Architecture

### n8n Node Structure

This is an **n8n community node** — a TypeScript npm package that n8n discovers at runtime. The key pattern is **resource + operation**: the user picks a resource (Table, Stored Procedure, Communication, File) and an operation (Get Many, Get, Create, Update, Execute, Send), then fills in operation-specific fields.

```
credentials/
  MinistryPlatformApi.credentials.ts   # OAuth2 client credentials config
nodes/MinistryPlatform/
  MinistryPlatform.node.ts             # Main node — execute logic
  resources/
    table/                             # Table CRUD operations
      index.ts                         # Operation picker + table selector
      getAll.ts, get.ts, create.ts, update.ts
    procedure/                         # Stored procedure operations
      index.ts, execute.ts
    communication/                     # Email/SMS operations
      index.ts, send.ts
    file/                              # File attachment operations
      index.ts, get.ts
  shared/
    transport.ts                       # Proactive token cache + authenticated requests
    descriptions.ts                    # Shared field definitions (table/proc selectors, query options)
  listSearch/
    getTables.ts                       # Dynamic dropdown — fetches table list from /tables
    getProcedures.ts                   # Dynamic dropdown — fetches proc list from /procs
    getTableFields.ts                  # Dynamic dropdown — fetches field names from a table
icons/
  ministry-platform.svg
postman/
  MinistryPlatform-API.postman_collection.json   # Postman collection for direct API testing
  README.md
```

### Ministry Platform API

The credential stores the platform URL (e.g. `https://churchname.ministryplatform.com`). The node appends `/ministryplatformapi` automatically. Key endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tables` | GET | List all available tables |
| `/tables/{table}` | GET | Query records (supports `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$groupby`, `$distinct`) |
| `/tables/{table}/{id}` | GET | Get single record by ID |
| `/tables/{table}` | POST | Create records (JSON array body) |
| `/tables/{table}` | PUT | Update records (JSON array body, must include PK) |
| `/tables/{table}/{id}` | DELETE | Delete a record by ID |
| `/procs` | GET | List stored procedures (supports `$search`) |
| `/procs/{proc}` | POST | Execute stored procedure |
| `/communications` | POST | Send email/SMS |
| `/files/{id}` | GET | Retrieve file attachment (supports `$thumbnail`) |

Auth is OAuth2 client credentials: POST to `{baseUrl}/oauth/connect/token` with `grant_type=client_credentials`.

### Known API Limits

These limits were discovered through production experience in mp-charts and are enforced/documented in this node:

| Limit | Value | Impact | Enforcement |
|-------|-------|--------|-------------|
| **IIS URL length** | ~4096 chars | GET requests with large `$filter` IN() clauses or many `$select` columns get a cryptic 404 | `transport.ts` estimates URL length and throws a clear error before sending |
| **Concurrent connections** | ~6 max | Bursts of parallel requests cause TCP `ConnectTimeoutError`, cascading into token refresh failures | n8n workflow design concern — document for users |
| **Request body size** | ~20 MB | Large POST/PUT payloads may be rejected | API server enforced |

The URL length limit is the most commonly hit. In mp-charts, queries with ~240 participant IDs in an `IN (...)` clause exceeded the limit. The fix was batching with `BATCH_SIZE = 100`. Users of this node should split large filter expressions across multiple requests in their n8n workflow.

### API Quirks & Tips (from mp-charts production experience)

**Dates are in the server's local timezone** — MP returns dates as ISO strings without timezone info (e.g. `2026-03-12T00:00:00`). These are in whatever timezone the MP server runs in, which varies by deployment. The credential has a **Server Timezone** field (defaults to `America/Chicago`) that records what timezone the data represents — the node passes dates through as-is, but the setting makes the timezone explicit for workflows that need to know. The `getServerTimezone()` helper in `shared/transport.ts` reads this from credentials.

**Filter syntax is SQL WHERE** — The `$filter` parameter maps directly to SQL WHERE clauses (not OData). Supports `LIKE`, `IN()`, `IS NULL`, `GETDATE()`, boolean logic, and most SQL functions. Single quotes must be doubled: `Display_Name = 'O''Brien'`.

**POST-based GET for long queries** — `POST /tables/{table}/get` accepts query parameters in the request body instead of the URL. The transport layer automatically switches to this when a GET URL would exceed ~4096 characters. Parameters map as: `$select` → `Select`, `$filter` → `Filter`, etc.

**$User for audit trail** — On POST, PUT, and DELETE, the `$User` query parameter controls which MP user appears in the audit log. If omitted, the API client's default user is recorded. Exposed as the "Audit User ID" field on create/update/delete operations.

**Bulk delete** — Single delete uses `DELETE /tables/{table}/{id}`. Multiple IDs use `POST /tables/{table}/delete` with `{ "Ids": [1, 2, 3], "User": 96 }`. The node detects comma-separated IDs and uses the appropriate method automatically.

**Nested record creation** — The API supports creating related records in a single POST by nesting JSON objects on FK fields (e.g. creating a Household with an Address in one call). Currently supported via the Raw JSON input mode.

**$select advanced syntax** — Use `FK_ID_Table.Column` for joins, aggregates like `SUM(Amount) AS Total`, and special columns:
- `Member_Status_ID_Table.Member_Status` — FK join
- `Household_ID_Table_Address_ID_Table.City` — chained FK joins
- `dp_Created.*, dp_Updated.*` — audit log (who created/updated, when)
- `dp_fileUniqueId` — default image file GUID
- `SUM(Donation_Amount) AS Total` — aggregate functions with `$groupby`

**Auto-pagination** — Without explicit `$top`/`$skip`, the API returns a default page (not all records). The Get Many operation always auto-paginates in 1000-record batches. If `$top` is set, it's respected as the max records to return.

**Response format** — Zero results returns `[]`, not null. Optional FK joins that don't resolve return `null` values in the record. Stored procedures return `unknown[][]` (array of arrays of values), not arrays of objects.

**Token lifetime** — Client credentials tokens are valid for ~1 hour. The transport layer caches tokens with a 5-minute refresh buffer before expiry (proactive cache, not relying on n8n's preAuthentication). If a token expires despite the buffer (clock skew), the retry logic detects both 401 and MP's non-standard 500-with-IDX10223 errors.

### Key Patterns

- **Declarative descriptions**: Node UI is defined via `INodeProperties` arrays, not JSX. Each operation's fields live in their own file and are spread into the parent resource description.
- **`displayOptions.show`**: Controls which fields appear based on the selected resource/operation.
- **`resourceLocator`**: Table and procedure selectors use n8n's resource locator with `listSearch` methods that hit the MP API for dynamic dropdowns.
- **`loadOptions`**: The `getFieldsForFilter` method fetches column names from a table (via `$top=1` query) for filter builder, column picker, and sort builder dropdowns.
- **GUI builders**: Get Many has `fixedCollection`-based filter and sort builders, plus a `multiOptions` column picker. All merge with raw Query Options for advanced use.
- **Transport layer**: `shared/transport.ts` manages a proactive token cache and adds the Bearer token to all API requests. Uses `httpRequest` (not `httpRequestWithAuthentication`) for full control over token lifecycle.

## Code Style

- **Tabs for indentation** (n8n convention, enforced by prettier/eslint)
- **Single quotes**, trailing commas, semicolons
- **PascalCase** for classes/types, **camelCase** for functions/variables
- Follow the n8n-nodes-starter patterns — check the [starter repo](https://github.com/n8n-io/n8n-nodes-starter) when in doubt

## Testing

Local testing: `npm run dev` starts an n8n instance with this node loaded. Configure credentials in the n8n UI and build a test workflow.

For Docker-based testing on the dev server (ironside), mount the built `dist/` into n8n's custom nodes directory.

For direct API testing without n8n, import the Postman collection from `postman/` — see `postman/README.md` for setup.

## Context & Documentation

- `docs/status.md` — Current project state (read first)
- `docs/ideas.md` — Feature ideas and improvements
- `docs/sessions/` — Per-session summaries
- `.claude/rules/` — Detailed rules (git workflow, security)
- `.claude/references/` — Reference materials (added as needed)

## Reference Projects

- **[PowerAutomate connector](https://github.com/MinistryPlatform-Community/PowerAutomate)** — MP's official Power Automate connector; the swagger.json defines all API operations
- **[MPNext](https://github.com/MinistryPlatform-Community/MPNext)** — Next.js template for MP; type generation pattern for MP schemas
- **[mp-charts](https://github.com/The-Moody-Church/mp-charts)** — Our MPNext implementation; reference for MP API integration patterns
