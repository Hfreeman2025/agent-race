import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { ClaimSchema } from "../core/schema";
import { command } from "./process";
export function resolveReceiptsRoot(configured?: string): string {
  return resolve(configured?.trim() || resolve(homedir(), "Personal/oss/receipts"));
}
export const receiptsRoot = resolveReceiptsRoot(process.env.RECEIPTS_PATH);
export const receiptsCli = resolve(receiptsRoot, "dist/cli.js");
export async function requireReceipts(): Promise<void> {
  try {
    await access(receiptsCli);
  } catch {
    throw new Error(
      "Local receipts build missing. Set RECEIPTS_PATH to its built repository. No race started.",
    );
  }
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
): Promise<z.infer<typeof ClaimSchema>[]> {
  const output = await command(process.execPath, [receiptsCli, "check", "--json", "-"], cwd, text);
  if (output.code !== 0) throw new Error(`Receipts check failed: ${output.stderr}`);
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
