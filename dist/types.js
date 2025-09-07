// Detailed types derived from sample `result.json` to make the client strongly typed.
// Exported type-guard helpers so consumers don't need to write them.
/**
 * Type-guard: isAskTextBlock
 *
 * Returns true when the provided block is an AskTextBlock.
 */
export function isAskTextBlock(b) {
    return (!!b &&
        b.intended_usage === "ask_text" &&
        !!b.markdown_block);
}
/**
 * Type-guard: isWebResultsBlock
 *
 * Returns true when the provided block is a WebResultsBlock.
 */
export function isWebResultsBlock(b) {
    return (!!b &&
        b.intended_usage === "web_results" &&
        !!b.web_result_block);
}
/**
 * Type-guard: isPlanBlock
 *
 * Returns true when the provided block is a PlanBlockType.
 */
export function isPlanBlock(b) {
    return !!b && b.intended_usage === "plan" && !!b.plan_block;
}
/**
 * Type-guard: isProSearchStepsBlock
 *
 * Returns true when the provided block is a ProSearchStepsBlock.
 */
export function isProSearchStepsBlock(b) {
    return (!!b &&
        b.intended_usage === "pro_search_steps" &&
        !!b.plan_block);
}
/**
 * getAskTextBlocks(result)
 *
 * Convenience helper to extract ask_text blocks from a PerplexityResponse.
 */
// Convenience helpers that operate on a full PerplexityResponse
// and return typed blocks or extracted text/answers.
/**
 * getAskTextBlocks
 *
 * Extracts ask_text blocks from a PerplexityResponse.
 */
export function getAskTextBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isAskTextBlock);
}
/**
 * getFirstAskTextAnswer
 *
 * Returns the first merged markdown answer from ask_text blocks, if any.
 */
export function getFirstAskTextAnswer(result) {
    const blocks = getAskTextBlocks(result);
    if (!blocks.length)
        return undefined;
    const md = blocks[0].markdown_block;
    if (md.answer)
        return md.answer;
    // fallback: join normalized chunks
    const chunks = Array.isArray(md.chunks)
        ? md.chunks
        : md.chunks
            ? [md.chunks]
            : [];
    if (chunks.length)
        return chunks.join("");
    return undefined;
}
/**
 * getWebResultsBlocks
 *
 * Extract typed web result blocks from a PerplexityResponse.
 */
export function getWebResultsBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isWebResultsBlock);
}
/**
 * getPlanBlocks
 *
 * Extract typed plan blocks from a PerplexityResponse.
 */
export function getPlanBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isPlanBlock);
}
/**
 * getProSearchStepsBlocks
 *
 * Extract pro-search step blocks from a PerplexityResponse.
 */
export function getProSearchStepsBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isProSearchStepsBlock);
}
