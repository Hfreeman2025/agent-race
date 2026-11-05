import { createHash, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RecordingSchema } from "../src/core/schema";
import { command } from "../src/harness/process";
import { requireReceipts } from "../src/harness/receipts";

const { cli: receiptsCli } = await requireReceipts();
const root = resolve(".");
const original = await readFile("public/recordings/demo.json");
const recording = RecordingSchema.parse(JSON.parse(original.toString("utf8")));
const knownHash = "1ef7ab7fd85bc60553c50606d22728aed16f2757ef2cb4bf252210cf9d52ed08";
if (createHash("sha256").update(original).digest("hex") !== knownHash)
  throw new Error("Immutable archive changed; refusing import");
await mkdir(".receipts", { recursive: true, mode: 0o700 });
await mkdir("public/attestations", { recursive: true });
for (const id of ["claude-8", "codex-5"]) {
  const event = recording.events.find((e) => e.id === id);
  if (event?.kind !== "run" || event.exitCode === undefined || event.exitCode === null)
    throw new Error(`Recorded command ${id} missing`);
  const record = {
    id: event.id,
    argv: null,
    cwd: null,
    shell: null,
    exitCode: event.exitCode,
    signal: null,
    startedAt: null,
    endedAt: null,
    stdout: { sha256: null, bytes: null },
    stderr: { sha256: null, bytes: null },
    recordedEvent: {
      displayCommand: event.title,
      cwdMarker: "<repo>",
      recordedAt: recording.recordedAt,
      at: event.at,
      atUnit: "ms",
      clock: "stream-arrival",
    },
  };
  const input = `.receipts/import-${id}.json`;
  const output = `.receipts/${id}.dsse.json`;
  await writeFile(input, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  const signed = await command(
    process.execPath,
    [
      receiptsCli,
      "attest",
      "--project",
      root,
      "--record",
      input,
      "--subject",
      "public/recordings/demo.json",
      "--output",
      output,
    ],
    root,
  );
  if (signed.code !== 0) throw new Error(signed.stderr || signed.stdout);
  const checked = await command(
    process.execPath,
    [
      receiptsCli,
      "verify",
      resolve(output),
      "--key",
      resolve(".receipts/keys/ed25519-public.pem"),
      "--subject-root",
      root,
      "--json",
    ],
    root,
  );
  if (checked.code !== 0) throw new Error(checked.stderr || checked.stdout);
  await writeFile(`public/attestations/${id}.dsse.json`, await readFile(output));
  await writeFile(`public/attestations/import-${id}.json`, await readFile(input));
  console.log(id, checked.stdout.trim());
}
const pem = await readFile(".receipts/keys/ed25519-public.pem", "utf8");
const raw = createPublicKey(pem).export({ format: "der", type: "spki" }).subarray(-32);
const key = {
  algorithm: "Ed25519",
  keyId: createHash("sha256").update(raw).digest("hex"),
  raw: raw.toString("base64"),
  encoding: "base64",
};
await writeFile("public/attestations/trusted-public.pem", pem);
// Compile the separately trusted anchor into the viewer; it is never read from an envelope.
await writeFile("web/trusted-key.json", `${JSON.stringify(key, null, 2)}\n`);
console.log(
  "Signed at import; original events unchanged; keys remain in ignored project-local .receipts/keys.",
);
