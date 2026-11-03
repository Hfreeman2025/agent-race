import { expect, it } from "vitest";
import { agentLaunch } from "../src/harness/args";
import { challengePrompt } from "../src/harness/challenge";

it("transports the exact same multiline prompt through supported CLI interfaces", () => {
  const prompt = challengePrompt("Concurrent misses must share one load.");
  expect(prompt).toContain("\n");
  const claude = agentLaunch("claude", prompt),
    codex = agentLaunch("codex", prompt);
  expect(claude.args.at(-1)).toBe(prompt);
  expect(claude.input).toBeUndefined();
  expect(codex.args.at(-1)).toBe("-");
  expect(codex.input).toBe(prompt);
  expect(codex.args).not.toContain(prompt);
  expect(codex.args).toContain("--json");
  expect(codex.args).toContain("--ephemeral");
  expect(claude.args).toContain("--safe-mode");
});
