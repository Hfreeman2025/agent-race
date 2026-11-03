/** Reproduce the Codex input transport fault with a localhost provider: zero model calls. */
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { scrub } from "../src/core/scrub";
import { agentLaunch } from "../src/harness/args";
import { capture } from "../src/harness/capture";
import { challengePrompt, loadChallenge } from "../src/harness/challenge";
import { command } from "../src/harness/process";
import { receiptsRoot } from "../src/harness/receipts";
import { prepareSandbox } from "../src/harness/sandbox";

const temp = await mkdtemp("/private/tmp/agent-race-diagnose-");
let requests = 0;
const server = createServer((_req, res) => {
  requests++;
  res.writeHead(400, { "content-type": "application/json" });
  res.end(
    '{"error":{"message":"Local diagnostic; no model connected","type":"invalid_request_error"}}',
  );
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const { challenge, directory } = await loadChallenge("single-flight");
  const root = resolve(temp, "codex"),
    cwd = resolve(root, "repo");
  await mkdir(root);
  await cp(resolve(directory, "repo"), cwd, { recursive: true });
  await command("git", ["init", "--quiet"], cwd);
  const sandbox = await prepareSandbox(root, { agent: "codex" });
  const prompt = challengePrompt(challenge.contract);
  const launch = agentLaunch("codex", prompt);
  const args = [
    ...launch.args.slice(0, -1),
    "-c",
    'model="offline-fixture"',
    "-c",
    'model_provider="fixture"',
    "-c",
    `model_providers.fixture={name="Local diagnosis",base_url="http://127.0.0.1:${address.port}",env_key="RACE_OFFLINE_API_KEY",wire_api="responses",request_max_retries=0,stream_max_retries=0}`,
    "-",
  ];
  const env = { ...sandbox.env, RACE_OFFLINE_API_KEY: "offline-fixture" };
  const argv = await new Promise<{
    code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
  }>((done, reject) => {
    const p = spawn(
      "/usr/bin/sandbox-exec",
      ["-f", sandbox.profile, "codex", ...args.slice(0, -1), prompt],
      { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      if (p.pid) process.kill(-p.pid, "SIGKILL");
    }, 60000);
    p.stdout.on("data", (d) => {
      stdout += String(d);
    });
    p.stderr.on("data", (d) => {
      stderr += String(d);
    });
    p.on("error", reject);
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr });
    });
  });
  const start = performance.now();
  const stdin = await capture({
    agent: "codex",
    root,
    cwd,
    ...sandbox,
    args,
    input: prompt,
    env,
    clock: () => Math.round(performance.now() - start),
    timeoutMs: 60000,
  });
  const report = {
    source: "actual-cli-loopback-diagnostic-no-model",
    recordedAt: new Date().toISOString(),
    requests,
    argv,
    stdin,
  };
  const cleaned = scrub(JSON.stringify(report), {
    [cwd]: "<repo>",
    [root]: "<sandbox>",
    [receiptsRoot]: "<receipts>",
  });
  if (cleaned.findings.length) throw new Error("Diagnostic privacy check failed");
  await writeFile("shots/codex-startup-diagnostic.json", `${cleaned.text}\n`);
  console.log({
    argvExit: argv.code,
    argvSignal: argv.signal,
    argvOutputBytes: argv.stdout.length + argv.stderr.length,
    stdinExit: stdin.code,
    stdinSignal: stdin.signal,
    stdinEvents: stdin.raw.length,
    loopbackRequests: requests,
  });
  if (stdin.raw.length === 0 || stdin.signal !== null || requests === 0)
    throw new Error("Supported stdin transport did not reach the offline provider");
} finally {
  server.close();
  await rm(temp, { recursive: true, force: true });
}
