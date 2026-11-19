import { describe, expect, test } from "bun:test";
import { MODEL_CONFIG_SNAPSHOT } from "../src/model_config_snapshot";
import {
  isModelConfigResponse,
  listModelCatalog,
  resolveModelPreference,
} from "../src/model_catalog";
import { buildSearchJsonBody, computeModelPreference } from "../src/search_helpers";

describe("model configuration snapshot", () => {
  test("has the expected schema and registered/model-menu counts", () => {
    expect(isModelConfigResponse(MODEL_CONFIG_SNAPSHOT)).toBe(true);
    expect(Object.keys(MODEL_CONFIG_SNAPSHOT.models)).toHaveLength(166);
    expect(MODEL_CONFIG_SNAPSHOT.config).toHaveLength(25);
  });

  test("rejects invalid or challenge responses", () => {
    expect(isModelConfigResponse("<html>Cloudflare</html>")).toBe(false);
    expect(isModelConfigResponse({ error: "blocked" })).toBe(false);
    expect(isModelConfigResponse({ config_schema: "v1", models: {}, config: [], default_models: {} })).toBe(false);
  });

  test("differentiates Pro and Max as advertised by selection config", () => {
    const models = listModelCatalog(MODEL_CONFIG_SNAPSHOT, { selectableOnly: true, mode: "search" });
    expect(models.find((x) => x.id === "gpt6_2_sol")?.subscriptionTier).toBe("pro");
    expect(models.find((x) => x.id === "gpt6_2_sol_thinking")?.subscriptionTier).toBe("pro");
    expect(models.find((x) => x.id === "gpt6_2_astra")?.subscriptionTier).toBe("max");
    expect(models.find((x) => x.id === "gpt6_2_astra_thinking")?.subscriptionTier).toBe("max");
    expect(models.find((x) => x.id === "claude55sonnet")?.subscriptionTier).toBe("pro");
  });

  test("keeps registered-but-unlisted models unknown", () => {
    const old = listModelCatalog(MODEL_CONFIG_SNAPSHOT).find((x) => x.id === "gpt5");
    expect(old?.selectable).toBe(false);
    expect(old?.subscriptionTier).toBeNull();
  });

  test("keeps search and Computer models distinct", () => {
    const search = listModelCatalog(MODEL_CONFIG_SNAPSHOT).find((x) => x.id === "gpt6_2_astra");
    const computer = listModelCatalog(MODEL_CONFIG_SNAPSHOT).find((x) => x.id === "pplx_asi_gpt_6_2_astra");
    expect(search?.mode).toBe("search");
    expect(search?.subscriptionTier).toBe("max");
    expect(computer?.mode).toBe("asi");
    expect(computer?.subscriptionTier).toBe("pro");
  });

  test("filters models by tier and mode", () => {
    const results = listModelCatalog(MODEL_CONFIG_SNAPSHOT, {
      mode: "search",
      subscriptionTier: "pro",
      selectableOnly: true,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((x) => x.mode === "search" && x.subscriptionTiers.includes("pro"))).toBe(true);
  });
});

describe("model preference routing", () => {
  test("maps search labels to their non-thinking IDs", () => {
    expect(resolveModelPreference("pro", "GPT-6.2 Sol")).toBe("gpt6_2_sol");
    expect(resolveModelPreference("pro", "Claude Sonnet 5.5")).toBe("claude55sonnet");
  });

  test("maps reasoning labels to thinking IDs", () => {
    expect(resolveModelPreference("reasoning", "GPT-6.2 Sol")).toBe("gpt6_2_sol_thinking");
    expect(resolveModelPreference("reasoning", "Grok 4.7")).toBe("grok47thinking");
    expect(resolveModelPreference("reasoning", "Kimi K3")).toBe("kimik3thinking");
  });

  test("preserves supported legacy aliases", () => {
    expect(computeModelPreference("pro", "claude45")).toBe("claude45sonnet");
    expect(computeModelPreference("pro", "Gemini25Pro")).toBe("gemini25pro");
    expect(computeModelPreference("pro", "sonar")).toBe("experimental");
  });

  test("allows exact known IDs but rejects Computer and unrecognized names", () => {
    expect(resolveModelPreference("pro", "gpt6_2_sol_thinking")).toBe("gpt6_2_sol_thinking");
    expect(() => resolveModelPreference("pro", "pplx_asi_gpt_6_2_sol")).toThrow(/cannot be sent/);
    expect(() => resolveModelPreference("pro", "fake-model-never-existed")).toThrow(/Unknown model/);
  });

  test("builds the request payload with the normalized model preference", () => {
    const body = buildSearchJsonBody(
      {}, "hello", "reasoning", "GPT-6.2 Sol",
      [], null, false, "ja-JP", ["web"]
    );
    expect(body.params.model_preference).toBe("gpt6_2_sol_thinking");
    expect(body.query_str).toBe("hello");
    expect(body.params.sources).toEqual(["web"]);
  });
});
