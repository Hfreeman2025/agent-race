import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const ChallengeId = z.enum(["unicode-slug", "date-window", "single-flight"]);
export const ChallengeSchema = z
  .object({ id: ChallengeId, title: z.string(), description: z.string(), contract: z.string() })
  .strict();
export async function loadChallenge(value: string) {
  const id = ChallengeId.parse(value);
  const directory = resolve(projectRoot, "challenges", id);
  const raw: unknown = JSON.parse(await readFile(resolve(directory, "challenge.json"), "utf8"));
  return { challenge: ChallengeSchema.parse(raw), directory };
}
export function challengePrompt(contract: string): string {
  return `Fix the bug in src.mjs in this fresh, isolated toy repository.\n\nContract: ${contract}\n\nBoth agents receive this exact prompt. Inspect the source and visible test. Fix only src.mjs; you may add a regression.test.mjs. Leave package.json, visible.test.mjs, verify, .gitignore and .git untouched. Run ./verify before finishing: it runs npm test through receipts. Also run any regression test you add. Finish with a short explanation and explicit, accurate verification claims. Work only inside this repository. Do not read home directories, configuration, credentials, memory, logs, session history or other repositories. No network calls, dependencies, subagents, commits, pushes or publishing. Hidden acceptance tests run after you exit; do not search for them. Keep the work focused.`;
}
