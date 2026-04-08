# Project Status

## Current State (2026-04-08)
- v0.1.0-beta.1 deployed and tested on TMC1 n8n instance
- All MP REST API endpoints implemented per official ACST docs
- Credential test and Table > Get Many confirmed working against live MP
- Build and lint pass clean on n8n strict mode

## Deployed Operations
- Table: Get Many (auto-pagination + POST fallback), Get, Create, Update, Delete (single + bulk)
- Stored Procedure: List (with $search), Execute
- Communication: Send (Email/SMS)
- File: Get (binary download with thumbnail)

## Known Limitations
- Error messages from MP only visible in "Error data" section (n8n NodeApiError not modifiable)
- Field mapping dropdown empty for tables with no records (use Manual mode)
- All operations shown regardless of per-table permissions (403 error explains what to fix)

## Next Steps
- Continue testing all operations against live MP
- Test POST /tables/{table}/get fallback with large filter
- Test bulk delete, stored procedure execute, communications
- Set up GitHub Actions CI/CD for v1 publish
- Publish to npm as community node
