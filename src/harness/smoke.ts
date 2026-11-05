import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { Agent } from "../core/schema";
import { scrub } from "../core/scrub";
import { agentLaunch } from "./args";
import { capture } from "./capture";
import { projectRoot } from "./challenge";
import { command } from "./process";
import { checkClaims, requireReceipts } from "./receipts";
import { prepareSandbox } from "./sandbox";
/** Two tiny provider-backed capability jobs, never a race recording or demo. */
export async function smokeAgents(): Promise<void> {
  const { root: receiptsRoot, cli: receiptsCli } = await requireReceipts();
  const temp = await mkdtemp("/private/tmp/agent-race-smoke-");
  const start = performance.now();
  const clock = () => Math.round(performance.now() - start);
  const paths: Record<string, string> = { [receiptsRoot]: "<receipts>" };
  const prompt =
    "Capability smoke check only.\nRead SMOKE.txt, then run ./verify in this repository. Do not edit any file. Do not read outside this repository or use network tools, subagents or Git operations. Finish with SMOKE_OK only if the command succeeded, followed by an accurate statement of whether npm test passes. Keep this very short.";
  try {
    const prepared = await Promise.all(
      (["claude", "codex"] as Agent[]).map(async (agent) => {
        const root = resolve(temp, agent),
          cwd = resolve(root, "repo");
        await mkdir(cwd, { recursive: true });
        paths[cwd] = "<repo>";
        paths[root] = "<sandbox>";
        const nonce = randomUUID();
        await writeFile(resolve(cwd, "SMOKE.txt"), `agent-race-smoke ${nonce}\n`);
        await writeFile(
          resolve(cwd, "smoke.mjs"),
          `import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';\nimport assert from 'node:assert/strict';\nconst text=readFileSync('SMOKE.txt','utf8');assert.equal(text,${JSON.stringify(`agent-race-smoke ${nonce}\n`)});mkdirSync('.race',{recursive:true});writeFileSync('.race/proof.json',JSON.stringify({nonce:${JSON.stringify(nonce)},answer:3*7,cwd:process.cwd()}));console.log('SMOKE_COMMAND_OK');\n`,
        );
        await writeFile(
          resolve(cwd, "package.json"),
          JSON.stringify({ private: true, type: "module", scripts: { test: "node smoke.mjs" } }),
        );
        await writeFile(resolve(cwd, ".gitignore"), ".receipts/\n.race/\n");
        await writeFile(
          resolve(cwd, "verify"),
          `#!/usr/bin/env node\nimport {spawnSync} from 'node:child_process';const r=spawnSync(process.execPath,[${JSON.stringify(receiptsCli)},'run','--','npm','test'],{stdio:'inherit'});process.exit(r.status??2);\n`,
          { mode: 0o755 },
        );
        const git = await command("git", ["init", "--quiet"], cwd);
        if (git.code !== 0) throw new Error("Smoke git init failed");
        const sandbox = await prepareSandbox(root, { agent, receiptsRoot });
        return { agent, root, cwd, nonce, receiptsRoot, ...sandbox };
      }),
    );
    const results = await Promise.all(
      prepared.map(async (lane) => {
        const launch = agentLaunch(lane.agent, prompt);
        const args = launch.args;
        if (lane.agent === "claude") {
          const index = args.indexOf("--max-budget-usd");
          args[index + 1] = "0.25";
        }
        console.log(`Smoke ${lane.agent}: starting read + command + receipts check.`);
        const run = await capture({ ...lane, ...launch, clock, timeoutMs: 120000 });
        let proof = false;
        try {
          const raw: unknown = JSON.parse(
            await readFile(resolve(lane.cwd, ".race/proof.json"), "utf8"),
          );
          const value = z
            .object({
              nonce: z.literal(lane.nonce),
              answer: z.literal(21),
              cwd: z.literal(lane.cwd),
            })
            .parse(raw);
          proof = value.answer === 21;
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        const claims = await checkClaims(lane.cwd, "npm test passes.", receiptsRoot);
        const readObserved = run.events.some((e) =>
          `${e.title}\n${e.detail ?? ""}`.includes("SMOKE.txt"),
        );
        const passed =
          run.code === 0 && proof && readObserved && claims.some((c) => c.verdict === "VERIFIED");
        console.log(
          `Smoke ${lane.agent}: ${passed ? "PASS" : "FAIL"}; exit ${run.code}; file read ${readObserved}; proof ${proof}; receipt ${claims[0]?.verdict ?? "none"}.`,
        );
        return { agent: lane.agent, passed, proof, readObserved, claims, ...run };
      }),
    );
    const cleaned = scrub(
      JSON.stringify({
        source: "real-cli-capability-smoke-not-a-race",
        recordedAt: new Date().toISOString(),
        results,
      }),
      paths,
    );
    if (cleaned.findings.length)
      throw new Error(`Smoke save blocked: ${cleaned.findings.join(", ")}`);
    await writeFile(resolve(projectRoot, "shots/agent-smoke.json"), `${cleaned.text}\n`);
    if (results.some((r) => !r.passed))
      throw new Error(
        "Agent smoke failed. No race permitted; see scrubbed shots/agent-smoke.json.",
      );
    console.log(
      `Both smoke checks passed; ${cleaned.pathsRedacted} path references redacted; zero scrub findings.`,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
