import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const assets = JSON.parse(
  await readFile(new URL("../public/fonts/plex-manifest.json", import.meta.url), "utf8"),
);
if (assets.length !== 11 || new Set(assets.map((asset) => asset.file)).size !== 11)
  throw new Error("Expected eight Plex faces and three full OFL notices");
for (const asset of assets) {
  if (!/^[a-zA-Z0-9.-]+$/u.test(asset.file)) throw new Error("Font asset must be a basename");
  const bytes = await readFile(new URL(`../public/fonts/${asset.file}`, import.meta.url));
  if (
    asset.version !== "5.3.0" ||
    asset.license !== "OFL-1.1" ||
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error(`Pinned Plex asset changed: ${asset.file}`);
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
  `# Dependency licences\n\nGenerated from package-lock.json by npm run licenses. All ${rows.length} locked dependency packages (including optional platform binaries) satisfy the MIT / Apache-2.0 / BSD / ISC allowlist. Local receipts is MIT and is used read-only from its own built repository. IBM Plex Sans, Mono and Sans Condensed are bundled under SIL OFL-1.1; the font and full notice hashes are checked separately. See [DEPENDENCIES.md](../DEPENDENCIES.md) for the pinned source and attribution. No external font requests are made.\n\n| Package | Version | SPDX licence |\n| --- | --- | --- |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`,
);
console.log(
  `PASS: ${rows.length} locked packages; permissive licence allowlist. Local receipts: MIT. IBM Plex: OFL-1.1, font and notice hashes verified.`,
);
