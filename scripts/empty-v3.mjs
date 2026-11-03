import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { silentBrowser } from "./silent.mjs";

const require = createRequire("<local path>");
const pw = require("playwright");
const recording = JSON.parse(await readFile("public/recordings/demo.json", "utf8"));
const out = "shots/v3/empty-final";
await mkdir(out, { recursive: true });
const checks = [];
for (const engine of ["chromium", "webkit", "firefox"]) {
  const browser = await silentBrowser(pw, engine);
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route("**/recordings/demo.json", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...recording, events: [] }),
        }),
      );
      await page.goto("http://127.0.0.1:4317");
      await page.waitForSelector("#trace-graph");
      assert.equal(await page.locator("[data-node]").count(), 0);
      assert.ok((await page.locator("#trace-origin").textContent()).includes("0 OBSERVED NODES"));
      assert.ok((await page.locator("#trace-summary").textContent()).includes("No tool calls"));
      assert.ok(await page.locator("#trace-file").isDisabled());
      await page.screenshot({ path: `${out}/${engine}-${size}-empty.png` });
      await page.unroute("**/recordings/demo.json");
      await page.goto("http://127.0.0.1:4317?recording=attempt-1");
      await page.waitForSelector('[data-node][aria-pressed="true"]');
      assert.equal(await page.locator("#trace-nodes .selected").count(), 1);
      assert.ok(
        await page
          .locator("[data-tick]")
          .evaluateAll((elements) =>
            elements.every(
              (el) => parseFloat(el.style.left) >= 0 && parseFloat(el.style.left) <= 95.5,
            ),
          ),
      );
      const extent = await page.locator("#trace-graph").evaluate((el) => ({
        client: el.clientWidth,
        scroll: el.scrollWidth,
        items: [...el.querySelectorAll("[data-node], [data-tick]")].map((e) => ({
          id: e.getAttribute("data-node") ?? e.textContent,
          left: e.getBoundingClientRect().left - el.getBoundingClientRect().left,
          right: e.getBoundingClientRect().right - el.getBoundingClientRect().left,
          width: e.getBoundingClientRect().width,
        })),
      }));
      assert.ok(extent.scroll <= extent.client + 1, `${engine}/${size}: ${JSON.stringify(extent)}`);
      await page.screenshot({ path: `${out}/${engine}-${size}-startup.png` });
      checks.push(
        `${engine}/${size}: no invented empty node; disabled file control; startup has real selected event`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${out}/report.json`, JSON.stringify({ checks }, null, 2));
console.log("PASS empty/startup states at both sizes in all three engines.");
