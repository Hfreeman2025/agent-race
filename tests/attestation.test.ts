import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ArchiveStatementSchema, TrustedKeySchema, verifyArchive } from "../src/core/attestation";
import { RecordingSchema } from "../src/core/schema";
import { EnvelopeSchema, encode64, pae, tamperPayload } from "../src/core/signatures";
import keyJson from "../web/trusted-key.json";

const key = TrustedKeySchema.parse(keyJson);
const archive = new Uint8Array(readFileSync("public/recordings/demo.json"));
const recording = RecordingSchema.parse(JSON.parse(new TextDecoder().decode(archive)));
const source = new Uint8Array(readFileSync("public/attestations/import-codex-5.json"));
const raw: unknown = JSON.parse(readFileSync("public/attestations/codex-5.dsse.json", "utf8"));
it("verifies the real receipts CLI archive import, binds source+recording digests and preserves nine missing execution facts", async () => {
  const proof = await verifyArchive(raw, key, archive, recording, source);
  expect(proof.status).toBe("verified");
  if (proof.status !== "verified") throw new Error("Real CLI import did not verify");
  expect(proof.statement.predicate.missingFields).toHaveLength(9);
  expect(proof.statement.predicate.command.argv).toBeNull();
  expect(proof.statement.predicate.command.startedAt).toBeNull();
  expect(proof.statement.predicate.source.chainVerified).toBe(false);
  expect(proof.archiveDigest).toBe(
    "1ef7ab7fd85bc60553c50606d22728aed16f2757ef2cb4bf252210cf9d52ed08",
  );
});
it("rejects subject/source changes, an event association mismatch and the one-byte exit tamper", async () => {
  expect(
    (await verifyArchive(raw, key, new Uint8Array([...archive, 10]), recording, source)).status,
  ).toBe("invalid");
  expect(
    (await verifyArchive(raw, key, archive, recording, new Uint8Array([...source, 10]))).status,
  ).toBe("invalid");
  expect(
    (await verifyArchive(raw, key, archive, { ...recording, events: [] }, source)).status,
  ).toBe("invalid");
  const changed = tamperPayload(EnvelopeSchema.parse(raw));
  expect((await verifyArchive(changed.envelope, key, archive, recording, source)).status).toBe(
    "invalid",
  );
});
it("does not treat a valid signature as permission to omit the unknown-field disclosure or use another predicate", async () => {
  const original = await verifyArchive(raw, key, archive, recording, source);
  if (original.status !== "verified") throw new Error("Fixture invalid");
  const keys = generateKeyPairSync("ed25519");
  const publicRaw = keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const trusted = {
    ...key,
    keyId: createHash("sha256").update(publicRaw).digest("hex"),
    raw: publicRaw.toString("base64"),
  };
  const statement = {
    ...original.statement,
    predicate: { ...original.statement.predicate, missingFields: [] },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(statement));
  const envelope = {
    payloadType: "application/vnd.in-toto+json",
    payload: encode64(bytes),
    signatures: [
      {
        keyid: trusted.keyId,
        sig: sign(null, pae("application/vnd.in-toto+json", bytes), keys.privateKey).toString(
          "base64",
        ),
      },
    ],
  };
  expect((await verifyArchive(envelope, trusted, archive, recording, source)).status).toBe(
    "invalid",
  );
  expect(
    ArchiveStatementSchema.safeParse({
      ...original.statement,
      predicateType: "https://example.invalid/other",
    }).success,
  ).toBe(false);
});
