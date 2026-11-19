---
name: perplexity-model-catalog
description: Refresh and validate Perplexity model IDs, friendly names, Pro/Max requirements, and Computer model metadata for linkalls/perplexity. Use when given a fresh config.json or asked to update model mapping.
---

# Model catalog maintenance

## Configuration contract

- models: dictionary indexed by server ID. Fields include label, mode,
  provider, optional computer_effort, and replaced_by.
- config: UI selectable entries with subscription_tier, non_reasoning_model,
  reasoning_model, and fast_model.
- default_models: fallback IDs per mode.
- computer_harness: Computer orchestration modes and effort, not compatible
  with the ordinary search endpoint.

## Reliable refresh workflow

1. Obtain a JSON config from an authorized Perplexity session or an
   explicitly provided file, without any personal cookies or secrets.
2. Validate shape using isModelConfigResponse().
3. Count models and config separately. Review any unexpected removal or tier
   change before updating src/model_config_snapshot.ts.
4. Build plan metadata ONLY by joining config model IDs against models IDs.
   Never infer a plan from the provider, model family, or registry membership.
5. Keep search and asi modes distinct even when labels coincide.
6. Update tests for representative Pro/Max/unknown tiers and normal/thinking
   preferences; run bun test and bun run build.
7. In the report state whether data came from live getModels() or snapshot.
   Even a valid UI config is not a guarantee a particular account can run a
   particular model.

## Behavioral rules

- An explicit unknown model must produce an error rather than silently
  selecting a different model.
- An ID registered in models but absent from config has unknown plan.
- If multiple UI configurations disagree on an ID's plan, report it as
  ambiguous instead of choosing the least restrictive plan.
- If a live request returns 403/HTML/invalid JSON, retain the snapshot.
  Never bypass Cloudflare challenges, rate limits, or account requirements.
- Keep README and src/types.ts consistent with public API changes.

See src/model_catalog.ts, src/perplexity.ts, and test/model_catalog.test.ts.
