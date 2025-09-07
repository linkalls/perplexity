// Detailed types derived from sample `result.json` to make the client strongly typed.
// Exported type-guard helpers so consumers don't need to write them.
export function isAskTextBlock(b) {
    return !!b && b.intended_usage === 'ask_text' && !!b.markdown_block;
}
export function isWebResultsBlock(b) {
    return !!b && b.intended_usage === 'web_results' && !!b.web_result_block;
}
export function isPlanBlock(b) {
    return !!b && b.intended_usage === 'plan' && !!b.plan_block;
}
export function isProSearchStepsBlock(b) {
    return !!b && b.intended_usage === 'pro_search_steps' && !!b.plan_block;
}
// Convenience helpers that operate on a full PerplexityResponse
// and return typed blocks or extracted text/answers.
export function getAskTextBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isAskTextBlock);
}
export function getFirstAskTextAnswer(result) {
    const blocks = getAskTextBlocks(result);
    if (!blocks.length)
        return undefined;
    const md = blocks[0].markdown_block;
    if (md.answer)
        return md.answer;
    // fallback: join normalized chunks
    const chunks = Array.isArray(md.chunks) ? md.chunks : (md.chunks ? [md.chunks] : []);
    if (chunks.length)
        return chunks.join('');
    return undefined;
}
export function getWebResultsBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isWebResultsBlock);
}
export function getPlanBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isPlanBlock);
}
export function getProSearchStepsBlocks(result) {
    if (!result || !Array.isArray(result.blocks))
        return [];
    return result.blocks.filter(isProSearchStepsBlock);
}
