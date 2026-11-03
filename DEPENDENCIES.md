# Dependencies and distributed assets

Application code is MIT, copyright 2026 Harry Freeman. The 130 locked npm packages retain their licences; `npm run licenses` checks the MIT / Apache-2.0 / BSD / ISC allowlist and generates [the full inventory](docs/dependency-licenses.md).

## Big Shoulders Display

The condensed broadcast face is **Big Shoulders Display**, Latin subset, upright weight 700. Its tall, architectural lettering gives timing numerals and race-control calls a distinct broadcast voice. Supporting text uses the installed Avenir Next / Arial stack.

- Distribution: [`@fontsource/big-shoulders-display@5.3.0`](https://www.npmjs.com/package/@fontsource/big-shoulders-display/v/5.3.0).
- Exact source archive: [npm registry tarball](https://registry.npmjs.org/@fontsource/big-shoulders-display/-/big-shoulders-display-5.3.0.tgz), `package/files/big-shoulders-display-latin-700-normal.woff2`.
- Upstream family: [Google Fonts specimen](https://fonts.google.com/specimen/Big+Shoulders+Display); package metadata identifies font version v21.
- Licence: **SIL Open Font License 1.1 (OFL-1.1)**, explicitly authorised for this asset. [The complete package-supplied notice](public/fonts/OFL-Big-Shoulders-Display.txt) is distributed unmodified, including its Google Inc. attribution. The font's embedded metadata is retained.
- Distributed asset: `public/fonts/big-shoulders-display-latin-700-normal.woff2`, **14,424 bytes**, copied without modification or re-subsetting.
- Font SHA-256: `d2d55115d0d7047ce956d4eb8f2fbfe7915552cf4fabb294a5979705ec9687ac`.
- Notice SHA-256: `18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3`.

`npm run licenses` verifies the bundled font and licence hashes. The font remains OFL-licensed; it is not relicensed as MIT or sold by itself. One local WOFF2 loads when the CSS face is first used; the viewer makes no external font requests. Fontsource was used only to obtain the pinned asset, not added as a runtime dependency.

## V3 cryptographic and graph core

No new runtime packages, model weights or hosted APIs were added. The evidence DAG, backward traversal, patch provenance and browser DSSE verifier are original MIT code. WebCrypto, SHA-256, Ed25519, TextEncoder/TextDecoder and SVG are browser facilities. The existing BSD-3-Clause `diff@9.0.0` applies/reconstructs patches. The local MIT receipts CLI produces the bundled signed imports; its implementation is not copied into this project. Public envelopes, null-field import records and the public trust anchor are project-generated data; private keys are ignored and never distributed.

Protocol references: [DSSE v1.0.2](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md), [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md), [Ed25519 / RFC 8032](https://www.rfc-editor.org/rfc/rfc8032).
