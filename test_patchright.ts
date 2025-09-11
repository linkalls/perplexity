#!/usr/bin/env bun
import Driver from "./src/driver";

async function testPatchright() {
  console.log("🧪 Testing Patchright integration...");

  // Set a timeout for the entire test
  const testTimeout = setTimeout(() => {
    console.error("⏰ Test timed out after 30 seconds");
    process.exit(1);
  }, 30000);

  try {
    console.log("🔧 Creating Driver instance...");
    const driver = new Driver();
    console.log("✅ Driver created successfully");

    console.log("🚀 Initializing browser...");
    await driver.initBrowser();
    console.log("✅ Browser initialized successfully");

    console.log("🌐 Navigating to Perplexity homepage...");
    await driver.page.goto("https://www.perplexity.ai", { timeout: 10000 });
    console.log("✅ Navigated to Perplexity homepage");

    console.log("📄 Getting page title...");
    const title = await driver.page.title();
    console.log("📊 Page title:", title);

    console.log("🔒 Closing browser...");
    await driver.closeBrowser();
    console.log("✅ Browser closed successfully");

    clearTimeout(testTimeout);
    console.log("🎉 Patchright test completed successfully!");
  } catch (e) {
    clearTimeout(testTimeout);
    console.error("💥 Patchright test failed:");
    console.error("Error type:", typeof e);
    console.error("Error message:", String(e));
    if (e instanceof Error) {
      console.error("Stack trace:", e.stack);
    }
    console.error("Full error object:", e);
  }
}

if (import.meta.main) {
  testPatchright();
}
