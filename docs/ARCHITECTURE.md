# Architecture and dependency decisions

## Process boundaries

```text
Toolbar popup ── commands ──> MV3 service worker
                                  │ activeTab + scripting
                                  ▼
Activated top-frame content script ── runtime.Port ──> Extension offscreen document
  Connection state + page identity                       HMAC page topic
  Pointer capture (20 Hz maximum)                        Trystero identity + signaling
  Shadow DOM + SVG cursors                               WebRTC DataChannels
                                  <── join/leave/messages ──┘
```

The worker only routes extension-owned commands and creates the offscreen document with the `WEB_RTC` reason. Networking lives outside both the popup and worker. The content script owns that page's participation state; its port disconnection tears down the transport when the page goes away. The singleton offscreen document can remain loaded when idle, but has no active room or cursor timers. In-memory library crypto caches are not a durable storage system and are discarded when the document/browser is destroyed.

Why offscreen: testing showed that a content-script WebSocket exposes the page origin in its Origin header. The offscreen origin is `chrome-extension://…`, keeping that metadata out of public signaling. WebCrypto derivation also lives there, so ordinary non-secure HTTP pages do not need `crypto.subtle` in their own context. Only sanitized origin/path passes through local extension messaging; no raw query, credentials, or fragment reaches the transport.

There is one active transport per profile. A second tab receives an explicit error and cannot displace another tab. Retry waits for a close acknowledgment before opening the replacement. Generation counters ignore late messages and canceled starts. A bounded close timeout allows local leave even if the transport becomes unavailable.

## Activation and lifecycle

Opening the popup only queries existing state. Create/Join validates inputs, obtains access to the active tab, ensures an offscreen host exists, then injects a self-contained IIFE into the isolated top-frame world. Duplicate injection installs no duplicate listeners. The extension does not use web-accessible scripts or wildcard host grants.

The page session tracks `connecting`, `connected`, and `disconnected` plus its current invitation and participants. A WebRTC join alone is insufficient: a validated v1 hello adds the participant. Hello and heartbeat messages repeat every five seconds. A 25-second presence expiry removes the displayed participant; a later valid hello restores an existing channel. Peer leave removes its cursor promptly. A 30-second no-peer deadline produces an honest connection error without pretending an empty room is a network failure. Background browser throttling may extend these wall-clock deadlines.

Local leave removes overlay, listeners, timers, pending cursor work, invitation, and participant state immediately, then closes the port/room. A single dormant runtime command dispatcher remains for explicit reactivation; page input listeners are removed. Navigation triggers the same cleanup. SPA pathname changes are checked every 500 ms; query/fragment changes intentionally retain the same page room. After refresh or navigation there is no automatic resumption.

## Wire protocol

v1 uses strict JSON messages with an exact field set: `hello`, `cursor`, `hide`, `beat`, and `bye`. Cursors use normalized `[0,1]` CSS viewport coordinates, quantized to four decimals, with monotonically increasing sequence numbers. Receivers reject invalid ranges, versions, types, extra fields, unsafe sequences, empty/oversized/control-character names, and unknown peers.

The application action rejects payloads above 512 bytes before delivery, and its decoder also rejects strings longer than 512 code units. Trystero's aggregate receive budget is 16 KiB: its authenticated identity handshake exceeds the cursor-message limit. Setting the whole room to 512 bytes was tested and broke the handshake. Each peer is limited to 60 application messages per second after decoding by the library; this bounds application work but is not a network-level DoS firewall.

Outgoing motion samples at most every 50 ms. Only one cursor send is pending at a time; superseded movements are dropped rather than accumulating. Extension bridge sends have a five-second deadline and a 16-request cap. The overlay uses compositor transforms and `requestAnimationFrame` until interpolation settles, then stops scheduling frames. Cursors hide after six seconds without movement, on explicit hide, and on local visibility changes. Resize rerenders using current viewport dimensions. Reduced-motion users receive immediate positions.

## Build compatibility

Verified installed versions: TypeScript 6.0.3, Vite 8.3.8, CRXJS 3.0.0, Trystero 0.27.0, Vitest 5.1.0, Playwright 1.65.1. CRXJS advertises compatibility with Vite 3–8. The actual installed Trystero 0.27 types use `room.onError`, object-returning `makeAction`, and context objects in peer callbacks; older examples using tuples or a third joinRoom callback are incompatible.

CRXJS builds the popup, worker, manifest, and offscreen module. A second Vite build emits a single IIFE `content.js` for `scripting.executeScript`. This avoids dynamic content module loaders and the extra web-accessible resources they require. Production builds clean their generated output first; watch mode preserves the other concurrent bundle.

The dependency tree contains only Trystero and its Nostr/core/cryptography dependencies at runtime. An explicit `minimatch` 11.0.8 override under typescript-estree fixes a dev-tool advisory; lint/type checks validate the resolution. Lockfile and npm audit results accompany verification. Browser minimum is 127 because the selected library uses modern Promise/Set APIs; only the tested Chromium build is claimed as verified.

Authoritative references consulted during implementation:

- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [CRXJS content scripts](https://crxjs.dev/concepts/content/)
- [Trystero signaling](https://trystero.dev/docs/signaling-strategies/)
- [Trystero connection troubleshooting](https://trystero.dev/docs/connections/)

Installed package declarations and source, rather than stale online examples, were used to resolve API differences.
