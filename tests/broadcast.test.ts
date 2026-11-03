import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRead, isTest, sectors, testOutcome } from "../src/core/broadcast";
import { type RaceEvent, RecordingSchema } from "../src/core/schema";

const r = RecordingSchema.parse(JSON.parse(readFileSync("public/recordings/demo.json", "utf8")));
const event = (title: string, detail = "", exitCode = 0): RaceEvent => ({
  id: "test",
  agent: "codex",
  at: 1,
  seq: 0,
  phase: "agent",
  kind: "run",
  title,
  detail,
  exitCode,
});
describe("broadcast evidence", () => {
  it("finds actual file reads inside shell commands, without treating file writes or promises as reads", () => {
    expect(isRead(event("/bin/zsh -lc 'cat src.mjs visible.test.mjs'"))).toBe(true);
    expect(isRead(event("cat > src.mjs <<'EOF'"))).toBe(false);
    expect(isRead({ ...event("I will cat src.mjs"), kind: "message" })).toBe(false);
    expect(isRead(event("rg --files"))).toBe(false);
  });
  it("recognises executed tests, including verify, without treating test file reads or acceptance as agent tests", () => {
    expect(isTest(event("./verify >/dev/null 2>&1; echo verify_exit=$?"))).toBe(true);
    expect(isTest(event("node --test regression.test.mjs"))).toBe(true);
    expect(isTest(event("cat visible.test.mjs verify"))).toBe(false);
    expect(isTest({ ...event("npm test"), phase: "acceptance" })).toBe(false);
  });
  it("does not call a zero-exit shell green when an inner test failed", () => {
    expect(testOutcome(r.events.find((e) => e.id === "claude-1") as RaceEvent)).toBe("failed");
    expect(testOutcome(event("./verify", "verify_exit=1", 0))).toBe("failed");
    expect(testOutcome(event("./verify", "", 0))).toBe("unknown");
    expect(testOutcome(event("node --test x", "ℹ pass 4\nℹ fail 0", 0))).toBe("passed");
  });
  it("derives first observed sectors from the immutable real recording", () => {
    expect(sectors(r, "claude")).toEqual({ read: 3244, edit: 16159, test: 16159, verified: 41466 });
    expect(sectors(r, "codex")).toEqual({ read: 31300, edit: 44034, test: 45338, verified: 77793 });
    expect(
      sectors(
        {
          ...r,
          events: [],
          results: r.results.map((result) => ({
            ...result,
            accepted: false,
            acceptanceExit: 1,
            verifiedAt: null,
          })),
        },
        "codex",
      ),
    ).toEqual({ read: null, edit: null, test: null, verified: null });
  });
});

import { commentary, currentCall, finishSummary, sectorGap } from "../src/core/broadcast";

it("anchors commentary in real evidence without leaking a future acceptance", () => {
  const calls = commentary(r);
  expect(calls.find((c) => c.eventId === "claude-2")?.text).toContain("earlier version");
  expect(calls.find((c) => c.eventId === "claude-1")?.text).toContain("does not erase");
  expect(currentCall(calls, 41000).text).not.toContain("verified finish is on the clock");
  expect(currentCall(calls, 41466).text).toContain("independent acceptance passes");
  expect(currentCall(calls, 49375).text).toMatch(/no recorded receipts verdict/iu);
  expect(
    calls.every(
      (c) => c.eventId === null || r.events.some((e) => e.id === c.eventId && e.at === c.at),
    ),
  ).toBe(true);
});
it("compares only completed matching sectors; handles ties and incomplete fields honestly", () => {
  expect(sectorGap(r, 31300)).toEqual({ sector: "read", leader: "claude", gap: 28056 });
  expect(sectorGap(r, 77792)?.sector).toBe("test");
  expect(sectorGap(r, 77793)).toEqual({ sector: "verified", leader: "claude", gap: 36327 });
  expect(sectorGap(r, 3000)).toBe(null);
  expect(finishSummary(r)).toContain("36.327s ahead");
  expect(
    finishSummary({ ...r, results: r.results.map((x) => ({ ...x, verifiedAt: 100 })) }),
  ).toContain("tied");
  expect(finishSummary({ ...r, results: r.results.map((x) => ({ ...x, error: "startup" })) })).toBe(
    "Incomplete comparison",
  );
});
it("does not mistake quoted examples or heredoc bodies for executed commands", () => {
  expect(isRead(event("printf 'example; cat src.mjs'"))).toBe(false);
  expect(isTest(event("echo 'node --test regression.test.mjs'"))).toBe(false);
  expect(isTest(event("cat > notes.txt <<'EOF'\nnode --test imaginary.mjs\nEOF"))).toBe(false);
  expect(isRead(event("cat missing.mjs", "No such file", 1))).toBe(false);
});
it("keeps a failed test in the booth when its edit snapshot shares the same timestamp", () => {
  expect(currentCall(commentary(r), 16159).eventId).toBe("claude-1");
});
