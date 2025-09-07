import { PerplexityClient } from '../src/perplexity';
import {getFirstAskTextAnswer} from '../src/types';
import { extractStreamEntries } from '../src/search_helpers';

async function main() {
  // Read cookie from environment for safety (set PERPLEXITY_COOKIE to a single cookie string),
  // or leave empty for unauthenticated usage.
  const cli = new PerplexityClient();

  try {
  // Choose mode based on whether we have an authenticated session

  // First query: get backend_uuid
  const first = await cli.search('私の好きな色は赤です', "pro", "claude37sonnetthinking", ['web','social'], {}, 'ja-JP');
    console.log('First display_model:', first.display_model);
    console.log('First backend_uuid:', first.backend_uuid);

    const backend_uuid = first.backend_uuid;
    if (!backend_uuid) {
      console.log('No backend_uuid returned; cannot follow up.');
      return;
    }
    const markdown = getFirstAskTextAnswer(first)
    console.log(markdown)

    // Follow-up using backend_uuid
    const follow = { backend_uuid, attachments: [] };
  const second = await cli.search('この会話の続きで質問します: 私の好きな色は？', "pro", null, ['web','social'], {}, 'ja-JP', follow);
    console.log('Follow display_model:', second.display_model);
    console.log('Follow backend_uuid:', second.backend_uuid);

    // Streaming example: get backend_uuid from stream then follow up
    console.log('\nStreaming example (listening for backend_uuid in chunks):');
  const gen2 = await cli.asyncSearch('ストリーミングで自己紹介して', "pro", null, ['web'], {}, 'ja-JP');
    let streamed_backend: string | undefined;
    // Use extractStreamEntries to get normalized text plus optional backend_uuid
    for await (const entry of extractStreamEntries(gen2)) {
      if (entry.backend_uuid && !streamed_backend) {
        streamed_backend = entry.backend_uuid;
        console.log('stream chunk backend_uuid:', streamed_backend);
      }
      if (entry.text && entry.text.trim()) {
        console.log('stream text chunk:', entry.text);
      }
      // For demo stop after we've observed a backend_uuid and some text
      if (streamed_backend) break;
    }

    if (streamed_backend) {
      const follow2 = { backend_uuid: streamed_backend, attachments: [] };
      const r = await cli.search('ストリーミングの会話を続けます：次の質問', 'pro', null, ['web'], {}, 'ja-JP', follow2);
      console.log('stream follow display_model:', r.display_model);
    }

  } catch (e) {
    console.error('error', e);
  }
}

main().catch(e=>console.error(e));
