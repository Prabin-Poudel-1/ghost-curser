# Phase 2 verification report

Executed locally on **16 November 2026**, macOS ARM64, Node **26.11.1**, npm **11.20.0**, Playwright **1.65.1**, Chromium **159.0.8154.6**. Implementation commit: **`665c2f2`** on **`feature/ghostcursor-phase2`**. [Phase 1 results](PHASE1_VERIFICATION.md) are retained as a historical archive.

## Executed checks

| Check                         | Actual result                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Clean dependency installation | `npm ci` passed; 197 packages added, 198 audited                                                           |
| Strict TypeScript             | `npm run typecheck` passed                                                                                 |
| ESLint                        | `npm run lint` passed                                                                                      |
| Formatting                    | `npm run format:check` passed                                                                              |
| Unit tests                    | **96 passed across 6 files**, including all 54 Phase 1 tests; final run 1.09 seconds                       |
| Production build              | `npm run build` passed; Chromium MV3 output in `dist/`                                                     |
| Browser integration           | **4 passed**, including both original Phase 1 tests; final run **20.8 seconds**                            |
| Dependency audit              | `npm audit`: **0 reported vulnerabilities**, full production/development tree                              |
| ZIP checks                    | Archive CRC check passed; manifest version/permissions verified; no test relay found in production scripts |
| Source hygiene                | `git diff --check` passed                                                                                  |

No tests were skipped. No external-network results, manual Phase 2 profile run, remote CI run or store compatibility result are inferred from these checks. The existing watch/build workflow is preserved; the dev watcher was not rerun during Phase 2. The production build and both test-build stages were executed.

## Genuine WebRTC integration

The tests load the unpacked extension in **two independent Chromium processes with separate temporary profiles**. They use the real popup code, real Trystero encryption/signaling protocol and real Chromium RTCDataChannels. A local Nostr wire-protocol fixture on `127.0.0.1:8787` replaces only the public signaling relay; STUN is disabled in the test build. This is actual peer networking, not an in-memory cursor/annotation simulation. The relay is a bounded test fixture, not a production server or complete Nostr implementation.

The feature test uses **1000 × 800** and **1200 × 800** viewports and verifies:

- A note created before B joins arrives through late-join synchronization.
- Click ripples appear remotely and expire; password/form interactions and synthetic page clicks do not create feedback.
- Laser batches produce a remote SVG path; clearing removes it.
- Author note editing/deletion synchronize; another participant has no cross-author edit/delete controls.
- Popup name editing changes the remote note author without restarting the session.
- Target replacement retains anchoring; scrolling keeps the card aligned; removal creates an unplaced note; reinsertion resolves it.
- Cursor visibility toggles, pointer dragging and keyboard movement of the toolbar work; Escape exits Laser mode.
- Toolbar Leave removes the overlays in both profiles.
- Note plaintext, dummy sensitive field values and invitation are absent from relay payloads.

The original multiplayer test remains and verifies bidirectional cursors, normalized viewport coordinates, normal webpage button interaction, idle hiding, retry, departure and cleanup. It closes the popups, explicitly stops the service worker via CDP, confirms its reported state is **stopped**, and then verifies cursor delivery. A separate production-artifact test verifies the exact permission set, no persistent host grants/static content injection and no local test relay in the shipped scripts.

Only the test manifest grants loopback host access and the test popup allows a target-tab parameter. This drives the popup as an extension page; it does not automate the physical browser toolbar click or real `activeTab` grant. Production strips both accommodations. The [manual guide](MANUAL_TESTING.md) covers that flow.

## Unit coverage

The 54 original tests remain. Added tests exercise v2 message round trips and rejection of malformed/oversized/private fields; secure UUID generation with `getRandomValues`; capability gating and transport-bound identities; sequence deduplication and name updates; palette collision behavior; note creation/editing/deletion/snapshots/ownership/revision conflicts/tombstones/quotas; minimal structural anchors and replacement/ambiguity/deletion cases; laser batching and caps; SVG expiry and reduced motion; toolbar actions/keyboard movement; safe note text rendering and observer/timer destruction.

Connection unit tests inject a simulated transport and clock. Rendering unit tests use jsdom and fake timers. These provide deterministic business-logic checks; the browser tests supply actual WebRTC and layout evidence.

## Resource measurements

Measurements are scoped to this fixture and this Chromium run. They are **not** an eight-peer, CPU, latency or broad website benchmark.

| Artifact                  | Measured size                                                        |
| ------------------------- | -------------------------------------------------------------------- |
| Production content bundle | **41,068 bytes** minified; Vite reports approximately 13.36 kB gzip  |
| Offscreen/network bundle  | **155,203 bytes** minified; Vite reports approximately 55.58 kB gzip |
| Entire `dist/` build      | **219,177 bytes**, including assets and third-party notices          |
| Install ZIP               | **79,958 bytes**, including `INSTALL.txt`                            |

[Bundle measurements](measurements/phase2-bundle.json) record each exact file size and Python level-9 gzip sizes. These can differ from Vite's compression settings. Archive SHA-256:

```text
7abb7a1893778d4f4c45d3f794b4661611fb63dde8eb8cd607408d8a42531e53
```

Chromium CDP counters in the feature test, with forced garbage collection at sample points:

| Page renderer sample                                     | Documents | DOM nodes | JS event listeners |
| -------------------------------------------------------- | --------- | --------- | ------------------ |
| Before extension activation                              | 1         | 108       | 0                  |
| Active, after collaboration operations and note deletion | 1         | 183       | 55                 |
| After leave                                              | 1         | 112       | 26                 |

Heap-used samples were **3,199,192 bytes active** and **3,198,744 bytes after leave**. These include the page and browser-automation infrastructure, exclude the offscreen transport, and cannot be treated as isolated extension allocations. They do not show zero residual memory/listeners. [Raw feature-run counters](measurements/phase2-resources.json) are retained.

A separate browser test creates a note and laser, leaves, waits for port closure, forces GC and repeats on the **same page four times**. Each post-leave sample was exactly **1 document, 109 DOM nodes and 13 JS event listeners**. The test asserts no growth between these warm lifecycle samples and verifies no `[data-ghostcursor]` hosts remain. [Raw repeated-cleanup counters](measurements/phase2-cleanup.json) are retained. Unit tests additionally assert expired effects leave no animation frames and destroyed note views disconnect observers. This is bounded cleanup evidence, not a general proof of no possible leak.

## Actual implementation screenshots

- [Remote note and toolbar](images/phase2-notes.png)
- [Remote laser, cursor and note](images/phase2-laser.png)
- [Author editing controls and moved toolbar](images/phase2-toolbar.png)

These are screenshots produced by the successful Chromium run, not mockups. Visible private-looking field strings are dummy fixture values. No invitation is included in these committed screenshots.

## Limits and reproduction

Public-relay connectivity across separate external networks remains **unverified**. No TURN, Firefox conversion, Edge/Brave run, store publishing, landing page, independent security audit or broad performance claim is included. Structural anchors cannot distinguish all semantically different but structurally identical content. Notes are session-only and author-owned, and are removed from other profiles when their author disconnects. All current features share the reliable ordered DataChannel exposed by the pinned library.

```sh
npm ci
npm run check
npm run format:check
npx playwright install chromium
npm run test:e2e
npm audit
```

Ports **8787** and **8788** must be free. Linux may require `npx playwright install --with-deps chromium`. Use Playwright's extension-capable Chromium; branded browser command-line extension flags can differ. The included [manual procedure](MANUAL_TESTING.md) tests two actual user profiles and the production permission flow.

The source branch is `feature/ghostcursor-phase2`, based on the completed Phase 1 history. Code/tests are in `665c2f2`; documentation and screenshots are committed separately. Run `git log --oneline -4` for the final local commit hashes. No main merge, force push, remote publication or deployment was performed.
