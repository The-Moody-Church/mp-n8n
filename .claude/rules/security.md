# Security

## Ministry Platform Data Safety
- **NEVER delete, update, or create MP records without explicit user confirmation.** Ministry Platform is a shared production database with real church member data.
- This applies to both direct API calls during development/testing AND to the node's runtime behavior.

## Credential Safety
- Never log or expose OAuth client secrets, access tokens, or credentials in code, tests, or documentation.
- Use the n8n credential system — never hardcode credentials in node logic.
- The `.env.example` file should document required variables without real values.

## Node Security
- Validate and sanitize user inputs before constructing API requests.
- Handle special characters in filter expressions to prevent injection.
- Respect the MP API's permissions — the node should not attempt to bypass API-level access controls.
