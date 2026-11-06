# Evidence, inference and signatures

Agent Race keeps three questions separate: what the stream observed, which claims have command evidence, and whether the edited program passes independent acceptance.

## Capture and acceptance

`src/harness/capture.ts` incrementally decodes newline-delimited CLI output, validates recognised envelopes and snapshots authored challenge files into unified patches. One monotonic clock measures stream arrival. Unknown envelopes remain in the scrubbed raw fixture without acquiring invented actions. Limits bound elapsed time, output and snapshot size.

`src/harness/runner.ts` checks protected challenge files and the verification wrapper before copying hidden acceptance into the lane. Acceptance runs after the CLI exits. Its timestamp supplies the finish; CLI startup/shutdown and local verification remain on the clock. A failed inner Node test overrides a zero outer-shell exit when replay commentary assesses commands.

The challenge programs, visible tests and hidden acceptance are authored fixtures. Their known fixes are under `tests/solutions/`. The three archived streams are real task recordings, scrubbed before saving, rather than development-session logs.

## Lexical provenance

`src/core/trace.ts` applies captured patches to the original baseline and preserves each line's edit owner. It constructs a DAG from observed reads, commands, edits and claims. A line criterion can match earlier complete lines or code identifiers in captured output. Common syntax, comments and string literals do not become identifier evidence. Failed commands can contribute actual output; proposed code in command titles cannot. Ordering and agent-lane constraints are enforced before inserting edges.

Backward traversal highlights the slice relevant to the selected line. The conceptual influence is [Weiser, *Program Slicing*, ICSE 1981](https://doi.org/10.5555/800078.802557): start with a criterion and traverse its dependencies. This implementation infers lexical relationships; it does not implement semantic or dynamic program slicing. Its audit checks matching text and routing, not causal truth.

File-to-test edges are inferred associations. The archived Claude claim is associated with the nearest earlier successful verification command because the original stream lacks an event-to-receipt ID mapping. That association is disclosed. Codex's unsupported final wording receives no fabricated claim verdict.

## Retrospective signatures

The public import files preserve original event IDs, display commands, scrub markers, recording time and numeric stream-arrival observations. The following absent execution facts remain null:

- argv, absolute cwd and shell mode;
- command start and end timestamps;
- separate stdout/stderr SHA-256 and byte counts.

`missingFields` must exactly describe those nine nulls. Observation time is never substituted for execution time. Both imports were signed through the receipts CLI without rerunning the command. Their source declares `chainVerified: false` and provenance `signed-at-import-from-recorded-ledger`; subject digests were captured at signing.

`src/core/signatures.ts` constructs DSSE pre-authentication encoding and checks Ed25519 over untouched payload bytes. Only then does it perform fatal UTF-8 decoding and statement validation. `src/core/attestation.ts` checks the bundled recording/import-file SHA-256 values and their association to the selected event. Standard and URL-safe base64 are supported. A DSSE key ID is an unauthenticated hint, not the trust anchor.

The separately pinned key is `web/trusted-key.json`; its SPKI representation is `public/attestations/trusted-public.pem`. Public-key fingerprint:

```text
0d63ae2ec3299b5b5a47aad4c929bfe27b7989e4c78156067f3bb7efc990b461
```

The signature establishes authenticity under that project-local key. It is not a third-party identity certificate, original ledger-chain validation or execution-time signing. A host able to replace the viewer and pinned key can replace both. The one-byte demo changes only an in-memory payload copy; restore verifies the untouched original. Earlier failed recordings have no signed imports and say so.

Protocol references: [DSSE v1.0.2](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md), [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md), [Ed25519 / RFC 8032](https://www.rfc-editor.org/rfc/rfc8032).

## Earlier attempts

1. Both lanes failed before useful coding. Original replay retained; 25 path references redacted, zero remaining findings.
2. Codex exited before emitting events. Claude passed nine hidden Unicode cases, but its commands were blocked. Original replay retained; 29 references redacted, zero remaining findings.
3. Codex still failed on multiline argv transport. Claude passed cache acceptance, but a remaining home path blocked the save. The candidate was discarded; only the terminal rejection report survives. It was never reconstructed into a replay.
4. The fair default: both lanes could run commands and receipt-wrapped tests, exited zero and passed all five hidden cases. The stdin transport fix and common filesystem boundaries made a useful comparison possible. Claude's heredoc failure, subsequent rewrite and successful tests remain visible.
