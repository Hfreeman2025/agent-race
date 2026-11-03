import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { eventDiff } from "../src/core/diffs";
import { RecordingSchema } from "../src/core/schema";
import { backwardSlice, buildTrace, finalFiles, traceTicks } from "../src/core/trace";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected recorded fixture / trace node missing");
  return value;
}

const recording = RecordingSchema.parse(
  JSON.parse(readFileSync("public/recordings/demo.json", "utf8")),
);
const baseline = { "src.mjs": readFileSync("challenges/single-flight/repo/src.mjs", "utf8") };
it("links the real Codex source patch to the earlier captured read with exact evidence, without mutating events", () => {
  const before = JSON.stringify(recording);
  const trace = buildTrace(recording);
  const edge = trace.edges.find((e) => e.from === "codex-2" && e.to === "codex-4");
  expect(edge?.inferred).toBe(true);
  expect(edge?.evidence).toContainEqual(
    expect.objectContaining({
      kind: "identifier",
      value: "values",
      source: "const values = new Map();",
    }),
  );
  const slice = backwardSlice(trace, "codex-4", "    values.set(key, pending);");
  expect([...slice.nodes]).toEqual(["codex-4", "codex-2"]);
  expect(JSON.stringify(recording)).toBe(before);
});
it("does not infer from future output, the other lane, common syntax or the failed heredoc's proposed code", () => {
  const trace = buildTrace(recording);
  expect(
    trace.edges.every(
      (e) =>
        required(recording.events.find((x) => x.id === e.from)).agent ===
        required(recording.events.find((x) => x.id === e.to)).agent,
    ),
  ).toBe(true);
  expect(
    trace.edges.every(
      (e) =>
        required(recording.events.find((x) => x.id === e.from)).at <
        required(recording.events.find((x) => x.id === e.to)).at,
    ),
  ).toBe(true);
  expect([...backwardSlice(trace, "codex-4", "    return pending;").edges]).toEqual([]);
  expect(
    trace.edges
      .find((e) => e.from === "claude-1" && e.to === "claude-5")
      ?.evidence.some((e) => e.value === "entries"),
  ).not.toBe(true);
});
it("reconstructs all four final files, resolves the combined edit transaction and refuses mismatched patches", () => {
  const files = finalFiles(recording, baseline);
  expect(files).toHaveLength(4);
  expect(files.every((f) => !f.error)).toBe(true);
  const source = required(files.find((f) => f.agent === "codex" && f.path === "src.mjs"));
  expect(
    source.lines
      .filter((l) => l.kind === "added")
      .map((l) => l.text)
      .join("\n"),
  ).toContain("values.set(key, pending)");
  expect(source.lines.every((l) => l.eventId === "codex-4")).toBe(true);
  expect(
    files
      .find((f) => f.agent === "claude" && f.path === "src.mjs")
      ?.lines.some((l) => l.kind === "added" && l.text.includes("entries.set")),
  ).toBe(true);
  expect(
    finalFiles(recording, { "src.mjs": "wrong\n" })
      .filter((f) => f.path === "src.mjs")
      .every((f) => f.error),
  ).toBe(true);
});
it("keeps claim-to-command mapping explicitly inferred, and does not manufacture a Codex claim verdict", () => {
  const trace = buildTrace(recording);
  expect(
    trace.edges.find((e) => e.to === "claude-9" && e.from === "claude-8")?.evidence[0]?.target,
  ).toContain("mapping inferred");
  expect(trace.nodes.find((e) => e.id === "codex-7")).toBeUndefined();
});
it("uses captured failure output as evidence, but never the proposed source in a shell command", () => {
  const read = recording.events.find((e) => e.id === "codex-2");
  const edit = recording.events.find((e) => e.id === "codex-4");
  if (!read || !edit) throw new Error("Fixture missing");
  const standaloneEdit = { ...edit, diff: required(eventDiff(recording.events, edit)).text };
  const failed = {
    ...read,
    id: "failed-output",
    title: "node --test",
    exitCode: 1,
    detail: "createCache returned undefined",
  };
  const candidate = buildTrace({ ...recording, events: [failed, standaloneEdit] });
  expect(candidate.edges).toEqual([]); // createCache is context, not a changed line.
  const withChanged = { ...failed, detail: "load(key) threw unexpectedly" };
  expect(
    buildTrace({ ...recording, events: [withChanged, standaloneEdit] }).edges[0]?.evidence.some(
      (e) => e.value === "load",
    ),
  ).toBe(true);
  const onlyTitle = {
    ...failed,
    title: "cat <<EOF\nvalues.set(key, pending)\nEOF",
    detail: "operation not permitted",
  };
  expect(buildTrace({ ...recording, events: [onlyTitle, standaloneEdit] }).edges).toEqual([]);
});
it("an absent or empty trace never invents a selected node", () => {
  expect([...backwardSlice({ nodes: [], edges: [] }, "codex-4").nodes]).toEqual([]);
  expect([...backwardSlice(buildTrace(recording), "missing-event").nodes]).toEqual([]);
});

it("bounds nice time-axis ticks to sub-second, short and full recordings", () => {
  for (const duration of [907, 25532, 77793]) {
    const ticks = traceTicks(duration);
    expect(ticks[0]).toBe(0);
    expect(ticks.length).toBeLessThanOrEqual(9);
    expect(ticks.every((t) => t <= duration)).toBe(true);
  }
  expect(traceTicks(907)).toEqual([0, 200, 400, 600, 800]);
});
