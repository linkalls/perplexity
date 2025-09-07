import { PerplexityClient } from '../src/perplexity';
import type { PerplexityResponse, Block } from '../src/types';
import { isAskTextBlock, isWebResultsBlock, isPlanBlock, isProSearchStepsBlock} from '../src/types';

async function main() {
  const cli = new PerplexityClient();

  try {
    // non-streaming search: returns final aggregated response
    const result: PerplexityResponse = await cli.search('今日のニュース', "pro","claude37sonnetthinking", ['web',"social"], {}, 'ja-JP');

    console.log('blocks length:', result.blocks?.length ?? 0);

    if (result.blocks) {
      for (const block of result.blocks) {
        if (isAskTextBlock(block)) {
          // safe access to merged answer and chunks
          console.log('--- ask_text answer ---');
          console.log('answer:', block.markdown_block.answer);
          // console.log('chunks:', block.markdown_block.chunks);
        } else if (isWebResultsBlock(block)) {
          console.log('--- web_results ---');
          console.log('web results count:', block.web_result_block.web_results?.length ?? 0);
        } else if (isPlanBlock(block)) {
          console.log('--- plan ---');
          console.log('plan progress:', block.plan_block.progress);
        } else if (isProSearchStepsBlock(block)) {
          console.log('--- pro_search_steps ---');
          console.log('steps:', block.plan_block.steps?.length ?? 0);
        } else {
          console.log('--- other block ---', block.intended_usage);
        }
      }
    }

    // write full response to disk for inspection
    await Bun.write('result.json', JSON.stringify(result, null, 2));
    console.log(result.display_model)
  } catch (e) {
    console.error('Error running search:', e);
  }
}

main();
