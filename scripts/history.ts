import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ArchiveSchema } from "../src/core/archive";
import { RecordingSchema } from "../src/core/schema";
import { scrub } from "../src/core/scrub";

const directory = resolve("public/recordings");
const current = RecordingSchema.parse(
  JSON.parse(await readFile(resolve(directory, "demo.json"), "utf8")),
);
const recordings = [];
for (const file of (await readdir(directory))
  .filter((file) => file.endsWith(".json") && file !== "demo.json")
  .sort()) {
  const r = RecordingSchema.parse(JSON.parse(await readFile(resolve(directory, file), "utf8")));
  const fair =
    r.results.every((result) => result.accepted && result.agentExit === 0 && !result.error) &&
    r.results.every((result) =>
      r.events.some(
        (event) =>
          event.agent === result.agent &&
          event.phase === "agent" &&
          event.kind === "run" &&
          event.exitCode === 0,
      ),
    );
  recordings.push({
    id: r.id,
    file,
    title: r.title,
    challenge: r.challenge,
    recordedAt: r.recordedAt,
    current: r.id === current.id,
    fair,
    results: r.results.map(({ agent, accepted, agentExit, verifiedAt, error }) => ({
      agent,
      accepted,
      agentExit,
      verifiedAt,
      ...(error ? { error } : {}),
    })),
  });
}
const archive = ArchiveSchema.parse({ source: "derived-from-real-recordings", recordings });
const payload = `${JSON.stringify(archive, null, 2)}\n`;
if (scrub(payload).findings.length) throw new Error("Archive privacy check failed");
await writeFile("public/race-history.json", payload);
console.log(`Archive: ${recordings.length} original recordings; historical failures preserved.`);
