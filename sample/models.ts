/**
 * Show model IDs and their advertised plan requirements from Perplexity.
 * If live refresh fails, the bundled snapshot is used and labeled as such.
 * Run: bun run sample/models.ts
 */
import { PerplexityClient } from "../src/perplexity";

const client = new PerplexityClient();
await client.getModels();

console.log("Catalog source:", client.modelConfigSource);
console.log("Registered model IDs:", Object.keys(client.modelConfig.models).length);
console.log("Selectable menu rows:", client.modelConfig.config.length);
console.log("Advertised plan requirements do not guarantee access.");

console.table(
  client.getModelCatalog({ selectableOnly: true }).map(
    ({ id, label, mode, provider, subscriptionTier, variants }) => ({
      id,
      label,
      mode,
      provider,
      requiredPlan: subscriptionTier ?? "unknown",
      variants: variants.join(", "),
    })
  )
);
