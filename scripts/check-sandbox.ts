/** Offline guard checks. No agent prompt, model call, or race reservation. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { command } from "../src/harness/process";
import { checkClaims, receiptsCli } from "../src/harness/receipts";
import { prepareSandbox } from "../src/harness/sandbox";

const container = await mkdtemp("/private/tmp/agent-race-guard-");
const root = resolve(container, "nested-lane");
await mkdir(root);
const sibling = await mkdtemp("/private/tmp/agent-race-sibling-");
try {
  const repo = resolve(root, "repo");
  await mkdir(repo);
  const initialized = await command("git", ["init", "--quiet"], repo);
  if (initialized.code !== 0) throw new Error("Fixture git init failed");
  await writeFile(
    resolve(repo, "package.json"),
    JSON.stringify({ scripts: { test: "node test.cjs" } }),
  );
  await writeFile(resolve(repo, "test.cjs"), 'console.log("OFFLINE_TOOLCHAIN_OK")');
  await writeFile(resolve(repo, ".gitignore"), ".receipts/\n");
  await writeFile(resolve(repo, "sentinel"), "own fixture");
  await writeFile(resolve(sibling, "sentinel"), "sibling fixture");
  const { profile, env } = await prepareSandbox(root, { verifyAuth: false });
  const exec = (args: string[]) =>
    command("/usr/bin/sandbox-exec", ["-f", profile, ...args], repo, undefined, env);
  const own = await exec(["/bin/cat", resolve(repo, "sentinel")]);
  const other = await exec(["/bin/cat", resolve(sibling, "sentinel")]);
  const write = await exec(["/bin/sh", "-c", "printf ok > local-proof"]);
  const git = await exec(["/bin/sh", "-c", "printf forbidden > .git/index"]);
  const toolchain = await exec([process.execPath, receiptsCli, "run", "--", "npm", "test"]);
  const claims = await checkClaims(repo, "npm test passes.");
  const expected = env.CLAUDE_CODE_TMPDIR === root;
  const result = {
    noModelCalls: true,
    ownRead: own.code === 0,
    ownWrite: write.code === 0,
    siblingReadDenied: /Operation not permitted/.test(other.stderr),
    gitWriteDenied: git.code !== 0,
    claudeTempOverride: expected,
    receiptWrappedNpmTest: toolchain.code === 0,
    receiptVerified: claims[0]?.verdict === "VERIFIED",
  };
  console.log(result);
  if (Object.values(result).some((x) => x !== true)) throw new Error("Sandbox boundary regression");
  await writeFile("shots/sandbox-check.json", `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await Promise.all([
    rm(container, { recursive: true, force: true }),
    rm(sibling, { recursive: true, force: true }),
  ]);
}
