import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as pw from "playwright";
import { silentBrowser } from "./silent.mjs";

await mkdir(".cache/browser/v3", { recursive: true });
const report = [];
for (const engine of ["chromium", "webkit", "firefox"]) {
  const browser = await silentBrowser(pw, engine);
  try {
    const page = await browser.newPage();
    const messages = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) messages.push(m.text());
    });
    await page.goto("http://127.0.0.1:4317");
    await page.waitForSelector("[data-node]");
    await page.screenshot({ path: `.cache/browser/v3/csp-${engine}.png` });
    const productionMessages = [...messages];
    assert.deepEqual(
      productionMessages,
      [],
      `${engine}: valid replay, including screenshot synchronisation, must be quiet`,
    );
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    assert.ok(
      policy.includes("script-src 'self'") &&
        !policy.includes("'unsafe-inline'") &&
        !policy.includes("'unsafe-eval'"),
    );
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__raceInlineProbe = true";
      document.head.append(script);
      const style = document.createElement("style");
      style.textContent = "html { --race-inline-probe: unsafe; }";
      document.head.append(style);
    });
    await page.waitForTimeout(100);
    const blocked = await page.evaluate(() => ({
      script: window.__raceInlineProbe !== true,
      style:
        getComputedStyle(document.documentElement)
          .getPropertyValue("--race-inline-probe")
          .trim() !== "unsafe",
    }));
    assert.equal(blocked.script, true, `${engine}: arbitrary inline script blocked`);
    assert.equal(blocked.style, true, `${engine}: arbitrary inline CSS blocked`);
    report.push({
      engine,
      version: browser.version(),
      productionMessages,
      blocked,
      expectedNegativeProbeMessages: messages.slice(productionMessages.length),
    });
  } finally {
    await browser.close();
  }
}
await writeFile(".cache/browser/v3/csp-check.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(
  "PASS: all three engines quiet in production; arbitrary inline scripts and CSS blocked.",
);
