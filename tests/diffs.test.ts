import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { eventDiff } from "../src/core/diffs";
import { RecordingSchema } from "../src/core/schema";

const r = RecordingSchema.parse(JSON.parse(readFileSync("public/recordings/demo.json", "utf8")));
const source = r.events.find(
  (e) => e.agent === "codex" && e.kind === "edit" && e.title.endsWith("src.mjs"),
);
if (!source) throw new Error("Real source edit fixture missing");
it("shows the actual per-file patch from a captured multi-file transaction without changing events", () => {
  const patch = eventDiff(r.events, source);
  expect(patch?.text).toContain("Index: src.mjs");
  expect(patch?.text).toContain("createCache");
  expect(patch?.text).not.toContain("Index: regression.test.mjs");
  expect(patch?.shared).toBe(true);
  expect(source.diff).toBeUndefined();
});
it("never borrows a patch from another agent or timestamp", () => {
  expect(
    eventDiff(
      r.events.map((e) => ({ ...e, agent: "claude" })),
      source,
    ),
  ).toBeUndefined();
  expect(eventDiff(r.events, { ...source, at: source.at + 1 })).toBeUndefined();
});
