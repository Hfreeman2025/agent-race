import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as pw from "playwright";
import { silentBrowser } from "./silent.mjs";

const out = `.cache/browser/plex/${process.env.PLEX_PASS ?? "after"}`;
await mkdir(out, { recursive: true });
const report = { checks: [], failures: [], console: [], rows: [] };
const check = (name, good) => (good ? report.checks : report.failures).push(name);
for (const engine of (process.env.PLEX_BROWSERS ?? "chromium,webkit,firefox").split(",")) {
  const browser = await silentBrowser(pw, engine);
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ])
      for (const view of ["flight", "replay"]) {
        const page = await browser.newPage({
          viewport: { width, height },
          reducedMotion: "reduce",
        });
        const hosts = new Set();
        page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
        page.on("pageerror", (e) => report.console.push(`${engine}/${size}/${view}: ${e.message}`));
        page.on("console", (m) => {
          if (["error", "warning"].includes(m.type()))
            report.console.push(`${engine}/${size}/${view}: ${m.text()}`);
        });
        await page.addInitScript(() => {
          window.__plexShifts = [];
          window.__plexCLSAvailable =
            PerformanceObserver.supportedEntryTypes.includes("layout-shift");
          if (window.__plexCLSAvailable)
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries())
                if (!entry.hadRecentInput)
                  window.__plexShifts.push({
                    value: entry.value,
                    at: entry.startTime,
                    sources: (entry.sources ?? []).map((s) => ({
                      element: s.node?.id || s.node?.className || s.node?.nodeName,
                      previous: s.previousRect,
                      current: s.currentRect,
                    })),
                  });
            }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(`http://127.0.0.1:4317${view === "replay" ? "?view=replay" : ""}`);
        await page.waitForSelector(view === "replay" ? "#scrubber:enabled" : "[data-node]");
        const geometryBefore = await page.evaluate(() =>
          Object.fromEntries(
            [
              ".masthead",
              ".challenge",
              ".view-switch",
              "#flight .flight-heading",
              "#trace-graph",
              "#race .control",
              "#race .race-surface",
              "#booth",
            ].map((selector) => {
              const el = document.querySelector(selector);
              const r = el?.getBoundingClientRect();
              return [selector, r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null];
            }),
          ),
        );
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(700);
        const label = `${engine}/${size}/${view}`;
        const sample = await page.evaluate(() => ({
          cls: window.__plexCLSAvailable
            ? window.__plexShifts.reduce((a, b) => a + b.value, 0)
            : null,
          shifts: window.__plexShifts,
          bodyFont: getComputedStyle(document.body).fontFamily,
          clockFont: getComputedStyle(
            document.querySelector("#flight").hidden
              ? document.querySelector("#clock")
              : document.querySelector("#trace-clock"),
          ).fontFamily,
          displayFont: getComputedStyle(document.querySelector(".wordmark h1")).fontFamily,
          preloads: document.querySelectorAll('link[rel="preload"][as="font"]').length,
          fontRequests: performance
            .getEntriesByType("resource")
            .filter((e) => e.name.endsWith(".woff2"))
            .map((e) => ({ name: new URL(e.name).pathname, bytes: e.decodedBodySize })),
          scrollWidth: document.documentElement.scrollWidth,
          width: innerWidth,
        }));
        const geometryAfter = await page.evaluate(() =>
          Object.fromEntries(
            [
              ".masthead",
              ".challenge",
              ".view-switch",
              "#flight .flight-heading",
              "#trace-graph",
              "#race .control",
              "#race .race-surface",
              "#booth",
            ].map((selector) => {
              const el = document.querySelector(selector);
              const r = el?.getBoundingClientRect();
              return [selector, r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null];
            }),
          ),
        );
        const geometryStable = JSON.stringify(geometryBefore) === JSON.stringify(geometryAfter);
        check(`${label}: board geometry stable through font completion`, geometryStable);
        report.rows.push({
          engine,
          size,
          view,
          ...sample,
          geometryBefore,
          geometryAfter,
          geometryStable,
        });
        const faces = await page.evaluate(async () => {
          const wanted = [
            ["IBM Plex Sans", 400, "normal"],
            ["IBM Plex Sans", 400, "italic"],
            ["IBM Plex Sans", 500, "normal"],
            ["IBM Plex Sans", 600, "normal"],
            ["IBM Plex Mono", 400, "normal"],
            ["IBM Plex Mono", 600, "normal"],
            ["IBM Plex Sans Condensed", 500, "normal"],
            ["IBM Plex Sans Condensed", 600, "normal"],
          ];
          return Promise.all(
            wanted.map(async ([family, weight, style]) => ({
              family,
              weight,
              style,
              loaded: (await document.fonts.load(`${style} ${weight} 16px "${family}"`)).length > 0,
            })),
          );
        });
        check(
          `${label}: all eight declared faces decode and load`,
          faces.every((face) => face.loaded),
        );

        check(`${label}: IBM Plex Sans reads`, sample.bodyFont.includes("IBM Plex Sans"));
        check(`${label}: IBM Plex Mono times`, sample.clockFont.includes("IBM Plex Mono"));
        check(
          `${label}: IBM Plex Sans Condensed signs`,
          sample.displayFont.includes("IBM Plex Sans Condensed"),
        );
        check(`${label}: three same-origin font preloads`, sample.preloads === 3);
        if (sample.cls !== null) check(`${label}: zero CLS from document start`, sample.cls === 0);
        check(`${label}: no viewport overflow`, sample.scrollWidth <= sample.width);
        check(
          `${label}: no font/CDN runtime requests`,
          [...hosts].every((host) => host === "127.0.0.1"),
        );
        await page.screenshot({ path: `${out}/${engine}-${size}-${view}.png` });
        if (view === "replay") {
          for (const at of [
            0, 3244, 16159, 19268, 20820, 29624, 33364, 41093, 41466, 44034, 45338, 45496, 49375,
            77793,
          ]) {
            await page.locator("#scrubber").evaluate((el, value) => {
              el.value = String(value);
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }, at);
            const fit = await page.evaluate(() => {
              const call = document.querySelector("#call-text").getBoundingClientRect();
              const source = document.querySelector("#call-source").getBoundingClientRect();
              const booth = document.querySelector("#booth").getBoundingClientRect();
              return {
                caption: call.bottom <= source.top + 1 && source.bottom <= booth.bottom - 4,
                fold: source.bottom <= innerHeight,
                splits: [...document.querySelectorAll(".split strong")].every(
                  (e) => e.scrollWidth <= e.clientWidth,
                ),
                clock:
                  document.querySelector("#clock").scrollWidth <=
                  document.querySelector("#clock").clientWidth,
              };
            });
            check(
              `${label}/${at}: caption/splits/clock fit first screen`,
              fit.caption && fit.fold && fit.splits && fit.clock,
            );
            if ([16159, 41466, 77793].includes(at))
              await page.screenshot({ path: `${out}/${engine}-${size}-replay-${at}.png` });
          }
        } else {
          await page.locator("#proof-open").click();
          await page.waitForSelector('#proof-state[data-state="verified"]');
          await page.screenshot({ path: `${out}/${engine}-${size}-proof.png` });
          await page.locator("#proof-tamper").click();
          await page.waitForSelector('#proof-state[data-state="invalid"]');
          await page.screenshot({ path: `${out}/${engine}-${size}-tamper.png` });
        }
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
      rows: report.rows.map(({ shifts, ...row }) => row),
    },
    null,
    2,
  ),
);
assert.equal(report.failures.length, 0);
assert.equal(report.console.length, 0);
