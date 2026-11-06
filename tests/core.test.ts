import { describe, expect, it } from "vitest";
import { EventSchema, type RaceEvent } from "../src/core/schema";
import { scrub } from "../src/core/scrub";
import { mergeTimeline } from "../src/core/timeline";

const e = (agent: "claude" | "codex", at: number, seq: number): RaceEvent => ({
  id: `${agent}-${seq}`,
  agent,
  at,
  seq,
  kind: "read",
  title: "src.mjs",
  phase: "agent",
});
describe("strict event contract", () => {
  it("rejects negative clocks, arbitrary kinds and unknown fields", () => {
    for (const patch of [{ at: -1 }, { at: NaN }, { kind: "victory" }, { secret: "oops" }])
      expect(EventSchema.safeParse({ ...e("claude", 1, 0), ...patch }).success).toBe(false);
  });
  it("validates a command with a real nonzero exit", () =>
    expect(EventSchema.parse({ ...e("codex", 1, 0), kind: "run", exitCode: 2 }).exitCode).toBe(2));
});
describe("fail-closed privacy scrub", () => {
  for (const [name, value] of [
    ["company", ["Example", "Organisation"].join(" ")],
    ["company alias", ["example", "organisation"].join("-")],
    ["email", "person@example.test"],
    ["home", "/Users/someone/file"],
    ["secret", "sk-ant-abcdefghijklmnopqrstuvxyz123456"],
    ["assignment", "api_key=abcdefghijklmnop123456"],
    ["private key", "-----BEGIN PRIVATE KEY-----"],
  ])
    it(`rejects ${name}`, () =>
      expect(scrub(value ?? "", {}, ["Example Organisation"]).findings.length).toBeGreaterThan(0));
  it("normalises only explicitly known repository paths first", () =>
    expect(scrub("/private/tmp/race/repo/src.mjs", { "/private/tmp/race/repo": "<repo>" })).toEqual(
      { text: "<repo>/src.mjs", pathsRedacted: 1, findings: [] },
    ));
  it("does not mistake prose for a secret", () =>
    expect(scrub("The cache key is stable. Read <repo>/src.mjs.").findings).toEqual([]));
});
describe("one shared clock", () => {
  it("orders by clock, agent then sequence without changing input", () => {
    const input = [e("codex", 10, 2), e("claude", 10, 1), e("claude", 1, 0), e("claude", 10, 0)];
    expect(mergeTimeline(input).map((x) => x.id)).toEqual([
      "claude-0",
      "claude-0",
      "claude-1",
      "codex-2",
    ]);
    expect(input[0]?.agent).toBe("codex");
  });
});
