import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { command } from "../src/harness/process";
import { checkClaims, receiptsCli, resolveReceiptsRoot } from "../src/harness/receipts";

it("real receipts integration: unbacked → verified → stale → failed", async () => {
  await mkdir(".race", { recursive: true });
  const cwd = await mkdtemp(resolve(".race/receipts-test-"));
  try {
    expect((await command("git", ["init", "--quiet"], cwd)).code).toBe(0);
    await writeFile(resolve(cwd, ".gitignore"), ".receipts/\n");
    await writeFile(
      resolve(cwd, "package.json"),
      JSON.stringify({ scripts: { test: "node test.cjs" } }),
    );
    await writeFile(resolve(cwd, "test.cjs"), 'console.log("pass");');
    expect((await checkClaims(cwd, "Tests pass."))[0]?.verdict).toBe("UNBACKED");
    expect(
      (await command(process.execPath, [receiptsCli, "run", "--", "npm", "test"], cwd)).code,
    ).toBe(0);
    const verified = await checkClaims(cwd, "Tests pass.");
    expect(verified[0]?.verdict).toBe("VERIFIED");
    expect(verified[0]?.receiptId).toMatch(/^[a-f0-9-]{36}$/);
    await writeFile(resolve(cwd, "source.mjs"), "export const changed=1;");
    expect((await checkClaims(cwd, "Tests pass."))[0]?.verdict).toBe("STALE");
    await writeFile(resolve(cwd, "test.cjs"), "process.exit(1);");
    expect(
      (await command(process.execPath, [receiptsCli, "run", "--", "npm", "test"], cwd)).code,
    ).toBe(1);
    expect((await checkClaims(cwd, "Tests pass."))[0]?.verdict).toBe("FAILED");
    expect(await checkClaims(cwd, "No tests have been run.")).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 45_000);

it("an empty optional CI path resolves to the documented local sibling", () => {
  expect(resolveReceiptsRoot("")).toBe(resolveReceiptsRoot());
  expect(resolveReceiptsRoot("  ")).toBe(resolveReceiptsRoot());
  expect(resolveReceiptsRoot("/private/tmp/receipts")).toBe("/private/tmp/receipts");
});
