import { z } from "zod";
import { AgentSchema } from "./schema";
export const ArchiveSchema = z
  .object({
    source: z.literal("derived-from-real-recordings"),
    recordings: z.array(
      z.object({
        id: z.string(),
        file: z.string().regex(/^[A-Za-z0-9.-]+\.json$/),
        title: z.string(),
        challenge: z.string(),
        recordedAt: z.iso.datetime(),
        current: z.boolean(),
        fair: z.boolean(),
        results: z
          .array(
            z.object({
              agent: AgentSchema,
              accepted: z.boolean(),
              agentExit: z.number().int().nullable(),
              verifiedAt: z.number().nullable(),
              error: z.string().optional(),
            }),
          )
          .length(2),
      }),
    ),
  })
  .strict();
