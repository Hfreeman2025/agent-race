import { z } from "zod";

const base64 = z
  .string()
  .max(1_500_000)
  .regex(/^[A-Za-z0-9+/_-]*={0,2}$/u)
  .refine((value) => value.replace(/=+$/u, "").length % 4 !== 1, "Invalid base64 length");
export const EnvelopeSchema = z
  .object({
    payloadType: z.literal("application/vnd.in-toto+json"),
    payload: base64.min(4),
    signatures: z
      .array(z.object({ keyid: z.string().max(256), sig: base64 }).strict())
      .min(1)
      .max(16),
  })
  .strict();
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type SignatureResult =
  | { status: "valid"; payload: Uint8Array<ArrayBuffer>; keyId: string }
  | { status: "invalid" | "unavailable"; reason: string };
export function decode64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/u, "");
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
}
export function encode64(value: Uint8Array): string {
  let text = "";
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text);
}
export function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** DSSE v1 PAE uses UTF-8 BYTE counts and signs the original payload bytes, never reserialized JSON. */
export function pae(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`DSSEv1 ${encoder.encode(type).length} ${type} ${payload.length} `);
  const output = new Uint8Array(prefix.length + payload.length);
  output.set(prefix);
  output.set(payload, prefix.length);
  return output;
}
export async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  return hex(await subtle.digest("SHA-256", bytes));
}
export async function verifyEnvelope(
  raw: unknown,
  trustedRaw: string,
  expectedKeyId: string,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<SignatureResult> {
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success)
    return { status: "invalid", reason: "Malformed DSSE envelope or unexpected payload type." };
  if (!subtle)
    return {
      status: "unavailable",
      reason: "WebCrypto is unavailable. The original recording and inferred graph remain usable.",
    };
  const envelope = parsed.data;
  if (!base64.safeParse(trustedRaw).success)
    return { status: "invalid", reason: "Malformed pinned public key." };
  const rawKey = decode64(trustedRaw);
  if (rawKey.length !== 32 || (await sha256(rawKey, subtle)) !== expectedKeyId)
    return { status: "invalid", reason: "Pinned public key fingerprint mismatch." };
  let key: CryptoKey;
  try {
    key = await subtle.importKey("raw", rawKey, { name: "Ed25519" }, false, ["verify"]);
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        error instanceof Error && error.name === "NotSupportedError"
          ? "Ed25519 is not supported by this browser. No verification result is substituted."
          : "The pinned public key could not be imported. Verification unavailable.",
    };
  }
  const payload = decode64(envelope.payload);
  try {
    // keyid is an unauthenticated DSSE hint. Verify every bounded signature against the separately pinned key.
    for (const signature of envelope.signatures) {
      const signatureBytes = decode64(signature.sig);
      if (signatureBytes.length !== 64) continue;
      if (
        await subtle.verify(
          { name: "Ed25519" },
          key,
          signatureBytes,
          pae(envelope.payloadType, payload),
        )
      )
        return { status: "valid", payload, keyId: expectedKeyId };
    }
    return { status: "invalid", reason: "Ed25519 signature mismatch. The signed bytes changed." };
  } catch {
    return {
      status: "invalid",
      reason: "The signature check failed. No verified status is substituted.",
    };
  }
}
export function tamperPayload(envelope: Envelope): {
  envelope: Envelope;
  offset: number;
  before: number;
  after: number;
} {
  const payload = decode64(envelope.payload);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  const exit = /"exitCode"\s*:\s*0/u.exec(text);
  // Prefer 0 -> 1 in a recorded exit: valid JSON, one changed byte, same signature.
  const offset = exit
    ? new TextEncoder().encode(text.slice(0, exit.index + exit[0].length - 1)).length
    : Math.max(0, payload.length - 2);
  const before = payload[offset];
  if (before === undefined) throw new Error("Empty payload cannot be tampered");
  payload[offset] = before ^ 1;
  return {
    envelope: { ...envelope, payload: encode64(payload) },
    offset,
    before,
    after: payload[offset],
  };
}
