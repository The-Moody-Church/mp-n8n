# n8n-nodes-ministry-platform

An [n8n](https://n8n.io/) community node for [Ministry Platform](https://www.ministryplatform.com/) — the church management system by ACST.

This node connects to the Ministry Platform REST API and provides a GUI-driven interface for reading and writing data, making the MP API approachable without code knowledge.

## Features

- **Table Operations** — Full CRUD: get, create, update, and delete records on any MP table with dynamic dropdowns
- **Stored Procedures** — List available procedures and execute them with parameters
- **Communications** — Send email and SMS messages
- **Files** — Retrieve file attachments and thumbnails
- **Dynamic Dropdowns** — Table, procedure, and field name lists are fetched from your MP instance
- **Query Support** — Full support for `$select`, `$filter`, `$search`, `$orderby`, `$top`, `$skip`, `$groupby`, `$having`, and `$distinct`
- **OAuth2 Authentication** — Client credentials flow with automatic token caching and 401 retry
- **Clear Error Messages** — Permission errors (403), not found (404), and other API errors include actionable troubleshooting guidance

> **Important: This node can create, modify, and delete real records in Ministry Platform.** MP is a shared production database with real church member data. We strongly recommend creating a dedicated n8n API user in MP and granting it only the specific table/page permissions your workflows require. This limits the blast radius if a workflow has a bug or is misconfigured.

## Prerequisites

- An n8n instance (self-hosted or cloud)
- Ministry Platform API access with an OAuth2 API client configured
- The API client needs the scope: `http://www.thinkministry.com/dataplatform/scopes/all`

### Setting Up an API Client in Ministry Platform

1. In MP, go to **Administration > API Clients**
2. Create a new API client dedicated to n8n (don't reuse an existing one with broad permissions)
3. Note the **Client ID** and **Client Secret**
4. Go to **Administration > API Client Pages** and grant access only to the tables your workflows need
5. Your platform URL is typically: `https://churchname.ministryplatform.com`

> **Tip: Least-privilege access.** If your workflow only reads from Contacts, only grant Select permission on Contacts. If a workflow writes to Contact_Log, grant Insert on Contact_Log. Don't grant Delete unless a workflow specifically needs it. This way, a 403 error in n8n means "this workflow is trying to do something it shouldn't" rather than silently modifying unexpected data.
>
> **How permissions affect the node:** The table dropdown only shows tables your API client can access — this is already permission-scoped by MP. However, all operations (Get, Create, Update, Delete) are always shown regardless of your specific permissions on that table. If your client lacks permission for an operation, you'll get a clear 403 error explaining where to check permissions in MP Admin.

## Installation

### In n8n (Community Node)

1. Go to **Settings > Community Nodes**
2. Select **Install a community node**
3. Enter `n8n-nodes-ministry-platform`
4. Agree to the risks and install

### Manual / Development

```bash
# Clone the repo
git clone https://github.com/The-Moody-Church/mp-n8n.git
cd mp-n8n

# Install dependencies
npm install

# Build
npm run build

# Run n8n with this node loaded for local testing
npm run dev
```

### Docker (Mount into existing n8n)

If you're running n8n in Docker, you can mount the built node:

```bash
# Build the node
npm run build

# Copy dist/ into your n8n custom nodes volume
# Example for a Docker Compose setup:
docker cp dist/ n8n:/home/node/.n8n/custom/node_modules/n8n-nodes-ministry-platform/dist/
```

Or add it to your `docker-compose.yml`:

```yaml
volumes:
  - ./n8n-nodes-ministry-platform:/home/node/.n8n/custom/node_modules/n8n-nodes-ministry-platform
```

## Configuration

Create credentials in n8n with:

| Field | Description | Example |
|-------|-------------|---------|
| **Platform URL** | Your MP platform URL | `https://churchname.ministryplatform.com` |
| **Client ID** | OAuth2 client ID | From MP Admin > API Clients |
| **Client Secret** | OAuth2 client secret | From MP Admin > API Clients |
| **Scope** | OAuth2 scope | `http://www.thinkministry.com/dataplatform/scopes/all` (default) |
| **Server Timezone** | Your MP server's timezone | `America/Chicago` (default) |

> **About Server Timezone**: Ministry Platform returns dates without timezone info — all dates are in your server's local timezone. This setting records what that timezone is, so your workflows know what the dates represent. If unsure, check with your MP hosting provider.

## Usage

### Get Records from a Table

1. Add a **Ministry Platform** node to your workflow
2. Select **Table** as the resource
3. Choose a table from the dropdown (e.g., Contacts)
4. Set operation to **Get Many**
5. Optionally add query options (`$filter`, `$select`, etc.)

### Get a Single Record by ID

1. Select **Table** as the resource, operation **Get**
2. Choose a table and enter the Record ID
3. Optionally specify `$select` to limit returned columns

### Create or Update Records

1. Select **Table** as the resource, operation **Create** or **Update**
2. Choose the target table
3. Provide the record data as a JSON array:
   ```json
   [{ "Display_Name": "Jane Smith", "Email_Address": "jane@example.com" }]
   ```
4. For updates, include the primary key field in each object
5. Optionally use `$select (Response)` to control which fields are returned

### Delete a Record

1. Select **Table** as the resource, operation **Delete**
2. Choose the table and enter the Record ID
3. The record will be **permanently deleted** — this cannot be undone

> If you get a 403 error, your API client doesn't have Delete permission on that table. This is by design — grant Delete access in MP only when a workflow specifically needs it.

### Execute a Stored Procedure

1. Select **Stored Procedure** as the resource, operation **Execute**
2. Choose a procedure from the dropdown
3. Provide parameters as a JSON object:
   ```json
   { "@ContactID": 12345 }
   ```

### List Available Stored Procedures

1. Select **Stored Procedure** as the resource, operation **List**
2. Optionally enter a search term (supports `*` wildcard, e.g. `api_*`)

### Send an Email or SMS

1. Select **Communication** as the resource, operation **Send**
2. Choose Email or SMS as the communication type
3. Fill in the required fields (Author User ID, From Contact ID, Subject, Body, Recipients)
4. For SMS, provide the Text Phone Number ID in additional options

### Get a File Attachment

1. Select **File** as the resource, operation **Get**
2. Enter the Unique File ID
3. Optionally enable Thumbnail to get a smaller version

## Development

```bash
npm run dev            # Start n8n with the node for local testing
npm run build          # Compile TypeScript
npm run build:watch    # Watch mode for development
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix lint issues
```

## Publishing

This package uses GitHub Actions to publish to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) (required for verified n8n community nodes as of May 2026).

To publish a new version:
1. Update the version in `package.json`
2. Create a GitHub Release with a tag matching the version (e.g., `v0.1.0`)
3. The `publish.yml` workflow will automatically build, lint, and publish to npm

## Roadmap

- [ ] Dynamic field mapping UI (populate fields based on table schema)
- [ ] Automatic pagination for large result sets
- [ ] Token caching (currently fetches a new OAuth2 token per request)
- [ ] MP type generation from your instance's schema

## Contributing

Contributions are welcome! This node is designed to work with any Ministry Platform deployment.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and ensure `npm run build && npm run lint` pass
4. Submit a pull request

## License

[MIT](LICENSE)

## Resources

- [Ministry Platform API Wiki](https://mpwiki.skylineict.com/wiki/rest-api/)
- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)
- [PowerAutomate Connector](https://github.com/MinistryPlatform-Community/PowerAutomate) — Reference implementation with swagger spec
- [MPNext](https://github.com/MinistryPlatform-Community/MPNext) — Next.js template for MP
