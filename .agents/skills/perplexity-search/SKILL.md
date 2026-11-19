---
name: perplexity-search
description: Integrate linkalls/perplexity into Bun or TypeScript applications for Perplexity search, model selection, streaming, and follow-up. Use when implementing or debugging an agent that calls Perplexity search.
---

# Perplexity search integration

## Checklist

1. Read README.md and src/perplexity.ts, then determine the required search mode.
2. Initialize PerplexityClient with only user-authorized cookies, if needed.
3. Call client.getModelCatalog({ mode: "search", selectableOnly: true }) to discover the configured model choices.
4. When fresh metadata matters, call await client.getModels() and inspect client.modelConfigSource ("live" or "snapshot").
5. Use a canonical ID or an unambiguous model name. For reasoning prefer the thinking model variant.
6. Check getModelInfo(id)?.subscriptionTier to report the advertised UI requirement. This is not an actual account-entitlement check.
7. Use search() for aggregated responses or asyncSearch() for streaming; handle rate limits and network failures without unlimited retrying.

## Minimal Bun example

~~~ts
import { PerplexityClient } from "../../src/perplexity";
import { getFirstAskTextAnswer } from "../../src/types";
import { parseCookieEnv } from "../../src/search_helpers";

// Optional: only load cookies from the caller's private environment.
const client = new PerplexityClient(
  parseCookieEnv(process.env.PERPLEXITY_COOKIE)
);

// An explicit tier is from the captured UI config, not the user's account.
console.table(
  client.getModelCatalog({ mode: "search", selectableOnly: true })
    .map(({ id, label, subscriptionTier }) => ({ id, label, subscriptionTier }))
);

// Use anonymous auto mode where supported.
const result = await client.search("Find recent open-source Bun releases", "auto");
console.log(getFirstAskTextAnswer(result));
~~~

## Boundaries

- The web SSE endpoint is unofficial and may change or return Cloudflare 403.
- Do not send Computer/ASI or browser-agent IDs to search() or asyncSearch().
- If modelConfigSource says snapshot, explicitly label model metadata as historical.
- A registered-but-unlisted model has an unknown required plan.
- Never log or publish cookies, session identifiers, tokens, or sensitive prompts.
- Do not automate account rotation or evade service rate limits.
- Run bun test and bun run build after changes.

For updates to model names or required tiers, see
.agents/skills/perplexity-model-catalog/SKILL.md.
