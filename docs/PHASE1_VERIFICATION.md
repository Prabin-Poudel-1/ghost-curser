# Phase 1 verification archive

Executed locally on **16 November 2026 (Asia/Kathmandu)**, macOS ARM64, Node 26.11.1, npm 11.20.0, Playwright 1.65.1 with Chromium **159.0.8154.6**.

## Results

| Check                   | Actual result                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Dependency installation | `npm install` and clean `npm ci` completed; pinned lockfile verified                                        |
| `npm run typecheck`     | Passed, strict TypeScript                                                                                   |
| `npm run lint`          | Passed                                                                                                      |
| `npm run format:check`  | Passed                                                                                                      |
| `npm test`              | **54 tests passed across 5 files**                                                                          |
| `npm run build`         | Passed; loadable MV3 production package in `dist/`                                                          |
| `npm run dev`           | Both Vite watch builds started successfully, then intentionally stopped                                     |
| Browser integration     | **2 tests passed** in the final run (13.2 seconds)                                                          |
| Repeated browser check  | **6/6 passed** across three repetitions before the final terminal-error/worker-status assertions were added |
| `npm audit`             | **0 vulnerabilities** in production and development dependency tree                                         |

No test skips are used to mask unavailable features. A GitHub Actions workflow is provided but has not run on a remote runner in this task.

## What was exercised

The multiplayer test launches **two separate persistent Chromium browser processes with independent temporary profiles**, loading the unpacked extension in each. It opens matching pages, creates a private room in the real popup code, joins the second participant, and verifies both rosters.

It closes both popups, confirms Chromium reports the extension worker's `runningStatus` as **stopped** after a CDP stop request, and verifies bidirectional cursor delivery. It checks normalized placement across 1000-pixel and 1200-pixel viewport widths, labels, normal page button interaction beneath the overlay, idle hiding, reopening the popup without losing the session, transport retry, participant departure, and DOM cleanup.

The wire is **genuine Chromium WebRTC with real Trystero encryption, signaling protocol and DataChannels**. Only the Nostr relay is a deterministic, local test fixture, bound to `127.0.0.1:8787`; the page fixture is on port 8788. STUN is disabled in the local-test build so the test does not depend on external network traversal. The relay implements subscriptions and ephemeral-event behavior; it is not a production relay or a complete Nostr conformance/security implementation.

Regression assertions verify the signaling Origin is the extension origin, sensitive fixture values/page path/invitation are absent from relay messages, and no application name or coordinate fields appear in decoded signaling envelopes. Random ciphertext can contain short human names by chance, so the test checks structured fields rather than treating arbitrary three-letter ciphertext substrings as a privacy leak. Production manifest assertions check the exact permission set, absence of persistent host grants and automatic injections, and absence of the localhost relay from all production scripts.

The test-only manifest grants loopback host access and the test-only popup accepts a target-tab query parameter. This automates the popup as an extension page; it does **not** claim to test the browser's physical toolbar click/activeTab grant. Production strips both accommodations. Use the manual profile procedure in the README to verify that UI grant in Chrome or Edge.

## Required unit-test coverage

| Requirement                  | Evidence                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Secure token generation      | 32-byte secure-random call, canonical encoding, independent generated tokens                                     |
| Serialization and validation | Valid message round trips; invalid types, versions, fields, sizes, names, coordinates rejected                   |
| Coordinate normalization     | Different viewport sizes, clamping, zero/nonfinite input                                                         |
| Rendering and cleanup        | SVG and text labels, interpolation scheduling, idle expiry, DOM/timer removal                                    |
| Participant join/leave       | Hello validation, palette collision handling, explicit leave and peer leave                                      |
| Invalid invitations          | Short codes, malformed encoding, whitespace handling, popup error path                                           |
| Recovery                     | Presence expiry/resumption, timeout/later discovery, retry, stale callback rejection, terminal transport failure |
| Popup transitions            | Setup, connecting, connected, failed with retained invitation, and leave; safe participant rendering             |

Unit connection tests use an injected simulated transport and clock. They do not prove actual WebRTC; the independent browser integration test supplies that evidence.

## Scope and known unverified areas

- Public Nostr relay availability and internet/cross-NAT connectivity were **not** acceptance-tested. The production adapter uses the pinned library's public defaults, and no TURN server is configured.
- Edge, Brave, Firefox, and older Chromium versions were not executed. Firefox support is a planned separate implementation.
- No eight-peer load benchmark, CPU/memory benchmark, broad website matrix, external security audit, or remote CI run is claimed.
- Cursor sampling is bounded to 20 Hz, incoming application handling to 60 messages/second/peer, participant count to eight, and application messages to 512 bytes. These are inspected implementation bounds, not observed throughput/latency guarantees.
- The content bundle is about **11.5 kB** minified and the offscreen/network bundle about **152.8 kB**, as reported by the production build. This is bundle size, not heap usage.

## Reproduce

```sh
npm ci
npm run check
npm run format:check
npx playwright install chromium
npm run test:e2e
# Optional stability run of the built artifacts:
npx playwright test --repeat-each=3
```

The test fixture needs free loopback ports 8787 and 8788. Playwright downloads its own extension-capable Chromium; using a locally branded Chrome binary may reject unpacked-extension command-line flags. Linux CI may require `npx playwright install --with-deps chromium`.

See [popup capture](images/popup.png) and [remote cursor capture](images/remote-cursor.png). Both are screenshots of the running implementation, not design mockups. The connected-room screenshot remains an untracked local test artifact because it contains an ephemeral invitation.

## Version control

Branch: `feature/ghostcursor-mvp`. Implementation and automated-test commit: `f347eac` (`feat: implement privacy-first GhostCursor multiplayer MVP`). Documentation is committed separately. No remote, force-push, main merge, deployment or publishing was performed. Run `git log --oneline -2` for the final local history.
