# Ideas & Improvements

## Features

### Dynamic field mapping
Instead of raw JSON input for create/update, provide a UI that maps fields dynamically based on the selected table's schema.

### MP type generation
Port the MPNext `generate-mp-types` pattern so users can generate TypeScript types from their MP instance's schema.

## Improvements

### Token caching
Currently the OAuth2 client credentials token is fetched on every API request. Cache the token and reuse it until expiry.

### Pagination support
Implement automatic pagination for large result sets on Get Many operations.

### File download as binary
The File > Get operation should return binary data that can be passed to downstream nodes (e.g., save to disk, attach to email).

## Technical Debt

(None yet — fresh project)
