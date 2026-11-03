import { expect, it } from "vitest";
import { validateSmokeProof } from "../src/harness/readiness";

const now = Date.parse("2026-11-01T13:00:00Z");
const proof = {
  source: "real-cli-capability-smoke-not-a-race",
  recordedAt: "2026-11-01T12:00:00Z",
  results: ["claude", "codex"].map((agent) => ({
    agent,
    passed: true,
    proof: true,
    readObserved: true,
    code: 0,
    claims: [{ text: "npm test passes", verdict: "VERIFIED", reason: "Same fingerprint" }],
  })),
};
it("requires successful real-command capability proof for both agents", () => {
  expect(() => validateSmokeProof(proof, now)).not.toThrow();
  for (const change of [
    { passed: false },
    { proof: false },
    { readObserved: false },
    { code: 1 },
    { claims: [] },
  ])
    expect(() =>
      validateSmokeProof(
        { ...proof, results: [proof.results[0], { ...proof.results[1], ...change }] },
        now,
      ),
    ).toThrow();
  expect(() =>
    validateSmokeProof({ ...proof, results: [proof.results[0], proof.results[0]] }, now),
  ).toThrow();
});
it("rejects stale and future smoke proofs", () => {
  expect(() => validateSmokeProof(proof, now + 25 * 3600000)).toThrow("expired");
  expect(() => validateSmokeProof(proof, now - 2 * 3600000)).toThrow("expired");
});
