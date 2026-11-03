import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const assets = [
  [
    "big-shoulders-display-latin-700-normal.woff2",
    "d2d55115d0d7047ce956d4eb8f2fbfe7915552cf4fabb294a5979705ec9687ac",
  ],
  [
    "OFL-Big-Shoulders-Display.txt",
    "18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3",
  ],
];
for (const [file, expected] of assets) {
  const bytes = await readFile(new URL(`../public/fonts/${file}`, import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error(`Pinned font asset changed: ${file}; review its source and licence.`);
}

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BSD",
]);
const rows = [];
const failures = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = path.split("node_modules/").at(-1);
  const license = pkg.license ?? "UNKNOWN";
  const terms = license.replace(/[()]/g, "").split(/\s+(?:OR|AND)\s+/);
  if (!terms.every((x) => allowed.has(x))) failures.push(`${name}: ${license}`);
  rows.push([name, pkg.version, license]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
if (failures.length) throw new Error(`Dependency licence gate failed:\n${failures.join("\n")}`);
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/dependency-licenses.md",
  `# Dependency licences\n\nGenerated from package-lock.json by npm run licenses. All ${rows.length} locked dependency packages (including optional platform binaries) satisfy the MIT / Apache-2.0 / BSD / ISC allowlist. Local receipts is MIT and is used read-only from its own built repository. Big Shoulders Display 700 is bundled under SIL OFL-1.1; the font and full notice hashes are checked separately. See [DEPENDENCIES.md](../DEPENDENCIES.md) for the pinned source and attribution. No external font requests are made.\n\n| Package | Version | SPDX licence |\n| --- | --- | --- |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`,
);
console.log(
  `PASS: ${rows.length} locked packages; permissive licence allowlist. Local receipts: MIT. Big Shoulders Display: OFL-1.1, font and notice hashes verified.`,
);
