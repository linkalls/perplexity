# Sample

This folder contains a  example showing how to use the TypeScript Perplexity client.

Usage:

```bash
# run the sample (requires network access and working Perplexity endpoints)
bun run sample
```

File: `sample/index.ts` demonstrates a simple non-streaming query and prints the last chunk.

Notes:

- The sample may perform network requests to `https://www.perplexity.ai` and S3; run it only if you expect those endpoints to be reachable.
- If you want `tsc` to typecheck this file, add `"sample/**/*.ts"` to `tsconfig.json:include`.
