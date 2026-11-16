# GhostCursor

**Browse together. Point anywhere.**

A working Manifest V3 extension for private, peer-to-peer live cursors. Phase 1 includes secure invitations, named and colored cursors, presence, interpolation, idle hiding, a charcoal popup, retry, and immediate local leave. Click effects, drawing, notes, Firefox packaging, and the public website are intentionally reserved for later phases.

## Run

Use Node **22.12+** (24 LTS recommended) and npm. Dependencies are pinned in the lockfile.

```sh
npm ci
npm run dev         # build both extension bundles in watch mode
npm run build       # clean production build → dist/
npm run check       # strict TypeScript, ESLint, unit tests, production build
npm run format:check
npx playwright install chromium
npm run test:e2e    # builds production + isolated local-test variants, runs real Chromium/WebRTC
```

The watch build uses Vite + CRXJS, with a separate Vite IIFE for programmatic content injection. Reload the extension and the test page after source changes. No development server or remote executable code is required. Never install `dist-test/` for normal browsing.

## Install unpacked in Chrome or Edge

1. Run `npm ci` and `npm run build` (or use the supplied `dist/` build). If using the packaged ZIP, extract it first and select the extracted folder containing `manifest.json` instead of `dist/`.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**, choose **Load unpacked**, and select this project's **dist** directory.
4. Pin GhostCursor to the toolbar. Open a regular HTTP(S) webpage and click its toolbar icon.
5. Enter a display name, choose a color, and click **Create a private room**. Copy the full `gc1_…` invitation and share it privately.

The Chromium manifest requires version 127+. Automated verification uses the bundled Playwright Chromium version listed in [verification](docs/VERIFICATION.md). Edge and Brave manual verification remains necessary; Firefox needs its own lifecycle adapter and manifest.

## Test with two profiles

1. Create two separate browser profiles, or use two independently launched Chromium browsers. Install `dist/` in both. Two tabs in one profile do not create independent users.
2. Open the **same origin and pathname** in both profiles. For example, both visit `https://example.com/`.
3. In profile A, open the toolbar popup, enter `Ada`, and create a room. Send its invitation to profile B through a private channel.
4. In profile B, open the toolbar popup, enter `Bea`, paste the invitation, and click **Join**.
5. Both popups should say **Connected** and show both names. Close the popups and move each pointer over the page. The other profile should show a labeled cursor.
6. Resize one window: positions map to the same fraction of each viewport. Leave the pointer still for six seconds: its remote cursor hides.
7. Open either popup and **Leave room**. That page's overlay is removed immediately; the remote participant disappears on the leave event, or after the presence timeout if the network is lost.
8. Refreshing, closing, or navigating away ends that page's session. Rejoin explicitly with the saved invitation. Use **Retry connection** after a recoverable discovery/connection failure.

A lone room creator is **Connecting**, not Connected. After 30 seconds without a peer, the popup explains possible causes; discovery can still succeed later. Check matching paths, invitation, connectivity, and firewall restrictions. No TURN relay is configured, so direct WebRTC is not guaranteed across all networks.

## Privacy and permissions

Nothing activates until Create or Join. Production permissions are only `activeTab`, `scripting`, and `offscreen`; there are no persistent host grants, automatic content scripts, storage, history, cookies, clipboard-read, or capture permissions.

Cursor coordinates, chosen display names, color preferences, ephemeral peer identities, and presence travel over encrypted WebRTC DataChannels. Signaling uses public Nostr infrastructure, with a 256-bit invitation used as the shared password and an HMAC-derived page topic. Raw webpage URLs are not sent to signaling. WebSockets originate in the extension's offscreen document so their Origin headers do not expose the page origin. Public relays and STUN services still observe network metadata, including IP addresses. Direct peers can learn each other's network addresses.

GhostCursor does not read or transmit form contents, typed webpage text, passwords, screenshots, cookies, auth tokens, or browsing history. Display names are explicitly entered in the extension. See [security and privacy](docs/SECURITY.md) for trust boundaries and limitations.

## Limits

- One activated tab per browser profile; at most eight participants in a room. Colors resolve collisions locally, so a peer's displayed color can differ between viewers.
- Positions are viewport-relative, not attached to webpage elements. Different scroll positions, zoom, layouts, device sizes, content, or responsive breakpoints can place pointers over different elements. Pinch zoom and nested frames are not synchronized.
- Query strings, fragments, and URL credentials are excluded from page matching. Query-driven pages can therefore match even when their content differs. Matching paths are case-sensitive; a trailing slash matters. SPA pathname changes end the session within roughly 500 ms.
- Browser pages, extension pages, browser stores, built-in PDF viewers, local files, and subframes are unsupported. Host pages can inspect or remove the shared DOM overlay; Shadow DOM provides CSS isolation, not a security boundary.
- No persistent rooms, host account, ownership, member removal, or global invitation revocation. Whoever knows a code can join; names are unverified. Leaving disconnects you, not other members. Use a new invitation if one leaks.
- Public signaling can fail or be rate-limited. No TURN, delivery SLA, internet-wide reliability guarantee, or independent security audit. Background tab throttling or browser suspension can delay presence timers.
- Performance bounds are implementation targets, not a hardware benchmark. Tests distinguish simulated unit transports from real local WebRTC.

## Project map

- `src/background/`: permission-gated injection and offscreen creation; no networking state.
- `src/content/`: event capture and isolated, pointer-transparent SVG cursor overlay.
- `src/networking/`: session state machine, validated protocol, extension transport bridge, and Trystero offscreen host.
- `src/popup/`: accessible vanilla TypeScript UI.
- `src/shared/`: invitation security, constants, types.
- `tests/unit/`: security, schema, coordinates, presence/recovery, rendering, popup states.
- `tests/e2e/`: independent extension profiles, real RTCDataChannels, local Nostr signaling fixture.

Read [architecture](docs/ARCHITECTURE.md), [verification](docs/VERIFICATION.md), and the [Phase 2–4 plan](docs/ROADMAP.md). No site, store listing, deployment, or remote repository has been published.
