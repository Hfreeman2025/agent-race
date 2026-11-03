import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { makeEvent, normalise, parseLine, toolKind } from "../src/core/normalise";
import { type Agent, EventSchema } from "../src/core/schema";
import { scrub } from "../src/core/scrub";

const fixtureRoot = resolve("tests/fixtures");
const Streams = z.record(z.string(), z.array(z.object({ at: z.number(), data: z.unknown() })));
describe("captured real Claude CLI streams", () => {
  const files = readdirSync(fixtureRoot).filter((n) => n.endsWith(".streams.json"));
  for (const file of files)
    it(`normalises ${file} without inventing actions`, () => {
      const text = readFileSync(resolve(fixtureRoot, file), "utf8");
      expect(scrub(text).findings).toEqual([]);
      const raw: unknown = JSON.parse(text);
      const streams = Streams.parse(raw);
      for (const agent of ["claude", "codex"] as Agent[]) {
        let seq = 0;
        const events = (streams[agent] ?? []).flatMap((row) =>
          normalise(agent, row.data).map((d) => makeEvent(agent, row.at, seq++, d)),
        );
        for (const event of events) expect(EventSchema.safeParse(event).success).toBe(true);
        if (agent === "claude" && file.includes("11-50"))
          expect(events.filter((e) => e.kind === "edit").map((e) => e.title)).toEqual([
            "<repo>/src.mjs",
            "<repo>/regression.test.mjs",
          ]);
      }
    });
});
describe("captured Codex CLI with an explicitly offline failing provider", () => {
  it("retains actual errors without inventing completed commands", () => {
    const raw: unknown = JSON.parse(
      readFileSync(resolve(fixtureRoot, "codex-offline-provider.json"), "utf8"),
    );
    const fixture = z
      .object({
        source: z.literal("actual-cli-local-provider-failure-no-model"),
        data: z.array(z.unknown()),
      })
      .parse(raw);
    const drafts = fixture.data.flatMap((e) => normalise("codex", e));
    expect(
      drafts.some((e) => e.title.includes("Offline fixture provider deliberately unavailable")),
    ).toBe(true);
    expect(drafts.some((e) => e.kind === "run" || e.kind === "edit")).toBe(false);
  });
});
describe("normaliser boundary and tool semantics", () => {
  it("rejects recognized malformed command envelopes", () =>
    expect(() =>
      normalise("codex", {
        type: "item.completed",
        item: { type: "command_execution", command: 7, exit_code: "zero" },
      }),
    ).toThrow());
  it("ignores unknown future envelopes", () =>
    expect(normalise("codex", { type: "future.metric" })).toEqual([]));
  it("rejects invalid JSON and primitives", () => {
    for (const input of ["{", "null", "[]", "7"]) expect(() => parseLine(input)).toThrow();
  });
  it("classifies shell mutation and compound commands as commands", () => {
    expect(toolKind("command", "node -e 'writeFileSync(...)'")).toBe("run");
    expect(toolKind("command", "cat src.mjs && npm test")).toBe("run");
  });
  it("handles command failure without converting it into success", () => {
    // Contract example, separate from captured fixtures.
    expect(
      normalise("codex", {
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "npm test",
          aggregated_output: "1 failed",
          exit_code: 1,
        },
      }),
    ).toEqual([{ kind: "run", title: "npm test", detail: "1 failed", exitCode: 1 }]);
  });
});
