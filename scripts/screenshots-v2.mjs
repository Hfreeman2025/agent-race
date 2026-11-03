import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { archiveRace } from "./archive-race.mjs";
import { silentBrowser } from "./silent.mjs";

const require = createRequire("<local path>");
const playwright = require("playwright");
const base = process.env.RACE_PREVIEW_URL ?? "http://127.0.0.1:4317?view=replay";
const pass = process.env.RACE_SHOT_PASS ?? "latest";
const engines = (process.env.RACE_BROWSERS ?? "chromium").split(",");
const original = await readFile("public/recordings/demo.json", "utf8");
const recording = JSON.parse(original);
const out = `${process.env.RACE_SHOT_ROOT ?? "shots/v2"}/${pass}`;
await mkdir(out, { recursive: true });
const report = { pass, checks: [], failures: [], console: [], metrics: {}, states: [] };
const check = (name, value) => {
  (value ? report.checks : report.failures).push(name);
};
const png = async (page, name, engine, size) => {
  await page.screenshot({ path: `${out}/${engine}-${size}-${name}.png` });
  report.states.push(`${engine}-${size}-${name}`);
};
const seek = async (page, at) => {
  await page.locator("#scrubber").evaluate((el, n) => {
    el.value = String(n);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, at);
};
for (const engine of engines) {
  const browser = await silentBrowser(playwright, engine);
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => report.console.push(`${engine}/${size}: ${e.message}`));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type()))
          report.console.push(`${engine}/${size}: ${m.text()}`);
      });
      const hosts = new Set();
      page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
      await page.goto(base);
      await page.waitForSelector("#scrubber:enabled");
      await page.waitForTimeout(900);
      check(
        `${engine}/${size}: real replay advances automatically after loading`,
        (await page.locator("#clock").textContent()) !== "0:00.0",
      );
      check(
        `${engine}/${size}: both race lanes on first screen`,
        await page
          .locator('[aria-label="Codex race lane"]')
          .evaluate((e) => e.getBoundingClientRect().bottom < innerHeight),
      );
      await png(page, "playing", engine, size);
      await page.getByRole("button", { name: "Pause replay", exact: true }).click();
      await png(page, "paused", engine, size);
      report.metrics[`${engine}/${size}`] = await page.evaluate(() => ({
        firstContentfulPaintMs:
          performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        firstMeaningfulPaintMs:
          performance.getEntriesByName("race-meaningful-paint")[0]?.startTime ?? null,
      }));
      check(
        `${engine}/${size}: commentary is visible on first screen`,
        await page
          .locator("#call-source")
          .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight),
      );
      const initialY = await page.locator(".booth").evaluate((e) => e.getBoundingClientRect().top);
      await seek(page, 0);
      await png(page, "starting-line", engine, size);
      await page.getByRole("button", { name: "Claims", exact: true }).click();
      await png(page, "empty-filter", engine, size);
      await page.getByRole("button", { name: "All", exact: true }).click();
      await seek(page, 16159);
      // Same timestamp edit follows the failed command; inspect that command directly.
      await page.locator('#ledger [data-event="claude-1"]').click();
      await png(page, "failed-inner-command", engine, size);
      check(
        `${engine}/${size}: failed test output stays visible despite shell exit zero`,
        (await page.locator("#inspector-body").textContent()).includes("does not erase") ||
          (await page.locator("#inspector-body").textContent()).includes("fail 1"),
      );
      await page.keyboard.press("Escape");
      check(
        `${engine}/${size}: Escape closes inline evidence`,
        await page.locator("#inspector").isHidden(),
      );
      await seek(page, 41465);
      check(`${engine}/${size}: no premature finish`, await page.locator("#photo").isHidden());
      await seek(page, 41466);
      await page.evaluate(() => scrollTo(0, 0));
      await png(page, "first-finish", engine, size);
      check(
        `${engine}/${size}: photo finish appears at independent verification`,
        await page.locator("#photo").isVisible(),
      );
      check(
        `${engine}/${size}: pending lane not declared accepted`,
        (await page.locator("#lane-status-codex").textContent()) !== "VERIFIED FIX",
      );
      const finishedY = await page.locator(".booth").evaluate((e) => e.getBoundingClientRect().top);
      check(
        `${engine}/${size}: finish does not shift the engine`,
        Math.abs(initialY - finishedY) < 1,
      );
      await seek(page, recording.duration);
      await page.evaluate(() => scrollTo(0, 0));
      await png(page, "final", engine, size);
      check(
        `${engine}/${size}: real independent finish gap`,
        (await page.locator("#gap").textContent()) === "+36.327s",
      );
      check(
        `${engine}/${size}: every real event remains inspectable`,
        (await page.locator("#ledger .event").count()) === recording.events.length,
      );
      await page.locator('#ledger [data-event="codex-4"]').click();
      await png(page, "inline-diff", engine, size);
      check(
        `${engine}/${size}: inline evidence opens inside viewport`,
        await page.locator("#inspector").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      );
      check(
        `${engine}/${size}: per-file inline diff, no modal`,
        (await page.locator("#inspector .diff .added").count()) > 0 &&
          (await page.locator("dialog[open]").count()) === 0 &&
          !(await page.locator("#inspector-body").textContent()).includes(
            "Index: regression.test.mjs",
          ),
      );
      check(
        `${engine}/${size}: Close evidence is not covered by playback controls`,
        await page.locator("#inspector-close").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") ===
            e
          );
        }),
      );
      const beforeEvidenceKey = await page.locator("#clock").textContent();
      await page.locator("#inspector-body").focus();
      await page.keyboard.press("ArrowRight");
      check(
        `${engine}/${size}: arrow keys inside evidence do not seek the race`,
        (await page.locator("#clock").textContent()) === beforeEvidenceKey,
      );
      await page.keyboard.press("Escape");
      check(
        `${engine}/${size}: evidence returns focus`,
        await page.evaluate(() => document.activeElement?.getAttribute("data-event") === "codex-4"),
      );
      await page.locator('#ledger [data-event="claude-9"]').click();
      await png(page, "claim", engine, size);
      check(
        `${engine}/${size}: real receipt ID retained`,
        (await page.locator("#inspector-body").textContent()).includes(
          "7988d3d9-dc41-42ea-9b42-2a231f5c450f",
        ),
      );
      await page.locator("#inspector-body").evaluate((e) => (e.scrollTop = e.scrollHeight));
      await png(page, "long-message-end", engine, size);
      await page.keyboard.press("Escape");
      await page.locator('#ledger [data-event="codex-7"]').click();
      await png(page, "unmatched-wording", engine, size);
      check(
        `${engine}/${size}: each new inspection starts at the top`,
        await page.locator("#inspector-body").evaluate((e) => e.scrollTop === 0),
      );
      check(
        `${engine}/${size}: no invented Codex claim verdict`,
        await page.locator(".unmatched").isVisible(),
      );
      await page.keyboard.press("Escape");
      check(
        `${engine}/${size}: a late archive cannot overwrite another dialog`,
        await archiveRace(page, () => png(page, "archive-loading", engine, size)),
      );
      for (const [button, name] of [
        ["How to watch", "guide"],
        ["Read brief", "brief"],
        ["Recording & privacy", "provenance"],
        ["Earlier attempts", "archive"],
      ]) {
        await page.getByRole("button", { name: button, exact: true }).click();
        if (name === "archive") await page.locator(".archive-list").waitFor();
        await png(page, name, engine, size);
        if (name === "archive")
          check(
            `${engine}/${size}: failures stay disclosed`,
            (await page.locator("#dialog-body").textContent()).includes("Incomplete comparison") &&
              (await page.locator('dialog a[href="/rejected-attempts.txt"]').count()) === 1,
          );
        await page.keyboard.press("Escape");
      }
      await page.route("**/race-history.json", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: '{"unavailable":true}' }),
      );
      await page.getByRole("button", { name: "Earlier attempts", exact: true }).click();
      await page.getByRole("heading", { name: "The archive is unavailable." }).waitFor();
      await png(page, "archive-error", engine, size);
      await page.keyboard.press("Escape");
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator("#scrubber").focus();
      await page.keyboard.press("Home");
      check(
        `${engine}/${size}: native timeline Home`,
        (await page.locator("#clock").textContent()) === "0:00.0",
      );
      await page.keyboard.press("End");
      await png(page, "keyboard-focus", engine, size);
      check(
        `${engine}/${size}: keyboard focus visible`,
        await page
          .locator("#scrubber")
          .evaluate((e) => getComputedStyle(e).outlineStyle !== "none"),
      );
      for (const w of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width: w, height });
        check(
          `${engine}/${size}: no overflow ${w}px`,
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        );
      }
      await page.setViewportSize({ width, height });
      check(
        `${engine}/${size}: local-only viewer traffic`,
        [...hosts].every((h) => h === "127.0.0.1"),
      );
      // Measure frame intervals across the whole accelerated race, including both verified finish boundaries.
      if (size === "desktop") {
        await page.evaluate(() => performance.clearMeasures("race-render"));
        await seek(page, 0);
        await page.getByRole("button", { name: "Play replay", exact: true }).click();
        report.metrics[`${engine}/frames`] = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const intervals = [];
              let previous = performance.now();
              const start = previous;
              let maximum = 0;
              function sample(now) {
                if (now - start > 12000) {
                  intervals.sort((a, b) => a - b);
                  resolve({
                    sampleCount: intervals.length,
                    framesOver33Ms: intervals.filter((n) => n > 33).length,
                    framesOver50Ms: intervals.filter((n) => n > 50).length,
                    medianMs: intervals[Math.floor(intervals.length * 0.5)],
                    p95Ms: intervals[Math.floor(intervals.length * 0.95)],
                    maximumMs: maximum,
                    windowMs: now - start,
                    renderSamples: performance.getEntriesByName("race-render").length,
                    maximumRenderMs: Math.max(
                      ...performance.getEntriesByName("race-render").map((e) => e.duration),
                    ),
                  });
                  return;
                }
                if (now > previous) {
                  const delta = now - previous;
                  intervals.push(delta);
                  maximum = Math.max(maximum, delta);
                }
                previous = now;
                requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
            }),
        );
        check(
          `${engine}: automatic replay reaches the finish`,
          (await page.locator("#clock").textContent()) === "1:17.8",
        );
      }
      await page.close();
      // Boundary states are intercepted only in Playwright, never bundled as invented recordings.
      for (const mode of ["loading", "slow", "offline", "invalid", "empty", "reduced"]) {
        const state = await browser.newPage({
          viewport: { width, height },
          reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
        });
        if (["loading", "slow"].includes(mode))
          await state.route(
            "**/recordings/demo.json",
            (r) =>
              new Promise((resolve) =>
                setTimeout(
                  () =>
                    resolve(
                      r.fulfill({ status: 200, contentType: "application/json", body: original }),
                    ),
                  mode === "loading" ? 800 : 2600,
                ),
              ),
          );
        if (mode === "offline")
          await state.route("**/recordings/demo.json", (r) => r.abort("failed"));
        if (mode === "invalid")
          await state.route("**/recordings/demo.json", (r) =>
            r.fulfill({
              status: 200,
              contentType: "application/json",
              body: '{"version":"invalid"}',
            }),
          );
        if (mode === "empty")
          await state.route("**/recordings/demo.json", (r) =>
            r.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...recording, events: [] }),
            }),
          );
        await state.goto(base, { waitUntil: "domcontentloaded" });
        if (mode === "slow") await state.getByText("STILL OPENING", { exact: true }).waitFor();
        if (["offline", "invalid"].includes(mode)) {
          await state.getByRole("button", { name: "Retry archive" }).waitFor();
          check(
            `${engine}/${size}: ${mode} explicit recovery`,
            await state.getByRole("button", { name: "Play replay" }).isDisabled(),
          );
        }
        if (mode === "empty") {
          await state.getByText("NO EVENTS RECORDED", { exact: true }).waitFor();
          await state.locator("body").click({ position: { x: 1, y: 1 } });
          await state.keyboard.press("Space");
          check(
            `${engine}/${size}: empty stream never autoplayed`,
            await state.getByRole("button", { name: "Play replay" }).isDisabled(),
          );
        }
        if (mode === "reduced") {
          await state.waitForSelector("#scrubber:enabled");
          check(
            `${engine}/${size}: reduced motion starts paused`,
            await state.getByRole("button", { name: "Play replay" }).isVisible(),
          );
        }
        await png(state, mode, engine, size);
        if (mode === "slow") {
          await state.waitForSelector("#scrubber:enabled");
          check(
            `${engine}/${size}: slow archive recovers`,
            await state.getByRole("button", { name: "Pause replay" }).isVisible(),
          );
        }
        if (mode === "invalid") {
          await state.unroute("**/recordings/demo.json");
          await state.getByRole("button", { name: "Retry archive" }).click();
          await state.waitForSelector("#scrubber:enabled");
          check(
            `${engine}/${size}: retry restores real replay`,
            await state.getByRole("button", { name: "Pause replay" }).isVisible(),
          );
        }
        await state.close();
      }
    }
  } finally {
    await browser.close();
  }
}
check("zero browser warnings/errors in valid production replay", report.console.length === 0);
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      pass,
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
assert.equal(report.failures.length, 0, `Failed: ${report.failures.join(", ")}`);
