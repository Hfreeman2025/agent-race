import { resolve } from "node:path";
import { command } from "../src/harness/process";
import { requireReceipts } from "../src/harness/receipts";

const configured = process.env.RECEIPTS_ROOT?.trim() || process.env.RECEIPTS_PATH?.trim();
if (!configured) {
  console.log(
    "SKIP receipts integration: RECEIPTS_ROOT is not configured. Set it to a built receipts checkout and run npm run test:integration. Neither the real CLI lifecycle nor sandbox toolchain ran.",
  );
} else {
  try {
    const { root } = await requireReceipts(configured);
    const env = { ...process.env, RECEIPTS_ROOT: root };
    const test = await command(
      process.execPath,
      [
        resolve("node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        "vitest.integration.config.ts",
      ],
      process.cwd(),
      undefined,
      env,
      60000,
    );
    process.stdout.write(test.stdout);
    process.stderr.write(test.stderr);
    if (test.code !== 0)
      throw new Error(`Real receipts lifecycle failed (exit ${test.code ?? test.signal}).`);
    console.log(
      "PASS receipts CLI integration: real UNBACKED → VERIFIED → STALE → FAILED lifecycle.",
    );
    if (process.platform !== "darwin")
      console.log(
        "SKIP sandbox integration: requires macOS sandbox-exec. The real receipts CLI lifecycle passed separately.",
      );
    else {
      const sandbox = await command(
        process.execPath,
        [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/check-sandbox.ts"],
        process.cwd(),
        undefined,
        env,
        45000,
      );
      process.stdout.write(sandbox.stdout);
      process.stderr.write(sandbox.stderr);
      if (sandbox.code !== 0)
        throw new Error(`Sandbox integration failed (exit ${sandbox.code ?? sandbox.signal}).`);
      console.log("PASS sandbox integration: real receipts toolchain and filesystem boundaries.");
    }
  } catch (error) {
    console.error(
      `FAIL receipts integration: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
