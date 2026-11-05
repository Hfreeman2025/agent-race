import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { type Agent, type RaceEvent, type Recording, RecordingSchema } from "../core/schema";
import { scrub } from "../core/scrub";
import { mergeTimeline } from "../core/timeline";
import { agentLaunch } from "./args";
import { capture } from "./capture";
import { challengePrompt, loadChallenge, projectRoot } from "./challenge";
import { command } from "./process";
import { requireSuccessfulSmoke } from "./readiness";
import { checkClaims, requireReceipts } from "./receipts";
import { prepareSandbox } from "./sandbox";

const agents: Agent[] = ["claude", "codex"];
export const RACE_LIMIT = 4; // Two initial attempts, plus two explicitly authorised on 1 November 2026.
const attemptSchema = z.object({ started: z.number().int().min(0).max(RACE_LIMIT) }).strict();
export async function reserveAttempt(
  dir = resolve(projectRoot, ".race"),
  limit = RACE_LIMIT,
): Promise<void> {
  z.number().int().min(1).max(RACE_LIMIT).parse(limit);
  await mkdir(dir, { recursive: true });
  const lock = resolve(dir, "attempt.lock");
  await mkdir(lock).catch(() => {
    throw new Error("A race is already running, or a stale .race/attempt.lock needs inspection.");
  });
  try {
    let started = 0;
    try {
      const raw: unknown = JSON.parse(await readFile(resolve(dir, "attempts.json"), "utf8"));
      started = attemptSchema.parse(raw).started;
    } catch (e) {
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
    }
    if (started >= limit)
      throw new Error(
        `Race model budget exhausted (${limit} attempts). Replay the bundled recording; no agents started.`,
      );
    await writeFile(resolve(dir, "attempts.json"), JSON.stringify({ started: started + 1 }));
  } finally {
    await rm(lock, { recursive: true });
  }
}
export async function runRace(id: string): Promise<Recording> {
  const { challenge, directory } = await loadChallenge(id);
  const { root: receiptsRoot, cli: receiptsCli } = await requireReceipts();
  await requireSuccessfulSmoke();
  const temp = await mkdtemp("/private/tmp/agent-race-");
  try {
    const lanes = await Promise.all(
      agents.map(async (agent) => {
        const root = resolve(temp, agent);
        const cwd = resolve(root, "repo");
        await mkdir(root);
        await cp(resolve(directory, "repo"), cwd, { recursive: true });
        await writeFile(resolve(cwd, "CHALLENGE.md"), `${challenge.contract}\n`);
        const verificationScript = `#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nconst r=spawnSync(process.execPath,[${JSON.stringify(receiptsCli)},'run','--','npm','test'],{stdio:'inherit'});\nprocess.exit(r.status??2);\n`;
        await writeFile(resolve(cwd, "verify"), verificationScript, { mode: 0o755 });
        const git = await command("git", ["init", "--quiet"], cwd);
        if (git.code !== 0) throw new Error(`git init failed: ${git.stderr}`);
        const sandbox = await prepareSandbox(root, { agent, receiptsRoot });
        return { agent, root, cwd, verificationScript, receiptsRoot, ...sandbox };
      }),
    );
    const prompt = challengePrompt(challenge.contract);
    const launches = { claude: agentLaunch("claude", prompt), codex: agentLaunch("codex", prompt) };
    const commands = { claude: launches.claude.args, codex: launches.codex.args };
    await reserveAttempt();
    const recordedAt = new Date().toISOString();
    const start = performance.now();
    const clock = () => Math.round(performance.now() - start);
    const results: Recording["results"] = [];
    const events: RaceEvent[] = [];
    const raw: Record<string, unknown> = {};
    console.log(`Starting ${challenge.id}: two isolated lanes; 240 s maximum each. No retries.`);
    const completed = await Promise.allSettled(
      lanes.map(async (lane) => {
        const captured = await capture({ ...lane, ...launches[lane.agent], clock });
        if (
          captured.error?.startsWith("Invalid agent stream") ||
          captured.error?.includes("exceeded")
        )
          throw new Error(captured.error);
        const finishedAt = clock();
        events.push(...captured.events);
        raw[lane.agent] = captured.raw;
        const final = captured.events
          .filter((e) => e.kind === "claim" || e.kind === "message")
          .at(-1);
        const claims = await checkClaims(
          lane.cwd,
          final?.detail ?? final?.title ?? "",
          receiptsRoot,
        );
        for (const file of ["src.mjs", "package.json", "visible.test.mjs", ".gitignore"])
          if ((await lstat(resolve(lane.cwd, file))).isSymbolicLink())
            throw new Error("Challenge symlink rejected before acceptance");
        let integrity = true;
        for (const file of ["package.json", "visible.test.mjs", ".gitignore"])
          if (
            (await readFile(resolve(lane.cwd, file), "utf8")) !==
            (await readFile(resolve(directory, "repo", file), "utf8"))
          )
            integrity = false;
        const verifyStat = await lstat(resolve(lane.cwd, "verify"));
        if (
          verifyStat.isSymbolicLink() ||
          (await readFile(resolve(lane.cwd, "verify"), "utf8")) !== lane.verificationScript
        )
          integrity = false;
        // Hidden source never enters either lane until that agent has fully exited.
        await cp(
          resolve(directory, "acceptance.test.mjs"),
          resolve(lane.cwd, ".acceptance.test.mjs"),
        );
        const acceptance = await command(
          "/usr/bin/sandbox-exec",
          ["-f", lane.profile, process.execPath, "--test", ".acceptance.test.mjs"],
          lane.cwd,
          undefined,
          lane.env,
        );
        const acceptanceExit = integrity ? acceptance.code : 2;
        const accepted = acceptanceExit === 0;
        const at = clock();
        const output = integrity
          ? acceptance.stdout + acceptance.stderr
          : "Challenge integrity failed: protected test or package was changed.";
        events.push({
          id: `${lane.agent}-acceptance`,
          agent: lane.agent,
          at,
          seq: captured.events.length + 1000,
          kind: "run",
          phase: "acceptance",
          title: "Hidden acceptance tests",
          detail: output,
          exitCode: acceptanceExit,
        });
        results.push({
          agent: lane.agent,
          agentExit: captured.code,
          signal: captured.signal,
          stderr: captured.stderr,
          finishedAt,
          verifiedAt: accepted ? at : null,
          accepted,
          acceptanceExit,
          output,
          claims,
          ...(captured.error ? { error: captured.error } : {}),
        });
        console.log(
          `${lane.agent}: ${accepted ? "ACCEPTED" : "NOT ACCEPTED"} at ${(at / 1000).toFixed(2)} s; ${claims.length} final claim(s).`,
        );
      }),
    );
    const rejected = completed.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected")
      throw new Error("Race capture failed; no recording saved", { cause: rejected.reason });
    const duration = clock();
    const base = {
      version: 1,
      id: `${id}-${recordedAt.replace(/[:.]/g, "-")}`,
      challenge: id,
      title: challenge.title,
      description: challenge.description,
      recordedAt,
      duration,
      prompt,
      source: "real-cli-recording",
      commands,
      events: mergeTimeline(events),
      results: results.sort((a, b) => a.agent.localeCompare(b.agent)),
      scrub: { passed: true, pathsRedacted: 0, findings: [] },
    };
    const paths: Record<string, string> = { [receiptsRoot]: "<receipts>" };
    for (const lane of lanes) {
      paths[lane.cwd] = "<repo>";
      paths[lane.root] = "<sandbox>";
    }
    const clean = scrub(JSON.stringify({ recording: base, raw }), paths);
    console.log(
      `Scrub: ${clean.pathsRedacted} known paths redacted; ${clean.findings.length} finding(s).`,
    );
    if (clean.findings.length)
      throw new Error(
        `Recording save blocked: ${clean.findings.join(", ")}. No recording or streams saved.`,
      );
    const parsed = z
      .object({ recording: z.unknown(), raw: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(clean.text));
    const recording = RecordingSchema.parse(parsed.recording);
    recording.scrub.pathsRedacted = clean.pathsRedacted;
    const outputDir = resolve(projectRoot, "public/recordings");
    await mkdir(outputDir, { recursive: true });
    const file = resolve(outputDir, `${recording.id}.json`);
    const payload = `${JSON.stringify(recording, null, 2)}\n`;
    await writeFile(`${file}.tmp`, payload, { flag: "wx" });
    await rename(`${file}.tmp`, file);
    await writeFile(resolve(outputDir, "demo.json"), payload);
    await mkdir(resolve(projectRoot, "tests/fixtures"), { recursive: true });
    await writeFile(
      resolve(projectRoot, "tests/fixtures", `${recording.id}.streams.json`),
      `${JSON.stringify(parsed.raw, null, 2)}\n`,
    );
    console.log(
      `Saved public/recordings/${recording.id}.json and demo.json. Temporary workspaces removed.`,
    );
    return recording;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
