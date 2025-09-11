// Full behavior requires Playwright/Patchright and complex request interception.
// Here we provide a structural stub and TODOs for integration.

/**
 * Driver
 *
 * Placeholder driver abstraction for browser automation. This file is a
 * structural stub - actual implementations should use Playwright/Playwright
 * patches to perform request interception and automated account creation.
 */
/**
 * Driver
 *
 * Abstraction/stub for browser automation workflows. Intended as a surface
 * for Playwright-based implementations that perform request interception
 * and automated account creation flows.
 */
export class Driver {
  // same regex as Python implementation for extracting signin callback links
  signin_regex = /"(https:\/\/www\.perplexity\.ai\/auth\/signin)"/;

  creating_new_account = false;
  account_creator_running = false;
  renewing_emailnator_cookies = false;
  background_pages: any[] = [];
  perplexity_cookies: Record<string, string> | null = null;
  emailnator_cookies: Record<string, string> | null = null;

  // headers captured from intercepted requests (best-effort)
  perplexity_headers: Record<string, any> | null = null;
  emailnator_headers: Record<string, any> | null = null;

  // internal coordination
  newAccountLink: string | null = null;

  // runtime browser/page handles (populated when run() starts Playwright)
  browser: any;
  page: any;

  constructor() {}

  // Initialize browser using patchright (preferred over playwright)
  async initBrowser(chrome_data_dir?: string): Promise<void> {
    console.log("🔄 Starting browser initialization...");
    let playwright: any = null;
    let usingPatchright = false;

    try {
      console.log("📦 Attempting to load patchright...");
      // prefer patchright
      const pr = await import("patchright");
      playwright = pr;
      usingPatchright = true;
      console.log("✅ Patchright loaded successfully");
    } catch (e) {
      console.log("❌ Patchright failed to load:", String(e));
      try {
        console.log("📦 Attempting to load playwright...");
        // fallback to playwright
        // @ts-ignore: optional dependency
        // playwright = await import("playwright");
        console.log("✅ Playwright loaded successfully");
      } catch (e2) {
        console.error("❌ Playwright also failed to load:", String(e2));
        throw new Error("Neither patchright nor playwright is installed");
      }
    }

    console.log(
      `🚀 Driver initializing using ${
        usingPatchright ? "patchright" : "playwright"
      }`
    );

    console.log("🔧 Getting chromium implementation...");
    const impl = (playwright as any).chromium;
    console.log("📁 Chrome data dir:", chrome_data_dir || "none (transient)");

    try {
      if (chrome_data_dir) {
        console.log("🔄 Launching persistent context...");
        // launch persistent context using provided user data dir
        this.browser = await impl.launchPersistentContext(chrome_data_dir, {
          channel: "chrome",
          headless: false,
        });
        console.log("✅ Persistent context launched");

        console.log("🔄 Getting page from persistent context...");
        this.page = this.browser.pages
          ? this.browser.pages()[0] || (await this.browser.newPage())
          : await this.browser.newPage();
        console.log("✅ Page obtained from persistent context");
      } else {
        console.log("🔄 Launching transient browser...");
        // no user-data-dir provided: launch a transient browser and context
        const browser = await impl.launch({
          headless: true, // Use headless for testing
          args: ["--no-sandbox", "--disable-setuid-sandbox"], // Additional args for better compatibility
        });
        console.log("✅ Transient browser launched");

        console.log("🔄 Creating new context...");
        const context = await browser.newContext();
        console.log("✅ Context created");

        this.browser = browser;
        console.log("🔄 Creating new page...");
        this.page = await context.newPage();
        console.log("✅ Page created");
      }

      console.log("🎉 Browser initialization completed successfully!");
    } catch (e) {
      console.error("💥 Error during browser launch/context creation:", e);
      throw e;
    }
  }

  // Close browser safely
  async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (e) {
      console.warn("Error closing browser:", e);
    }
  }

  // helper to parse `cookie` header into a map
  private parseCookies(
    cookieHeader: string | undefined
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (!cookieHeader) return out;
    for (const part of String(cookieHeader).split(/;\s*/)) {
      const [k, ...rest] = part.split("=");
      if (!k) continue;
      out[k] = rest.join("=");
    }
    return out;
  }

  // Background account creation loop (mirrors Python account_creator)
  async accountCreator() {
    // load Emailnator lazily from the TypeScript implementation if present
    const EmailnatorModule = await import("./emailnator").catch(() => null);
    const Emailnator: any = EmailnatorModule
      ? EmailnatorModule.default || EmailnatorModule
      : null;

    while (true) {
      if (!this.newAccountLink) {
        // attempt to create a new account link
        try {
          // require Emailnator client available
          if (!Emailnator)
            throw new Error(
              "Emailnator module not available (install or implement src/emailnator.ts)"
            );

          const en = new Emailnator(this.emailnator_cookies || {}, {
            ...(this.emailnator_headers || {}),
          });

          // Initiate signin request using captured Perplexity cookies/headers if available
          const csrfToken = this.perplexity_cookies
            ? this.perplexity_cookies["next-auth.csrf-token"] || ""
            : "";
          const body = new URLSearchParams({
            email: en.email,
            csrfToken: csrfToken ? String(csrfToken).split("%")[0] : "",
            callbackUrl: "https://www.perplexity.ai/",
            json: "true",
          }).toString();

          const headers = {
            ...(this.perplexity_headers || {}),
            "content-type": "application/x-www-form-urlencoded",
          };

          const resp = await fetch(
            "https://www.perplexity.ai/api/auth/signin/email",
            {
              method: "POST",
              headers,
              body,
            }
          ).catch((e) => {
            throw e;
          });

          if (resp && resp.ok) {
            // wait for email to arrive via Emailnator
            const newMsgs = await en
              .reload({
                wait_for: (m: any) =>
                  m && m.subject && /perplexity/i.test(m.subject),
                timeout: 20,
              })
              .catch(() => null);
            if (newMsgs) {
              const msg =
                en.get((x: any) => x.subject === "Sign in to Perplexity") ||
                en.get((x: any) => !!x.subject) ||
                (en.inbox && en.inbox[0]);
              if (msg) {
                const content = await en
                  .open(msg.messageID || msg.messageId)
                  .catch(() => null);
                if (content) {
                  const unescaped = String(content)
                    .replace(/&quot;|&#34;/g, '"')
                    .replace(/&amp;/g, "&")
                    .replace(/&#39;/g, "'");
                  const m = this.signin_regex.exec(unescaped);
                  if (m && m[1])
                    this.newAccountLink = m[1].replace(/&amp;/g, "&");
                }
              }
            }
          }
        } catch (e) {
          // if anything fails, signal emailnator cookie renewal and retry
          // small backoff to avoid tight loop
          // eslint-disable-next-line no-console
          console.warn(
            "accountCreator error, will attempt to renew emailnator cookies:",
            e
          );
          this.emailnator_cookies = null;
          this.renewing_emailnator_cookies = true;
          // wait for external code to set emailnator_cookies
          while (!this.emailnator_cookies) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      } else {
        // link exists, sleep briefly
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // interceptRequest attempts to mimic Python's Playwright route handler
  async interceptRequest(route: any, request: any) {
    try {
      const url = request.url();

      // helper to fetch a route's response when needed
      const fetchedResponse = await route.fetch().catch(() => null);

      // Perplexity main page handling: capture initial cookies/headers
      if (url === "https://www.perplexity.ai/") {
        const cookies = this.parseCookies(request.headers()["cookie"]);

        if (
          !this.perplexity_cookies &&
          fetchedResponse &&
          (await fetchedResponse.text()).includes(
            "What do you want to know?"
          ) &&
          cookies["next-auth.csrf-token"]
        ) {
          this.perplexity_headers = request.headers();
          this.perplexity_cookies = cookies;
          await route.fulfill({ body: ":)" }).catch(() => {});

          // open Emailnator in a background page if possible (caller should manage browser pages)
          try {
            this.background_pages.push(this.page);
            this.page = this.browser.newPage();
            this.page.route("**/*", this.interceptRequest.bind(this));
            await this.page.goto("https://www.emailnator.com/");
          } catch (e) {
            // ignore if no browser available in this environment
          }
          return;
        }

        // otherwise just forward original response
        return route.fulfill({ response: fetchedResponse }).catch(() => {});
      }

      // Emailnator page handling: capture its cookies/headers
      if (url === "https://www.emailnator.com/") {
        const cookies = this.parseCookies(request.headers()["cookie"]);
        if (
          !this.emailnator_cookies &&
          fetchedResponse &&
          (await fetchedResponse.text()).includes(
            "Temporary Disposable Gmail"
          ) &&
          cookies["XSRF-TOKEN"]
        ) {
          this.emailnator_headers = request.headers();
          this.emailnator_cookies = cookies;
          await route.fulfill({ body: ":)" }).catch(() => {});

          if (!this.account_creator_running) {
            this.account_creator_running = true;
            // spawn background creator (no await)
            this.accountCreator();
          }

          // if account creator later sets newAccountLink, attempt to navigate
          try {
            while (!this.newAccountLink) {
              await new Promise((r) => setTimeout(r, 1000));
            }
            await this.page.goto(this.newAccountLink).catch(() => {});
            await this.page.goto("https://www.perplexity.ai/").catch(() => {});
            this.newAccountLink = null;
          } catch (e) {}

          return;
        }

        return route.fulfill({ response: fetchedResponse }).catch(() => {});
      }

      // rate-limit probe handling (simple heuristic)
      if (url.includes("/rest/rate-limit")) {
        // continue the request and inspect response if possible
        await route.continue().catch(() => {});
        try {
          const res = await request.response();
          const json = res ? await res.json() : null;
          const remaining = json ? json["remaining"] : undefined;
          if (!this.creating_new_account && remaining === 0) {
            this.creating_new_account = true;
            try {
              this.page = this.browser.newPage();
              this.page.route("**/*", this.interceptRequest.bind(this));
              while (!this.newAccountLink) {
                await new Promise((r) => setTimeout(r, 1000));
              }
              await this.page.goto(this.newAccountLink).catch(() => {});
              await this.page
                .goto("https://www.perplexity.ai/")
                .catch(() => {});
              this.newAccountLink = null;
            } catch (e) {}
          }
        } catch (e) {}
        return;
      }

      // default: continue request
      return route.continue().catch(() => {});
    } catch (e) {
      // swallow handler errors to avoid breaking the browser routing
      // eslint-disable-next-line no-console
      console.warn("interceptRequest handler error:", e);
      try {
        await route.continue();
      } catch (e) {}
    }
  }

  // run launches Playwright (or Patchright) if available and starts intercepting
  async run(chrome_data_dir?: string, port?: number) {
    // Try to load Playwright or Patchright; provide clear guidance if missing
    let playwright: any = null;
    let usingPatchright = false;
    try {
      // prefer patchright when not connecting to an existing CDP port
      if (port) {
        // @ts-ignore: optional dependency
        // playwright = await import("playwright");
      } else {
        try {
          // @ts-ignore: optional dependency
          const pr = await import("patchright");
          playwright = pr;
          usingPatchright = true;
        } catch (_) {
          // @ts-ignore: optional dependency
          playwright = await import("playwright");
        }
      }
    } catch (e) {
      throw new Error(
        "Playwright or Patchright is not installed. Install patchright (preferred) or playwright and provide a Chrome user data dir."
      );
    }

    // minimal launch/connect logic
    try {
      // log which implementation we're using
      // eslint-disable-next-line no-console
      console.log(
        `Driver starting using ${
          usingPatchright ? "patchright" : "playwright"
        } (port: ${port ?? "none"})`
      );

      if (port) {
        // connect to existing chrome over CDP
        this.browser = await (playwright as any).chromium.connectOverCDP({
          endpointURL: `http://localhost:${port}`,
        });
        this.page =
          this.browser.contexts && this.browser.contexts[0]
            ? this.browser.contexts[0].newPage()
            : this.browser.newPage();
      } else {
        const impl = (playwright as any).chromium;
        if (chrome_data_dir) {
          // launch persistent context using provided user data dir (recommended)
          this.browser = await impl.launchPersistentContext(chrome_data_dir, {
            channel: "chrome",
            headless: false,
          });
          this.page = this.browser.pages
            ? this.browser.pages()[0] || this.browser.newPage()
            : this.browser.newPage();
        } else {
          // no user-data-dir provided: launch a transient browser and context
          const browser = await impl.launch({ headless: false });
          const context = await browser.newContext();
          this.browser = browser;
          this.page = await context.newPage();
        }
      }

      this.background_pages.push(this.page);
      // wire up route handler (best-effort)
      try {
        this.page.route("**/*", this.interceptRequest.bind(this));
      } catch (e) {
        // if routing not supported in this environment, ignore
      }

      await this.page.goto("https://www.perplexity.ai/");

      // keep process alive and let Playwright drive the flow
      // simple loop to mimic Python run's wait
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // if page.context().waitForTimeout exists, use it, otherwise sleep
          if (
            this.page &&
            typeof this.page.context === "function" &&
            this.page.context().waitForTimeout
          ) {
            this.page.context().waitForTimeout(1000);
          } else {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch (e) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } catch (e) {
      throw new Error("Failed to start browser: " + String(e));
    }
  }

  /**
   * Launch a headful Patchright/Playwright browser and wait for Perplexity cookies to appear.
   * This is an interactive fallback: the user may need to complete Cloudflare/challenge steps.
   * Returns a cookie map on success, or null on timeout/error.
   */
  async performInteractiveSignin(
    opts: { chromeDataDir?: string; timeoutSec?: number } = {}
  ) {
    const timeout = (opts.timeoutSec ?? 180) * 1000;
    let playwright: any = null;
    try {
      // try patchright first
      // @ts-ignore
      playwright = await import("patchright").catch(() => null);
    } catch (e) {
      // ignore
    }
    if (!playwright) {
      console.warn(
        "performInteractiveSignin: neither patchright nor playwright is available"
      );
      return null;
    }

    const impl = (playwright as any).chromium;
    try {
      const context = opts.chromeDataDir
        ? await impl.launchPersistentContext(opts.chromeDataDir, {
            channel: "chrome",
            headless: false,
          })
        : await (async () => {
            const b = await impl.launch({ headless: false });
            return await b.newContext();
          })();

      const page = await context.newPage();
      await page.goto("https://www.perplexity.ai/");

      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        // try to get cookies from the context
        try {
          const cookies = await context.cookies();
          const map: Record<string, string> = {};
          for (const c of cookies) map[c.name] = c.value;
          if (map["next-auth.csrf-token"]) {
            // success
            return map;
          }
        } catch (e) {
          // ignore
        }
        // wait a bit
        await new Promise((r) => setTimeout(r, 1000));
      }

      try {
        await context.close();
      } catch (e) {}
    } catch (e) {
      console.warn("performInteractiveSignin failed:", e);
    }
    return null;
  }
}

export default Driver;
