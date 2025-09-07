import fs from 'fs/promises';

function normalizeChunksField(chunks: any): string[] {
  if (!chunks && chunks !== 0) return [];
  if (Array.isArray(chunks)) {
    return chunks.map((c) => (typeof c === 'string' ? c : JSON.stringify(c)));
  }
  if (typeof chunks === 'string') {
    // sometimes the server sends a JSON-encoded array as a string
    try {
      const parsed = JSON.parse(chunks);
      if (Array.isArray(parsed)) return parsed.map((c) => (typeof c === 'string' ? c : JSON.stringify(c)));
    } catch (e) {
      // not JSON
    }
    return [chunks];
  }
  // object/other
  return [JSON.stringify(chunks)];
}

(async () => {
  const infile = 'result_chunks.jsonl';
  const outfile = 'result_aggregated.json';
  const compactChunksOut = 'result_chunks_parsed.jsonl';

  const raw = await fs.readFile(infile, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed = lines.map((l) => JSON.parse(l));

  // write a compact JSONL with cleaned objects (for inspection)
  await fs.writeFile(
    compactChunksOut,
    parsed.map((o) => JSON.stringify(o)).join('\n') + '\n',
    'utf8'
  );

  // We'll merge ask_text markdown chunks into one markdown_block
  const askChunks: string[] = [];

  // Keep latest seen non-ask blocks keyed by intended_usage or block type
  const otherBlocksByKey = new Map<string, any>();

  for (const obj of parsed) {
    const blocks = obj.blocks;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const intended = block.intended_usage || 'unknown';

      // ask_text blocks
      if (intended === 'ask_text' || block.ask_text || block.markdown_block) {
        // find markdown_block inside
        const md = block.ask_text?.markdown_block || block.markdown_block || block.ask_text?.markdown_block;
        if (!md) continue;
        const normalized = normalizeChunksField(md.chunks || md.chunks === 0 ? md.chunks : md);
        askChunks.push(...normalized);
        continue;
      }

      // web_results
      if (intended === 'web_results' || block.web_result_block || block.web_results) {
        otherBlocksByKey.set('web_results', block.web_result_block || block);
        continue;
      }

      // plan / pro_search_steps
      if (intended === 'plan' || intended === 'pro_search_steps' || block.plan_block) {
        // keep the most recent plan/pro_search_steps
        const key = intended === 'plan' ? 'plan' : 'pro_search_steps';
        otherBlocksByKey.set(key, block.plan_block ? block : block);
        continue;
      }

      // fallback: store by intended_usage (last-wins)
      otherBlocksByKey.set(intended, block);
    }
  }

  // Build merged blocks array: include web_results, plan/pro_search_steps, then ask_text merged
  const mergedBlocks: any[] = [];
  if (otherBlocksByKey.has('web_results')) mergedBlocks.push({ intended_usage: 'web_results', web_result_block: otherBlocksByKey.get('web_results').web_result_block || otherBlocksByKey.get('web_results') });
  if (otherBlocksByKey.has('plan')) mergedBlocks.push({ intended_usage: 'plan', plan_block: otherBlocksByKey.get('plan').plan_block || otherBlocksByKey.get('plan') });
  if (otherBlocksByKey.has('pro_search_steps')) mergedBlocks.push({ intended_usage: 'pro_search_steps', plan_block: otherBlocksByKey.get('pro_search_steps').plan_block || otherBlocksByKey.get('pro_search_steps') });

  // merged ask_text
  if (askChunks.length > 0) {
    const md = { chunks: askChunks, answer: askChunks.join('') };
    mergedBlocks.push({ intended_usage: 'ask_text', ask_text: { markdown_block: md } });
  }

  // Base response: copy last chunk's top-level keys
  const last = parsed[parsed.length - 1] || {};
  const aggregated = { ...last, blocks: mergedBlocks, final_sse_message: true, status: 'DONE' };

  await fs.writeFile(outfile, JSON.stringify(aggregated, null, 2) + '\n', 'utf8');

  console.log('Wrote', outfile, 'with', mergedBlocks.length, 'blocks (ask_chunks:', askChunks.length, ')');
})();
