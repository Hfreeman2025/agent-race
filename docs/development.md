# Development and recording

The viewer and unit tests are portable. Recording is a separate macOS-only path with provider usage. No model or live-agent calls run in the default gate or browser checks.

## Portable checks

```sh
npm ci --ignore-scripts
npm run gate
```

The gate runs strict TypeScript, Biome, unit tests, production build, the self-contained preview-header integration, pinned-asset/dependency licence checks and npm audit. `npm run test:preview` starts an ephemeral loopback fixture server; npm audit needs the registry. `npm test` needs neither a listener nor external network access. `npm test` uses an in-checkout receipts transport stub, not a sibling repository. A missing `RECEIPTS_ROOT` cannot break those unit tests. No runtime dependency is downloaded by the viewer.

For serial browser checks, install the pinned Playwright engines into this checkout's ignored cache, start the local production preview, then run the suite in another terminal:

```sh
npm run browser:install
npm run build
npm run preview
```

```sh
npm run test:browser
```

The preview is **http://127.0.0.1:4317**. Preview CORS is disabled: resources are same-origin, and the server must not vary font responses by Origin. WebKit uses CORS for font preloads but no-CORS for CSS font loads; Origin-dependent variants prevent reuse. A header regression test checks both request forms. The suite checks flight-recorder interactions, signatures/tamper/restore, failure states, replay, keyboard use, content security policy, IBM Plex geometry and cold-load proxies. It launches one browser at a time and disables audio/media devices. It refuses to launch when another detected automated browser owns the machine. Captures and JSON reports go to `.cache/browser/`; they are not source files. Installation needs network access and browser dependencies; tests serve only bundled local data. GitHub Actions installs Linux dependencies and runs the same suite on a hosted Ubuntu runner. Actual hosted execution remains a separate CI result.

Playwright is pinned to **1.63.0**. WebKit 27.2 in 1.64 emits false strict-CSP violations around native select controls ([upstream report](https://github.com/microsoft/playwright/issues/43497)). Keep real console errors and CSP assertions enabled; weakening `style-src` or filtering the warning would hide application regressions. Revisit the pin when the upstream engine is fixed.

## Optional receipts integration

```sh
npm run test:integration
RECEIPTS_ROOT=/absolute/path/to/receipts npm run test:integration
```

Without configuration, this prints **SKIP** and explains that neither the real CLI lifecycle nor sandbox ran. A configured missing or broken checkout fails. The lifecycle checks UNBACKED → VERIFIED → STALE → FAILED with the real CLI; macOS additionally checks the offline Seatbelt toolchain. Other platforms explicitly skip that sandbox check. No model calls occur.

`RECEIPTS_ROOT` must contain built `dist/cli.js`. There is no home or sibling default. A programmatic explicit root takes precedence; the legacy `RECEIPTS_PATH` environment variable remains supported. Integration is deliberately outside the portable gate.

## Recording a new task

Use existing authenticated `claude` and `codex` CLIs on macOS, Git, `sandbox-exec` and a built local receipts checkout. Provider calls can incur usage. Check the challenge contract with `./bin/agent-race list`, then follow the smoke/run commands in the README. Smoke output is local `.cache/agent-smoke.json`, expires after 24 hours, and must prove file read, command execution and a VERIFIED receipt for both lanes.

Each lane gets its own temporary repository. Seatbelt denies home-tree reads and writes outside that lane, except explicit read-only tool/provider authentication inputs consumed by the CLIs themselves. Metadata access lets Node resolve receipts; arbitrary sibling contents remain denied. Git metadata is read-only. Both lanes use the same effective boundary. The harness never inspects credential contents or rewrites global agent settings. Provider network access remains necessary; this is not a network-isolated sandbox.

The harness's CLI permission flags delegate filesystem enforcement to Seatbelt. Claude's temporary directory is explicitly routed into its lane. Codex receives the multiline prompt on stdin. Protected package/test/wrapper files and source symlinks are checked before hidden acceptance. Both lanes settle before cleanup. `npm run test:sandbox` checks the offline filesystem/toolchain boundaries without starting models and requires macOS plus an explicit receipts root.

Before saving, only known paths become `<repo>`, `<sandbox>` or `<receipts>`. Built-in checks reject home paths, email addresses and common credential/key formats, including common JSON escape layers. Operator-specific names must be supplied locally through comma-separated `RACE_PRIVATE_TERMS`; the public source contains no private organisation denylist. Terms are literal and tolerate whitespace, underscores and hyphens between words. Never commit that environment value. The detector is conservative, not a proof against arbitrary encoding. Any remaining finding blocks the complete candidate and raw streams from being saved.

`.race/attempts.json` persists the four-attempt cap; failed/rejected saves count. No automatic retry occurs. Existing archives are immutable. New races replace the local default JSON but do not recreate the bundled historical signatures.

## Verify an existing signed import

This command only verifies; it neither signs nor reruns anything:

```sh
export RECEIPTS_ROOT=/absolute/path/to/receipts
node "$RECEIPTS_ROOT/dist/cli.js" verify \
  public/attestations/codex-5.dsse.json \
  --key public/attestations/trusted-public.pem --subject-root "$PWD" --json
```

`scripts/attest-recording.ts` is the historical import adapter. It checks the immutable input hash, preserves missing facts as null, invokes the explicitly configured CLI and verifies its output before exporting public files. Its outputs are no-clobber; invoking it against existing exports intentionally fails. Private keys belong under ignored `.receipts/keys/` and must never be distributed. Viewing and verification require only public files.

## Source map

| Area | Responsibility |
| --- | --- |
| `src/core/` | Validated recording schemas, patches, trace inference, deterministic commentary and signature checks |
| `src/harness/` | CLI transport, isolated execution, readiness/budget limits, capture and privacy boundaries |
| `web/main.ts` | Archive loading, playback state, controls and focus |
| `web/replay-content.ts` | Pure event/evidence presentation |
| `web/flight.ts`, `web/proof.ts` | Interactive line trace and signature panel |
| `web/styles/` | Ordered layout, evidence, graph, proof and responsive styles |
| `challenges/`, `tests/solutions/` | Authored bug contracts, acceptance and known fixes |
| `tests/fixtures/` | Scrubbed task streams and the portable CLI stub |
