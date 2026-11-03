import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";
export interface Output {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}
/** Bounded, argv-only execution. Never treats a timeout or spawn failure as success. */
export function command(
  executable: string,
  args: string[],
  cwd: string,
  input?: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 15000,
): Promise<Output> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_ATTR_NOSYSTEM: "1",
        XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? resolvePath(cwd, ".race/config"),
      },
    });
    let stdout = "",
      stderr = "";
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill("SIGKILL");
      reject(new Error(`${executable} timed out`));
    }, timeoutMs);
    const collect = (stream: "stdout" | "stderr", data: Buffer) => {
      if (stream === "stdout") stdout += data.toString();
      else stderr += data.toString();
      if (stdout.length + stderr.length > 2_000_000) {
        failed = true;
        child.kill("SIGKILL");
        reject(new Error("Subprocess output limit exceeded"));
      }
    };
    child.stdout.on("data", (d: Buffer) => collect("stdout", d));
    child.stderr.on("data", (d: Buffer) => collect("stderr", d));
    child.on("error", (e) => {
      clearTimeout(timer);
      failed = true;
      reject(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (!failed) resolve({ code, signal, stdout, stderr });
    });
    child.stdin.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code !== "EPIPE") reject(e);
    });
    child.stdin.end(input);
  });
}
