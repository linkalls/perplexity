import { PerplexityClient } from '../src/perplexity';
import {getFirstAskTextAnswer} from '../src/types';
import { extractStreamAnswers,extractStreamBackend,extractStreamEntries, parseCookieEnv } from '../src/search_helpers';

async function main() {
  // Read cookie from environment for safety (set PERPLEXITY_COOKIE to either:
  // - a cookie header string: "k1=v1; k2=v2"
  // - a JSON string/object mapping: '{"k1":"v1","k2":"v2"}'
  // - or an object-like string produced by some shells. We try several fallbacks
  // and produce a Record<string,string> for the client constructor.
  const parsedCookies = parseCookieEnv(process.env.PERPLEXITY_COOKIE);
  const cli = new PerplexityClient(parsedCookies);
  console.log('parsed cookies:', parsedCookies);
  try {
    console.log('\nStreaming example (listening in chunks):');
    const gen = await cli.asyncSearch('ストリーミングで自己紹介して', 'pro', null, ['web'], {}, 'ja-JP');

    // 1 回の走査でテキスト断片と backend_uuid を同時に取得する
    let backend_uuid: string | undefined;
    for await (const entry of extractStreamEntries(gen)) {
      if (entry.backend_uuid) backend_uuid = entry.backend_uuid;
      if (entry.text && entry.text.trim()) console.log("entry",entry.text);
    }

    if (backend_uuid) {
      console.log('captured backend_uuid:', backend_uuid);
      const follow = { backend_uuid, attachments: [] };
      const second = await cli.search('この会話の続きで質問します: 私の好きな色は？', 'pro', null, ['web'], {}, 'ja-JP', follow);
      console.log('Follow display_model:', second.display_model);
      console.log('Follow backend_uuid:', second.backend_uuid);
      console.log('Follow answer:', getFirstAskTextAnswer(second));
    } else {
      console.log('No backend_uuid captured from stream; cannot follow up.');
    }
  } catch (e) {
    console.error('error', e);
  }
}

main().catch(e => console.error(e));
