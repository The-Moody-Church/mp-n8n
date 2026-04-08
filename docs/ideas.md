# Ideas & Improvements

## Features

### Dynamic field mapping
Instead of raw JSON input for create/update, provide a UI that maps fields dynamically based on the selected table's schema.
**Status: Implemented** — Input Mode toggle with Field Mapping option using searchable column dropdowns.

### MP type generation
Port the MPNext `generate-mp-types` pattern so users can generate TypeScript types from their MP instance's schema.

## Improvements

### Token caching
Currently the OAuth2 client credentials token is fetched on every API request. Cache the token and reuse it until expiry.
**Status: Implemented** — Module-level cache keyed by clientId+baseUrl with 60s expiry buffer.

### Pagination support
Implement automatic pagination for large result sets on Get Many operations.
**Status: Implemented** — Return All toggle auto-paginates in 1000-record batches.

### File download as binary
The File > Get operation should return binary data that can be passed to downstream nodes (e.g., save to disk, attach to email).
**Status: Implemented** — Returns n8n binary data via prepareBinaryData.

## Technical Debt

(None yet — fresh project)
