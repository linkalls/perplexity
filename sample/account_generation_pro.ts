import { PerplexityClient } from "../src/perplexity";
import { parseCookieEnv } from "../src/search_helpers";

async function useProQueriesForClient(
  cli: PerplexityClient,
  queriesPerAccount = 5
): Promise<number> {
  let successCount = 0;
  for (let i = 0; i < queriesPerAccount; i++) {
    const q = `デモ検索 (account) 回数 ${i + 1}`;
    try {
      console.log(`Running pro query #${i + 1} for this account:`, q);
      const res = await cli.search(q, "pro", null, ["web"], {}, "ja-JP");
      console.log(" -> display_model:", res.display_model ?? "(none)");
      successCount++;
    } catch (e: any) {
      console.error(
        "Search error (may be out of pro quota or network):",
        e?.message ?? e
      );
      break;
    }
  }
  return successCount;
}

async function main() {
  const emailnatorCookies = parseCookieEnv(process.env.EMAILNATOR_COOKIE);
  // Do NOT use user's personal Perplexity cookies here — create a fresh, empty client
  // so the script will create and sign into newly generated accounts.
  const maxAccounts = Number(process.env.MAX_ACCOUNTS || "2");
  const queriesPerAccount = Number(process.env.QUERIES_PER_ACCOUNT || "5");

  if (
    !process.env.EMAILNATOR_COOKIE ||
    Object.keys(emailnatorCookies).length === 0
  ) {
    console.error(
      "EMAILNATOR_COOKIE is not set or could not be parsed. Please set it in your .env or environment."
    );
    process.exit(1);
  }

  let accountsCreated = 0;
  let totalQueries = 0;

  while (accountsCreated < maxAccounts) {
    console.log("\n=== Creating new account (emailnator) ===");
    // initialize client without the user's cookies so we don't reuse personal auth
    const cli = new PerplexityClient({});

    // try createAccount with a few retries because email delivery can be flaky
    let created = false;
    const maxCreateRetries = 3;
    for (let attempt = 1; attempt <= maxCreateRetries; attempt++) {
      try {
        console.log(`createAccount attempt ${attempt}...`);
        const ok = await cli.createAccount(emailnatorCookies);
        if (ok) {
          created = true;
          break;
        }
      } catch (e) {
        console.error(
          `createAccount attempt ${attempt} failed:`,
          e?.message ?? e
        );
      }
      // wait before retry
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }

    if (!created) {
      console.error(
        "Failed to create account after retries; moving to next (if any)."
      );
      // small pause between attempts
      await new Promise((r) => setTimeout(r, 1000));
      accountsCreated++;
      continue;
    }

    accountsCreated++;
    console.log(
      `Account #${accountsCreated} created. Starting ${queriesPerAccount} pro queries.`
    );

    const successCount = await useProQueriesForClient(cli, queriesPerAccount);
    if (successCount < queriesPerAccount) {
      console.log(
        "Stopped early for this account (likely quota exhausted or error)."
      );
    }

    totalQueries += successCount;
    console.log(
      `Completed account #${accountsCreated}. Total successful queries so far: ${totalQueries}`
    );

    // small pause between accounts
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    "\nAll done. Accounts created:",
    accountsCreated,
    "Total queries attempted:",
    totalQueries
  );
}

main().catch((e) => {
  console.error("Fatal error in script:", e);
});
