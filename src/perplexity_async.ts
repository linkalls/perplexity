import { PerplexityClient as _PC } from './perplexity';

// Thin async wrapper 
export class PerplexityAsyncClient {
  public client: any;
  constructor(public cookies: Record<string,string> = {}){
    // no heavy init in constructor
  }

  async init(){
    // Create underlying client
    const mod = await import('./perplexity');
    this.client = new mod.PerplexityClient(this.cookies);
    // perform an initial session GET
    try{
      await fetch('https://www.perplexity.ai/api/auth/session', { headers: this.client['buildHeaders']() });
    }catch(e){ /* ignore */ }
    return this;
  }

  // convenience factory to mimic `await Client(cookies)` style
  static async create(cookies: Record<string,string> = {}){
    const c = new PerplexityAsyncClient(cookies);
    return await c.init();
  }

  async search(...args: Parameters<_PC['search']>) {
    // @ts-ignore
    return await this.client.search(...args);
  }
}

export default PerplexityAsyncClient;
