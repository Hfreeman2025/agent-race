import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  type Envelope,
  encode64,
  pae,
  tamperPayload,
  verifyEnvelope,
} from "../src/core/signatures";

const keys = generateKeyPairSync("ed25519");
const rawKey = keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
const spki = rawKey.toString("base64");
const keyId = createHash("sha256").update(rawKey).digest("hex");
const payload = new TextEncoder().encode('{"hello":"world"}');
const envelope: Envelope = {
  payloadType: "application/vnd.in-toto+json",
  payload: encode64(payload),
  signatures: [
    {
      keyid: keyId,
      sig: sign(null, pae("application/vnd.in-toto+json", payload), keys.privateKey).toString(
        "base64",
      ),
    },
  ],
};
it("uses DSSE PAE byte counts, including non-ASCII payloads and types", () => {
  expect(new TextDecoder().decode(pae("é", new TextEncoder().encode("雪")))).toBe(
    "DSSEv1 2 é 3 雪",
  );
});
it("verifies real Ed25519 in native WebCrypto, rejects exactly one changed payload byte and the wrong key", async () => {
  expect((await verifyEnvelope(envelope, spki, keyId)).status).toBe("valid");
  const tampered = tamperPayload(envelope);
  expect(tampered.before ^ tampered.after).toBe(1);
  expect((await verifyEnvelope(tampered.envelope, spki, keyId)).status).toBe("invalid");
  const other = generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("base64");
  expect((await verifyEnvelope(envelope, other, keyId)).status).toBe("invalid");
  expect((await verifyEnvelope(envelope, spki, "untrusted-key")).status).toBe("invalid");
});
it("rejects malformed or different payload types and has an explicit unsupported-browser state", async () => {
  expect(
    (await verifyEnvelope({ ...envelope, payloadType: "application/json" }, spki, keyId)).status,
  ).toBe("invalid");
  expect((await verifyEnvelope({ ...envelope, payload: "not base64" }, spki, keyId)).status).toBe(
    "invalid",
  );
  expect((await verifyEnvelope(envelope, spki, keyId, undefined)).status).toBe("valid");
  const spy = vi
    .spyOn(crypto.subtle, "importKey")
    .mockRejectedValueOnce(new DOMException("Unsupported", "NotSupportedError"));
  try {
    expect((await verifyEnvelope(envelope, spki, keyId)).status).toBe("unavailable");
  } finally {
    spy.mockRestore();
  }
  vi.stubGlobal("crypto", undefined);
  try {
    expect((await verifyEnvelope(envelope, spki, keyId)).status).toBe("unavailable");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not authenticate keyid hints, supports URL-safe payloads, and still verifies only the pinned key", async () => {
  const renamed = {
    ...envelope,
    signatures: envelope.signatures.map((s) => ({ ...s, keyid: "unauthenticated hint" })),
  };
  expect((await verifyEnvelope(renamed, spki, keyId)).status).toBe("valid");
  const url = {
    ...envelope,
    payload: envelope.payload.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""),
  };
  expect((await verifyEnvelope(url, spki, keyId)).status).toBe("valid");
});
it("tampering a recorded exit changes one byte while leaving valid JSON and the original signature", () => {
  const record = {
    ...envelope,
    payload: encode64(new TextEncoder().encode('{"label":"雪","exitCode":0}')),
  };
  const altered = tamperPayload(record);
  expect(altered.before).toBe(48);
  expect(altered.after).toBe(49);
  expect(
    JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(altered.envelope.payload), (c) => c.charCodeAt(0)),
      ),
    ).exitCode,
  ).toBe(1);
  expect(altered.envelope.signatures).toEqual(record.signatures);
  expect(record.payload).not.toEqual(altered.envelope.payload);
});
