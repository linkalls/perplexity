import Driver from "./driver";

async function main() {
  const driver = new Driver();
  // change this to a path on your machine. Using a Chrome user-data-dir preserves cookies and settings.


  try {
    await driver.run(
      
    );
  } catch (e) {
    console.error("driver.run failed:", e);
    process.exit(1);
  }
}

main();
