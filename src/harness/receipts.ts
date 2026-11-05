import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { ClaimSchema } from "../core/schema";
import { command } from "./process";
export function resolveReceiptsRoot(
  configured?: string,
  env: Partial<Pick<NodeJS.ProcessEnv, "RECEIPTS_ROOT" | "RECEIPTS_PATH">> = process.env,
): string {
  const root = configured?.trim() || env.RECEIPTS_ROOT?.trim() || env.RECEIPTS_PATH?.trim();
  if (!root)
    throw new Error(
      "Receipts is not configured. Set RECEIPTS_ROOT to its built checkout (RECEIPTS_PATH is a legacy alias). No race started.",
    );
  return resolve(root);
}
export async function requireReceipts(configured?: string): Promise<{ root: string; cli: string }> {
  const root = resolveReceiptsRoot(configured);
  const cli = resolve(root, "dist/cli.js");
  try {
    await access(cli);
  } catch {
    throw new Error(
      `Local receipts build missing at ${cli}. Set RECEIPTS_ROOT to its built checkout. No race started.`,
    );
  }
  return { root, cli };
}
const CheckSchema = z.object({
  results: z.array(
    z.object({
      claim: z.object({ text: z.string() }),
      verdict: z.enum(["VERIFIED", "STALE", "FAILED", "UNBACKED", "MISMATCH", "VAGUE"]),
      reason: z.string(),
      receiptId: z.string().optional(),
    }),
  ),
});
export async function checkClaims(
  cwd: string,
  text: string,
  configuredRoot?: string,
): Promise<z.infer<typeof ClaimSchema>[]> {
  const { cli: receiptsCli } = await requireReceipts(configuredRoot);
  const output = await command(process.execPath, [receiptsCli, "check", "--json", "-"], cwd, text);
  if (output.code !== 0)
    throw new Error(
      `Receipts check failed (exit ${output.code ?? output.signal}): ${output.stderr || output.stdout}`,
    );
  const raw: unknown = JSON.parse(output.stdout);
  const checked = CheckSchema.parse(raw);
  return checked.results.map((r) =>
    ClaimSchema.parse({
      text: r.claim.text,
      verdict: ["MISMATCH", "VAGUE"].includes(r.verdict) ? "UNBACKED" : r.verdict,
      reason: r.reason,
      ...(r.receiptId ? { receiptId: r.receiptId } : {}),
      ...(["MISMATCH", "VAGUE"].includes(r.verdict) ? { originalVerdict: r.verdict } : {}),
    }),
  );
}
