import { PerplexityClient } from '../src/perplexity';
import type { PerplexityResponse, Block } from '../src/types';
import { isAskTextBlock, isWebResultsBlock, isPlanBlock, isProSearchStepsBlock,getFirstAskTextAnswer} from '../src/types';
import { parseCookieEnv } from '../src/search_helpers';

async function main() {
  const parsedCookies = parseCookieEnv(process.env.PERPLEXITY_COOKIE);
  const cli = new PerplexityClient(parsedCookies);

  try {
    // non-streaming search: returns final aggregated response
    const result: PerplexityResponse = await cli.search('今日のニュース', "pro","claude45", ['web',"social"], {}, 'ja-JP');

    console.log('blocks length:', result.blocks?.length ?? 0);
const res = getFirstAskTextAnswer(result);
    console.log('First ask_text answer:', res);

    // write full response to disk for inspection
    // await Bun.write('result.json', JSON.stringify(result, null, 2));
    console.log(result.display_model)
  } catch (e) {
    console.error('Error running search:', e);
  }
}

main();
