import { applyPatch, createTwoFilesPatch, parsePatch } from "diff";
import { isRead, isTest, testOutcome } from "./broadcast";
import { eventDiff } from "./diffs";
import type { Agent, RaceEvent, Recording } from "./schema";

export type Evidence = {
  kind: "identifier" | "line" | "file" | "claim";
  value: string;
  source: string;
  target: string;
};
export type TraceEdge = {
  id: string;
  from: string;
  to: string;
  inferred: true;
  evidence: Evidence[];
};
export type Trace = { nodes: RaceEvent[]; edges: TraceEdge[] };
export type ChangedLine = {
  id: string;
  text: string;
  kind: "added" | "removed" | "context";
  old: number | null;
  next: number | null;
  eventId: string;
};
export type FinalFile = { agent: Agent; path: string; lines: ChangedLine[]; error?: string };
const stop = new Set(
  "const let var return function async await export import from if else new throw catch try true false undefined null test assert equal strict node src mjs this of for in as typeof instanceof default resolve reject error Promise Map Error Object Array String Number all then set get has delete length console log".split(
    " ",
  ),
);
function lexicalCode(text: string): string {
  // Small lexical scanner: strings and comments do not become code identifiers.
  // Template interpolations are opaque; this intentionally loses recall rather than parsing arbitrary JS.
  return text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu,
    (match) => match.replace(/[^\n]/gu, " "),
  );
}
export function identifiers(text: string): string[] {
  return [...new Set(lexicalCode(text).match(/\b[A-Za-z_$][\w$]*\b/gu) ?? [])].filter(
    (x) => x.length > 2 && !stop.has(x),
  );
}
function excerpt(text: string, value: string): string {
  const masked = lexicalCode(text).split("\n");
  const index = masked.findIndex((line) => identifiers(line).includes(value));
  const line = text.split("\n")[index]?.trim() ?? value;
  const at = Math.max(0, line.indexOf(value));
  const start = Math.max(0, at - 80);
  return `${start ? "…" : ""}${line.slice(start, Math.max(240, at + value.length + 80))}${line.length > Math.max(240, at + value.length + 80) ? "…" : ""}`;
}
function changedText(events: RaceEvent[], event: RaceEvent): string {
  return (eventDiff(events, event)?.text ?? "")
    .split("\n")
    .filter((line) => /^[+-](?![+-])/u.test(line))
    .map((line) => line.slice(1))
    .join("\n");
}
function fileName(event: RaceEvent): string | null {
  const name = event.title.replace(/^<repo>\//u, "");
  return /^[\w./-]+\.[\w]+$/u.test(name) ? name : null;
}
function lexicalEvidence(source: string, target: string): Evidence[] {
  const sourceTokens = new Set(identifiers(source));
  const matches: Evidence[] = identifiers(target)
    .filter((value) => sourceTokens.has(value))
    .map((value) => ({
      kind: "identifier",
      value,
      source: excerpt(source, value),
      target: excerpt(target, value),
    }));
  const sourceLines = new Set(
    source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 12),
  );
  for (const line of target.split("\n").map((line) => line.trim()))
    if (line.length >= 12 && sourceLines.has(line))
      matches.push({ kind: "line", value: line, source: line, target: line });
  return matches;
}
/** Conservative evidence graph, NOT execution-level data/control dependence. All edges are hypotheses. */
export function buildTrace(recording: Recording): Trace {
  const nodes = recording.events.filter((e) => e.kind !== "message");
  const edges: TraceEdge[] = [];
  const add = (from: RaceEvent, to: RaceEvent, evidence: Evidence[]) => {
    if (evidence.length)
      edges.push({ id: `${from.id}>${to.id}`, from: from.id, to: to.id, inferred: true, evidence });
  };
  for (const target of nodes) {
    const prior = nodes.filter((source) => source.agent === target.agent && source.at < target.at);
    if (target.kind === "edit") {
      const text = changedText(recording.events, target);
      for (const source of prior) {
        // Only captured output; never a shell title, heredoc, agent message or proposed edit.
        if ((isRead(source) || source.kind === "run") && source.detail)
          add(source, target, lexicalEvidence(source.detail, text));
      }
    }
    if (target.kind === "run" && (isTest(target) || target.phase === "acceptance")) {
      for (const source of prior.filter((e) => e.kind === "edit")) {
        const path = fileName(source);
        if (
          !path ||
          prior.some((e) => e.kind === "edit" && e.at > source.at && fileName(e) === path)
        )
          continue;
        // ./verify's test target is visible in the captured initial wrapper/package output.
        const wrapper = prior.find(
          (e) => isRead(e) && e.detail?.includes('"test": "node --test visible.test.mjs"'),
        );
        const tested =
          target.phase === "acceptance"
            ? path === "src.mjs"
            : target.title.includes(path) || (path === "src.mjs" && isTest(target));
        if (tested && (path !== "src.mjs" || wrapper || target.title.includes(path)))
          add(source, target, [
            {
              kind: "file",
              value: path,
              source: `Recorded edit: ${path}`,
              target:
                target.phase === "acceptance"
                  ? "Independent acceptance imports src.mjs"
                  : (target.title.split("\n")[0] ?? target.title),
            },
          ]);
      }
    }
    if (target.kind === "claim") {
      const run = prior.findLast(
        (e) =>
          isTest(e) && /(?:^|[\s'";])\.\/verify\b/u.test(e.title) && testOutcome(e) === "passed",
      );
      const receipt = target.claims?.find(
        (c) => c.verdict === "VERIFIED" && c.receiptId,
      )?.receiptId;
      if (run && receipt)
        add(run, target, [
          {
            kind: "claim",
            value: receipt,
            source: run.detail ?? "",
            target:
              "Recorded VERIFIED claim; nearest earlier successful ./verify. Event-to-receipt mapping inferred, not stored in the event.",
          },
        ]);
    }
  }
  return { nodes, edges };
}
/** A line criterion restricts lexical incoming edges, then walks the DAG backwards. */
export function backwardSlice(
  trace: Trace,
  eventId: string,
  line?: string,
): { nodes: Set<string>; edges: Set<string> } {
  if (!trace.nodes.some((node) => node.id === eventId))
    return { nodes: new Set(), edges: new Set() };
  const nodes = new Set([eventId]);
  const edges = new Set<string>();
  const visit = (id: string, criterion?: string) => {
    const tokens = criterion === undefined ? null : new Set(identifiers(criterion));
    for (const edge of trace.edges.filter((e) => e.to === id)) {
      if (
        tokens &&
        !edge.evidence.some((e) =>
          e.kind === "line"
            ? e.value === criterion?.trim()
            : e.kind === "identifier" && tokens.has(e.value),
        )
      )
        continue;
      edges.add(edge.id);
      if (!nodes.has(edge.from)) {
        nodes.add(edge.from);
        visit(edge.from);
      }
    }
  };
  visit(eventId, line);
  return { nodes, edges };
}
/** Reconstruct from captured patches; refuse mismatched hunks rather than inventing a final file. */
export function finalFiles(recording: Recording, baselines: Record<string, string>): FinalFile[] {
  const files: FinalFile[] = [];
  for (const agent of ["claude", "codex"] as const) {
    type Piece = { owner: string; origin: number | null };
    const state = new Map<
      string,
      {
        text: string;
        eventId: string;
        pieces: Piece[];
        removed: Map<number, string>;
        error?: string;
      }
    >();
    const transactions = new Set<string>();
    for (const event of recording.events.filter(
      (e) => e.agent === agent && e.kind === "edit" && e.diff,
    )) {
      for (const patch of parsePatch(event.diff ?? "")) {
        const path = patch.newFileName?.replace(/^b\//u, "");
        if (!path || path === "/dev/null") continue;
        const transaction = `${event.at}:${path}`;
        if (transactions.has(transaction)) continue;
        transactions.add(transaction);
        const owner =
          recording.events.find(
            (e) => e.agent === agent && e.at === event.at && fileName(e) === path,
          ) ?? event;
        const previous = state.get(path);
        const input =
          previous?.text ??
          baselines[path] ??
          (!patch.hunks.length || patch.hunks[0]?.oldLines === 0 ? "" : undefined);
        const output = input === undefined || previous?.error ? false : applyPatch(input, patch);
        if (output === false || input === undefined) {
          state.set(path, {
            text: "",
            eventId: owner.id,
            pieces: [],
            removed: new Map(),
            error: "Captured patch does not apply to the known baseline. Final diff unavailable.",
          });
          continue;
        }
        const oldPieces =
          previous?.pieces ??
          input
            .split("\n")
            .slice(0, input.endsWith("\n") ? -1 : undefined)
            .map((_, i) => ({ owner: owner.id, origin: i + 1 }));
        const pieces: Piece[] = [];
        const removed = new Map(previous?.removed ?? []);
        let cursor = 0;
        for (const hunk of patch.hunks) {
          const start = hunk.oldLines === 0 ? hunk.oldStart : Math.max(0, hunk.oldStart - 1);
          pieces.push(...oldPieces.slice(cursor, start));
          cursor = start;
          for (const line of hunk.lines) {
            if (line.startsWith("\\")) continue;
            if (line.startsWith("+")) pieces.push({ owner: owner.id, origin: null });
            else if (line.startsWith("-")) {
              const gone = oldPieces[cursor++];
              if (gone?.origin) removed.set(gone.origin, owner.id);
            } else {
              const piece = oldPieces[cursor++];
              if (piece) pieces.push(piece);
            }
          }
        }
        pieces.push(...oldPieces.slice(cursor));
        state.set(path, { text: output, eventId: owner.id, pieces, removed });
      }
    }
    for (const [path, value] of state) {
      if (value.error) {
        files.push({ agent, path, lines: [], error: value.error });
        continue;
      }
      const diff = parsePatch(
        createTwoFilesPatch(path, path, baselines[path] ?? "", value.text, "", "", { context: 3 }),
      )[0];
      const lines: ChangedLine[] = [];
      for (const hunk of diff?.hunks ?? []) {
        let old = hunk.oldStart;
        let next = hunk.newStart;
        for (const raw of hunk.lines) {
          if (raw.startsWith("\\")) continue;
          const kind = raw[0] === "+" ? "added" : raw[0] === "-" ? "removed" : "context";
          lines.push({
            id: `${agent}:${path}:${lines.length}`,
            text: raw.slice(1),
            kind,
            old: kind === "added" ? null : old++,
            next: kind === "removed" ? null : next++,
            eventId:
              kind === "removed"
                ? (value.removed.get(old - 1) ?? value.eventId)
                : (value.pieces[next - 2]?.owner ?? value.eventId),
          });
        }
      }
      files.push({ agent, path, lines });
    }
  }
  return files;
}
/** Nice 1/2/5 time ticks, bounded to the recording even for sub-second startup failures. */
export function traceTicks(duration: number): number[] {
  const target = duration / 8;
  const scale = 10 ** Math.floor(Math.log10(target));
  const multiple = [1, 2, 5, 10].find((n) => n * scale >= target) ?? 10;
  const step = multiple * scale;
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
}
