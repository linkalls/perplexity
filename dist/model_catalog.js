import { MODEL_CONFIG_SNAPSHOT } from "./model_config_snapshot";
/** Shallow runtime validation for responses; rejects Cloudflare/error JSON. */
export function isModelConfigResponse(input) {
    if (!input || typeof input !== "object")
        return false;
    const value = input;
    if (typeof value.config_schema !== "string")
        return false;
    if (!value.models || typeof value.models !== "object" || Array.isArray(value.models))
        return false;
    if (!value.default_models || typeof value.default_models !== "object" || Array.isArray(value.default_models))
        return false;
    if (!Array.isArray(value.config))
        return false;
    // A valid config contains at least one model, a menu entry, and a default.
    if (Object.keys(value.models).length === 0 ||
        Object.keys(value.default_models).length === 0 ||
        value.config.length === 0)
        return false;
    if (!Object.values(value.models).every((v) => Boolean(v) && typeof v === "object" &&
        typeof v.label === "string" &&
        typeof v.mode === "string"))
        return false;
    if (!value.config.every((v) => Boolean(v) && typeof v === "object" &&
        typeof v.label === "string"))
        return false;
    return true;
}
export function listModelCatalog(source = MODEL_CONFIG_SNAPSHOT, filter = {}) {
    const selections = new Map();
    // Each UI selection may name a normal, reasoning, and fast variant.
    for (const option of source.config) {
        const pairs = [
            ["normal", option.non_reasoning_model],
            ["thinking", option.reasoning_model],
            ["fast", option.fast_model],
        ];
        for (const [variant, id] of pairs) {
            if (!id)
                continue;
            let existing = selections.get(id);
            if (!existing) {
                existing = { tiers: new Set(), variants: new Set() };
                selections.set(id, existing);
            }
            if (option.subscription_tier)
                existing.tiers.add(option.subscription_tier);
            existing.variants.add(variant);
        }
    }
    return Object.entries(source.models).flatMap(([id, model]) => {
        const selection = selections.get(id);
        const tiers = selection ? [...selection.tiers] : [];
        const entry = {
            id,
            label: model.label,
            shortName: model.short_name ?? null,
            description: model.description ?? null,
            provider: model.provider ?? null,
            mode: model.mode,
            selectable: selection !== undefined,
            subscriptionTier: tiers.length === 1 ? tiers[0] : null,
            subscriptionTiers: tiers,
            variants: selection ? [...selection.variants] : [],
            computerEffort: model.computer_effort ?? null,
        };
        if (filter.mode && entry.mode !== filter.mode)
            return [];
        if (filter.subscriptionTier && !tiers.includes(filter.subscriptionTier))
            return [];
        if (filter.selectableOnly && !entry.selectable)
            return [];
        return [entry];
    });
}
export const normalizeModelName = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Legacy library model names whose server IDs have changed. */
const LEGACY_ALIASES = {
    sonar: "experimental",
    claude_sonnet_4_0: "claude2",
    claude45: "claude45sonnet",
    claude45sonnetthinking: "claude45sonnetthinking",
    gemini25pro: "gemini25pro",
    Gemini25Pro: "gemini25pro",
};
const DEFAULT_MODELS = {
    auto: "turbo",
    pro: "pplx_pro",
    reasoning: "pplx_reasoning",
    "deep research": "pplx_alpha",
};
/**
 * Map a supplied string to the canonical model_preference for search().
 *
 * Exact IDs are accepted when present in the registry, regardless of menu
 * availability; this does NOT imply they are available on an account.
 * Computer/ASI IDs require another API and cannot be used with search().
 */
export function resolveModelPreference(mode, model, source = MODEL_CONFIG_SNAPSHOT) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_MODELS, mode)) {
        throw new Error(`Unknown search mode "${mode}".`);
    }
    if (model === null)
        return DEFAULT_MODELS[mode];
    const raw = model.trim();
    if (!raw)
        throw new Error("Model name must not be empty.");
    const expectedMode = mode === "deep research" ? "research" : "search";
    const alias = LEGACY_ALIASES[raw] ?? LEGACY_ALIASES[normalizeModelName(raw)];
    const id = source.models[raw] ? raw : alias;
    if (id && source.models[id]) {
        if (source.models[id].mode !== expectedMode) {
            throw new Error(`Model "${raw}" uses mode "${source.models[id].mode}", which cannot be sent to "${mode}" search.`);
        }
        return id;
    }
    // UI entries are authoritative for choosing a normal vs thinking variant.
    const normalized = normalizeModelName(raw);
    const matching = source.config.filter((option) => normalizeModelName(option.label) === normalized);
    for (const option of matching) {
        const preferred = mode === "reasoning"
            ? option.reasoning_model ?? option.non_reasoning_model
            : option.non_reasoning_model ?? option.reasoning_model;
        if (preferred && source.models[preferred]?.mode === expectedMode)
            return preferred;
    }
    // Legacy model labels can still resolve if the menu no longer lists them.
    const labelMatches = Object.entries(source.models)
        .filter(([, entry]) => entry.mode === expectedMode && normalizeModelName(entry.label) === normalized)
        .map(([candidate]) => candidate);
    if (labelMatches.length === 1)
        return labelMatches[0];
    if (labelMatches.length > 1) {
        throw new Error(`Ambiguous model "${raw}" (${labelMatches.join(", ")}); specify its exact model ID.`);
    }
    throw new Error(`Unknown model "${raw}". Use an ID from listModelCatalog() or refresh with getModels().`);
}
