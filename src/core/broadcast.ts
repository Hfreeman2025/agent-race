import type { Agent, RaceEvent, Recording } from "./schema";
export type Sector = "read" | "edit" | "test" | "verified";
export const sectorNames: Record<Sector, string> = {
  read: "First read",
  edit: "First edit",
  test: "First test",
  verified: "Verified fix",
};
export const agentNames: Record<Agent, string> = { claude: "Claude Code", codex: "Codex" };
const seconds = (n: number) => `${(n / 1000).toFixed(3)}s`;
/** A small, fail-closed recogniser for the command forms captured in this archive.
 * Quotes are opaque to command separators. Heredoc source is never executable evidence.
 * This does not attempt to interpret arbitrary shell programs or command substitutions.
 */
function shellCommands(title: string): string[] {
  let source = title.replace(/^\/bin\/(?:zsh|bash) -l?c\s+/u, "");
  if (
    (source.startsWith("'") && source.endsWith("'")) ||
    (source.startsWith('"') && source.endsWith('"'))
  )
    source = source.slice(1, -1);
  source = source.replace(
    /<<(['"]?)([A-Za-z_][A-Za-z_0-9]*)\1[^\n]*\n[\s\S]*?\n\2(?:\n|$)/gu,
    "\n",
  );
  if (source.includes("$(") || source.includes("`")) return [];
  const commands: string[] = [];
  let quote = "";
  let buffer = "";
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      buffer += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      buffer += char;
      continue;
    }
    if (char === quote) quote = "";
    else if (!quote && (char === "'" || char === '"')) quote = char;
    if (!quote && /[;&|\n]/u.test(char)) {
      commands.push(buffer.trim());
      buffer = "";
    } else buffer += char;
  }
  if (quote || escaped) return [];
  commands.push(buffer.trim());
  return commands;
}
export function isRead(event: RaceEvent): boolean {
  return (
    event.phase === "agent" &&
    (event.kind === "read" ||
      (event.kind === "run" &&
        event.exitCode === 0 &&
        shellCommands(event.title).some((command) => /^cat\s+(?![<>])/u.test(command))))
  );
}
export function isTest(event: RaceEvent): boolean {
  return (
    event.phase === "agent" &&
    event.kind === "run" &&
    shellCommands(event.title).some((command) =>
      /^(?:\.\/verify\b|npm\s+test\b|node\s+--test\b)/u.test(command),
    )
  );
}
export function testOutcome(event: RaceEvent): "failed" | "passed" | "unknown" {
  const output = event.detail ?? "";
  if (
    (event.exitCode !== undefined && event.exitCode !== null && event.exitCode !== 0) ||
    /(?:\bfail\s+[1-9]\d*|(?:verify_exit|exit)=[1-9]\d*|✖|operation not permitted)/iu.test(output)
  )
    return "failed";
  if (/\bfail\s+0\b|\bverify_exit=0\b/iu.test(output)) return "passed";
  return "unknown";
}
export function sectors(recording: Recording, agent: Agent): Record<Sector, number | null> {
  const events = recording.events.filter((e) => e.agent === agent && e.phase === "agent");
  return {
    read: events.find(isRead)?.at ?? null,
    edit: events.find((e) => e.kind === "edit")?.at ?? null,
    test: events.find(isTest)?.at ?? null,
    verified: recording.results.find((r) => r.agent === agent && r.accepted)?.verifiedAt ?? null,
  };
}
export type Call = {
  at: number;
  text: string;
  rule: string;
  eventId: string | null;
  tone: "neutral" | "warning" | "green";
};
/** Every line has a rule and an evidence anchor. No language model or fabricated event. */
export function commentary(recording: Recording): Call[] {
  const calls: Call[] = [
    {
      at: 0,
      text: "Two fresh repos. One shared clock. The finish needs independent acceptance.",
      rule: "START · recording provenance",
      eventId: null,
      tone: "neutral",
    },
  ];
  for (const e of recording.events) {
    const name = agentNames[e.agent];
    let text = "";
    let rule = "";
    let tone: Call["tone"] = "neutral";
    if (e.phase === "acceptance") {
      text = `${name}: independent acceptance ${e.exitCode === 0 ? "passes" : "fails"} at ${seconds(e.at)}. ${e.exitCode === 0 ? "A verified finish." : "No verified finish."}`;
      rule = "ACCEPTANCE · independent harness output";
      tone = e.exitCode === 0 ? "green" : "warning";
    } else if (isTest(e)) {
      const outcome = testOutcome(e);
      tone = outcome === "failed" ? "warning" : outcome === "passed" ? "green" : "neutral";
      text =
        outcome === "failed"
          ? `${name} hits trouble: a failure inside the test run. Shell exit ${e.exitCode ?? "unknown"} does not erase it.`
          : outcome === "passed"
            ? `${name} runs tests: green output. That proves this command, not the hidden cases.`
            : `${name} starts a test command. The captured output does not establish a pass.`;
      rule = `TEST OUTPUT · ${outcome === "unknown" ? "no recognised result" : outcome === "failed" ? "nonzero exit or failure in output" : "zero-failure summary or verify_exit=0"}`;
    } else if (isRead(e)) {
      text = `${name} is into the source. File read observed at ${seconds(e.at)}. The clock includes startup.`;
      rule = "READ · file-read event or shell cat";
    } else if (e.kind === "edit") {
      text = `${name} changes ${e.title.includes("<repo>/") ? e.title.replace("<repo>/", "") : "the working tree"}. Tests on an earlier version cannot prove this edit.`;
      rule = "EDIT · captured working-tree change";
    } else if (e.kind === "claim") {
      const verdicts = [...new Set(e.claims?.map((c) => c.verdict) ?? [])];
      text = `${name} claims a pass. Receipts: ${verdicts.join(", ") || "no verdict"}. The claim check is separate from hidden acceptance.`;
      rule = "CLAIM · recorded receipts verdict";
      tone = verdicts.length && verdicts.every((v) => v === "VERIFIED") ? "green" : "warning";
    } else if (e.kind === "message" && /\bverification passed\b/iu.test(e.detail ?? e.title)) {
      text = `${name} says “Verification passed”. No recorded receipts verdict for that wording. Open the evidence.`;
      rule = "UNMATCHED WORDING · message, no claim verdict";
      tone = "warning";
    } else if (e.kind === "message" && /heredocs failed/iu.test(e.title)) {
      text = `${name} reports truncated files and a rewrite. The failed attempt stays in the replay.`;
      rule = "RECOVERY · agent’s recorded explanation";
      tone = "warning";
    } else if (e.kind === "run") {
      text = `${name} runs a repo command. ${e.exitCode === 0 ? "Shell exit zero; no test verdict inferred." : `Shell exit ${e.exitCode ?? "unknown"}.`}`;
      rule = "COMMAND · recorded exit code";
    } else {
      text = `${name} explains its approach. Words do not stop the race clock.`;
      rule = "MESSAGE · agent’s recorded words";
    }
    calls.push({ at: e.at, text, rule, eventId: e.id, tone });
  }
  return calls;
}
export function currentCall(calls: Call[], at: number): Call {
  const latest = calls.findLast((call) => call.at <= at);
  return (
    (latest
      ? (calls.findLast((call) => call.at === latest.at && call.tone === "warning") ?? latest)
      : undefined) ??
    calls[0] ?? {
      at: 0,
      text: "No events recorded.",
      rule: "EMPTY",
      eventId: null,
      tone: "neutral",
    }
  );
}
export function sectorGap(
  recording: Recording,
  at: number,
): { sector: Sector; leader: Agent | null; gap: number } | null {
  const a = sectors(recording, "claude");
  const b = sectors(recording, "codex");
  for (const sector of ["verified", "test", "edit", "read"] as const) {
    const x = a[sector];
    const y = b[sector];
    if (x !== null && y !== null && x <= at && y <= at)
      return { sector, leader: x === y ? null : x < y ? "claude" : "codex", gap: Math.abs(x - y) };
  }
  return null;
}
export function finishSummary(recording: Recording): string {
  const sorted = recording.results
    .filter((r) => r.accepted && r.verifiedAt !== null)
    .sort((a, b) => (a.verifiedAt ?? Infinity) - (b.verifiedAt ?? Infinity));
  const first = sorted[0];
  const second = sorted[1];
  if (!first) return "No verified finish";
  if (recording.results.some((r) => r.error || r.agentExit !== 0)) return "Incomplete comparison";
  if (second && first.verifiedAt === second.verifiedAt) return "A tied verified finish";
  return `${agentNames[first.agent]} finishes first${second ? ` · ${seconds((second.verifiedAt ?? 0) - (first.verifiedAt ?? 0))} ahead` : ""}`;
}
