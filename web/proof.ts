import { type ArchiveProof, TrustedKeySchema, verifyArchive } from "../src/core/attestation";
import type { Recording } from "../src/core/schema";
import {
  decode64,
  type Envelope,
  EnvelopeSchema,
  pae,
  tamperPayload,
} from "../src/core/signatures";
import { escapeHtml as h } from "./escape";
import trustedKey from "./trusted-key.json";

const key = TrustedKeySchema.parse(trustedKey);
export function mountProof(
  root: HTMLElement,
  recording: Recording,
  archive: Uint8Array<ArrayBuffer>,
): void {
  if (recording.id !== "single-flight-2026-11-01T12-50-14-922Z") {
    root.innerHTML = `<div id="proof-state" data-state="unavailable"><span>EARLIER FAILED ATTEMPT</span><strong>No signed import available</strong><p>This original recording remains inspectable. No cryptographic result is substituted. Select the fair cache race to verify its signed import.</p></div>`;
    return;
  }
  let version = 0;
  let active = "codex-5";
  let original: Envelope | undefined;
  let source: Uint8Array<ArrayBuffer> | undefined;
  const must = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`Proof panel missing ${selector}`);
    return el;
  };
  root.innerHTML = `<div class="proof-controls" role="group" aria-label="Signed imported command"><button type="button" data-proof-command="claude-8" aria-pressed="false">Claude Code</button><button type="button" data-proof-command="codex-5" aria-pressed="true">Codex</button></div><div id="proof-state" data-state="loading" role="status"><span>WEBCRYPTO / ED25519</span><strong>Checking signed bytes…</strong><p>Local signature, recording digest and source-record digest.</p></div><div class="proof-actions"><button type="button" id="proof-tamper" disabled>Change one byte</button><button type="button" id="proof-restore" disabled>Restore original</button></div><p id="proof-byte">The original recording is never modified. The demo changes only an in-memory copy.</p><div id="proof-facts"></div><p class="proof-trust">Pinned project key · <code>${h(key.keyId)}</code></p><p class="proof-trust">This local project key authenticates this import. It is not an independent witness or an identity certificate; a compromised host could replace both viewer and trust anchor.</p><details class="proof-downloads"><summary>Inspect / verify independently</summary><p><a id="proof-envelope" href="/attestations/codex-5.dsse.json" download>DSSE envelope</a> · <a id="proof-import" href="/attestations/import-codex-5.json" download>Exact import record</a> · <a href="/attestations/trusted-public.pem" download>Public key</a></p><pre>node /path/to/receipts/dist/cli.js verify recording.dsse.json \\\n  --key trusted-public.pem --subject-root /path/to/agent-race --json</pre></details>`;
  function render(proof: ArchiveProof): void {
    const state = must("#proof-state");
    state.dataset.state = proof.status;
    state.innerHTML = `<span>WEBCRYPTO / ED25519 + SHA-256</span><strong>${proof.status === "verified" ? "Signature + file verified" : proof.status === "invalid" ? "Verification failed" : "Verification unavailable"}</strong><p>${proof.status === "verified" ? "Original signed bytes, recording and source import all match." : h(proof.reason)}</p>`;
    if (proof.status === "verified") {
      const p = proof.statement.predicate;
      const command = p.command;
      must("#proof-facts").innerHTML =
        `<h4 class="proof-facts-title">Original authenticated import</h4><p class="proof-provenance">signed at import from the recorded ledger</p><dl><dt>Recorded command</dt><dd><code>${h(command.recordedEvent.displayCommand)}</code></dd><dt>Recorded outcome</dt><dd>Shell exit ${command.exitCode ?? h(command.signal ?? "unknown")}. Signature validity is separate from test completeness.</dd><dt>Observation</dt><dd>${h(command.recordedEvent.recordedAt)} + ${command.recordedEvent.at.toFixed(0)} ms stream arrival. Not command start/end.</dd><dt>Attested later</dt><dd>${h(p.attestedAt)}</dd><dt>Recording SHA-256</dt><dd><code>${proof.archiveDigest}</code></dd><dt>Import source chain</dt><dd>Not validated historically. File digests captured at signing.</dd></dl><details open><summary>9 execution facts were not captured</summary><p>These fields are signed as literal null; none was reconstructed:</p><ul>${p.missingFields.map((field) => `<li>${h(field.replace(/^command\./u, ""))}</li>`).join("")}</ul></details>`;
    }
  }
  async function verify(tampered: boolean): Promise<void> {
    if (!original || !source) return;
    const turn = ++version;
    must("#proof-state").dataset.state = "checking";
    must("#proof-state").innerHTML =
      "<span>WEBCRYPTO / ED25519</span><strong>Checking signed bytes…</strong><p>Verification runs here. No server or model API.</p>";
    const changed = tampered ? tamperPayload(original) : undefined;
    const wire = root.closest(".flight-proof")?.querySelector<HTMLElement>("#proof-wire");
    if (wire) {
      const sample = tamperPayload(original);
      const payload = decode64((changed?.envelope ?? original).payload);
      const start = Math.max(0, sample.offset - 7);
      const end = Math.min(payload.length, start + 16);
      const prefix = new TextDecoder()
        .decode(pae(original.payloadType, new Uint8Array()))
        .replace(/ 0 $/u, ` ${payload.length} `);
      wire.innerHTML = `<span class="flight-kicker">WHAT IS ACTUALLY SIGNED</span><dl><dt>Payload</dt><dd>${payload.length.toLocaleString()} UTF-8 bytes</dd><dt>Signature</dt><dd>64 Ed25519 bytes</dd><dt>PAE message</dt><dd>${pae(original.payloadType, payload).length.toLocaleString()} bytes</dd></dl><p>Domain separation + exact original payload bytes:</p><pre>${h(prefix)}</pre><div class="byte-window">${[...payload.slice(start, end)].map((byte, i) => `<span class="${start + i === sample.offset ? "changed-byte" : ""}"><b>${byte.toString(16).padStart(2, "0")}</b><small>${h(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")}</small></span>`).join("")}</div><p>Payload byte ${sample.offset}: <strong>${tampered ? "31 / exit 1 · altered" : "30 / exit 0 · original"}</strong>. This window shows actual signed payload bytes.</p>`;
    }

    must("#proof-byte").textContent = changed
      ? `PAYLOAD BYTE ${changed.offset}: 0x${changed.before.toString(16)} → 0x${changed.after.toString(16)} (exit 0 → 1). Original signature retained. Original file untouched.`
      : "Original payload restored. The recording on disk was never changed.";
    const started = performance.now();
    const result = await verifyArchive(
      changed?.envelope ?? original,
      key,
      archive,
      recording,
      source,
    );
    if (turn !== version) return;
    render(result);
    must<HTMLButtonElement>("#proof-restore").disabled = !tampered;
    performance.measure("proof-verify", { start: started, end: performance.now() });
  }
  async function load(): Promise<void> {
    const turn = ++version;
    original = undefined;
    source = undefined;
    must<HTMLButtonElement>("#proof-tamper").disabled = true;
    must<HTMLButtonElement>("#proof-restore").disabled = true;
    must("#proof-facts").textContent = "";
    must("#proof-state").dataset.state = "loading";
    must("#proof-state").innerHTML =
      "<span>WEBCRYPTO / ED25519</span><strong>Opening attestation…</strong><p>Reading the bundled signed import.</p>";
    must<HTMLAnchorElement>("#proof-envelope").href = `/attestations/${active}.dsse.json`;
    must<HTMLAnchorElement>("#proof-import").href = `/attestations/import-${active}.json`;
    try {
      const [envelopeResponse, importResponse] = await Promise.all([
        fetch(`/attestations/${active}.dsse.json`),
        fetch(`/attestations/import-${active}.json`),
      ]);
      if (!envelopeResponse.ok || !importResponse.ok)
        throw new Error(
          "Local attestation files unavailable. Restore the bundled envelope and source import, then retry.",
        );
      const [raw, bytes] = await Promise.all([
        envelopeResponse.json() as Promise<unknown>,
        importResponse.arrayBuffer(),
      ]);
      const envelope = EnvelopeSchema.parse(raw);
      if (turn !== version) return;
      original = envelope;
      source = new Uint8Array(bytes);
      await verify(false);
      if (original === envelope)
        must<HTMLButtonElement>("#proof-tamper").disabled =
          must("#proof-state").dataset.state !== "verified";
    } catch (error) {
      if (turn !== version) return;
      render({
        status: "unavailable",
        reason: error instanceof Error ? error.message : "Local attestation unavailable.",
      });
      must("#proof-facts").innerHTML =
        '<button type="button" id="proof-retry">Retry attestation</button>';
      must("#proof-retry").addEventListener("click", () => void load());
    }
  }
  root.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest<HTMLButtonElement>("[data-proof-command]");
    if (!button?.dataset.proofCommand) return;
    active = button.dataset.proofCommand;
    for (const b of root.querySelectorAll("[data-proof-command]"))
      b.setAttribute("aria-pressed", String(b === button));
    void load();
  });
  must("#proof-tamper").addEventListener("click", () => void verify(true));
  must("#proof-restore").addEventListener("click", () => void verify(false));
  void load();
}
