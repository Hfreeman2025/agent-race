# Checks and measured results

The default recording is real archived CLI evidence. Browser interaction tests use that recording; explicit network interception supplies failure and boundary cases only within the tests. They do not rewrite the shipped data.

## Portable gate

`npm run gate` passes strict TypeScript, Biome, **77 unit tests in 16 files plus one preview-header integration test**, the production build, licences for **132 locked packages**, hashes for eight IBM Plex faces and three complete OFL notices, and npm audit (**zero vulnerabilities**). The two added packages are the development-only Playwright runtime and its core; the viewer gained no runtime dependency.

Unit tests cover stream decoding/normalisation, strict schemas, scrub rejection and escaping, process limits, CLI input transport, readiness/budget guards, challenge acceptance against known bugs/fixes, replay rules, patch provenance, lexical routing and DSSE validation. The receipts adapter uses an in-checkout stub. The real cross-repository lifecycle and macOS sandbox remain explicit opt-in checks; an unconfigured root prints SKIP and its reason, while a configured missing root fails.

GitHub Actions is configured for hosted Ubuntu runners with Node 22. The quality job gates typecheck, lint, unit tests, build, licences and audit. A separate job installs pinned Playwright engines and runs the serial browser suite against a local preview. Provider/model calls and macOS recording are explicitly excluded. The [hosted workflow results](https://github.com/Hfreeman2025/agent-race/actions/workflows/check.yml) are separate from the local measurements below. The first Ubuntu run caught small fallback-font shifts that macOS did not expose: the recording label wrapped, and compact replay text changed width. Those slots now reserve their layout through font swap; the zero-CLS assertion remains enforced.

## Browser method

`npm run test:browser` runs Chromium, WebKit and Firefox sequentially, one browser and one page at a time. Desktop is 1440×900; phone is a 390×844 desktop-engine viewport, with an additional 320px overflow check. Audio, playback and media-device access are disabled. A process guard checks for existing automated browsers before every launch.

The suite covers selected-line ancestry, every graph node/edge, original patches, long content, claim mapping, signatures for both agents, original/tamper/restore, missing WebCrypto, unsigned historical recordings, reduced motion, keyboard controls, replay finishes, archive-dialog concurrency, offline/retry, invalid/empty/slow data and content security policy. Expected negative CSP and offline probes are kept separate from unexpected production errors.

Fresh contexts measure font completion, selected trace availability and two animation-frame opportunities. That is a meaningful-paint proxy over loopback, not a physical display measurement or a guarantee for every machine. Graph computation and proof verification use explicit Performance API marks. Animation frame intervals are measured with the actual selected graph in view. Raw generated reports and captures stay under ignored `.cache/browser/`.

## Observed results — 6 November 2026

Playwright **1.63.0**, Chromium **153.0.8010.12**, WebKit **26.6**, Firefox **155.0**. All final suites pass with zero unexpected console warnings/errors. The negative CSP probes still block arbitrary inline scripts and styles.

| Suite | Observed coverage |
| --- | --- |
| Flight recorder | 144 named checks, 102 captured states |
| Signature fallbacks and historical archives | 54 named checks |
| Race replay | 208 named checks, 144 captured states |
| Fonts and layout | 184 named checks |
| Empty/startup | Both sizes in all three engines, six cases |
| Content security policy | All three engines; allowed production and blocked negative probes |
| Late archive response | Cannot overwrite a newer dialog |
| Cold-load proxy | 12 fresh contexts, two per engine/size |

The long-page WebKit console check also stays quiet beyond the preload-warning timer. Preview font responses no longer vary by Origin: preload and CSS requests can reuse the same response. The regression is tested through real HTTP in `npm run test:preview`, separately from the listener-free unit suite. Font files, preload links, CSP and the frontend bundle were unchanged by this server fix. Earlier failed diagnostics remain local rather than being counted as passing coverage.

Cold font+trace paint proxies ranged from **87–225 ms**, rounded to whole milliseconds. Graph computation/mount in those samples took **8.1–17 ms**; native proof verification took **0.7–17 ms**. All 12 proxies were below two seconds. CPU idle was **72.24% before** and **54.68% after** the run, so this is a shared-machine observation, not a quiet-machine guarantee.

Desktop replay intervals were sampled across the complete accelerated race, including both finish boundaries:

| Engine | Frame p95 | Maximum interval |
| --- | ---: | ---: |
| Chromium | 16.8 ms | 33.3 ms |
| WebKit | 18 ms | 19 ms |
| Firefox | 16.74 ms | 17.46 ms |

Each window was about 12 seconds and contained 719–720 intervals. Chromium had one interval above 33 ms; no engine had an interval above 50 ms. These are local measurements, not guarantees for other hardware.

## Typography and assets

Eight self-hosted Latin IBM Plex WOFF2 files total **165,476 bytes**. The three preloaded main faces total **58,024 bytes**. Every font uses `font-display: swap`; no external font request occurs. Before the Plex reset, Chromium measured Flight recorder CLS of **0.05470789194617252** at desktop and **0.024881516587677725** at phone size; replay values were **0.00040847687060613857** and **0.00037605956912295497**. These historical measurements were taken from document start through font completion and a 700ms settle, using fresh production-preview contexts with reduced motion.

The final font suite records Chromium layout-shift entries from document start: **CLS is exactly zero** for both views at both sizes. All 12 engine/size/view cases retain stable board geometry through font completion. Engines lacking the Layout Instability API report null rather than an invented zero, and are checked for stable board geometry through font completion. Measurements apply to the rendered browser viewports, not physical devices.

## Evidence boundaries

The recordings, raw challenge stream fixtures and signed exports are byte-for-byte unchanged by the public polish. Splitting styles preserves the original cascade and rule tokens. Claims about evidence coverage are recomputed by the trace tests; the 16/16 edge audit is not a causal accuracy score. No new race, model call or signing operation was performed for this pass.
