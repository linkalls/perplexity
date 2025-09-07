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
    cookies;
    client;
    constructor(cookies = {}) {
        this.cookies = cookies;
        // no heavy init in constructor
    }
    async init() {
        // Create underlying client
        const mod = await import("./perplexity");
        this.client = new mod.PerplexityClient(this.cookies);
        // perform an initial session GET
        try {
            await fetch("https://www.perplexity.ai/api/auth/session", {
                headers: this.client["buildHeaders"](),
            });
        }
        catch (e) {
            /* ignore */
        }
        return this;
    }
    // convenience factory to mimic `await Client(cookies)` style
    static async create(cookies = {}) {
        const c = new PerplexityAsyncClient(cookies);
        return await c.init();
    }
    async search(...args) {
        // @ts-ignore
        return await this.client.search(...args);
    }
}
export default PerplexityAsyncClient;
