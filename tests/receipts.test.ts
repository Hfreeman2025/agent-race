import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { command } from "../src/harness/process";
import { checkClaims, requireReceipts, resolveReceiptsRoot } from "../src/harness/receipts";

it("requires explicit receipts configuration and gives the option precedence over environment", () => {
  expect(() => resolveReceiptsRoot(undefined, {})).toThrow("RECEIPTS_ROOT");
  expect(() => resolveReceiptsRoot("  ", { RECEIPTS_ROOT: " ", RECEIPTS_PATH: "" })).toThrow(
    "RECEIPTS_ROOT",
  );
  expect(resolveReceiptsRoot(" .cache/option ", { RECEIPTS_ROOT: ".cache/env" })).toBe(
    resolve(".cache/option"),
  );
  expect(
    resolveReceiptsRoot(undefined, {
      RECEIPTS_ROOT: " .cache/env ",
      RECEIPTS_PATH: ".cache/legacy",
    }),
  ).toBe(resolve(".cache/env"));
  expect(resolveReceiptsRoot(undefined, { RECEIPTS_PATH: ".cache/legacy" })).toBe(
    resolve(".cache/legacy"),
  );
});
async function fixture(run: (cwd: string) => Promise<void>): Promise<void> {
  await mkdir(".cache", { recursive: true });
  const cwd = await mkdtemp(resolve(".cache/receipts-unit-"));
  try {
    await mkdir(resolve(cwd, "dist"));
    await writeFile(resolve(cwd, "package.json"), '{"private":true,"type":"module"}');
    await cp("tests/fixtures/receipts-stub.mjs", resolve(cwd, "dist/cli.js"));
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
it("checks argv/stdin and maps all supported fixture verdicts without a sibling checkout", async () =>
  fixture(async (cwd) => {
    expect(await requireReceipts(cwd)).toEqual({ root: cwd, cli: resolve(cwd, "dist/cli.js") });
    for (const verdict of ["UNBACKED", "VERIFIED", "STALE", "FAILED", "MISMATCH", "VAGUE"]) {
      await writeFile(
        resolve(cwd, "receipts-stub.json"),
        JSON.stringify({
          input: "Tests pass.\nExact stdin.",
          output: {
            results: [
              {
                claim: { text: "Tests pass." },
                verdict,
                reason: "Fixture boundary response",
                receiptId: "fixture-receipt",
              },
            ],
          },
        }),
      );
      expect(await checkClaims(cwd, "Tests pass.\nExact stdin.", cwd)).toEqual([
        {
          text: "Tests pass.",
          verdict: ["MISMATCH", "VAGUE"].includes(verdict) ? "UNBACKED" : verdict,
          reason: "Fixture boundary response",
          receiptId: "fixture-receipt",
          ...(["MISMATCH", "VAGUE"].includes(verdict) ? { originalVerdict: verdict } : {}),
        },
      ]);
    }
    await writeFile(
      resolve(cwd, "receipts-stub.json"),
      JSON.stringify({ input: "No tests run.", output: { results: [] } }),
    );
    expect(await checkClaims(cwd, "No tests run.", cwd)).toEqual([]);
  }));
it("fails closed on fixture CLI failure, malformed JSON and unknown verdicts", async () =>
  fixture(async (cwd) => {
    for (const output of [
      "not-json",
      { results: [{ claim: { text: "pass" }, verdict: "GREEN", reason: "bad" }] },
    ]) {
      await writeFile(
        resolve(cwd, "receipts-stub.json"),
        JSON.stringify({ input: "Tests pass.", output }),
      );
      await expect(checkClaims(cwd, "Tests pass.", cwd)).rejects.toThrow();
    }
    await writeFile(
      resolve(cwd, "receipts-stub.json"),
      JSON.stringify({
        input: "Tests pass.",
        exitCode: 7,
        stderr: "fixture failure",
        output: { results: [] },
      }),
    );
    await expect(checkClaims(cwd, "Tests pass.", cwd)).rejects.toThrow("fixture failure");
    await expect(requireReceipts(resolve(cwd, "missing"))).rejects.toThrow(
      "receipts build missing",
    );
  }));
it("reports an absent opt-in integration explicitly and fails an explicitly missing checkout", async () => {
  const args = [
    resolve("node_modules/tsx/dist/cli.mjs"),
    resolve("scripts/check-receipts-integration.ts"),
  ];
  const skipped = await command(process.execPath, args, process.cwd(), undefined, {
    ...process.env,
    RECEIPTS_ROOT: "",
    RECEIPTS_PATH: "",
  });
  expect(skipped.code).toBe(0);
  expect(skipped.stdout).toContain("SKIP receipts integration");
  expect(skipped.stdout).toContain("RECEIPTS_ROOT");
  const missing = await command(process.execPath, args, process.cwd(), undefined, {
    ...process.env,
    RECEIPTS_ROOT: resolve(".cache/no-receipts"),
    RECEIPTS_PATH: "",
  });
  expect(missing.code).not.toBe(0);
  expect(missing.stderr).toContain("receipts build missing");
  expect(missing.stdout).not.toContain("PASS");
});
