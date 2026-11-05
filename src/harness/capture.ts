import { spawn } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { makeEvent, normalise, parseLine } from "../core/normalise";
import type { Agent, RaceEvent } from "../core/schema";
import { StreamLines } from "./lines";
import { checkClaims } from "./receipts";

function snapshot(root: string): Map<string, string> {
  const result = new Map<string, string>();
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules" || name === "verify") continue;
      const path = resolve(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Symlinks are not allowed in a challenge");
      if (stat.isDirectory()) walk(path);
      else if (stat.size < 131072 && result.size < 100)
        result.set(relative(root, path), readFileSync(path, "utf8"));
      else throw new Error("Challenge snapshot limit exceeded");
    }
  }
  walk(root);
  return result;
}
export async function capture(options: {
  agent: Agent;
  cwd: string;
  root: string;
  profile: string;
  env: NodeJS.ProcessEnv;
  args: string[];
  input?: string;
  clock: () => number;
  timeoutMs?: number;
  receiptsRoot?: string;
}): Promise<{
  events: RaceEvent[];
  raw: { at: number; data: unknown }[];
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  error?: string;
}> {
  const { agent, cwd, profile, env, args, clock } = options;
  let before = snapshot(cwd);
  const events: RaceEvent[] = [];
  const raw: { at: number; data: unknown }[] = [];
  let sequence = 0;
  const lines = new StreamLines();
  let stderr = "";
  let bytes = 0;
  let error: string | undefined;
  const pending = new Map<string, RaceEvent>();
  let queue = Promise.resolve();
  const receive = async (line: string, at: number) => {
    const data = parseLine(line);
    raw.push({ at, data });
    const root = z.record(z.string(), z.unknown()).parse(data);
    const drafts = normalise(agent, data);
    const toolIds: string[] = [];
    if (agent === "claude" && root.type === "assistant") {
      const message = z
        .object({ content: z.array(z.record(z.string(), z.unknown())) })
        .parse(root.message);
      for (const b of message.content)
        if (b.type === "tool_use" && typeof b.id === "string") toolIds.push(b.id);
    }
    for (const draft of drafts) {
      const event = makeEvent(agent, at, sequence++, draft);
      if (event.kind === "message") {
        const claims = await checkClaims(cwd, event.detail ?? event.title, options.receiptsRoot);
        if (claims.length) {
          event.kind = "claim";
          event.claims = claims;
        }
      }
      if (event.kind !== "message" && event.kind !== "claim") {
        const after = snapshot(cwd);
        const diffs: string[] = [];
        for (const file of new Set([...before.keys(), ...after.keys()])) {
          if (before.get(file) !== after.get(file))
            diffs.push(
              createTwoFilesPatch(file, file, before.get(file) ?? "", after.get(file) ?? ""),
            );
        }
        if (diffs.length) {
          if (event.kind === "edit") event.diff = diffs.join("\n");
          else
            events.push(
              makeEvent(agent, at, sequence++, {
                kind: "edit",
                title: "Working tree changed",
                diff: diffs.join("\n"),
              }),
            );
        }
        before = after;
      }
      const toolId =
        event.kind !== "message" && event.kind !== "claim" ? toolIds.shift() : undefined;
      if (toolId) pending.set(toolId, event);
      events.push(event);
    }
    if (agent === "claude" && root.type === "user") {
      const message = z
        .object({ content: z.array(z.record(z.string(), z.unknown())) })
        .parse(root.message);
      for (const b of message.content)
        if (b.type === "tool_result") {
          const event = pending.get(typeof b.tool_use_id === "string" ? b.tool_use_id : "");
          if (!event) continue;
          event.at = at;
          const content = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
          if (content) event.detail = content;
          if (event.kind === "run") {
            const code = /Exit code[: ]+(\d+)/i.exec(content ?? "");
            event.exitCode = b.is_error === true ? (code ? Number(code[1]) : null) : 0;
          }
          const after = snapshot(cwd);
          const diffs: string[] = [];
          for (const file of new Set([...before.keys(), ...after.keys()]))
            if (before.get(file) !== after.get(file))
              diffs.push(
                createTwoFilesPatch(file, file, before.get(file) ?? "", after.get(file) ?? ""),
              );
          if (diffs.length) {
            if (event.kind === "edit") event.diff = diffs.join("\n");
            else
              events.push(
                makeEvent(agent, at, sequence++, {
                  kind: "edit",
                  title: "Working tree changed",
                  diff: diffs.join("\n"),
                }),
              );
          }
          before = after;
        }
    }
  };
  return new Promise((resolveResult, reject) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-f", profile, agent, ...args], {
      cwd,
      env,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(options.input);
    const stop = (reason: string) => {
      error = reason;
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (e) {
          if (!(e instanceof Error && "code" in e && e.code === "ESRCH")) reject(e);
        }
      }
    };
    const timeout = options.timeoutMs ?? 240000;
    const timer = setTimeout(
      () => stop(`Agent stopped after ${timeout / 1000} second budget`),
      timeout,
    );
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdout.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > 8_000_000) {
        stop("Agent stream exceeded 8 MB");
        return;
      }
      let framed: string[];
      try {
        framed = lines.feed(data);
      } catch (error) {
        stop(error instanceof Error ? error.message : String(error));
        return;
      }
      for (const line of framed) {
        const at = clock();
        queue = queue
          .then(() => receive(line, at))
          .catch((error: unknown) => {
            stop(`Invalid agent stream: ${error instanceof Error ? error.message : String(error)}`);
          });
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-16384);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      void (async () => {
        await queue;
        for (const line of lines.finish()) await receive(line, clock());
        if (code !== 0) error ??= `Agent exited ${code}${signal ? ` (${signal})` : ""}: ${stderr}`;
        resolveResult({ events, raw, code, signal, stderr, ...(error ? { error } : {}) });
      })().catch(reject);
    });
  });
}
