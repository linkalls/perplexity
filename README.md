# Perplexity Bun / TypeScript Client

Bun-first TypeScript client for Perplexity's **unofficial web endpoints**.
Search via SSE, stream partial answers, follow up in a thread, upload files,
and inspect model IDs and their **config-advertised** Pro/Max requirements.

> 非公式クライアント。Perplexityが公開する正式なAPI SDKではなく、
> Web内部のAPIに依存するため、通信仕様・モデル名・利用枠は予告なく変わる可能性がある。

## Quick start / セットアップ

~~~bash
git clone https://github.com/linkalls/perplexity.git
cd perplexity
bun install
bun run sample/models.ts
bun test
bun run build
~~~

No API key is required for reading the bundled model catalog. A successful
live search may require authentication, a paid subscription, or working network
access depending on the requested feature. Cloudflare can reject requests.

## Models and subscription plans / モデルと必要プラン

The catalog is built from a user-provided config_schema=v1 JSON snapshot captured
**2026-11-19**, containing **166 registered model IDs** and **25 UI menu options**.
A successful getModels() call updates the in-memory configuration; otherwise
the bundled snapshot remains in use.

- **models:** known IDs, their labels, providers, and modes. Listing an ID
  does NOT mean it is selectable or available on your account.
- **config:** selectable UI choices and their advertised subscription_tier
  (typically pro or max), plus normal, thinking, and fast model variants.
- **default_models:** service defaults by mode.
- **computer_harness:** metadata for Computer/ASI orchestration presets.

**subscriptionTier = null means UNKNOWN, not free.** The library reports
the advertised plan attached to a UI option, NOT the user's actual subscription,
remaining quota, or authorization to use a given model.

~~~ts
import { PerplexityClient } from "./src/index";

const client = new PerplexityClient();

// Uses snapshot until a successful live fetch.
const proSearch = client.getModelCatalog({
  mode: "search",
  selectableOnly: true,
  subscriptionTier: "pro",
});
console.table(proSearch.map(({ label, id, subscriptionTier }) => ({
  label, id, requiredPlan: subscriptionTier,
})));

// Live request is optional and can fail due to Cloudflare:
await client.getModels();
console.log("Catalog source:", client.modelConfigSource); // live | snapshot

const info = client.getModelInfo("gpt6_2_sol");
console.log(info?.subscriptionTier); // "pro" in provided snapshot
~~~

### Representative model IDs from the snapshot

| Mode | Model | Server ID | Advertised tier |
| --- | --- | --- | --- |
| search | GPT-6.2 Sol | gpt6_2_sol | pro |
| search | GPT-6.2 Sol Thinking | gpt6_2_sol_thinking | pro |
| search | GPT-6.2 Astra | gpt6_2_astra | max |
| search | GPT-6.2 Astra Thinking | gpt6_2_astra_thinking | max |
| search | Claude Sonnet 5.5 | claude55sonnet | pro |
| search | Claude Opus 5.5 | claude55opus | max |
| asi | GPT-6.2 Astra Computer | pplx_asi_gpt_6_2_astra | pro |

Search and Computer/ASI can have different IDs and different UI plan labels
for the same model family. **Do not send ASI/browser-agent IDs to search().**
Those protocols are not implemented by this search client.

## Search and model selection / 検索とモデル指定

~~~ts
import { PerplexityClient } from "./src/index";
import { parseCookieEnv } from "./src/search_helpers";
import { getFirstAskTextAnswer } from "./src/types";

const cookies = parseCookieEnv(process.env.PERPLEXITY_COOKIE);
const client = new PerplexityClient(cookies);

// Ordinary search: returns an aggregated structured response.
const response = await client.search(
  "早稲田大学の公式ニュースを教えて",
  "auto",
  null,
  ["web"],
  {},
  "ja-JP",
);
console.log(getFirstAskTextAnswer(response));

// With an authorized account, Pro search can use a model ID or UI label.
// This example requires the required plan and a working web endpoint.
// const pro = await client.search(
//   "Bunのリリースを調べて",
//   "pro",
//   "gpt6_2_sol",
//   ["web"],
//   {},
//   "ja-JP",
// );
~~~

- Modes: auto, pro, reasoning, deep research.
- Sources: web, scholar, social, finance.
- An exact model ID is preserved; friendly labels are resolved from the UI
  config (e.g. GPT-6.2 Sol => gpt6_2_sol).
- With reasoning mode, friendly labels prefer a thinking model when available.
- Unknown explicit model names **throw** instead of silently falling back.
- Legacy names such as claude45 and Gemini25Pro are handled by aliases.
- Model registrations are metadata, not a check that a search will succeed.

## Streaming / ストリーミング

~~~ts
import { PerplexityClient } from "./src/index";

const client = new PerplexityClient();
const chunks = await client.asyncSearch(
  "Bunについて簡潔に教えて",
  "auto",
  null,
  ["web"],
  {},
  "ja-JP",
);

for await (const chunk of chunks) {
  console.log(chunk);
}
~~~

For follow-up use the previous response's backend_uuid and
sample/followup.ts. File upload and text-extraction helpers live in
src/search_helpers.ts.

## Agent Skills and AGENTS.md / エージェント向け

Repository guidance for Codex and other agents:
- [AGENTS.md](./AGENTS.md) describes project conventions, checks, and boundaries.
- [perplexity-search skill](./.agents/skills/perplexity-search/SKILL.md)
  explains integrating this library into a Bun/TypeScript agent.
- [perplexity-model-catalog skill](./.agents/skills/perplexity-model-catalog/SKILL.md)
  explains safe model catalog refresh and tier mapping.

The Agent Skills live under .agents/skills. Both have the standard SKILL.md
YAML frontmatter for agent discovery; no external MCP connection is required
just to read them.

## Development and limitations / 開発・制限事項

~~~bash
bun install
bun test
bun run build
bun run sample/models.ts
~~~

- Network endpoints are **unofficial** and may change or produce Cloudflare 403.
- Existing browser login helpers are experimental. Do not share credentials.
- Cookie presence is not proof of Pro/Max; the client does not validate your
  actual account tier, quota, or entitlement to any model.
- Do not use temporary accounts to bypass quotas or security checks.
- A bundled snapshot may become outdated; validate live results when possible.
- The project is provided as-is and is not affiliated with Perplexity.

## Package

- JSR name: @ptt/perplexity
- package.json name: @potetotown/perplexity
- License declaration: MIT
