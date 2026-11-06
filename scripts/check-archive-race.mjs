import assert from "node:assert/strict";
import * as pw from "playwright";
import { archiveRace } from "./archive-race.mjs";
import { silentBrowser } from "./silent.mjs";

const browser = await silentBrowser(pw, "chromium");
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4317?view=replay");
  await page.waitForSelector("#scrubber:enabled");
  assert.equal(
    await archiveRace(page),
    true,
    "A late archive response must not overwrite the newly opened guide",
  );
  console.log("PASS: late archive responses cannot replace a newer dialog.");
} finally {
  await browser.close();
}
