Perplexity Bun client

A minimal TypeScript client for Bun that implements SSE parsing behavior.

Usage:

- Run with Bun:

```bash
bun run src/x.ts
```

Notes:

- This client makes unauthenticated requests to the public perplexity SSE endpoint. For production, you should add proper cookies/auth handling.
- The implementation defensively parses incoming SSE `message` events and tries to parse the `text` field if it's a JSON string.
