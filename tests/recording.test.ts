import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RecordingSchema } from "../src/core/schema";
import { scrub } from "../src/core/scrub";
import { mergeTimeline } from "../src/core/timeline";

const data: unknown = JSON.parse(readFileSync("public/recordings/demo.json", "utf8"));
const recording = RecordingSchema.parse(data);
describe("bundled immutable race evidence", () => {
  for (const file of readdirSync("public/recordings").filter((x) => x.endsWith(".json")))
    it(`${file} validates and passes the save scrub`, () => {
      const text = readFileSync(`public/recordings/${file}`, "utf8");
      expect(scrub(text).findings).toEqual([]);
      const raw: unknown = JSON.parse(text);
      const value = RecordingSchema.parse(raw);
      expect(value.events).toEqual(mergeTimeline(value.events));
      expect(value.source).toBe("real-cli-recording");
    });
  it("rejects fabricated timestamps, duplicate event IDs and contradictory outcomes", () => {
    expect(RecordingSchema.safeParse({ ...recording, duration: 0 }).success).toBe(false);
    expect(RecordingSchema.safeParse({ ...recording, duration: 1.5 }).success).toBe(false);
    const event = recording.events[0];
    expect(event).toBeDefined();
    expect(RecordingSchema.safeParse({ ...recording, events: [event, event] }).success).toBe(false);
    expect(
      RecordingSchema.safeParse({
        ...recording,
        events: [{ ...event, at: recording.duration + 1 }],
      }).success,
    ).toBe(false);
    expect(
      RecordingSchema.safeParse({
        ...recording,
        results: recording.results.map((r) => ({ ...r, accepted: true, verifiedAt: null })),
      }).success,
    ).toBe(false);
  });
  it("does not turn a startup failure into a verified finish", () => {
    const historical: unknown = JSON.parse(
      readFileSync("public/recordings/unicode-slug-2026-11-01T11-50-08-213Z.json", "utf8"),
    );
    const codex = RecordingSchema.parse(historical).results.find((r) => r.agent === "codex");
    expect(codex?.accepted).toBe(false);
    expect(codex?.verifiedAt).toBe(null);
    expect(codex?.error).toContain("SIGKILL");
  });
});
it("the default is the original fair recording with successful agent tests in both lanes", () => {
  expect(recording.challenge).toBe("single-flight");
  for (const result of recording.results) {
    expect(result.agentExit).toBe(0);
    expect(result.accepted).toBe(true);
    expect(result.acceptanceExit).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("pass 5");
    expect(
      recording.events.some(
        (event) =>
          event.agent === result.agent &&
          event.phase === "agent" &&
          event.kind === "run" &&
          event.title.includes("./verify") &&
          event.exitCode === 0,
      ),
    ).toBe(true);
    expect(
      recording.events.some(
        (event) => event.agent === result.agent && event.kind === "edit" && Boolean(event.diff),
      ),
    ).toBe(true);
  }
  expect(readFileSync("public/recordings/demo.json", "utf8")).toBe(
    readFileSync(`public/recordings/${recording.id}.json`, "utf8"),
  );
});
