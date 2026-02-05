import Driver from "./driver";
import { ensureSearchArgs, uploadFiles, buildSearchJsonBody, postSearch, buildModelPrefMap, } from "./search_helpers";
/**
 * PerplexityClient
 *
 * High-level client for interacting with Perplexity.ai programmatically.
 * - supports streaming and non-stream searches
 * - lightweight file upload helper
 * - createAccount flow (via Emailnator) for automated account creation
 *
 * Typical usage:
 *   const cli = new PerplexityClient(cookies);
 *   const res = await cli.search('hello world');
 */
/**
 * PerplexityClient
 *
 * High-level client for interacting with Perplexity.ai. Supports both
 * non-streaming `search` and streaming `asyncSearch` modes, file uploads,
 * and account creation helpers.
 */
export class PerplexityClient {
    cookies;
    base = "https://www.perplexity.ai";
    own;
    copilot;
    file_upload;
    signin_regex = /"(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?callbackUrl=.*?)"/;
    constructor(cookies = {}) {
        this.cookies = cookies;
        this.own = Object.keys(cookies).length > 0;
        this.copilot = this.own ? Number.POSITIVE_INFINITY : 0;
        this.file_upload = this.own ? Number.POSITIVE_INFINITY : 0;
        // try to warm up an authenticated session ( initial GET)
        // fire-and-forget to avoid making the constructor async
        (async () => {
            try {
                await fetch(this.base + "/api/auth/session", {
                    headers: this.buildHeaders(),
                });
            }
            catch (e) {
                // ignore network/errors during best-effort init
            }
        })();
    }
    /**
     * Streaming search returning an async generator of SSE chunks.
     *
     * Use this when you want to process incremental results as they arrive.
     * Example:
     *   const gen = await cli.asyncSearch(query);
     *   for await (const chunk of gen) { console.log(chunk); }
     *
     * The generator yields PerplexityChunk objects. When the final message is
     * received the generator will return.
     *
     * implementation but is separated for clarity.
     */
    async asyncSearch(query, mode = "auto", model = null, sources = ["web"], files = {}, language = "en-US", follow_up = null, incognito = false) {
        // basic validation (same as in search)
        ensureSearchArgs(this, mode, sources, files);
        const uploaded_files = await uploadFiles(this, files);
        const jsonBody = buildSearchJsonBody(this, query, mode, model, uploaded_files, follow_up, incognito, language, sources);
        const res = await postSearch(this, jsonBody);
        // wrap the low-level sseStream so callers receive chunks and also get
        // an aggregated PerplexityResponse as the generator's return value.
        const self = this;
        async function* wrapper() {
            const collected = [];
            for await (const chunk of self.sseStream(res)) {
                // If backend explicitly signals rate limiting or failure, abort immediately
                try {
                    const ec = chunk?.error_code;
                    const st = chunk?.status;
                    if (ec === "RATE_LIMITED" || st === "failed") {
                        const reason = chunk?._response_type || ec || st || "request failed";
                        const text = chunk?.text || chunk?.message || undefined;
                        const msg = `Perplexity API error: ${String(reason)}${text ? ` - ${JSON.stringify(text)}` : ""}`;
                        throw new Error(msg);
                    }
                }
                catch (e) {
                    // rethrow any detection errors as proper failures
                    throw e;
                }
                // normalize chunk.text to array for easier downstream merging
                if (chunk.text && typeof chunk.text === "string")
                    chunk.text = [chunk.text];
                collected.push(chunk);
                yield chunk;
                if (chunk && (chunk.final === true || chunk.final_sse_message === true))
                    break;
            }
            // merge collected chunks into a final PerplexityResponse (same strategy as non-stream search)
            if (collected.length > 0) {
                const agg = {};
                const pushUnique = (targetKey, value) => {
                    agg[targetKey] = agg[targetKey] || [];
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            if (!agg[targetKey].some((x) => JSON.stringify(x) === JSON.stringify(item)))
                                agg[targetKey].push(item);
                        }
                    }
                    else {
                        if (!agg[targetKey].some((x) => JSON.stringify(x) === JSON.stringify(value)))
                            agg[targetKey].push(value);
                    }
                };
                for (const c of collected) {
                    if (!c || typeof c !== "object")
                        continue;
                    for (const [k, v] of Object.entries(c)) {
                        if (k === "text") {
                            agg.text = (agg.text || []).concat(Array.isArray(v) ? v : [v]);
                        }
                        else if (k === "widget_data" ||
                            k === "media_items" ||
                            k === "attachments" ||
                            k === "blocks" ||
                            k === "answer_modes") {
                            pushUnique(k, v);
                        }
                        else if (v !== undefined) {
                            agg[k] = v;
                        }
                    }
                }
                // Post-process blocks: merge multiple `ask_text` blocks into a single block
                if (Array.isArray(agg.blocks)) {
                    const mergedBlocks = [];
                    let askTextChunks = [];
                    let firstAskTextIndex = null;
                    for (let i = 0; i < agg.blocks.length; i++) {
                        const b = agg.blocks[i];
                        if (b && b.intended_usage === "ask_text" && b.markdown_block) {
                            if (firstAskTextIndex === null)
                                firstAskTextIndex = mergedBlocks.length;
                            const chunks = Array.isArray(b.markdown_block.chunks)
                                ? b.markdown_block.chunks
                                : b.markdown_block.chunks
                                    ? [b.markdown_block.chunks]
                                    : [];
                            askTextChunks = askTextChunks.concat(chunks);
                            // do not push individual ask_text blocks
                        }
                        else {
                            mergedBlocks.push(b);
                        }
                    }
                    if (askTextChunks.length > 0) {
                        const normalizedChunks = self.normalizeChunksField(askTextChunks);
                        const mergedMarkdown = {
                            progress: "finished",
                            chunks: normalizedChunks,
                            chunk_starting_offset: 0,
                        };
                        const joined = normalizedChunks.join("");
                        mergedMarkdown.answer = joined;
                        const insertAt = firstAskTextIndex === null
                            ? mergedBlocks.length
                            : firstAskTextIndex;
                        mergedBlocks.splice(insertAt, 0, {
                            intended_usage: "ask_text",
                            markdown_block: mergedMarkdown,
                        });
                    }
                    agg.blocks = mergedBlocks;
                }
                return agg;
            }
            throw new Error("No final response received");
        }
        return Promise.resolve(wrapper());
    }
    buildHeaders(additional = {}) {
        const headers = {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "max-age=0",
            dnt: "1",
            "user-agent": "bun-perplexity-client/0.1",
            "content-type": "application/json",
            ...additional,
        };
        if (Object.keys(this.cookies).length) {
            headers["cookie"] = Object.entries(this.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join("; ");
        }
        return headers;
    }
    // Browser-based signin method (learned from MCP Playwright session)
    async performBrowserSignin(email) {
        try {
            const drv = new Driver();
            console.log("Attempting browser-based signin for:", email);
            // Initialize browser using patchright
            await drv.initBrowser();
            // Navigate to signin page
            await drv.page.goto("https://www.perplexity.ai/auth/signin");
            await new Promise((r) => setTimeout(r, 2000));
            // Find email input and enter email
            const emailInput = await drv.page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
            if (!emailInput) {
                console.warn("Email input not found on signin page");
                await drv.closeBrowser();
                return { success: false };
            }
            await emailInput.clear();
            await emailInput.fill(email);
            await new Promise((r) => setTimeout(r, 1000));
            // Find and click signin button (multiple possible selectors)
            const submitBtn = await drv.page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Continue"), button:has-text("Send"), .submit-button, [data-testid="submit"]');
            if (!submitBtn) {
                console.warn("Submit button not found on signin page");
                await drv.closeBrowser();
                return { success: false };
            }
            await submitBtn.click();
            await new Promise((r) => setTimeout(r, 5000)); // Increased wait time
            // Check if we were redirected to verify-request page
            const currentUrl = drv.page.url();
            if (currentUrl.includes("verify-request") ||
                currentUrl.includes("check-email") ||
                currentUrl.includes("signin-email-sent")) {
                console.log("Successfully submitted signin request via browser");
                await drv.closeBrowser();
                return { success: true };
            }
            console.warn("Unexpected page after signin submission:", currentUrl);
            await drv.closeBrowser();
            return { success: false };
        }
        catch (e) {
            console.warn("Browser signin failed:", e);
            return { success: false };
        }
    }
    // Complete signin using token via browser automation (learned from MCP Playwright)
    async completeBrowserSignin(token, email) {
        try {
            const drv = new Driver();
            console.log("Attempting to complete signin with token:", token);
            // Initialize browser using patchright
            await drv.initBrowser();
            // Construct callback URL with token (pattern learned from MCP session)
            const callbackUrl = `https://www.perplexity.ai/api/auth/callback/email?callbackUrl=https%3A%2F%2Fwww.perplexity.ai%2F&token=${token}&email=${encodeURIComponent(email)}`;
            // Navigate to callback URL
            await drv.page.goto(callbackUrl);
            await new Promise((r) => setTimeout(r, 8000)); // Increased wait time for full authentication
            // Check if successfully redirected to main page (multiple success indicators)
            const currentUrl = drv.page.url();
            const pageContent = await drv.page.content();
            // Look for Pro features or account indicators (learned from MCP session)
            const isAuthenticated = currentUrl.includes("perplexity.ai") &&
                !currentUrl.includes("signin") &&
                !currentUrl.includes("verify-request") &&
                (pageContent.includes("今日残り") || // Japanese Pro features
                    pageContent.includes("file upload") ||
                    pageContent.includes("Pro") ||
                    pageContent.includes("account"));
            if (isAuthenticated) {
                // Extract cookies for persistent session
                const cookies = await drv.page.context().cookies();
                for (const cookie of cookies) {
                    if (cookie.domain.includes("perplexity.ai")) {
                        this.cookies[cookie.name] = cookie.value;
                    }
                }
                console.log("Successfully completed signin and extracted cookies");
                console.log("Found Pro features:", pageContent.includes("今日残り"));
                await drv.closeBrowser();
                return { success: true };
            }
            console.warn("Token signin did not redirect to expected page:", currentUrl);
            await drv.closeBrowser();
            return { success: false };
        }
        catch (e) {
            console.warn("Browser token signin failed:", e);
            return { success: false };
        }
    }
    // Enhanced CSRF token retrieval based on learned patterns
    async getCsrfToken() {
        // First try to get from existing cookies (next-auth format)
        const rawCsrf = this.cookies["next-auth.csrf-token"] || "";
        if (rawCsrf) {
            try {
                const dec = decodeURIComponent(String(rawCsrf));
                // next-auth stores token as "token|hash"; prefer the token part
                return (dec.split("|")[0] || dec.split("%7C")[0] || dec);
            }
            catch (e) {
                const fallback = String(rawCsrf).split("|")[0] ||
                    String(rawCsrf).split("%7C")[0] ||
                    String(rawCsrf);
                if (fallback)
                    return fallback;
            }
        }
        // If not found in cookies, try fetching from the CSRF endpoint
        try {
            const response = await fetch(this.base + "/api/auth/csrf", {
                headers: this.buildHeaders({ accept: "application/json" }),
            });
            if (response && response.ok) {
                const data = await response.json();
                if (data && data.csrfToken) {
                    return String(data.csrfToken);
                }
            }
        }
        catch (e) {
            console.warn("Failed to fetch CSRF token from endpoint:", e);
        }
        return "";
    }
    // low-dependency mime guessing for common extensions
    guessMime(filename) {
        const ext = filename.split(".").pop()?.toLowerCase() ?? "";
        switch (ext) {
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "png":
                return "image/png";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "pdf":
                return "application/pdf";
            case "txt":
                return "text/plain";
            case "md":
                return "text/markdown";
            case "csv":
                return "text/csv";
            case "json":
                return "application/json";
            default:
                return "application/octet-stream";
        }
    }
    sizeOf(file) {
        if (file instanceof Uint8Array)
            return file.byteLength;
        if (typeof Blob !== "undefined" && file instanceof Blob)
            return file.size;
        if (typeof ArrayBuffer !== "undefined" && file instanceof ArrayBuffer)
            return file.byteLength;
        if (typeof file === "string")
            return new TextEncoder().encode(file).length;
        return 0;
    }
    // Normalize markdown_block.chunks (which can be string, array, nested arrays, or structured pieces)
    normalizeChunksField(chunksField) {
        const out = [];
        const push = (v) => {
            if (v === null || v === undefined)
                return;
            if (Array.isArray(v)) {
                for (const it of v)
                    push(it);
                return;
            }
            if (typeof v === "string") {
                out.push(v);
                return;
            }
            try {
                out.push(JSON.stringify(v));
            }
            catch (e) {
                out.push(String(v));
            }
        };
        push(chunksField);
        return out;
    }
    // use shared helpers imported from search_helpers
    // generic SSE parser used by both stream and non-stream modes
    async *sseStream(res) {
        if (!res.body)
            return;
        const reader = res.body.getReader();
        let buf = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += new TextDecoder().decode(value);
            const parts = buf.split("\r\n\r\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
                const content = part;
                if (content.startsWith("event: message\r\n")) {
                    const dataPrefix = "event: message\r\ndata: ";
                    const jsonText = content.slice(dataPrefix.length);
                    try {
                        const parsed = JSON.parse(jsonText);
                        const textVal = parsed?.text;
                        if (typeof textVal === "string") {
                            try {
                                parsed.text = JSON.parse(textVal);
                            }
                            catch (e) {
                                parsed.text = textVal;
                            }
                        }
                        yield parsed;
                    }
                    catch (e) {
                        yield { raw: content };
                    }
                }
            }
        }
    }
    /**
     * search:
     * - query: string
     * - mode: 'auto' | 'pro' | 'reasoning' | 'deep research'
     * - model: optional model name
     * - sources: ['web'|'scholar'|'social']
     * - files: Record<filename, Uint8Array|Blob|string>
     * - stream: if true, returns AsyncGenerator<Chunk>
     */
    async search(query, mode = "auto", model = null, sources = ["web"], files = {}, language = "en-US", follow_up = null, incognito = false) {
        // basic validation
        ensureSearchArgs(this, mode, sources, files);
        const uploaded_files = await uploadFiles(this, files);
        const jsonBody = buildSearchJsonBody(this, query, mode, model, uploaded_files, follow_up, incognito, language, sources);
        // console.log(jsonBody) //*大事
        const res = await postSearch(this, jsonBody);
        // non-stream: collect all chunks, merge them, and return an aggregated final response
        const collected = [];
        for await (const chunk of this.sseStream(res)) {
            // detect explicit backend errors (rate limit / failed status)
            const ec = chunk?.error_code;
            const st = chunk?.status;
            if (ec === "RATE_LIMITED" || st === "failed") {
                const reason = chunk?._response_type || ec || st || "request failed";
                const text = chunk?.text || chunk?.message || undefined;
                const msg = `Perplexity API error: ${String(reason)}${text ? ` - ${JSON.stringify(text)}` : ""}`;
                throw new Error(msg);
            }
            collected.push(chunk);
            // detect final SSE message
            if (chunk && (chunk.final === true || chunk.final_sse_message === true)) {
                break;
            }
        }
        if (collected.length > 0) {
            // Merge strategy:
            // - concatenate `text` arrays from all chunks
            // - concatenate `widget_data` arrays
            // - for other keys, prefer the most recent non-undefined value
            const agg = {};
            const pushUnique = (targetKey, value) => {
                agg[targetKey] = agg[targetKey] || [];
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (!agg[targetKey].some((x) => JSON.stringify(x) === JSON.stringify(item)))
                            agg[targetKey].push(item);
                    }
                }
                else {
                    if (!agg[targetKey].some((x) => JSON.stringify(x) === JSON.stringify(value)))
                        agg[targetKey].push(value);
                }
            };
            for (const c of collected) {
                if (!c || typeof c !== "object")
                    continue;
                for (const [k, v] of Object.entries(c)) {
                    if (k === "text") {
                        agg.text = (agg.text || []).concat(Array.isArray(v) ? v : [v]);
                    }
                    else if (k === "widget_data" ||
                        k === "media_items" ||
                        k === "attachments" ||
                        k === "blocks" ||
                        k === "answer_modes") {
                        pushUnique(k, v);
                    }
                    else if (v !== undefined) {
                        agg[k] = v;
                    }
                }
            }
            // Post-process blocks: merge multiple `ask_text` blocks into a single block
            if (Array.isArray(agg.blocks)) {
                const mergedBlocks = [];
                let askTextChunks = [];
                let firstAskTextIndex = null;
                for (let i = 0; i < agg.blocks.length; i++) {
                    const b = agg.blocks[i];
                    if (b && b.intended_usage === "ask_text" && b.markdown_block) {
                        if (firstAskTextIndex === null)
                            firstAskTextIndex = mergedBlocks.length;
                        const chunks = Array.isArray(b.markdown_block.chunks)
                            ? b.markdown_block.chunks
                            : b.markdown_block.chunks
                                ? [b.markdown_block.chunks]
                                : [];
                        askTextChunks = askTextChunks.concat(chunks);
                        // do not push individual ask_text blocks
                    }
                    else {
                        mergedBlocks.push(b);
                    }
                }
                if (askTextChunks.length > 0) {
                    const normalizedChunks = this.normalizeChunksField(askTextChunks);
                    const mergedMarkdown = {
                        progress: "finished",
                        chunks: normalizedChunks,
                        chunk_starting_offset: 0,
                    };
                    // Always construct the merged answer from normalized chunks
                    const joined = normalizedChunks.join("");
                    mergedMarkdown.answer = joined;
                    // insert merged ask_text block at firstAskTextIndex if known, otherwise push at end
                    const insertAt = firstAskTextIndex === null
                        ? mergedBlocks.length
                        : firstAskTextIndex;
                    mergedBlocks.splice(insertAt, 0, {
                        intended_usage: "ask_text",
                        markdown_block: mergedMarkdown,
                    });
                }
                agg.blocks = mergedBlocks;
            }
            return agg;
        }
        throw new Error("No final response received");
    }
    // add createAccount method
    async createAccount(emailnatorCookies) {
        // minimal account creation flow using Emailnator
        const Emailnator = (await import("./emailnator")).default;
        const en = new Emailnator(emailnatorCookies);
        await en.initGenerate();
        console.log("Emailnator generated address:", en.email);
        // Enhanced CSRF token retrieval based on learned patterns
        let csrfToken = await this.getCsrfToken();
        if (csrfToken) {
            console.log("Using csrf token prefix:", csrfToken.slice(0, 12) + "...");
        }
        else {
            console.warn("No CSRF token available - proceeding anyway");
        }
        // Use browser automation for signin (learned from MCP Playwright session)
        const maxAttempts = 6;
        let initResp = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Try browser automation first for more reliable signin
                const browserSignin = await this.performBrowserSignin(en.email);
                if (browserSignin.success) {
                    // Browser signin succeeded, continue with email polling
                    console.log("Browser signin completed successfully");
                    break;
                }
                else {
                    console.warn("Browser signin failed, attempting API fallback");
                }
                // Fallback to API call if browser method fails
                initResp = await fetch(this.base + "/api/auth/signin/email", {
                    method: "POST",
                    headers: this.buildHeaders({
                        "content-type": "application/x-www-form-urlencoded",
                    }),
                    body: new URLSearchParams({
                        email: en.email,
                        csrfToken: csrfToken,
                        callbackUrl: "https://www.perplexity.ai/",
                        json: "true",
                    }).toString(),
                });
                // debug: capture response body snippet to help diagnose delivery issues
                try {
                    const txt = await initResp
                        .clone()
                        .text()
                        .catch(() => "<no-body>");
                    console.log("signin init response:", {
                        status: initResp.status,
                        ok: initResp.ok,
                        body_snippet: String(txt).slice(0, 400),
                    });
                    // Detect Cloudflare / JS challenge pages and attempt interactive fallback
                    try {
                        const bodyLower = String(txt || "").toLowerCase();
                        if (bodyLower.includes("just a moment") ||
                            bodyLower.includes("enable javascript and cookies") ||
                            bodyLower.includes("_cf_chl_opt") ||
                            bodyLower.includes("cdn-cgi/challenge-platform")) {
                            console.error("Detected Cloudflare-like challenge page in signin response. This request requires a real browser (JS + cookies) to complete.");
                            // attempt interactive fallback using Driver
                            try {
                                const drv = new Driver();
                                console.log("Attempting interactive signin via Driver.performInteractiveSignin()...");
                                const cookies = await drv.performInteractiveSignin({
                                    chromeDataDir: process.env.CHROME_USER_DATA_DIR,
                                });
                                if (cookies) {
                                    // merge cookies into this.cookies and retry
                                    this.cookies = { ...(this.cookies || {}), ...cookies };
                                    console.log("Merged cookies from interactive signin; retrying signin flow.");
                                    initResp = null;
                                    await new Promise((r) => setTimeout(r, 1000));
                                    continue;
                                }
                                else {
                                    throw new Error("Interactive signin did not produce Perplexity cookies");
                                }
                            }
                            catch (e) {
                                // propagate to outer handler
                                throw e;
                            }
                        }
                    }
                    catch (e) {
                        // if detection throws, rethrow to abort outer flow
                        throw e;
                    }
                }
                catch (e) {
                    // ignore logging errors
                }
            }
            catch (e) {
                console.warn("signin request network error (attempt", attempt, "):", e);
            }
            if (!initResp) {
                // small backoff and retry
                await new Promise((r) => setTimeout(r, 1000 * attempt));
                continue;
            }
            if (!initResp.ok) {
                const txt = await initResp.text().catch(() => "<no-body>");
                console.error("signin request failed, status:", initResp.status, "body:", txt);
                // for 4xx other than 429 don't retry
                if (initResp.status >= 400 && initResp.status < 500)
                    break;
                // otherwise retry
                await new Promise((r) => setTimeout(r, 1000 * attempt));
                continue;
            }
            // success
            break;
        }
        if (!initResp || !initResp.ok) {
            const txt = initResp
                ? await initResp.text().catch(() => "<no-body>")
                : "<no-response>";
            console.error("Final signin request result, status:", initResp ? initResp.status : "(none)", "body:", txt);
            throw new Error("signin request failed");
        }
        // Debug: fetch the public mailbox page HTML to see if messages are visible
        try {
            const mailboxUrl = en.makeMailboxUrl();
            const mbResp = await fetch(mailboxUrl, {
                headers: this.buildHeaders({ accept: "text/html" }),
            });
            const mbText = await mbResp.text().catch(() => "<no-body>");
            console.log("Mail box page snippet:", String(mbText).slice(0, 800));
        }
        catch (e) {
            console.warn("Failed to fetch mailbox page for debug:", e);
        }
        // wait for email
        // give more time for the signin email to arrive (some providers are slow)
        // wait for a signin message — be tolerant: some providers change subject or sender
        const new_msgs = await en.reload({
            wait: true,
            // Accept subjects that mention 'perplexity' (case-insensitive) or exact match
            wait_for: (m) => !!(m &&
                ((m.subject && /perplexity/i.test(m.subject)) ||
                    m.subject === "Sign in to Perplexity")),
            // increase timeout for slower delivery
            timeout: 120,
        });
        if (!new_msgs) {
            // First attempt yielded nothing — try resending the signin init once.
            console.warn("No signin email arrived on first attempt; attempting single resend of signin request...");
            try {
                await fetch(this.base + "/api/auth/signin/email", {
                    method: "POST",
                    headers: this.buildHeaders({
                        "content-type": "application/x-www-form-urlencoded",
                    }),
                    body: new URLSearchParams({
                        email: en.email,
                        csrfToken: csrfToken || "",
                        callbackUrl: "https://www.perplexity.ai/",
                        json: "true",
                    }).toString(),
                });
            }
            catch (e) {
                console.warn("Resend signin request failed:", e);
            }
            // brief backoff then poll inbox again with a shorter timeout
            await new Promise((r) => setTimeout(r, 3000));
            const retry_msgs = await en
                .reload({ wait: true, timeout: 60 })
                .catch(() => undefined);
            if (!retry_msgs || retry_msgs.length === 0) {
                // attempt a non-wait reload to capture current mailbox state for debugging
                const current = await en.reload({ wait: false }).catch(() => undefined);
                console.error("No new messages arrived after resend. inbox length:", en.inbox?.length ?? 0, "inbox_ads length:", en.inbox_ads?.length ?? 0);
                console.error("Mailbox snapshot (for diagnosis):", JSON.stringify({
                    latest_list: current
                        ? Array.isArray(current)
                            ? current.slice(0, 10)
                            : current
                        : null,
                    inbox: en.inbox ? en.inbox.slice(0, 10) : null,
                    inbox_ads: en.inbox_ads ? en.inbox_ads.slice(0, 10) : null,
                }, null, 2));
                throw new Error("no signin email");
            }
            // continue with retry_msgs by treating them as the messages we received
            // (the later selection and processing will find the correct message)
        }
        // Prefer an exact-subject match, but fall back to fuzzy subject match or first new message
        let msg = en.get((x) => x.subject === "Sign in to Perplexity") ||
            en.findBySubject(/perplexity/i) ||
            en.get((x) => !!x.subject) ||
            en.inbox[0];
        if (!msg) {
            console.error("No suitable message found in inbox", {
                inbox_len: en.inbox?.length ?? 0,
                inbox_sample: en.inbox?.slice(0, 5) ?? null,
            });
            throw new Error("signin message not found");
        }
        let content = "";
        try {
            content = await en.open(msg.messageID || msg.messageID || msg.messageId);
        }
        catch (e) {
            console.error("Failed to open message for id", msg, e);
            throw new Error("failed to open signin email");
        }
        // Try several strategies to locate the signin callback URL in the email
        // Enhanced pattern matching based on MCP Playwright learnings (nb3bp-asxab style tokens)
        const unescaped = String(content)
            .replace(/&quot;|&#34;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'");
        // Extract token directly from email content (learned pattern: nb3bp-asxab)
        const tokenMatch = /\b([a-z0-9]{5}-[a-z0-9]{5})\b/i.exec(unescaped);
        if (tokenMatch) {
            const token = tokenMatch[1];
            console.log("Found signin token in email:", token);
            // Try to use browser automation to complete signin with token
            try {
                const browserResult = await this.completeBrowserSignin(token, en.email);
                if (browserResult.success) {
                    console.log("Successfully completed signin via browser automation");
                    this.copilot = 5;
                    this.file_upload = 10;
                    return true;
                }
            }
            catch (e) {
                console.warn("Browser token signin failed, falling back to URL method:", e);
            }
        }
        const reQuoted = /"(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?callbackUrl=[^"]+)"/;
        const reHref = /href=['"]?(https?:\/\/[^'"\s>]*api\/auth\/callback\/email\?[^'"\s>]+)/i;
        const reGeneric = /(https?:\/\/[^"'<>\s]*api\/auth\/callback\/email\?[^"'<>\s]+)/;
        let m = reQuoted.exec(unescaped) ||
            reHref.exec(unescaped) ||
            reGeneric.exec(unescaped);
        // If not found, try a decoded version (some providers URL-encode the whole link)
        if (!m) {
            try {
                const decoded = decodeURIComponent(unescaped);
                m =
                    reQuoted.exec(decoded) ||
                        reHref.exec(decoded) ||
                        reGeneric.exec(decoded);
            }
            catch (e) {
                // ignore decode errors
            }
        }
        if (!m) {
            // helpful debug: show a short snippet of the email to aid diagnosis
            console.error("Email content snippet:", unescaped.slice(0, 400));
            throw new Error("signin link not found");
        }
        let link = m[1];
        // ensure common HTML-escaped ampersands are unescaped in the URL
        link = String(link).replace(/&amp;/g, "&");
        try {
            await fetch(link, { method: "GET", headers: this.buildHeaders() });
        }
        catch (e) {
            console.error("Failed to fetch signin callback link", link, e);
            throw new Error("failed to complete signin callback");
        }
        this.copilot = 5;
        this.file_upload = 10;
        return true;
    }
    /**
     * Attempt to retrieve available models. Strategy:
     * 1) try known HTTP endpoints
     * 2) try cookie `pplx.search-models-v4` if present
     * 3) try /api/auth/session body
     * 4) fallback to internal model map
     */
    async getModels() {
        const candidates = [
            "/rest/models/config?config_schema=v1&version=2.18&source=default",
            "/api/search/models",
            "/rest/models",
            "/api/models",
            "/api/public/models",
        ];
        for (const path of candidates) {
            try {
                const resp = await fetch(this.base + path, {
                    headers: this.buildHeaders({ accept: "application/json" }),
                });
                if (resp.ok) {
                    const ct = resp.headers.get("content-type") || "";
                    if (ct.includes("application/json")) {
                        try {
                            return await resp.json();
                        }
                        catch (e) {
                            /* ignore parse error */
                        }
                    }
                }
            }
            catch (e) {
                // ignore and try next
            }
        }
        // try cookie-based model hint
        try {
            const cookieVal = (this.cookies &&
                (this.cookies["pplx.search-models-v4"] ||
                    this.cookies["pplx.search-models-v3"]));
            if (cookieVal) {
                try {
                    const decoded = decodeURIComponent(String(cookieVal));
                    const parsed = JSON.parse(decoded.startsWith("{")
                        ? decoded
                        : decoded.replace(/^pplx\.search-models-v\d+=/, ""));
                    return parsed;
                }
                catch (e) {
                    // ignore
                }
            }
        }
        catch (e) {
            // ignore
        }
        // try session endpoint for hints
        try {
            const s = await fetch(this.base + "/api/auth/session", {
                headers: this.buildHeaders({ accept: "application/json" }),
            });
            if (s.ok) {
                try {
                    const body = await s.json();
                    // heuristics: search for keys that might contain model info
                    if (body &&
                        (body.search_models || body["pplx.search-models-v4"] || body.user))
                        return body;
                }
                catch (e) { }
            }
        }
        catch (e) { }
        // use shared model preference map
        return buildModelPrefMap();
    }
}
