import { resolve } from "node:path";
import { expect, it } from "vitest";
import { command } from "../src/harness/process";

it("help or invalid smoke options never start provider-backed capability jobs", async () => {
  for (const option of ["--help", "--invalid-option"]) {
    // Provider CLIs are deliberately absent from PATH, even if this guard regresses.
    const result = await command(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("src/harness/cli.ts"), "smoke", option],
      process.cwd(),
      undefined,
      { ...process.env, PATH: "/usr/bin:/bin" },
    );
    expect(result.stdout).toContain("agent-race smoke");
    expect(result.stdout).not.toContain("Smoke claude: starting");
    expect(result.stdout).not.toContain("Smoke codex: starting");
  }
});
