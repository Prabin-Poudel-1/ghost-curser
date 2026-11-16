# Phase 3 verification report — v0.3.0

Executed locally on **16 November 2026**, macOS ARM64, Node **26.11.1**, npm **11.20.0**. Browser engines: Playwright Chromium **159.0.8154.6** and Firefox **159.0**, driven by Selenium **4.41.0** / geckodriver **0.37.1**. Source branch: `feature/ghostcursor-phase3`, based on the preserved Phase 2 history. [Phase 1](PHASE1_VERIFICATION.md) and [Phase 2](PHASE2_VERIFICATION.md) reports are historical results, not substitutes for these reruns.

## Executed checks

| Check                            | Actual result                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clean installation               | `npm ci` passed; 464 packages added, 465 audited                                                                        |
| TypeScript / ESLint / formatting | `npm run typecheck`, `npm run lint`, `npm run format:check` passed                                                      |
| Unit suite                       | **106 passed across 7 files**, including all 96 earlier tests; final run 1.02 seconds                                   |
| Browser suite                    | **9 passed, no skips**, final run **2.2 minutes**; all 4 earlier Chromium tests retained                                |
| Production builds                | Chromium and Firefox builds passed; separate test builds also passed                                                    |
| Mozilla validation               | `web-ext lint --warnings-as-errors`: **0 errors, 0 warnings, 0 notices**                                                |
| Artifact validation              | Both manifests, referenced assets, permission sets, packaged scripts and exclusion of localhost test signaling passed   |
| Production dependency audit      | **0 vulnerabilities** with `npm audit --omit=dev`                                                                       |
| Full dependency audit            | **3 low findings**, one unpatched `deepmerge` advisory through Mozilla development tooling; full audit is not clean     |
| ZIP validation                   | CRC checks passed; two package runs produced byte-identical archives                                                    |
| Source hygiene                   | `git diff --check` passed; credential-pattern and sensitive-file review found no matching secrets in publishable source |

No remote CI, signed Firefox installation, store review, branded Edge/Chrome/Brave Phase 3 run or external-network room test is claimed. The Actions workflow is prepared but has not run on GitHub. The existing development watch workflow is retained and was not rerun in Phase 3. Browser automation opens the real popup HTML as an extension page; it does not click the physical browser toolbar or exercise the production `activeTab` grant UI.

## Browser and networking evidence

Tests use independent browser processes/profiles and **real RTCDataChannels**, with the actual Trystero encryption and signaling protocol. A bounded local Nostr fixture replaces public signaling, and test builds disable STUN. This demonstrates engine interoperability on the local machine, not NAT traversal or public-room reliability. Only test manifests grant loopback host access; only test popups support a target-tab override. Production validation checks these accommodations are absent.

The nine tests cover:

1. Preserved Chromium annotation coverage: late-join notes, remote clicks and expiry, sensitive-field exclusions, laser/clear, author editing/deletion, names, anchor replacement/scroll/removal, toolbar controls and safe text.
2. Four same-page activate/annotate/leave cycles with stable warm cleanup counters.
3. Firefox MV3 installation, popup creation, session tab, note creation and **End collaboration** cleanup/status.
4. Firefox ↔ Firefox cursors, bidirectional clicks, laser, notes, late joining, edit/delete/name synchronization and host closure.
5. Firefox ↔ Chromium equivalents using the same invitation and wire protocol. The Firefox background is explicitly terminated and confirmed **stopped** before collaboration continues in both Firefox pair tests.
6. Preserved Chromium multiplayer cursors, normalized viewports, popup closure, confirmed service-worker termination, retry, idle hiding and departure.
7. Preserved production permission/signaling-artifact checks.
8. Chromium offscreen interruption with visible retry feedback, peer departure and note restoration after recovery; explicit host-revocation cleanup; tab-close networking cleanup. The revocation routing path is exercised, not the browser's permission-revocation UI.
9. A longer annotated session with 12 notes, 20 laser strokes, 10 target replacements, bounded effects, a measured 60-second idle interval and overlay removal.

Chromium tests use 1000- and 1200-pixel viewports. Firefox automation temporarily installs the real Firefox test package using Selenium/geckodriver and Playwright's downloaded Gecko binary. A privileged driver flag allows extension-page navigation and forced background termination; it is not in the production extension or ordinary installation procedure. See the [compatibility matrix](COMPATIBILITY.md) for exact tested pairs and lifecycle limits.

Unit tests use mocked transports/clocks and jsdom where appropriate. Added hardening tests cover protocol negotiation, invalid/coercible types, identity binding after heartbeat expiry, retry caps/jitter/deduplication/cancellation, explicit host termination, restricted URLs, bounded anchor traversal, ownership/tombstones and high-rate pre-IPC filtering. Existing validation, XSS-safe text, malformed messages, note limits, observer cleanup and annotation tests remain.

## Resource findings

These are fixture measurements, not an eight-peer, hours-long or broad hardware benchmark. The Chromium page renderer measurement excludes the offscreen networking process and includes browser automation overhead.

| Sample                            | Documents | DOM nodes | JS event listeners | JS heap bytes |
| --------------------------------- | --------: | --------: | -----------------: | ------------: |
| Active: 12 notes after 20 strokes |         1 |       333 |                 67 |     2,686,040 |
| After 60.018763 seconds idle      |         1 |       333 |                 67 |     2,686,940 |
| After leaving                     |         1 |       155 |                 26 |     3,342,436 |

During the idle interval, page task duration increased by **0.077553 seconds**. DOM/listener counts did not grow. Heap measurements after cleanup include retained automation handles and GC timing and do **not** establish zero leaks. The separate four-cycle test measured **1 document, 109 nodes, 13 listeners after every leave**. No extension overlay remained. See [idle-session measurements](measurements/phase3-performance.json), [repeated cleanup](measurements/phase3-cleanup.json) and [feature-run counters](measurements/phase3-feature-resources.json).

| Artifact                                |      Chromium |       Firefox |
| --------------------------------------- | ------------: | ------------: |
| Minified content script                 |  44,359 bytes |  44,343 bytes |
| Main networking bundle                  | 156,490 bytes | 156,782 bytes |
| Complete build directory                | 224,322 bytes | 226,862 bytes |
| ZIP including installation text/license |  82,009 bytes |  82,894 bytes |

The Chromium content script grew from Phase 2's 41,068 bytes by 3,291 bytes (about 8%); the complete build grew about 2.3%. This bounded size increase supplies lifecycle and validation hardening. It is not a measured runtime slowdown. [Per-file sizes and gzip measurements](measurements/phase3-bundles.json) and [package SHA-256 checksums](measurements/phase3-packages.json) are recorded.

## Public signaling probe

A standalone probe opened WebSockets to five library-default relay endpoints without subscribing to a room or sending an invitation. Four opened in 866–1,934 ms; one timed out at 10 seconds. [Raw probe result](measurements/phase3-relays.json). This checks reachability only. It does **not** verify public-relay discovery, a public WebRTC room, external network interoperability or NAT traversal. Production retains Trystero's public relay configuration; no localhost dependency or mandatory backend is shipped.

## Security and packaging limits

The runtime audit is clean. The complete development tree has one unpatched low-severity prototype-poisoning advisory, reported against `deepmerge`, `addons-linter` and `web-ext`. These tools are not bundled into either extension. The [security assessment](SECURITY.md) records the advisory, affected scope and explicit CI threshold; an unsafe tool downgrade was not used to make the report green. [Audit summary](measurements/phase3-audit.json) preserves the result without machine-specific paths.

Firefox's ZIP is **unsigned**. It is ready for temporary developer loading and later signing review, not an already signed publicly installable add-on. Chromium's ZIP is for unpacked loading. Both include local scripts, icons, manifest, notices and installation text. Determinism was checked across two packaging runs of the same build on this machine; cross-platform/compiler reproducibility is unverified.

Actual screenshots from the passing run: [Firefox during mixed-engine collaboration](images/phase3-chromium.png) and [Firefox during a Firefox pair session](images/phase3-firefox.png). Both show the implemented toolbar, cursor and edited note. Any sensitive-looking form strings belong to the dummy test fixture. No invitation is included. Phase 2 screenshots remain available for laser visuals.

## Reproduce

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium firefox
npm run test:e2e
npm run lint:firefox
npm run validate:builds
npm audit --omit=dev
npm audit                       # expected known low tooling findings
npm run package
```

Ports **8787/8788** must be free. On Linux, install browser system dependencies with `npx playwright install --with-deps chromium firefox`. Selenium Manager needs network access on its first run to obtain geckodriver; `FIREFOX_BINARY` can select a compatible Firefox binary. The [consolidated manual guide](MANUAL_TESTING.md) covers subsequent Phase 2 + Phase 3 production permission, branded-browser and mixed-profile checks. No manual testing was required from the user during implementation.

## Git and release state

Phase 1 and Phase 2 commits remain intact. The Phase 2 hygiene commit is `f4319d0`; Phase 3 implementation is commit `ff29a94` on `feature/ghostcursor-phase3`. Documentation and measured artifacts are committed separately; run `git log --oneline -3` for the final documentation hash. Initial normal pushes to the configured GitHub repository were rejected with **GH007** because historical author metadata contains a private email address. The owner then instructed that history remain local and no push occur. New commits use the supplied GitHub noreply identity; prior commits were not rewritten. No Phase 3 main merge, force push, deployment, signing or store submission occurred. There are no pushed Phase 3 hashes or remote CI results to report.
