# Project Status

## Current State (2026-04-09)
- v0.1.1-beta.1 deployed and tested on TMC1 n8n instance
- Proactive token cache replaces n8n preAuthentication (fixes MP 500-for-expired-token bug)
- GUI builders for Filter, Columns to Return, and Sort By on Get Many
- Auto-pagination always on; $top respected as max record limit
- Postman collection added for direct API testing (all endpoints + auto-save token)
- Build and lint pass clean on n8n strict mode

## Deployed Operations
- Table: Get Many (filter/select/sort builders, auto-pagination, POST fallback), Get, Create, Update, Delete (single + bulk)
- Stored Procedure: List (with $search), Execute
- Communication: Send (Email/SMS)
- File: Get (binary download with thumbnail)

## Known Limitations
- Error messages from MP only visible in "Error data" section (n8n NodeApiError not modifiable)
- Field mapping dropdown empty for tables with no records (use Manual mode)
- Columns to Return (multiOptions) requires close/reopen after selecting table to populate
- All operations shown regardless of per-table permissions (403 error explains what to fix)

## Next Steps
- Implement Custom API Call operation
- Continue testing all operations against live MP
- Test POST /tables/{table}/get fallback with large filter
- Set up GitHub Actions CI/CD for v1 publish
- Publish to npm as community node
