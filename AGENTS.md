# Guide for AI agents

This is a **Bun-first TypeScript library for Perplexity's unofficial web
endpoints**. No official API affiliation or stability is implied.

## Development conventions

- Use Bun: bun install, bun test, bun run build.
- Preserve the public search and asyncSearch positional argument signatures.
- Keep the model registry and UI selection list separate:
  - models: known model identifiers (NOT proof of availability).
  - config: selectable UI options; subscription_tier is the *advertised*
    requirement for that specific option, not the authenticated user's plan.
  - default_models: mode-specific defaults.
  - computer_harness: Computer/ASI metadata, NOT a search protocol.
- A null subscriptionTier means UNKNOWN, not free.
- Live model refreshes should validate response shape; on Cloudflare or network
  failures preserve the snapshot with modelConfigSource = "snapshot".
- When a user specifies a model explicitly, reject invalid model identifiers
  rather than silently selecting the default.
- Search does not support Computer/ASI or browser-agent models. Do not attempt
  to send them to the search SSE endpoint.
- Never leak user session cookies or store authentication in source control.
- Respect account plans and service rate limits. Do not build account rotation,
  automated rate-limit evasion, or Cloudflare challenge bypass into the client.

## Main code

- src/perplexity.ts: PerplexityClient and live model refresh.
- src/model_catalog.ts: models, subscription tiers, and name resolution.
- src/model_config_snapshot.ts: bundled user-provided fallback, 2026-11-19.
- src/search_helpers.ts: search mode validation and request body assembly.
- src/types.ts: response types.
- sample/models.ts: print model catalog with plan metadata.
- test/model_catalog.test.ts: offline model mapping regression tests.

## Before committing

1. bun install
2. bun test
3. bun run build
4. bun run sample/models.ts (may use fallback)
5. Include README changes when public functionality changes.

## Skills

- .agents/skills/perplexity-search/SKILL.md: integrating the search client.
- .agents/skills/perplexity-model-catalog/SKILL.md: maintaining catalog data.
