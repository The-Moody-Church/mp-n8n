# Project Status

## Current State (2026-04-08)
- All MP REST API endpoints implemented per official ACST docs
- Table: Get Many (auto-pagination + POST-based GET fallback for long queries), Get, Create, Update, Delete (single + bulk)
- Stored Procedure: List (with $search), Execute
- Communication: Send (Email/SMS)
- File: Get (binary download with thumbnail)
- Audit User ID ($User) on all write operations for audit trail control
- POST /tables/{table}/get auto-fallback eliminates URL length limit issues
- Feature parity with ACST n8n node, plus dynamic dropdowns, field mapping UI, communications, files
- Security hardened, clear error messages (especially 403 permissions)

## Next Steps
- Test locally with `npm run dev` against a real MP instance
- Validate all operations end-to-end
- Publish to npm as community node
