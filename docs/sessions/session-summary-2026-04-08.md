# Session Summary — 2026-04-08

## Objectives
- Scaffold a new n8n community node for Ministry Platform from scratch
- Create a publishable npm package that makes the MP API approachable from n8n's GUI

## What Was Built

### Initial scaffold (v0.1.0-beta.1)
- Project structure based on n8n-nodes-starter template
- OAuth2 client credentials authentication with token caching
- MinistryPlatform node with Table (CRUD) and Stored Procedure (execute) resources
- Dynamic dropdowns for tables, procedures, and field names via listSearch
- Full swagger-aligned query parameters ($select, $filter, $orderby, $top, $skip, $groupby, $having, $distinct, $userId, $globalFilterId)
- Communication resource (email/SMS) and File resource (binary download)
- .claude/ folder structure (settings, rules, skills, commands, agents)
- CLAUDE.md, README, docs/ with status/ideas/sessions

### Security audit & hardening
- Path traversal protection on all URL-interpolated inputs
- JSON.parse safety with clear error messages
- Error message sanitization (redacts tokens/secrets)
- Token cache keyed by clientId+baseUrl (prevents cross-tenant reuse)
- URL length pre-check (~4096 char IIS limit)
- Input validation (empty checks, contact ID bounds, binary response guards)

### Known limitation fixes
- Token caching with 60s expiry buffer
- File downloads return n8n binary data
- Field mapping UI for create/update (alternative to raw JSON)
- Auto-pagination (Return All with 1000-record batches)

### API tips from mp-charts
- IIS URL length limits, concurrent connection limits, body size limits
- Date timezone handling (server timezone credential field)
- Filter escaping, FK join syntax documentation
- $filter and $select descriptions warn about limits

### ACST comparison gap closure
- DELETE operation on tables
- 401 auto-retry with token cache clear
- Stored procedure List operation (GET /procs with $search)
- $search query parameter
- Simpler base URL (platform URL, node appends /ministryplatformapi)
- Enhanced error messages (especially 403 with permissions guidance)
- README warning about real data + least-privilege API client setup

## Key Decisions
- Use n8n's `authenticate` function on credential (not manual auth in transport) to satisfy linter
- Don't enforce HTTPS — some churches run MP on-prem with HTTP
- Require explicit PK field for update field mapping (don't guess from table name)
- Pass dates through unchanged, use credential timezone to label what they represent
- Operations alphabetized in n8n UI for consistency

## Files Changed
- All files are new (greenfield project)
- 38+ files across credentials/, nodes/, icons/, docs/, .claude/, and root config
