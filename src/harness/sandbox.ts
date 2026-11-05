import { mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { Agent } from "../core/schema";
import { command } from "./process";
import { resolveReceiptsRoot } from "./receipts";

const quote = (s: string) => JSON.stringify(s);
/** macOS seatbelt is mandatory: agents cannot read the home tree or write outside their temp root. */
export async function prepareSandbox(
  root: string,
  options: { verifyAuth?: boolean; agent?: Agent; receiptsRoot?: string } = {},
): Promise<{ profile: string; env: NodeJS.ProcessEnv }> {
  if (process.platform !== "darwin")
    throw new Error(
      "Real races currently require macOS sandbox-exec; viewer and offline tests are portable.",
    );
  const receiptsRoot = resolveReceiptsRoot(options.receiptsRoot);
  const home = homedir();
  const claude = resolve(root, ".claude");
  const codex = resolve(root, "codex-home");
  await Promise.all([mkdir(claude, { recursive: true }), mkdir(codex, { recursive: true })]);
  // The CLIs, never this harness, consume the existing provider credential files.
  await symlink(resolve(home, ".codex/auth.json"), resolve(codex, "auth.json"));
  await symlink(resolve(home, ".claude/.credentials.json"), resolve(claude, ".credentials.json"));
  const profile = resolve(root, "agent.sb");
  const parents: string[] = [];
  for (let parent = dirname(root); parent.startsWith("/private/tmp/"); parent = dirname(parent))
    parents.push(parent);
  // Node canonicalizes the receipts entry point one ancestor at a time. Metadata is
  // required; directory contents outside the explicitly allowed trees stay denied.
  for (let parent = dirname(receiptsRoot); parent !== "/"; parent = dirname(parent))
    parents.push(parent);
  const metadata = [...new Set(parents)].map((path) => `(literal ${quote(path)})`).join(" ");
  const policy = `(version 1)\n(allow default)\n(deny file-read* (subpath "/Users"))\n(deny file-read* (subpath "/private/tmp") (subpath "/tmp"))\n(allow file-read-metadata (literal "/private/tmp") (literal "/tmp") ${metadata})\n(deny file-write*)\n(allow file-write* (subpath ${quote(root)}) (literal "/dev/null") (literal "/dev/tty"))\n(allow file-read* (subpath ${quote(root)}) (subpath ${quote(receiptsRoot)}) (literal ${quote(resolve(home, ".codex/auth.json"))}) (literal ${quote(resolve(home, ".claude/.credentials.json"))}) (literal ${quote(resolve(home, ".claude.json"))}) (subpath ${quote(resolve(home, "Library/Keychains"))}) (literal ${quote(resolve(home, "Library/Preferences/com.apple.security.plist"))}))\n`;
  await writeFile(
    profile,
    `${policy}\n(deny file-write* (subpath ${quote(resolve(root, "repo/.git"))}))\n`,
  );
  const probe = await command(
    "/usr/bin/sandbox-exec",
    ["-f", profile, "/bin/cat", new URL("../../SPEC.md", import.meta.url).pathname],
    root,
  );
  if (!/Operation not permitted/.test(probe.stderr))
    throw new Error("Home-read sandbox probe did not fail closed");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: options.agent === "codex" ? root : home,
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    TMPDIR: root,
    XDG_CONFIG_HOME: resolve(root, ".config"),
    XDG_CACHE_HOME: resolve(root, ".cache"),
    XDG_STATE_HOME: resolve(root, ".state"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ATTR_NOSYSTEM: "1",
    CODEX_HOME: codex,
    CLAUDE_CODE_TMPDIR: root,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
    npm_config_cache: resolve(root, "npm-cache"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    TERM: "dumb",
  };
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"])
    if (process.env[key]) env[key] = process.env[key];
  if (options.verifyAuth === false) return { profile, env };
  if (options.agent !== "codex") {
    const status = await command(
      "/usr/bin/sandbox-exec",
      ["-f", profile, "claude", "auth", "status"],
      root,
      undefined,
      env,
    );
    const auth: unknown = JSON.parse(status.stdout);
    if (!auth || typeof auth !== "object" || !("loggedIn" in auth) || auth.loggedIn !== true)
      throw new Error("Claude existing authentication unavailable in sandbox. No model started.");
  }
  if (options.agent !== "claude") {
    const status = await command(
      "/usr/bin/sandbox-exec",
      ["-f", profile, "codex", "login", "status"],
      root,
      undefined,
      env,
    );
    if (status.code !== 0 || !/logged in/i.test(status.stdout + status.stderr))
      throw new Error(
        `Codex authentication preflight failed (exit ${status.code}, signal ${status.signal}): ${status.stderr.split(root).join("<sandbox>")}`,
      );
  }
  return { profile, env };
}
