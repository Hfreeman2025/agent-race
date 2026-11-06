import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as pw from "playwright";
import { silentBrowser } from "./silent.mjs";

const root = ".cache/browser/v3/fallbacks";
await mkdir(root, { recursive: true });
const report = { checks: [], failures: [], console: [], versions: {} };
const check = (name, good) => (good ? report.checks : report.failures).push(name);
for (const engine of ["chromium", "webkit", "firefox"]) {
  const browser = await silentBrowser(pw, engine);
  report.versions[engine] = browser.version();
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => report.console.push(e.message));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type())) report.console.push(m.text());
      });
      const c = (n, v) => check(`${engine}/${size}: ${n}`, v);
      const shot = async (n) => {
        await page.locator("#proof-state").evaluate((e) => e.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: `${root}/${engine}-${size}-${n}.png` });
      };
      await page.route("**/attestations/codex-5.dsse.json", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
      );
      await page.goto("http://127.0.0.1:4317");
      await page.waitForSelector("#proof-retry");
      await shot("invalid-envelope");
      c(
        "invalid envelope has no substituted verified state",
        (await page.locator("#proof-state").getAttribute("data-state")) === "unavailable",
      );
      await page.unroute("**/attestations/codex-5.dsse.json");
      await page.locator("#proof-retry").click();
      await page.waitForSelector('#proof-state[data-state="verified"]');
      c("proof retry recovers", true);
      await page.locator('[data-proof-command="claude-8"]').click();
      await page.waitForSelector('#proof-state[data-state="verified"]');
      await shot("claude-signature");
      c(
        "second real CLI signature verifies",
        (await page.locator("#proof-facts").textContent()).includes("verify_exit"),
      );
      await page.locator("#recording-choice").selectOption("attempt-2");
      await page.waitForSelector('#proof-state[data-state="unavailable"]');
      await shot("earlier-failed-attempt");
      c("earlier attempt trace is usable", (await page.locator("[data-node]").count()) > 0);
      c(
        "earlier attempt never gets borrowed signature",
        (await page.locator("#proof-state").textContent()).includes("No signed import"),
      );
      await page.locator("#recording-choice").selectOption("attempt-1");
      await page.waitForSelector('#proof-state[data-state="unavailable"]');
      await shot("startup-failure-trace");
      c(
        "first startup failure recording selectable",
        (await page.locator("#race-title").textContent()) === "Lost in translation",
      );
      await page.locator("#recording-choice").selectOption("demo");
      await page.waitForSelector('#proof-state[data-state="verified"]');
      c(
        "fair recording remains default option",
        (await page.locator("#recording-choice").inputValue()) === "demo",
      );
      await page.addInitScript(() =>
        Object.defineProperty(window, "crypto", { value: undefined, configurable: true }),
      );
      await page.reload();
      await page.waitForSelector('#proof-state[data-state="unavailable"]');
      await shot("no-webcrypto");
      c("no WebCrypto leaves graph working", (await page.locator("[data-node]").count()) === 17);
      c(
        "unsupported verification explicitly unavailable",
        (await page.locator("#proof-state").textContent()).includes("WebCrypto is unavailable"),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
assert.equal(report.failures.length, 0);
assert.equal(report.console.length, 0);
