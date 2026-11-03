# Dependencies and distributed assets

Application code is MIT, copyright 2026 Harry Freeman. The 130 locked npm packages retain their licences; `npm run licenses` checks the MIT / Apache-2.0 / BSD / ISC allowlist and generates [the full inventory](docs/dependency-licenses.md).

## IBM Plex — shared type family

Self-hosted Latin WOFF2 assets from **@fontsource 5.3.0**, unmodified, licensed **SIL OFL-1.1** (approved by Harry). IBM Plex Sans reads and handles the interface (400, 400 italic, 500, 600); IBM Plex Mono records timings and code (400, 600); IBM Plex Sans Condensed signs the wordmark, headings and labels (500, 600). Sans labels remain Sans/Condensed; uppercase mono micro-labels are not used.

The eight font files total **165,476 bytes**. Each family's full distribution-supplied OFL notice is beside the fonts, preserving IBM's attribution. `public/fonts/plex.css` uses `font-display: swap`; the document preloads Sans 400, Mono 600 and Sans Condensed 600 with matching anonymous CORS mode. Everything loads from the same origin; no Google Fonts or CDN request occurs at runtime.

`public/fonts/plex-manifest.json` records package version, source URL, exact size and SHA-256. `npm run licenses` checks every pinned asset against it. The font remains OFL licensed; application code remains MIT. No Fontsource runtime package was added. The former Big Shoulders asset is retired; historical screenshots remain unchanged.

| Asset | Bytes | SHA-256 | Pinned @fontsource 5.3.0 source |
| --- | ---: | --- | --- |
| ibm-plex-sans-latin-400-normal.woff2 | 22588 | `3b646991d30055a93a4ecc499713d4347953a74a947ecab435ab72070cbdab0e` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-400-normal.woff2) |
| ibm-plex-sans-latin-400-italic.woff2 | 24356 | `6de912e531b6c98084f1b2d5e5a91bad77be4e68bc4e396e43c46fc435e5f3d9` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-400-italic.woff2) |
| ibm-plex-sans-latin-500-normal.woff2 | 24184 | `0717336fb31fcdcde4b8deb3675bb4a0f7f6d484864afcd6751ac29975962203` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-500-normal.woff2) |
| ibm-plex-sans-latin-600-normal.woff2 | 24252 | `8960851d691c054ed38e259bdcf1a6190d157b4203ed5bb32c632a863fb8ec2f` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-600-normal.woff2) |
| ibm-plex-mono-latin-400-normal.woff2 | 14708 | `08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-400-normal.woff2) |
| ibm-plex-mono-latin-600-normal.woff2 | 15620 | `0d1f0b8d0722224e32e9f28261bdc86c79115be73444ae5eceb73976a1bcdf83` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-600-normal.woff2) |
| ibm-plex-sans-condensed-latin-500-normal.woff2 | 19952 | `e3b4fd97fd20bc70fda66d8d5f0745d8d6958068a024cb4724bbc1ffb6cbc183` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-condensed@5.3.0/files/ibm-plex-sans-condensed-latin-500-normal.woff2) |
| ibm-plex-sans-condensed-latin-600-normal.woff2 | 19816 | `3d72a0923c5830358b0a8e25b258aecadbecbf542b6ee9a25f387803e37d56b9` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-condensed@5.3.0/files/ibm-plex-sans-condensed-latin-600-normal.woff2) |
| OFL-ibm-plex-mono.txt | 5299 | `23b0a9d0c6d3f140a0b77e483c5cfa6bba574325ef5cb189ed9f2fec4884533f` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/LICENSE) |
| OFL-ibm-plex-sans.txt | 4429 | `d0283623ef57e722fd0eb688a8041589670c608ab780cd3612d06ba6f153d3fd` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5.3.0/LICENSE) |
| OFL-ibm-plex-sans-condensed.txt | 5416 | `251faa58c24c53a1855818116292bf449d591937cf5143fafc23e0be5e26ddc6` | [source](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-condensed@5.3.0/LICENSE) |

## V3 cryptographic and graph core

No new runtime packages, model weights or hosted APIs were added. The evidence DAG, backward traversal, patch provenance and browser DSSE verifier are original MIT code. WebCrypto, SHA-256, Ed25519, TextEncoder/TextDecoder and SVG are browser facilities. The existing BSD-3-Clause `diff@9.0.0` applies/reconstructs patches. The local MIT receipts CLI produces the bundled signed imports; its implementation is not copied into this project. Public envelopes, null-field import records and the public trust anchor are project-generated data; private keys are ignored and never distributed.

Protocol references: [DSSE v1.0.2](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md), [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md), [Ed25519 / RFC 8032](https://www.rfc-editor.org/rfc/rfc8032).
