import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { silentBrowser } from "./silent.mjs";

const require = createRequire("<local path>");
const pw = require("playwright");
const rows = [];
const messages = [];
const host = () =>
  execFileSync("top", ["-l", "1", "-n", "0"], { encoding: "utf8" })
    .split("\n")
    .filter((x) => /^CPU usage:|^Load Avg:/u.test(x));
const before = host();
for (const engine of ["chromium", "webkit", "firefox"]) {
  const browser = await silentBrowser(pw, engine);
  try {
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ])
      for (let run = 1; run <= 2; run++) {
        const page = await browser.newPage({ viewport: { width, height } });
        page.on("pageerror", (e) => messages.push(e.message));
        await page.goto("http://127.0.0.1:4317");
        await page.waitForSelector('[data-line][aria-pressed="true"]');
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          performance.mark("cold-font-and-trace");
        });
        rows.push({
          engine,
          size,
          run,
          ...(await page.evaluate(() => ({
            fontAndTracePaintProxyMs:
              performance.getEntriesByName("cold-font-and-trace")[0].startTime,
            graphReadyMs: performance.getEntriesByName("flight-meaningful-paint")[0].startTime,
            computeMs: performance.getEntriesByName("trace-compute-and-mount")[0].duration,
            proofMs: performance.getEntriesByName("proof-verify")[0]?.duration ?? null,
            resources: performance
              .getEntriesByType("resource")
              .map((e) => ({ name: new URL(e.name).pathname, bytes: e.decodedBodySize })),
          }))),
        });
        await page.close();
      }
  } finally {
    await browser.close();
  }
}
const after = host();
await mkdir("shots/v3/cold", { recursive: true });
await writeFile(
  "shots/v3/cold/report.json",
  JSON.stringify(
    {
      method:
        "Fresh contexts, same browser process per engine; production loopback. Font+selected real trace+two animation frames, not a fully-idle-machine guarantee.",
      before,
      after,
      rows,
      messages,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { before, after, rows: rows.map(({ resources, ...row }) => row), messages },
    null,
    2,
  ),
);
assert.equal(messages.length, 0);
assert.ok(rows.every((r) => r.fontAndTracePaintProxyMs < 2000));
