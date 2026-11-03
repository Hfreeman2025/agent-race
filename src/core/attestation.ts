import { z } from "zod";
import type { Recording } from "./schema";
import { sha256, verifyEnvelope } from "./signatures";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const TrustedKeySchema = z
  .object({
    algorithm: z.literal("Ed25519"),
    keyId: digest,
    raw: z.string(),
    encoding: z.literal("base64"),
  })
  .strict();
export type TrustedKey = z.infer<typeof TrustedKeySchema>;
export const missingExecutionFields = [
  "command.argv",
  "command.cwd",
  "command.shell",
  "command.startedAt",
  "command.endedAt",
  "command.stdout.sha256",
  "command.stdout.bytes",
  "command.stderr.sha256",
  "command.stderr.bytes",
] as const;
const unknownOutput = z.object({ sha256: z.null(), bytes: z.null() }).strict();
export const ArchiveCommandSchema = z
  .object({
    id: z.string(),
    argv: z.null(),
    cwd: z.null(),
    shell: z.null(),
    exitCode: z.number().int().min(0).max(255).nullable(),
    signal: z.string().nullable(),
    startedAt: z.null(),
    endedAt: z.null(),
    stdout: unknownOutput,
    stderr: unknownOutput,
    recordedEvent: z
      .object({
        displayCommand: z.string(),
        cwdMarker: z.literal("<repo>"),
        recordedAt: z.iso.datetime(),
        at: z.number().finite().nonnegative(),
        atUnit: z.literal("ms"),
        clock: z.literal("stream-arrival"),
      })
      .strict(),
  })
  .strict()
  .refine(
    (c) => (c.exitCode === null) !== (c.signal === null),
    "Exactly one command outcome required",
  );
export const ArchiveStatementSchema = z
  .object({
    _type: z.literal("https://in-toto.io/Statement/v1"),
    subject: z
      .array(
        z
          .object({
            name: z.literal("public/recordings/demo.json"),
            digest: z.object({ sha256: digest }).strict(),
          })
          .strict(),
      )
      .length(1),
    predicateType: z.literal("https://receipts.dev/attestation/command/v1"),
    predicate: z
      .object({
        version: z.literal(1),
        attestedAt: z.iso.datetime(),
        provenance: z.literal("signed-at-import-from-recorded-ledger"),
        subjectBinding: z.literal("digests-captured-at-signing"),
        source: z
          .object({
            kind: z.literal("imported-command-record"),
            id: z.string(),
            sha256: digest,
            chainVerified: z.literal(false),
          })
          .strict(),
        command: ArchiveCommandSchema,
        missingFields: z
          .array(z.string())
          .refine(
            (fields) => JSON.stringify(fields) === JSON.stringify(missingExecutionFields),
            "Unknown execution facts must be disclosed exactly",
          ),
      })
      .strict(),
  })
  .strict();
export type ArchiveStatement = z.infer<typeof ArchiveStatementSchema>;
export type ArchiveProof =
  | {
      status: "verified";
      statement: ArchiveStatement;
      archiveDigest: string;
      importDigest: string;
      keyId: string;
    }
  | { status: "invalid" | "unavailable"; reason: string };
/** This viewer supports the explicit null-field archival import profile, not arbitrary in-toto predicates. */
export async function verifyArchive(
  raw: unknown,
  key: TrustedKey,
  archiveBytes: Uint8Array<ArrayBuffer>,
  recording: Recording,
  importBytes: Uint8Array<ArrayBuffer>,
): Promise<ArchiveProof> {
  const signed = await verifyEnvelope(raw, key.raw, key.keyId);
  if (signed.status !== "valid") return signed;
  let statement: ArchiveStatement;
  try {
    statement = ArchiveStatementSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(signed.payload)),
    );
  } catch {
    return {
      status: "invalid",
      reason:
        "Signed payload has an unsupported or invalid archive-import statement. No trusted status is substituted.",
    };
  }
  const archiveDigest = await sha256(archiveBytes);
  if (statement.subject[0]?.digest.sha256 !== archiveDigest)
    return {
      status: "invalid",
      reason: "Signature is valid, but the recording SHA-256 does not match its signed subject.",
    };
  const importDigest = await sha256(importBytes);
  if (importDigest !== statement.predicate.source.sha256)
    return {
      status: "invalid",
      reason: "Signature is valid, but the imported source-record digest does not match.",
    };
  const command = statement.predicate.command;
  let imported: z.infer<typeof ArchiveCommandSchema>;
  try {
    imported = ArchiveCommandSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(importBytes)),
    );
  } catch {
    return {
      status: "invalid",
      reason: "The signed source-record bytes are not a valid supported archive import.",
    };
  }
  if (JSON.stringify(imported) !== JSON.stringify(command))
    return { status: "invalid", reason: "Signed command differs from the source import record." };
  const event = recording.events.find((e) => e.id === command.id);
  const observation = command.recordedEvent;
  if (
    event?.kind !== "run" ||
    statement.predicate.source.id !== event.id ||
    observation.displayCommand !== event.title ||
    observation.recordedAt !== recording.recordedAt ||
    observation.at !== event.at ||
    command.exitCode !== event.exitCode
  )
    return {
      status: "invalid",
      reason: "Signed imported command does not match the recorded event.",
    };
  return { status: "verified", statement, archiveDigest, importDigest, keyId: key.keyId };
}
