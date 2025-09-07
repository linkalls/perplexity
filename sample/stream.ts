import { PerplexityClient } from '../src/perplexity';
import type { PerplexityChunk } from '../src/types';
import { appendFile } from 'node:fs/promises';

async function main(){
  const cli = new PerplexityClient();

  try{
    const gen = await cli.asyncSearch('きょうのニュース', 'auto', null, ['web'], {}, 'ja-JP');

    // open an append file for incremental results
    for await (const chunk of gen){
      try{
        // ensure editor knows the chunk shape
        const c = chunk as PerplexityChunk;
        console.log(c);

        // persist a compact, typed snapshot so later reads can rely on common fields
        const snapshot = {
          ts: new Date().toISOString(),
          backend_uuid: c.backend_uuid,
          context_uuid: c.context_uuid,
          cursor: c.cursor,
          text: Array.isArray(c.text) ? c.text : (c.text ? [c.text] : []),
          final: c.final ?? false,
          raw: c
        };

        await appendFile('result_stream.jsonl', JSON.stringify(snapshot) + '\n');
      }catch(e){
        console.error('write error', e);
      }
    }

    console.log('Stream finished');
  }catch(e){
    console.error('stream error', e);
  }
}

main();
