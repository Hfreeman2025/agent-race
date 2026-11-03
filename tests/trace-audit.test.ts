import { readFileSync } from "node:fs";
import { createTwoFilesPatch } from "diff";
import { expect, it } from "vitest";
import { RecordingSchema } from "../src/core/schema";
import { buildTrace, finalFiles, identifiers } from "../src/core/trace";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected recorded fixture / trace node missing");
  return value;
}

const recording = RecordingSchema.parse(
  JSON.parse(readFileSync("public/recordings/demo.json", "utf8")),
);
// An edge audit of observable overlap/routing, NOT a ground-truth causal label set.
const audited = [
  "claude-0>claude-2",
  "claude-0>claude-5",
  "claude-1>claude-5",
  "claude-0>claude-6",
  "claude-1>claude-6",
  "claude-5>claude-7",
  "claude-6>claude-7",
  "claude-5>claude-8",
  "claude-8>claude-9",
  "claude-5>claude-acceptance",
  "codex-2>codex-3",
  "codex-2>codex-4",
  "codex-4>codex-5",
  "codex-3>codex-6",
  "codex-4>codex-6",
  "codex-4>codex-acceptance",
];
it("keeps the explicitly audited evidence/routing edge set, without presenting it as causal accuracy", () => {
  const trace = buildTrace(recording);
  expect(trace.edges.map((e) => e.id).sort()).toEqual([...audited].sort());
  for (const edge of trace.edges)
    for (const evidence of edge.evidence) {
      if (evidence.kind === "identifier" || evidence.kind === "line") {
        expect(evidence.source).toContain(evidence.value);
        expect(evidence.target).toContain(evidence.value);
      }
    }
});
it("excludes words that occur only in comments or string literals, including new-line comments", () => {
  expect(
    identifiers('const pending = load(key); // inventedIdentifier\n"anotherFake"; /* thirdFake */'),
  ).toEqual(["pending", "load", "key"]);
});
it("retains each surviving changed line's actual edit owner across later patches and handles a pure insertion", () => {
  const initial = "export const first = 0;\nexport const second = 0;\n";
  const one = "export const first = 1;\nexport const second = 0;\n";
  const two = "export const first = 1;\nexport const second = 2;\n";
  const three = `${two}export const third = 3;\n`;
  const template = required(recording.events.find((e) => e.id === "codex-4"));
  const events = [one, two, three].map((text, i) => ({
    ...template,
    id: `patch-${i}`,
    at: i + 1,
    diff: createTwoFilesPatch(
      "src.mjs",
      "src.mjs",
      required([initial, one, two][i]),
      text,
      "",
      "",
      {
        context: 0,
      },
    ),
  }));
  const file = required(
    finalFiles({ ...recording, events }, { "src.mjs": initial }).find((f) => f.agent === "codex"),
  );
  expect(file.error).toBeUndefined();
  expect(file.lines.filter((l) => l.kind === "added").map((l) => [l.text, l.eventId])).toEqual([
    ["export const first = 1;", "patch-0"],
    ["export const second = 2;", "patch-1"],
    ["export const third = 3;", "patch-2"],
  ]);
  expect(file.lines.filter((l) => l.kind === "removed").map((l) => l.eventId)).toEqual([
    "patch-0",
    "patch-1",
  ]);
});
