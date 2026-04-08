# Project Status

## Current State (2026-04-08)
- Initial project scaffold complete — builds and lints clean
- All 4 MP API resources implemented: Table, Stored Procedure, Communication, File
- OAuth2 client credentials auth via n8n's `authenticate` + `httpRequestWithAuthentication` pattern
- Dynamic dropdowns for table and procedure selection via listSearch
- Full swagger-aligned query parameter support ($select, $filter, $orderby, $top, $skip, $groupby, $having, $distinct, $userId, $globalFilterId)
- CI/CD: GitHub Actions for CI (build+lint on Node 20/22) and npm publish with provenance

## Next Steps
- Test locally with `npm run dev` against a real MP instance
- Validate credential test flow (token exchange + /tables probe)
- Set up NPM_TOKEN secret in GitHub repo for publishing
- Token caching to avoid per-request OAuth2 exchanges
- Dynamic field mapping UI for create/update operations
