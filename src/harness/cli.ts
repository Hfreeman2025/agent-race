#!/usr/bin/env node
import { ChallengeId, loadChallenge } from "./challenge";
import { runRace } from "./runner";
import { smokeAgents } from "./smoke";

const [action, id, ...extra] = process.argv.slice(2);
if (action === "smoke" && id === undefined && extra.length === 0) {
  try {
    await smokeAgents();
  } catch (error) {
    console.error(`agent-race: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else if (action === "list") {
  for (const value of ChallengeId.options) {
    const { challenge: c } = await loadChallenge(value);
    console.log(`${c.id.padEnd(16)} ${c.title}\n                 ${c.description}`);
  }
} else if (action === "run" && id && extra.length === 0) {
  try {
    await runRace(id);
  } catch (e) {
    console.error(`agent-race: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
} else {
  console.log(
    "agent-race — the finish line is evidence.\n\n  agent-race list\n  agent-race smoke\n  agent-race run <unicode-slug|date-window|single-flight>\n\nRuns locally. Four authorised model-backed races in total; two initial plus two additional.",
  );
  if (action && action !== "--help") process.exitCode = 1;
}
