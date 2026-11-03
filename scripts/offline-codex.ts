/** CLI parser fixture only. Local HTTP failure, zero model calls, never a demo recording. */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { scrub } from "../src/core/scrub";
import { prepareSandbox } from "../src/harness/sandbox";

const temp = await mkdtemp("/private/tmp/agent-race-offline-");
const server = createServer((_req, res) => {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: {
        message: "Offline fixture provider deliberately unavailable",
        type: "invalid_request_error",
      },
    }),
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local address");
  const { profile, env } = await prepareSandbox(temp);
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "-c",
    "features.memories=false",
    "-c",
    "features.skills=false",
    "-c",
    'model="offline-fixture"',
    "-c",
    'model_provider="fixture"',
    "-c",
    `model_providers.fixture={name="Local offline test",base_url="http://127.0.0.1:${address.port}",env_key="RACE_OFFLINE_API_KEY",wire_api="responses",request_max_retries=0,stream_max_retries=0}`,
    "Offline parser fixture; the local provider always fails.",
  ];
  const output = await new Promise<string>((resolve, reject) => {
    const p = spawn("/usr/bin/sandbox-exec", ["-f", profile, "codex", ...args], {
      cwd: temp,
      env: { ...env, RACE_OFFLINE_API_KEY: "offline-fixture" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 20000);
    p.stdout.on("data", (d) => {
      out += String(d);
    });
    p.stderr.on("data", (d) => {
      err += String(d);
    });
    p.on("error", reject);
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      console.log({ code, signal, stderr: err.replaceAll(temp, "<sandbox>") });
      resolve(out);
    });
  });
  const clean = scrub(output, { [temp]: "<repo>" });
  if (clean.findings.length) throw new Error("Unsafe fixture");
  if (clean.text.trim()) {
    const data = clean.text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    await writeFile(
      "tests/fixtures/codex-offline-provider.json",
      JSON.stringify({ source: "actual-cli-local-provider-failure-no-model", data }, null, 2) +
        "\n",
    );
    console.log(data);
  }
} finally {
  server.close();
  await rm(temp, { recursive: true, force: true });
}
