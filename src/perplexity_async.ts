import { PerplexityClient as _PC } from "./perplexity";

// Thin async wrapper
/**
 * Async wrapper for PerplexityClient.
 * Provides an async factory and lazy initialization for environments where
 * synchronous construction is undesirable.
 */
/**
 * PerplexityAsyncClient
 *
 * An async-initializing wrapper around `PerplexityClient`. Use this in
 * environments that prefer lazy or async construction (e.g. when network
 * access is required during initialization).
 */
export class PerplexityAsyncClient {
  public client: any;
  constructor(public cookies: Record<string, string> = {}) {
    // no heavy init in constructor
  }

  async init(): Promise<this> {
    // Create underlying client
    const mod = await import("./perplexity");
    this.client = new mod.PerplexityClient(this.cookies);
    // perform an initial session GET
    try {
      await fetch("https://www.perplexity.ai/api/auth/session", {
        headers: this.client["buildHeaders"](),
      });
    } catch (e) {
      /* ignore */
    }
    return this;
  }

  // convenience factory to mimic `await Client(cookies)` style
  static async create(
    cookies: Record<string, string> = {}
  ): Promise<PerplexityAsyncClient> {
    const c = new PerplexityAsyncClient(cookies);
    return await c.init();
  }

  async search(...args: Parameters<_PC["search"]>): Promise<any> {
    // @ts-ignore
    return await this.client.search(...args);
  }
}

export default PerplexityAsyncClient;
