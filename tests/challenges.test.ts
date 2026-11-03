import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ChallengeId, loadChallenge, projectRoot } from "../src/harness/challenge";
import { command } from "../src/harness/process";

describe("challenge acceptance contracts", () => {
  for (const id of ChallengeId.options)
    it(`${id}: weak visible test passes, hidden tests reject bug and accept reference`, async () => {
      await mkdir(resolve(projectRoot, ".race"), { recursive: true });
      const temp = await mkdtemp(resolve(projectRoot, ".race/test-"));
      try {
        const { directory } = await loadChallenge(id);
        await cp(resolve(directory, "repo"), temp, { recursive: true });
        const visible = await command(process.execPath, ["--test", "visible.test.mjs"], temp);
        expect(visible.code).toBe(0);
        expect(visible.stdout).toMatch(/pass 1/);
        await cp(resolve(directory, "acceptance.test.mjs"), resolve(temp, "acceptance.test.mjs"));
        const broken = await command(process.execPath, ["--test", "acceptance.test.mjs"], temp);
        expect(broken.code).toBe(1);
        expect(broken.stdout).toMatch(/fail [1-9]/);
        await cp(resolve(projectRoot, "tests/solutions", `${id}.mjs`), resolve(temp, "src.mjs"));
        const fixed = await command(process.execPath, ["--test", "acceptance.test.mjs"], temp);
        expect(fixed.code).toBe(0);
        expect(fixed.stdout).toMatch(/fail 0/);
        expect(fixed.stdout).toContain(
          `pass ${{ "unicode-slug": 9, "date-window": 8, "single-flight": 5 }[id]}`,
        );
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    });
});
