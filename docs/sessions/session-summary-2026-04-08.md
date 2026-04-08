# Session Summary — 2026-04-08

## Objectives
- Scaffold a new n8n community node for Ministry Platform from scratch
- Create a publishable npm package that makes the MP API approachable from n8n's GUI
- Test against live MP instance on TMC1

## What Was Built

### Project scaffold (v0.1.0-beta.1)
- n8n community node based on n8n-nodes-starter template
- OAuth2 client credentials via `preAuthentication` pattern (from ACST reference)
- Dynamic dropdowns for tables, procedures, and field names via listSearch
- Full swagger-aligned query parameters
- .claude/ folder structure, CLAUDE.md, README, docs/

### Resources & Operations
- **Table**: Get Many (auto-pagination), Get, Create, Update, Delete (single + bulk)
- **Stored Procedure**: List (with $search), Execute
- **Communication**: Send (Email/SMS)
- **File**: Get (binary download with thumbnail)

### Features from ACST comparison
- DELETE operation (single via DELETE, bulk via POST /tables/{table}/delete)
- 401 auto-retry with fresh token
- Stored procedure List operation
- $search query parameter
- Simpler credential: platform URL only, /ministryplatformapi appended automatically
- $User audit parameter on create/update/delete

### From official ACST docs
- POST /tables/{table}/get — auto-fallback when GET URL exceeds ~4096 chars
- Bulk delete via POST with { Ids: [...] }
- $filter is SQL WHERE syntax (not OData) — supports GETDATE(), LIKE, IN()
- $select supports aggregates (SUM, COUNT), audit joins (dp_Created.*, dp_Updated.*), dp_fileUniqueId
- Nested record creation documented (via raw JSON)

### Security
- Path traversal protection on URL-interpolated inputs
- JSON parse safety with clear errors
- Error message sanitization (redacts tokens/secrets)
- Input validation (empty checks, contact ID bounds)
- README warns about real data modification, recommends least-privilege API clients

### Additional features
- Server timezone credential field (labels what timezone dates represent)
- Field mapping UI for create/update (alternative to raw JSON)
- IIS URL length pre-check with auto POST fallback
- Token caching via n8n's expirable accessToken field

## Testing
- Deployed to TMC1 n8n instance (192.168.5.222)
- Credential test working (preAuthentication + GET /tables)
- Table > Get Many with $filter confirmed working (18 Huff contacts returned)
- Installation: `npm install` from tgz into `/home/node/.n8n/nodes/`, plus DB registration in `installed_packages` and `installed_nodes` tables

## Key Decisions
- Use `preAuthentication` + `IAuthenticateGeneric` (ACST pattern) instead of custom `authenticate` function
- Don't enforce HTTPS on platform URL — some churches use HTTP internally
- Require explicit PK field for update field mapping (no guessing)
- Pass dates through unchanged, timezone field is informational
- Dropped custom error enhancement — n8n's NodeApiError controls UI display and can't be overridden from community node code. MP error messages visible in "Error data" section.

## Known Limitations
- Error messages from MP API only visible in "Error data" section, not the headline
- n8n's NodeApiError can't be modified from community node code
- Dynamic field list requires at least one record in the table (empty tables show no fields)
- Operations (Create, Update, Delete) always shown — can't dynamically hide based on per-table permissions

## Deployment Notes
- TMC1: tgz installed in `/home/node/.n8n/nodes/` via `npm install`
- Required manual DB insert into `installed_packages` and `installed_nodes` tables for n8n to discover the node
- Hard refresh (Cmd+Shift+R) needed after first install for node to appear in search
