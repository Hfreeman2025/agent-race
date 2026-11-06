import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { AgentSchema, ClaimSchema } from "../core/schema";
import { projectRoot } from "./challenge";
export const SmokeProofSchema = z
  .object({
    source: z.literal("real-cli-capability-smoke-not-a-race"),
    recordedAt: z.iso.datetime(),
    results: z
      .array(
        z.object({
          agent: AgentSchema,
          passed: z.literal(true),
          proof: z.literal(true),
          readObserved: z.literal(true),
          code: z.literal(0),
          claims: z
            .array(ClaimSchema)
            .min(1)
            .refine((claims) => claims.every((c) => c.verdict === "VERIFIED")),
        }),
      )
      .length(2),
  })
  .superRefine((r, ctx) => {
    if (new Set(r.results.map((x) => x.agent)).size !== 2)
      ctx.addIssue({ code: "custom", message: "Both agents must pass smoke" });
  });
export function validateSmokeProof(value: unknown, now = Date.now()): void {
  const proof = SmokeProofSchema.parse(value);
  const age = now - Date.parse(proof.recordedAt);
  if (age < 0 || age > 24 * 60 * 60 * 1000)
    throw new Error("Smoke proof expired; run agent-race smoke before recording.");
}
export async function requireSuccessfulSmoke(): Promise<void> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(resolve(projectRoot, ".cache/agent-smoke.json"), "utf8"),
    );
    validateSmokeProof(raw);
  } catch (error) {
    throw new Error(
      "A fresh successful read + command + receipts smoke is required for both agents. Run agent-race smoke.",
      { cause: error },
    );
  }
}
