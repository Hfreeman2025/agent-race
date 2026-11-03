/** Replace only known working roots. Everything else is checked, never silently erased. */
export function scrub(
  text: string,
  paths: Record<string, string> = {},
): { text: string; pathsRedacted: number; findings: string[] } {
  let clean = text;
  let pathsRedacted = 0;
  for (const [path, replacement] of Object.entries(paths).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    pathsRedacted += clean.split(path).length - 1;
    clean = clean.split(path).join(replacement);
  }
  // Inspect common JSON escape layers too; retain original agent text in the saved artifact.
  let readable = clean;
  for (let layer = 0; layer < 4; layer++) {
    const decoded = readable
      .replace(/\\u([0-9a-f]{4})/gi, (_match, code: string) =>
        String.fromCharCode(Number.parseInt(code, 16)),
      )
      .replace(/\\[nrt]/g, " ")
      .replace(/\\(["\\/])/g, "$1");
    if (decoded === readable) break;
    readable = decoded;
  }
  const rules: [string, RegExp][] = [
    ["company name", /simply(?:[\s_-]*sustainable|-carbon)/iu],
    ["email address", /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu],
    ["home directory", /(?:\/Users\/|\\\\Users\\|\/home\/)/iu],
    [
      "provider secret",
      /\b(?:sk-(?:ant-)?[a-z0-9_-]{12,}|(?:gh[pousr]_|github_pat_)[a-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/iu,
    ],
    [
      "secret assignment",
      /\b(?:api[_-]?key|access[_-]?token|authorization|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9/+_.=-]{8,}/iu,
    ],
    ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/u],
    ["credential URL", /https?:\/\/[^\s/:]+:[^\s/@]+@/iu],
    ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u],
  ];
  return {
    text: clean,
    pathsRedacted,
    findings: rules
      .filter(([, pattern]) => pattern.test(clean) || pattern.test(readable))
      .map(([name]) => name),
  };
}
export function assertClean(text: string): void {
  const { findings } = scrub(text);
  if (findings.length) throw new Error(`Recording save blocked: ${findings.join(", ")}`);
}
