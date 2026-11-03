import { z } from "zod";
export const AgentSchema = z.enum(["claude", "codex"]);
export type Agent = z.infer<typeof AgentSchema>;
export const ClaimSchema = z
  .object({
    text: z.string(),
    verdict: z.enum(["VERIFIED", "STALE", "FAILED", "UNBACKED"]),
    reason: z.string(),
    receiptId: z.string().optional(),
    originalVerdict: z.string().optional(),
  })
  .strict();
export const EventSchema = z
  .object({
    id: z.string().min(1),
    agent: AgentSchema,
    at: z.number().finite().nonnegative(),
    seq: z.number().int().nonnegative(),
    kind: z.enum(["read", "search", "edit", "run", "claim", "message"]),
    title: z.string().min(1),
    detail: z.string().optional(),
    diff: z.string().optional(),
    exitCode: z.number().int().nullable().optional(),
    claims: z.array(ClaimSchema).optional(),
    phase: z.enum(["agent", "acceptance"]).default("agent"),
  })
  .strict();
export type RaceEvent = z.infer<typeof EventSchema>;
export const ResultSchema = z
  .object({
    agent: AgentSchema,
    agentExit: z.number().int().nullable(),
    signal: z.string().nullable().optional(),
    stderr: z.string().optional(),
    finishedAt: z.number().nonnegative(),
    verifiedAt: z.number().nonnegative().nullable(),
    accepted: z.boolean(),
    acceptanceExit: z.number().int().nullable(),
    output: z.string(),
    claims: z.array(ClaimSchema),
    error: z.string().optional(),
  })
  .strict();
export const RecordingSchema = z
  .object({
    version: z.literal(1),
    id: z.string(),
    challenge: z.string(),
    title: z.string(),
    description: z.string(),
    recordedAt: z.iso.datetime(),
    duration: z.number().int().positive(),
    prompt: z.string(),
    source: z.literal("real-cli-recording"),
    commands: z.object({ claude: z.array(z.string()), codex: z.array(z.string()) }),
    events: z.array(EventSchema),
    results: z.array(ResultSchema).length(2),
    scrub: z.object({
      passed: z.literal(true),
      pathsRedacted: z.number().int().nonnegative(),
      findings: z.array(z.string()).length(0),
    }),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    for (const e of r.events) {
      if (ids.has(e.id) || e.at > r.duration)
        ctx.addIssue({ code: "custom", message: "Duplicate event or event beyond duration" });
      ids.add(e.id);
    }
    if (new Set(r.results.map((x) => x.agent)).size !== 2)
      ctx.addIssue({ code: "custom", message: "Both agents required" });
    for (let i = 1; i < r.events.length; i++) {
      const previous = r.events[i - 1];
      const current = r.events[i];
      if (previous && current && current.at < previous.at)
        ctx.addIssue({ code: "custom", message: "Timeline out of order" });
    }
    for (const result of r.results) {
      if (
        result.accepted !== (result.acceptanceExit === 0) ||
        result.accepted !== (result.verifiedAt !== null) ||
        result.finishedAt > r.duration ||
        (result.verifiedAt !== null &&
          (result.verifiedAt < result.finishedAt || result.verifiedAt > r.duration))
      )
        ctx.addIssue({ code: "custom", message: "Acceptance evidence inconsistent" });
    }
  });
export type Recording = z.infer<typeof RecordingSchema>;
