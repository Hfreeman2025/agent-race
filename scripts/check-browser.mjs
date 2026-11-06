import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Each script closes its browser before the next script starts.
const suites = [
  "screenshots-v3.mjs",
  "proof-fallbacks-v3.mjs",
  "screenshots-v2.mjs",
  "empty-v3.mjs",
  "check-browser-csp.mjs",
  "check-archive-race.mjs",
  "plex-check.mjs",
  "cold-v3.mjs",
];
for (const suite of suites) {
  console.log(`Browser check: ${suite}`);
  const result = spawnSync(process.execPath, [resolve("scripts", suite)], {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: resolve(".cache/ms-playwright"),
      RACE_BROWSERS: process.env.RACE_BROWSERS ?? "chromium,webkit,firefox",
      RACE_SHOT_PASS: "latest",
      RACE_SHOT_ROOT:
        suite === "screenshots-v2.mjs" ? ".cache/browser/replay" : ".cache/browser/trace",
      PLEX_PASS: "latest",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("PASS: serial trace, proof, replay, fallback, CSP, typography and cold-load suites.");
