import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { assertClean, scrub } from "../src/core/scrub";
import { command } from "../src/harness/process";
import { reserveAttempt } from "../src/harness/runner";

it("reserves exactly two attempts and rejects a third without changing the count", async () => {
  await mkdir(".race", { recursive: true });
  const dir = await mkdtemp(resolve(".race/budget-test-"));
  try {
    await reserveAttempt(dir, 2);
    await reserveAttempt(dir, 2);
    await expect(reserveAttempt(dir, 2)).rejects.toThrow("budget exhausted");
    expect(JSON.parse(await readFile(resolve(dir, "attempts.json"), "utf8"))).toEqual({
      started: 2,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("budget corruption and an occupied lock fail closed", async () => {
  await mkdir(".race", { recursive: true });
  const dir = await mkdtemp(resolve(".race/budget-test-"));
  try {
    await writeFile(resolve(dir, "attempts.json"), "{}");
    await expect(reserveAttempt(dir, 2)).rejects.toThrow();
    await mkdir(resolve(dir, "attempt.lock"));
    await expect(reserveAttempt(dir, 2)).rejects.toThrow("already running");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("scrub blocks saves and does not erase unknown paths", () => {
  expect(() => assertClean("contact somebody@example.test")).toThrow("save blocked");
  expect(scrub("/Users/other/private.txt", { "/private/tmp/repo": "<repo>" }).findings).toContain(
    "home directory",
  );
  for (const value of [
    "https://name:password@example.test/",
    "eyJabcdefghijkl.abcdefghijkl.abcdefghijkl",
  ])
    expect(scrub(value).findings.length).toBeGreaterThan(0);
});
it("argv execution preserves nonzero exits and rejects missing executables", async () => {
  expect((await command(process.execPath, ["-e", "process.exit(7)"], process.cwd())).code).toBe(7);
  await expect(command("/no/such/agent-race-binary", [], process.cwd())).rejects.toThrow();
});
it("subprocess timeout and output cap are enforced", async () => {
  await expect(
    command(
      process.execPath,
      ["-e", "setTimeout(()=>{},10000)"],
      process.cwd(),
      undefined,
      process.env,
      25,
    ),
  ).rejects.toThrow("timed out");
  await expect(
    command(process.execPath, ["-e", "process.stdout.write('x'.repeat(2100000))"], process.cwd()),
  ).rejects.toThrow("output limit");
});
it("detects sensitive values inside JSON-escaped captured output", () => {
  expect(
    scrub(JSON.stringify({ line: '{"api_key":"opaqueCredential123456"}' })).findings,
  ).toContain("secret assignment");
  expect(
    scrub(JSON.stringify({ line: ["Example", "Organisation"].join("\n") }), {}, [
      "Example Organisation",
    ]).findings,
  ).toContain("private term");
  expect(scrub('"\\u002fUsers/test/private.txt"').findings).toContain("home directory");
});

it("enforces the four-attempt cap while preserving previously recorded usage", async () => {
  await mkdir(".race", { recursive: true });
  const dir = await mkdtemp(resolve(".race/budget-test-"));
  try {
    await writeFile(resolve(dir, "attempts.json"), '{"started":2}');
    await reserveAttempt(dir);
    await reserveAttempt(dir);
    await expect(reserveAttempt(dir)).rejects.toThrow("budget exhausted");
    expect(JSON.parse(await readFile(resolve(dir, "attempts.json"), "utf8"))).toEqual({
      started: 4,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("private denylist terms are literal, separator-tolerant and explicitly configured", () => {
  expect(scrub("Example_Organisation", {}, ["Example Organisation"]).findings).toContain(
    "private term",
  );
  expect(scrub("Example Organisation").findings).toEqual([]);
  expect(scrub("A+B", {}, ["A+B", " "]).findings).toContain("private term");
  expect(scrub("AAAB", {}, ["A+B"]).findings).toEqual([]);
});
