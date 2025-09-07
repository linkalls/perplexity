import { PerplexityClient } from './perplexity';

async function main(){
  const cli = new PerplexityClient();
  // request a streaming search (stream=true)
  const gen = await cli.search('今日の船橋の天気', 'auto', null, ['web'], {}, true, 'ja-JP') as AsyncGenerator<any, any, unknown>;
  let i = 0;
  try{
    for await (const chunk of gen){
      console.log('CHUNK', i++, chunk);
      if(i>10) break;
    }
  }catch(e){
    console.error('stream error', e);
  }
}

main();
