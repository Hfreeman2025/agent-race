# Agent Race

Two coding agents get the same bug, in fresh isolated repositories, on one clock. Agent Race records their real headless CLI streams and exposes their commands, edits and verification claims as a motorsport timing screen and an evidence flight recorder. The finish is independent hidden acceptance, with [receipts](#receipts-and-claims) checking recognized verification claims against command evidence and code fingerprints. The default recording is a **fair, completed cache race**: both agents ran their tests and passed all five hidden cases. This is a personal local experiment, not a model leaderboard.

## Try it

Node **22.12 or later** and npm. No account, key, agent CLI or receipts checkout is needed to watch the bundled replay.

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4317**. The server binds to loopback and refuses to silently change ports. `npm run dev` starts the development server on the same address. The viewer invokes no models and has no upload, telemetry or backend. Replay data and the condensed display font are bundled locally. The viewer makes no external requests.

The **Flight recorder opens immediately**, with a changed line connected back to its captured source read. Choose any +/− line in the final diff, or any node/edge in the time graph, to inspect its inferred evidence. The Recording selector includes both earlier failed races; the fair cache race remains the default. All inference is computed live in your browser from the original scrubbed JSON.

Choose **Race replay** (or open `/?view=replay`) for the original broadcast. It starts at **8×**, completing in about ten seconds; reduced motion starts paused. Scrub the shared timeline, choose a speed, or jump to **Finish**. Sector splits show first read, first edit, first test command and independent verification. The gap compares matching observed sectors. Click a command, change, claim or commentary source to inspect its evidence in an inline picture-in-picture panel. Space plays/pauses outside controls; left/right move five seconds. The range supports native keys including End. Escape closes inline evidence or dialogs and restores focus.

**Earlier attempts** keeps the two original failed recordings downloadable and discloses the additional candidate rejected by the privacy scrub. The failed attempt was not rewritten to force a save.

## Flight recorder: the technique

The core is an **evidence-labelled lexical provenance DAG and backward slice**, inspired by [Mark Weiser, *Program Slicing*, ICSE 1981](https://doi.org/10.5555/800078.802557). Start at a changed line; find earlier captured outputs containing the same code identifiers or complete changed lines; walk the inferred graph backwards. Common syntax, comments and string literals do not become identifier evidence. A failed command's actual output can supply evidence, but proposed code in its title cannot. No edge crosses agents or comes from the future. This borrows criterion-driven graph traversal, **not semantic/dynamic program slicing** or access to an agent's private reasoning.

Every edge exposes its rule and text. File-to-test links are inferred associations. Claude's claim is mapped to the nearest earlier successful verify command, with the absent historical event-to-receipt ID association disclosed. Codex's unmatched wording remains without a receipt verdict. Final diffs are reconstructed by applying the captured transactions to the authored challenge baseline, with line ownership retained across edits; mismatched patches fail closed.

**Measured coverage:** 51 of 124 changed lines (41.1%) have an earlier lexical match in the fair recording; the other 73 remain unlinked. There are 17 observed call/claim nodes and 16 inferred edges. An explicit 16/16 edge audit checks observable overlap/routing, not causal ground truth. **Causal accuracy is unknown.** Lexical overlap can be coincidental, and a missing match does not establish invention. No model is running, no weights download and no hosted inference occurs.

## Signatures and the one-byte demo

Choose **Verify the recording +**, then **Change one byte**. The browser changes a recorded exit from `0` to `1` in an in-memory payload, retaining valid JSON and the original signature. Native WebCrypto Ed25519 rejects it. **Restore original** verifies again. The byte window shows the actual payload, UTF-8 byte counts and domain-separated message.

Two real imports, one per agent, were signed by the local [receipts CLI](#receipts-and-claims) retrospectively during this build. They use an [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) inside [DSSE v1](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md), with Ed25519 signatures. The exact original payload bytes are verified before fatal UTF-8 decoding and schema validation. The browser pins a separately bundled raw public key, checks its SHA-256 fingerprint, then checks recording and import-file digests and association to the recorded event. DSSE key IDs are hints, not authenticated identities. Standard/URL-safe base64 are supported.

The UI says exactly **“signed at import from the recorded ledger”**. Original execution argv, absolute cwd, shell flags, start/end times and separate stdout/stderr hashes/byte counts were not saved. All nine fields are literal null, with checked `missingFields`; stream-arrival observation metadata is separate. No missing evidence was reconstructed and no command was rerun. Subject digests describe signing-time bytes. The entire immutable recording, including its claims and failures, is bound by each signed subject digest; signing does not expand the original receipts claim grammar or establish test completeness.

The key is project-local under ignored `.receipts/keys/`, with directory mode 0700 and private-key mode 0600. No home configuration is touched. The published public key is `public/attestations/trusted-public.pem`; the browser anchor is `web/trusted-key.json`. Fingerprint: `0d63ae2ec3299b5b5a47aad4c929bfe27b7989e4c78156067f3bb7efc990b461`. This is the project's local trust anchor, **not independent execution-time attestation or a third-party identity certificate**. A compromised host could replace the viewer and key together.

Verify an existing import with the local CLI (no signing or command execution):

```sh
node "$HOME/Personal/oss/receipts/dist/cli.js" verify \
  public/attestations/codex-5.dsse.json \
  --key public/attestations/trusted-public.pem --subject-root "$PWD" --json
```

`node_modules/.bin/tsx scripts/attest-recording.ts` is the original import adapter. It checks the immutable recording hash, preserves only recorded facts, calls the sibling CLI and verifies its result before exporting public artifacts. Outputs are no-clobber: rerunning against the existing signed files fails intentionally. Viewing or checking does not need that script or a private key. Earlier failed recordings have no signed imports and display an explicit unavailable state. Unsupported WebCrypto also leaves the trace usable without a substitute verification result.

## The default race

**The double fetch** (`single-flight`), recorded **1 November 2026 at 12:50:14.922 UTC**, with Claude Code **2.1.286** and Codex CLI **0.160.1**. Both agents received the same multiline prompt and fresh copies of the same repo.

| Agent | Process exit | Visible test through receipts | Agent regression suite | Independent hidden tests | Verified finish |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 0 | 1/1 pass | 5/5 pass | **5/5 pass** | **41.466 s** |
| Codex | 0 | 1/1 pass | 4/4 pass | **5/5 pass** | **77.793 s** |

Claude reached independent acceptance first, by **36.327 seconds**. Timings include CLI startup, provider latency, work, process shutdown, claim checking and hidden execution. Codex's final message arrived before its process exited; the replay retains that gap. These are launch-to-acceptance measurements, not pure inference times or a general performance ranking.

Claude encountered a blocked shell heredoc, saw that it had truncated its files, rewrote them through the Write tool and reran its tests. That failure and recovery stay visible. Both agents could run commands and the receipts-wrapped test suite in their own repo. The same filesystem boundaries applied to both lanes.

The recording contains **20 observed normalized events**, including **five edit events**. Save scrub: **36 known path references redacted, zero remaining findings**. Two recognized final Claude claims are VERIFIED. Codex's final “Verification passed” wording does not match the current receipts grammar and remains an unannotated message; its command exits and independent acceptance are recorded separately.

Original JSON: `public/recordings/single-flight-2026-11-01T12-50-14-922Z.json`. `demo.json` is its identical default replay copy. Scrubbed raw streams are retained in `tests/fixtures/`.

## Record locally

The harness requires **macOS**, `sandbox-exec`, Git, existing authenticated `claude` and `codex` CLIs, and a built local receipts checkout. It never signs in, creates accounts, fetches keys or changes global agent settings.

```sh
./bin/agent-race list
./bin/agent-race smoke
./bin/agent-race run single-flight
```

Receipts defaults to `$HOME/Personal/oss/receipts/dist/cli.js`. Set `RECEIPTS_PATH` to a different built repository root if needed; an empty optional value uses the default. The sibling is used read-only and is never copied or modified.

The original two-attempt cap was explicitly extended by two attempts. **All four authorised race attempts have now been used.** Further `run` calls are blocked; the counter is not reset. Capability smoke jobs are separate, small read/command checks, not races or demo data. Offline tests and viewing remain available without further model use.

Before reserving a race attempt, the harness requires a successful smoke report for **both** agents from the last 24 hours. It proves a file was read, an actual command created the expected nonce-bound output, the process exited zero and receipts VERIFIED the wrapped `npm test`. A failed, incomplete, duplicated-agent or expired proof blocks the race. Smoke has a 120-second per-agent bound and a $0.25 Claude CLI budget; races have 240 seconds per lane and a $2 Claude CLI budget. These are CLI controls, not billing guarantees. Neither tests nor CI invoke model-backed smoke automatically.

### Challenges

| Challenge | Weak visible test | Hidden acceptance |
| --- | --- | --- |
| `single-flight` — The double fetch | Sequential cache reuse | 5 cases: concurrent misses, rejection eviction, synchronous throw/retry, independent keys, `undefined` values |
| `unicode-slug` — Lost in translation | ASCII “Hello World” | 9 cases: canonical equivalence, NFKD compatibility, combining marks, non-Latin text, separators, empty input |
| `date-window` — One day too many | Checks only the first day | 8 cases: exclusive end, equal/reversed bounds, leap/year boundaries, strict dates, UTC changes |

Toy repos have no dependencies and use Node's built-in test runner. Hidden suites are visible in this source tree but are copied into a lane **only after that agent exits**. “Hidden” is a per-race filesystem boundary. Reference solutions are offline test fixtures and never replay events.

## Harness and sandbox fixes

The installed CLI help was checked. Both tools use their documented noninteractive interfaces inside an external macOS Seatbelt sandbox. Native approval bypass is used only because that external policy remains mandatory; Claude's nested tool sandbox is explicitly disabled to avoid conflicting wrappers.

- **Codex pre-event SIGKILL:** the full multiline race prompt passed as argv through `sandbox-exec` reproducibly exited with SIGKILL before stdout/stderr, even with a failing localhost-only provider. Sending the **exact same prompt** through the documented `codex exec --json … -` stdin interface started normally and reached that provider. Production now keeps argv and stdin together in one launch plan, writes the prompt to the pipe and closes it. The launch contract test checks byte-identical prompt content for both agents. This is an observed input-transport failure, not an invented explanation about an update or login prompt.
- **Nested state canonicalization:** Codex's stderr identified denied canonicalization of `CODEX_HOME`. The policy now permits metadata for the exact ancestor directories of each lane; sibling directory contents remain denied.
- **Claude command temp area:** `TMPDIR` alone did not control its Bash working area. `CLAUDE_CODE_TMPDIR` is set to its lane's private root. Actual live smoke and the fair race verify command execution.
- **Node loading receipts:** Node's realpath traversal failed at `lstat '/Users'` before the test runner could start. Exact ancestor metadata for the allowed receipts executable is permitted, while unrelated home contents stay denied.
- **Git warning / scrub failure:** Git tried an implicit global ignore path in the real home and emitted a home-path warning. Lane-local XDG config/cache/state and explicit Git config isolation remove that warning. The privacy checker remains fail-closed.

Each challenge repo is under `/private/tmp/agent-race-…/<agent>/repo`, with private CLI temp/state areas in that lane. The policy denies unrelated home contents, sibling temp trees, writes outside the lane and writes to `.git` after initialization. Narrow read exceptions serve the built receipts code and existing provider credential locations; the harness never opens credential contents. Auth belongs to the CLIs. Codex uses a clean HOME/CODEX_HOME and ignores user config/rules; Claude runs in safe mode without customisations or MCP. The prompt forbids private data, outside repos, network tools, dependencies, subagents, commits, pushes and publishing.

The **offline** boundary check uses the actual nested layout and runs Node → receipts → npm → a test command inside it. It verifies both the receipt and positive read/write access, alongside home/sibling denial and Git-write denial. Successful process stderr and exit signals are retained for future diagnosis.

A repeatable zero-model diagnostic is available with `node_modules/.bin/tsx scripts/diagnose-startup.ts`. It points the CLI only at a deliberately failing loopback provider and keeps diagnostic output separate from race recordings.

## Receipts and claims

`./verify` wraps `npm test` with receipts. The checker binds a command's result to before/after/current code fingerprints. Each recognized claim is checked at its message boundary and final claims are checked again **before** hidden acceptance, so hidden tests cannot retroactively back an agent's words.

The viewer supports VERIFIED, STALE, FAILED and UNBACKED. Receipts' MISMATCH/VAGUE statuses map to UNBACKED while preserving the original status and reason. Its grammar is bounded: unsupported wording can remain an ordinary message; absence of a badge is not verification. Numeric Node test summaries are not automatically evidence for every numeric phrase. The real integration test proves UNBACKED → VERIFIED → STALE → FAILED. A receipt proves the recorded command/fingerprint, not full test quality or completeness.

Streams are timestamped from one monotonic clock, incrementally decoded across UTF-8 chunks, validated and normalized. Working-tree snapshots supply expandable unified diffs. Unknown envelopes remain in raw fixtures but create no invented action; malformed recognized events fail closed. Time/output/snapshot limits are enforced. Protected tests, package files and the verify wrapper are checked; source symlinks are rejected. Hidden acceptance runs inside the lane sandbox. Both lanes settle before normal/error cleanup.

Before any recording save, only explicitly known roots are replaced with `<repo>`, `<sandbox>` and `<receipts>`. The entire candidate and raw event streams are checked for company names, emails, home paths and recognizable secret formats, including JSON-escaped forms. Any remaining finding blocks saving. The detector is conservative, not a proof that arbitrary encoded secrets are impossible. No agent events are fabricated or hand-edited.

## Failed attempts remain disclosed

- **Attempt 1:** both lanes failed before useful coding. Original recording retained; 25 path references redacted, zero findings.
- **Attempt 2:** Codex died before events; Claude's edit passed 9 hidden Unicode cases but its commands were blocked. Original recording retained; 29 references redacted, zero findings.
- **Attempt 3 (first additional attempt):** Codex still died with the multiline argv transport; Claude passed cache acceptance at the displayed 42.25 s. The scrub rejected a remaining home path. The full candidate was **not saved**. [Terminal-only rejection report](public/rejected-attempts.txt); no replay was reconstructed from it.
- **Attempt 4:** the default fair race above. Both agents exit zero and pass all five hidden cases; 36 references redacted and zero findings.

The failed pre-fix capability smoke is also preserved separately in `shots/`. Those jobs are labelled smoke, not a race. The final successful report is `shots/agent-smoke.json`.

## Checks and visual QA

V3 evidence, both critique passes, browser reports and limits are in [docs/v3-verification.md](docs/v3-verification.md), with screenshots under `shots/v3/`. `node scripts/screenshots-v3.mjs` exercises trace/proof states; `node scripts/proof-fallbacks-v3.mjs` tests unavailable verification and historical recordings. All browser launchers share `scripts/silent.mjs`: no live AudioContext, media playback or device access. Suites run one engine at a time, one worker.

```sh
npm run gate
```

This runs strict TypeScript (including diagnostic/build scripts), Biome, tests, the zero-model sandbox/toolchain check, production build, dependency licence checks and npm audit. The local receipts build is required for its integration test. Core tests cover normalization from captured streams, schemas, scrub rejection/escaping, timeline ordering, CLI input transport, readiness/budget guards, subprocess limits and all challenge acceptance contracts against bugs/reference fixes.

The PR workflow targets a **self-hosted macOS runner labelled `agent-race`**, with Node and the built receipts sibling available (`RECEIPTS_PATH` may be a repository variable). No runner was provisioned and no hosted workflow was dispatched. CI configuration is distinct from local passing checks.

With the production preview running, the v2 browser matrix is:

```sh
RACE_SHOT_PASS=pass5 RACE_BROWSERS=chromium,webkit,firefox node scripts/screenshots-v2.mjs
```

It uses the Playwright runtime explicitly approved by the brief. WebKit and Firefox binaries live under `.race/browsers` (installed using that runtime’s `cli.js install webkit firefox` with `PLAYWRIGHT_BROWSERS_PATH="$PWD/.race/browsers"`). No code from the runtime’s host project is read. The matrix captures 24 states at **1440×900** and **390×844** in each engine, including delays, missing/invalid/empty data, failed commands, both finish boundaries, inline patches, claims, long messages, keyboard focus and archive failures. Network interception supplies test-only boundary states; the shipped default always uses the original real recording.

The matrix also measures meaningful paint and animation frame intervals. `node scripts/contact-sheets.mjs pass5` makes inspection sheets. The two critique passes, browser observations and performance details are in [v2 verification](docs/v2-verification.md) and `shots/v2/`. `node scripts/social-preview.mjs` creates the 1200×630 social image from the real rendered replay. [IDENTITY.md](IDENTITY.md) records the visual decisions. The [v2.1 typography verification](docs/v2.1-verification.md) records the self-hosted face, current screenshots and cold-load observations.

## Deterministic race control

`src/core/broadcast.ts` derives the booth commentary from immutable events. Every line names its rule and opens its exact source event. No model runs in the viewer. The shell recogniser handles the archive’s documented `cat`, `./verify`, `npm test` and `node --test` command forms, preserving quoted strings and excluding heredoc bodies; it is deliberately not an arbitrary shell interpreter. Unsupported forms do not earn a sector split. A failed inner test overrides an outer shell exit of zero. A zero exit alone is never a passing test verdict.

Edit commentary invalidates the inference from earlier tests; claim commentary reports the stored receipts verdict; independent acceptance alone supplies the finish. Unknown verification wording is disclosed explicitly. The finish graphic appears at the verified timestamp and occupies an existing event window, so the clock and commentary stay in place. The phrase “photo finish” describes this freeze-frame treatment, not a claim that a 36-second result was close.

## Credits and licences

Created by **Harry Freeman**. MIT: `Copyright (c) 2026 Harry Freeman`.

- **receipts** — Harry Freeman's local MIT evidence checker, called through its CLI.
- **Zod** — MIT. **diff** — BSD-3-Clause. **TypeScript** — Apache-2.0.
- **Vite**, **Vitest**, **tsx** — MIT. **Biome** — MIT OR Apache-2.0.
- All **130 locked npm packages**, including optional platform binaries, satisfy MIT / Apache-2.0 / BSD / ISC. [Full inventory](docs/dependency-licenses.md).
- **IBM Plex Sans** (400, 400 italic, 500, 600), **IBM Plex Mono** (400, 600), **IBM Plex Sans Condensed** (500, 600) — eight unmodified Latin WOFF2 files from **@fontsource 5.3.0**, self-hosted under **SIL OFL-1.1**, 165,476 bytes total. Sans reads, Mono records, Condensed signs. Full OFL notices sit beside them. [Pinned sources, sizes and hashes](DEPENDENCIES.md); `npm run licenses` checks the manifest. Three main faces are preloaded and all faces use `font-display: swap`. No external runtime font request. [Plex reset verification](docs/plex-verification.md) records before/after layout shift and screenshots.

No employer code, client data, private transcripts or prior user session recordings are included. No accounts or logins were used. Harry authorised a local commit on main on 3 November 2026; no remote, push or publishing is authorised. A project-local Git root was initialized only because receipts requires one for key isolation. Original challenge prompts, agent messages and diffs remain as observed after path scrubbing.

## Remaining limits

This is one fair recorded task under the documented sandbox, not a universal ranking. Claim grammar coverage remains bounded, including the unannotated Codex verification wording. Shell heredocs can still hit the stricter temporary-file boundary; that recovery is preserved in the match. The four-race allowance is exhausted. The v2 brief conditionally permits one extra race only after a material harness change; this viewer-only revision uses none. There are no remaining blockers to viewing the fair race locally.
