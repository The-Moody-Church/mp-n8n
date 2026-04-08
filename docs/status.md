# Project Status

## Current State (2026-04-08)
- All MP swagger endpoints implemented: Table (full CRUD + delete), Stored Procedure (list + execute), Communication (send), File (get)
- Feature parity with ACST's n8n-nodes-ministryplatform, plus: dynamic dropdowns, field mapping UI, communications, files, auto-pagination, URL length checks, server timezone config
- OAuth2 client credentials auth with token caching, 401 auto-retry, and enhanced error messages (especially 403 permission errors)
- Simpler credential setup: user provides platform URL, node appends /ministryplatformapi
- Security hardened: path traversal protection, error sanitization, input validation, JSON parse safety
- Build and lint pass clean on n8n strict mode

## Next Steps
- Test locally with `npm run dev` against a real MP instance
- Validate all operations end-to-end
- Set up GitHub Actions CI/CD (saved for v1 deployment)
- Publish to npm
