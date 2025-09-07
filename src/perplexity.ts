import type { PerplexityResponse, PerplexityChunk, Models } from "./types";
import Emailnator from "./emailnator";
import {
  ensureSearchArgs,
  uploadFiles,
  buildSearchJsonBody,
  postSearch,
  computeModelPreference,
  buildModelPrefMap,
  cryptoRandomUuid,
} from "./search_helpers";

/**
 * A single incremental SSE chunk emitted by Perplexity's streaming API.
 * Consumers can treat this as a partial/complete response piece.
 */
export type Chunk = PerplexityChunk;

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
export class PerplexityClient {
  base = "https://www.perplexity.ai";

  public own: boolean;
  public copilot: number;
  public file_upload: number;
  private signin_regex =
    /"(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?callbackUrl=.*?)"/;

  constructor(public cookies: Record<string, string> = {}) {
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
      } catch (e) {
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
  async asyncSearch(
    query: string,
    mode: "auto" | "pro" | "reasoning" | "deep research" = "auto",
    model: Models | null = null,
    sources: Array<"web" | "scholar" | "social" | "finance"> = ["web"],
    files: Record<string, any> = {},
    language = "en-US",
    follow_up: any = null,
    incognito = false
  ): Promise<AsyncGenerator<PerplexityChunk, PerplexityResponse, void>> {
    // basic validation (same as in search)
    ensureSearchArgs(this, mode, sources, files);

    const uploaded_files = await uploadFiles(this, files);

    const jsonBody = buildSearchJsonBody(
      this,
      query,
      mode,
      model as any,
      uploaded_files,
      follow_up,
      incognito,
      language,
      sources
    );
    const res = await postSearch(this, jsonBody);

    // wrap the low-level sseStream so callers receive chunks and also get
    // an aggregated PerplexityResponse as the generator's return value.
    const self = this;
    async function* wrapper(): AsyncGenerator<
      PerplexityChunk,
      PerplexityResponse,
      void
    > {
      const collected: PerplexityChunk[] = [];
      for await (const chunk of self.sseStream(res)) {
        // normalize chunk.text to array for easier downstream merging
        if (chunk.text && typeof chunk.text === "string")
          chunk.text = [chunk.text];
        collected.push(chunk as PerplexityChunk);
        yield chunk as PerplexityChunk;
        if (chunk && (chunk.final === true || chunk.final_sse_message === true))
          break;
      }

      // merge collected chunks into a final PerplexityResponse (same strategy as non-stream search)
      if (collected.length > 0) {
        const agg: any = {};
        const pushUnique = (targetKey: string, value: any) => {
          agg[targetKey] = agg[targetKey] || [];
          if (Array.isArray(value)) {
            for (const item of value) {
              if (
                !agg[targetKey].some(
                  (x: any) => JSON.stringify(x) === JSON.stringify(item)
                )
              )
                agg[targetKey].push(item);
            }
          } else {
            if (
              !agg[targetKey].some(
                (x: any) => JSON.stringify(x) === JSON.stringify(value)
              )
            )
              agg[targetKey].push(value);
          }
        };

        for (const c of collected) {
          if (!c || typeof c !== "object") continue;
          for (const [k, v] of Object.entries(c)) {
            if (k === "text") {
              agg.text = (agg.text || []).concat(Array.isArray(v) ? v : [v]);
            } else if (
              k === "widget_data" ||
              k === "media_items" ||
              k === "attachments" ||
              k === "blocks" ||
              k === "answer_modes"
            ) {
              pushUnique(k, v);
            } else if (v !== undefined) {
              agg[k] = v;
            }
          }
        }

        // Post-process blocks: merge multiple `ask_text` blocks into a single block
        if (Array.isArray(agg.blocks)) {
          const mergedBlocks: any[] = [];
          let askTextChunks: string[] = [];
          let firstAskTextIndex: number | null = null;

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
              askTextChunks = askTextChunks.concat(chunks as string[]);
              // do not push individual ask_text blocks
            } else {
              mergedBlocks.push(b);
            }
          }

          if (askTextChunks.length > 0) {
            const normalizedChunks = self.normalizeChunksField(askTextChunks);
            const mergedMarkdown: any = {
              progress: "finished",
              chunks: normalizedChunks,
              chunk_starting_offset: 0,
            };
            const joined = normalizedChunks.join("");
            mergedMarkdown.answer = joined;

            const insertAt =
              firstAskTextIndex === null
                ? mergedBlocks.length
                : firstAskTextIndex;
            mergedBlocks.splice(insertAt, 0, {
              intended_usage: "ask_text",
              markdown_block: mergedMarkdown,
            });
          }

          agg.blocks = mergedBlocks;
        }

        return agg as PerplexityResponse;
      }

      throw new Error("No final response received");
    }

    return Promise.resolve(wrapper());
  }

  private buildHeaders(additional: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
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

  // low-dependency mime guessing for common extensions
  private guessMime(filename: string) {
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

  private sizeOf(file: any): number {
    if (file instanceof Uint8Array) return file.byteLength;
    if (typeof Blob !== "undefined" && file instanceof Blob)
      return (file as Blob).size;
    if (typeof ArrayBuffer !== "undefined" && file instanceof ArrayBuffer)
      return file.byteLength;
    if (typeof file === "string") return new TextEncoder().encode(file).length;
    return 0;
  }

  // Normalize markdown_block.chunks (which can be string, array, nested arrays, or structured pieces)
  private normalizeChunksField(chunksField: any): string[] {
    const out: string[] = [];
    const push = (v: any) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) {
        for (const it of v) push(it);
        return;
      }
      if (typeof v === "string") {
        out.push(v);
        return;
      }
      try {
        out.push(JSON.stringify(v));
      } catch (e) {
        out.push(String(v));
      }
    };
    push(chunksField);
    return out;
  }

  // use shared helpers imported from search_helpers

  // generic SSE parser used by both stream and non-stream modes
  private async *sseStream(
    res: Response
  ): AsyncGenerator<PerplexityChunk, void, void> {
    if (!res.body) return;
    const reader = res.body.getReader();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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
              } catch (e) {
                parsed.text = textVal;
              }
            }
            yield parsed as Chunk;
          } catch (e) {
            yield { raw: content } as Chunk;
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
  async search(
    query: string,
    mode: "auto" | "pro" | "reasoning" | "deep research" = "auto",
    model: Models | null = null,
    sources: Array<"web" | "scholar" | "social" | "finance"> = ["web"],
    files: Record<string, any> = {},
    language = "en-US",
    follow_up: any = null,
    incognito = false
  ): Promise<PerplexityResponse> {
    // basic validation

    ensureSearchArgs(this, mode, sources, files);

    const uploaded_files = await uploadFiles(this, files);
    const jsonBody = buildSearchJsonBody(
      this,
      query,
      mode,
      model as any,
      uploaded_files,
      follow_up,
      incognito,
      language,
      sources
    );
    // console.log(jsonBody) //*大事
    const res = await postSearch(this, jsonBody);

    // non-stream: collect all chunks, merge them, and return an aggregated final response
    const collected: PerplexityChunk[] = [];
    for await (const chunk of this.sseStream(res)) {
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
      const agg: any = {};
      const pushUnique = (targetKey: string, value: any) => {
        agg[targetKey] = agg[targetKey] || [];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (
              !agg[targetKey].some(
                (x: any) => JSON.stringify(x) === JSON.stringify(item)
              )
            )
              agg[targetKey].push(item);
          }
        } else {
          if (
            !agg[targetKey].some(
              (x: any) => JSON.stringify(x) === JSON.stringify(value)
            )
          )
            agg[targetKey].push(value);
        }
      };

      for (const c of collected) {
        if (!c || typeof c !== "object") continue;
        for (const [k, v] of Object.entries(c)) {
          if (k === "text") {
            agg.text = (agg.text || []).concat(Array.isArray(v) ? v : [v]);
          } else if (
            k === "widget_data" ||
            k === "media_items" ||
            k === "attachments" ||
            k === "blocks" ||
            k === "answer_modes"
          ) {
            pushUnique(k, v);
          } else if (v !== undefined) {
            agg[k] = v;
          }
        }
      }

      // Post-process blocks: merge multiple `ask_text` blocks into a single block
      if (Array.isArray(agg.blocks)) {
        const mergedBlocks: any[] = [];
        let askTextChunks: string[] = [];
        let firstAskTextIndex: number | null = null;

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
            askTextChunks = askTextChunks.concat(chunks as string[]);
            // do not push individual ask_text blocks
          } else {
            mergedBlocks.push(b);
          }
        }

        if (askTextChunks.length > 0) {
          const normalizedChunks = this.normalizeChunksField(askTextChunks);
          const mergedMarkdown: any = {
            progress: "finished",
            chunks: normalizedChunks,
            chunk_starting_offset: 0,
          };
          // Always construct the merged answer from normalized chunks
          const joined = normalizedChunks.join("");
          mergedMarkdown.answer = joined;

          // insert merged ask_text block at firstAskTextIndex if known, otherwise push at end
          const insertAt =
            firstAskTextIndex === null
              ? mergedBlocks.length
              : firstAskTextIndex;
          mergedBlocks.splice(insertAt, 0, {
            intended_usage: "ask_text",
            markdown_block: mergedMarkdown,
          });
        }

        agg.blocks = mergedBlocks;
      }

      return agg as PerplexityResponse;
    }

    throw new Error("No final response received");
  }

  // add createAccount method
  async createAccount(
    emailnatorCookies: Record<string, string>
  ): Promise<boolean> {
    // minimal account creation flow using Emailnator
    const Emailnator = (await import("./emailnator")).default as any;
    const en = new Emailnator(emailnatorCookies);
    await en.initGenerate();
    console.log("Emailnator generated address:", en.email);

    // ensure we have a CSRF token (try cookies first, then fetch endpoint)
    let csrfToken =
      (this.cookies["next-auth.csrf-token"] || "").split("%")[0] || "";
    if (!csrfToken) {
      try {
        const cRes = await fetch(this.base + "/api/auth/csrf", {
          headers: this.buildHeaders(),
        });
        if (cRes.ok) {
          const cj = await cRes.json().catch(() => null);
          csrfToken =
            cj && (cj.csrfToken || cj.csrf_token)
              ? cj.csrfToken || cj.csrf_token
              : csrfToken;
          console.log(
            "Fetched CSRF token from /api/auth/csrf:",
            csrfToken ? "[redacted]" : "(none)"
          );
        } else {
          console.warn("/api/auth/csrf responded with status", cRes.status);
        }
      } catch (e) {
        console.warn("Failed to fetch CSRF token:", e);
      }
    }

    // request signin link with retry/backoff for rate limits (429)
    const maxAttempts = 6;
    let initResp: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
      } catch (e) {
        console.warn("signin request network error (attempt", attempt, "):", e);
      }

      if (!initResp) {
        // small backoff and retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (initResp.status === 429) {
        const txt = await initResp.text().catch(() => "<no-body>");
        console.warn(
          "signin rate-limited (429), attempt",
          attempt,
          "body:",
          txt
        );
        // try to read suggested wait time in message, otherwise exponential backoff
        const waitMs = 60 * 1000 * (attempt === 1 ? 1 : attempt); // escalate wait
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!initResp.ok) {
        const txt = await initResp.text().catch(() => "<no-body>");
        console.error(
          "signin request failed, status:",
          initResp.status,
          "body:",
          txt
        );
        // for 4xx other than 429 don't retry
        if (initResp.status >= 400 && initResp.status < 500) break;
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
      console.error(
        "Final signin request result, status:",
        initResp ? initResp.status : "(none)",
        "body:",
        txt
      );
      throw new Error("signin request failed");
    }

    // wait for email
    // give more time for the signin email to arrive (some providers are slow)
    const new_msgs = await en.reload({
      wait: true,
      wait_for: (m: any) => m.subject === "Sign in to Perplexity",
      timeout: 60,
    });
    if (!new_msgs) {
      console.error(
        "No new messages arrived. inbox length:",
        en.inbox?.length ?? 0,
        "inbox_ads length:",
        en.inbox_ads?.length ?? 0
      );
      throw new Error("no signin email");
    }

    const msg = en.get((x: any) => x.subject === "Sign in to Perplexity");
    const content = await en.open(msg.messageID);

    // Try several strategies to locate the signin callback URL in the email
    // - unescape common HTML entities
    // - look for a quoted URL, an href= attribute, or any raw URL containing the callback path
    const unescaped = String(content)
      .replace(/&quot;|&#34;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'");

    const reQuoted =
      /"(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?callbackUrl=[^"]+)"/;
    const reHref =
      /href=['"]?(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?[^'"\s>]+)/i;
    const reGeneric =
      /(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?[^"'<>\s]+)/;

    let m: RegExpExecArray | null =
      reQuoted.exec(unescaped) ||
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
      } catch (e) {
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

    await fetch(link, { method: "GET", headers: this.buildHeaders() });

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
  async getModels(): Promise<any> {
    const candidates = [
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
            } catch (e) {
              /* ignore parse error */
            }
          }
        }
      } catch (e) {
        // ignore and try next
      }
    }

    // try cookie-based model hint
    try {
      const cookieVal = (this.cookies &&
        (this.cookies["pplx.search-models-v4"] ||
          this.cookies["pplx.search-models-v3"])) as any;
      if (cookieVal) {
        try {
          const decoded = decodeURIComponent(String(cookieVal));
          const parsed = JSON.parse(
            decoded.startsWith("{")
              ? decoded
              : decoded.replace(/^pplx\.search-models-v\d+=/, "")
          );
          return parsed;
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
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
          if (
            body &&
            (body.search_models || body["pplx.search-models-v4"] || body.user)
          )
            return body;
        } catch (e) {}
      }
    } catch (e) {}

    // use shared model preference map
    return buildModelPrefMap();
  }
}
