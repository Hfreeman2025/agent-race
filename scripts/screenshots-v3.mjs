import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { silentBrowser } from "./silent.mjs";

const require = createRequire("<local path>");
const pw = require("playwright");
const base = process.env.RACE_PREVIEW_URL ?? "http://127.0.0.1:4317";
const pass = process.env.RACE_SHOT_PASS ?? "pass2";
const out = `${process.env.RACE_SHOT_ROOT ?? "shots/v3"}/${pass}`;
await mkdir(out, { recursive: true });
const report = {
  pass,
  checks: [],
  failures: [],
  console: [],
  expectedNetworkFailures: [],
  metrics: {},
  states: [],
};
const original = await readFile("public/recordings/demo.json", "utf8");
const recording = JSON.parse(original);
const check = (name, good) => (good ? report.checks : report.failures).push(name);
const png = async (page, name, engine, size) => {
  await page.screenshot({ path: `${out}/${engine}-${size}-${name}.png` });
  report.states.push(`${engine}-${size}-${name}`);
};
for (const engine of (process.env.RACE_BROWSERS ?? "chromium,webkit,firefox").split(",")) {
  const browser = await silentBrowser(pw, engine);
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      let expectedOffline = false;
      const hosts = new Set();
      page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
      page.on("pageerror", (e) => report.console.push(`${engine}/${size}: ${e.message}`));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type()))
          (expectedOffline && /503/u.test(m.text())
            ? report.expectedNetworkFailures
            : report.console
          ).push(`${engine}/${size}: ${m.text()}`);
      });
      const c = (name, good) => check(`${engine}/${size}: ${name}`, good);
      await page.goto(base);
      await page.waitForSelector('[data-line][aria-pressed="true"]');
      await page.evaluate(() => document.fonts.ready);
      await png(page, "opener", engine, size);
      c(
        "live inferred chain opens from immutable recording",
        (await page.locator("#trace-summary").textContent()) ===
          "2 observed calls connected by 1 inferred link. The shared text is below.",
      );
      c(
        "both graph lanes on the first screen",
        await page
          .locator(".trace-lane.codex")
          .evaluate((el) => el.getBoundingClientRect().bottom < innerHeight),
      );
      c(
        "selected line visible on first screen",
        await page
          .locator("#trace-criterion")
          .evaluate((el) => el.getBoundingClientRect().bottom < innerHeight),
      );
      c("17 observed nodes", (await page.locator("[data-node]").count()) === 17);
      c("16 inferred edges", (await page.locator("[data-edge]").count()) === 16);
      c(
        "no page horizontal overflow",
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      );
      c(
        "selected edit in phone graph viewport",
        await page.locator('[data-node="codex-4"]').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth;
        }),
      );
      report.metrics[`${engine}/${size}`] = await page.evaluate(() => ({
        meaningfulPaintMs: performance.getEntriesByName("flight-meaningful-paint")[0]?.startTime,
        computeAndMountMs: performance.getEntriesByName("trace-compute-and-mount")[0]?.duration,
      }));
      await page.getByRole("button", { name: "Show all connections", exact: true }).click();
      await png(page, "all-connections", engine, size);
      await page.locator('[data-node="claude-9"]').click();
      c(
        "claim links back through verify and source",
        (await page.locator("[data-edge].lit").count()) >= 3,
      );
      await page.locator("#flow-evidence").scrollIntoViewIfNeeded();
      await png(page, "claim-chain", engine, size);
      c(
        "claim mapping explicitly inferred",
        (await page.locator("#flow-evidence").textContent()).includes("mapping inferred"),
      );
      await page.locator('[data-agent="claude"]').click();
      await page.locator('[data-line][aria-pressed="true"]').scrollIntoViewIfNeeded();
      await png(page, "claude-patch", engine, size);
      c(
        "Claude patch recovered",
        (await page.locator("#final-lines").textContent()).includes("entries.set"),
      );
      await page.locator('[data-agent="codex"]').click();
      await page.locator("[data-line]").filter({ hasText: "return pending;" }).click();
      c(
        "new identifier does not acquire fake ancestry",
        (await page.locator("[data-edge].lit").count()) === 0,
      );
      await png(page, "unlinked-line", engine, size);
      await page.locator("#trace-file").selectOption("regression.test.mjs");
      await png(page, "long-regression", engine, size);
      c(
        "every final changed line interactive",
        (await page.locator("#final-lines button").count()) === 57,
      );
      await page.locator('[data-node="claude-1"]').click();
      await page.locator(".trace-raw summary").click();
      await page.locator("#flow-evidence").scrollIntoViewIfNeeded();
      await png(page, "failed-original-output", engine, size);
      c(
        "original failure still visible despite shell zero",
        (await page.locator(".trace-raw").textContent()).includes("fail 1"),
      );
      await page.locator("#trace-file").selectOption("src.mjs");
      await page.locator('[data-edge="codex-2>codex-4"]').focus();
      await page.keyboard.press("Enter");
      c(
        "edges keyboard inspectable",
        (await page.locator("#trace-headline").textContent()).includes("Codex"),
      );
      c("proof controls exist", (await page.locator("#proof-tamper").count()) === 1);
      await page.waitForSelector('#proof-state[data-state="verified"]');
      await page.locator("#proof-state").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await png(page, "signature-valid", engine, size);
      c(
        "retrospective provenance exact",
        (await page.locator("#proof-body").textContent()).includes(
          "signed at import from the recorded ledger",
        ),
      );
      await page.locator("#proof-tamper").click();
      await page.waitForSelector('#proof-state[data-state="invalid"]');
      await png(page, "one-byte-tamper", engine, size);
      c(
        "tamper really flips a byte",
        (await page.locator("#proof-byte").textContent()).includes("→"),
      );
      await page.locator("#proof-restore").click();
      await page.waitForSelector('#proof-state[data-state="verified"]');
      await png(page, "signature-restored", engine, size);
      await page.locator('[data-node="claude-9"]').click();
      await page.locator("#trace-graph").scrollIntoViewIfNeeded();
      const frame = await page.evaluate(async () => {
        const frames = [];
        let last = performance.now();
        for (let i = 0; i < 90; i++)
          await new Promise((resolve) =>
            requestAnimationFrame((now) => {
              frames.push(now - last);
              last = now;
              resolve();
            }),
          );
        return frames.sort((a, b) => a - b);
      });
      report.metrics[`${engine}/${size}`].frameP95Ms = frame[Math.floor(frame.length * 0.95)];
      report.metrics[`${engine}/${size}`].frameMaxMs = Math.max(...frame);
      c(
        "only loopback network requests",
        [...hosts].every((h) => h === "127.0.0.1"),
      );
      // Replay and archive remain accessible, with the fair race as the replay default.
      await page.locator("#replay-view").click();
      await page.locator("#finish").click();
      await page.evaluate(() => scrollTo(0, 0));
      await png(page, "fair-replay-finish", engine, size);
      c(
        "both agents verified in preserved replay",
        (await page.locator("#gap").textContent()) === "+36.327s",
      );
      await page.locator("#flight-view").click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await png(page, "reduced-motion", engine, size);
      c(
        "reduced motion stops edge animation",
        await page
          .locator("[data-edge].lit")
          .first()
          .evaluate((el) => getComputedStyle(el).animationName === "none"),
      );
      await page.setViewportSize({ width: 320, height: 844 });
      await png(page, "narrow-320", engine, size);
      c(
        "320px has no page overflow",
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      );
      await page.setViewportSize({ width, height });
      // Slow/offline/invalid/empty are test-only intercepted archives, never shipped data.
      await page.route("**/recordings/demo.json", async (route) => {
        await new Promise((r) => setTimeout(r, 1750));
        await route.fulfill({ status: 200, contentType: "application/json", body: original });
      });
      const nav = page.goto(base);
      await page.waitForSelector("#flight-status");
      await page.waitForTimeout(1550);
      await png(page, "slow-archive", engine, size);
      await nav;
      await page.waitForSelector("[data-node]");
      await page.unroute("**/recordings/demo.json");
      expectedOffline = true;
      await page.route("**/recordings/demo.json", (route) =>
        route.fulfill({ status: 503, body: "offline" }),
      );
      await page.goto(base);
      await page.waitForSelector("#flight-retry");
      await png(page, "offline", engine, size);
      c("offline state invents no graph", (await page.locator("[data-node]").count()) === 0);
      await page.unroute("**/recordings/demo.json");
      expectedOffline = false;
      await page.locator("#flight-retry").click();
      await page.waitForSelector("[data-node]");
      c("offline retry recovers", (await page.locator("[data-node]").count()) === 17);
      await page.route("**/recordings/demo.json", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: '{"invalid":true}' }),
      );
      await page.goto(base);
      await page.waitForSelector("#flight-retry");
      await png(page, "invalid-archive", engine, size);
      await page.unroute("**/recordings/demo.json");
      await page.route("**/recordings/demo.json", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...recording, events: [] }),
        }),
      );
      await page.goto(base);
      await page.waitForSelector("#trace-graph");
      await png(page, "empty-recording", engine, size);
      c("empty recording has no fake node", (await page.locator("[data-node]").count()) === 0);
      await page.unroute("**/recordings/demo.json");
      await page.close();
    }
  } finally {
    await browser.close();
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  }
}
console.log(
  JSON.stringify(
    {
      checks: report.checks.length,
      failures: report.failures,
      console: report.console,
      metrics: report.metrics,
      states: report.states.length,
    },
    null,
    2,
  ),
);
assert.equal(report.failures.length, 0);
assert.equal(report.console.length, 0);
