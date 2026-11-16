# Architecture and dependency decisions

## Chromium process boundaries

```text
Toolbar popup ── commands ──> MV3 service worker
                                  │ activeTab + scripting
                                  ▼
Activated top-frame content script ── runtime.Port ──> Extension offscreen document
  Connection state + page identity                       HMAC page topic
  Pointer capture (20 Hz maximum)                        Trystero identity + signaling
  Shadow DOM cursors, effects, notes                               WebRTC DataChannels
                                  <── join/leave/messages ──┘
```

The worker only routes extension-owned commands and creates the offscreen document with the `WEB_RTC` reason. Networking lives outside both the popup and worker. The content script owns that page's participation state; its port disconnection tears down the transport when the page goes away. The singleton offscreen document can remain loaded when idle, but has no active room or cursor timers. In-memory library crypto caches are not a durable storage system and are discarded when the document/browser is destroyed.

Why offscreen: testing showed that a content-script WebSocket exposes the page origin in its Origin header. The offscreen origin is `chrome-extension://…`, keeping that metadata out of public signaling. WebCrypto derivation also lives there, so ordinary non-secure HTTP pages do not need `crypto.subtle` in their own context. Only sanitized origin/path passes through local extension messaging; no raw query, credentials, or fragment reaches the transport.

There is one active transport per profile. A second tab receives an explicit error and cannot displace another tab. Retry waits for a close acknowledgment before opening the replacement. Generation counters ignore late messages and canceled starts. A bounded close timeout allows local leave even if the transport becomes unavailable.

## Activation and lifecycle

Opening the popup only queries existing state. Create/Join validates inputs, obtains access to the active tab, ensures an offscreen host exists, then injects a self-contained IIFE into the isolated top-frame world. Duplicate injection installs no duplicate listeners. The extension does not use web-accessible scripts or wildcard host grants.

The page session tracks `connecting`, `connected`, and `disconnected` plus its current invitation and participants. A WebRTC join alone is insufficient: a validated v1 hello adds the participant. Hello and heartbeat messages repeat every five seconds. A 25-second presence expiry removes the displayed participant; a later valid hello restores an existing channel. Peer leave removes its cursor promptly. A 30-second no-peer deadline produces an honest connection error without pretending an empty room is a network failure. Background browser throttling may extend these wall-clock deadlines.

Local leave removes overlay, listeners, timers, pending cursor work, invitation, and participant state immediately, then closes the port/room. A single dormant runtime command dispatcher remains for explicit reactivation; page input listeners are removed. Navigation triggers the same cleanup. SPA pathname changes are checked every 500 ms; query/fragment changes intentionally retain the same page room. After refresh or navigation there is no automatic resumption.

## Cursor protocol and transport

v1 uses strict JSON messages with an exact field set: `hello`, `cursor`, `hide`, `beat`, and `bye`. Cursors use normalized `[0,1]` CSS viewport coordinates, quantized to four decimals, with monotonically increasing sequence numbers. Receivers reject invalid ranges, versions, types, extra fields, unsafe sequences, empty/oversized/control-character names, and unknown peers.

The v1 decoder rejects strings longer than 512 code units. Phase 2 raises the shared application-action limit to 4096 UTF-8 bytes for validated v2 annotation messages. Trystero's aggregate receive budget is 16 KiB: its authenticated identity handshake exceeds the cursor-message limit. Setting the whole room to 512 bytes was tested and broke the handshake. Each peer is limited to 60 application messages per second after decoding by the library; this bounds application work but is not a network-level DoS firewall.

Outgoing motion samples at most every 50 ms. Only one cursor send is pending at a time; superseded movements are dropped rather than accumulating. Extension bridge sends have a five-second deadline and a 16-request cap. The overlay uses compositor transforms and `requestAnimationFrame` until interpolation settles, then stops scheduling frames. Cursors hide after six seconds without movement, on explicit hide, and on local visibility changes. Resize rerenders using current viewport dimensions. Reduced-motion users receive immediate positions.

## Phase 2 collaboration

`Connection` validates transport identity, v1 presence and v2 capability/profile messages before delivering `SessionEvents.feature`. The content-level `Collaboration` controller connects pure `NoteStore` / `LaserSampler` logic to the isolated `Toolbar`, `Effects` and `NoteView`. Networking has no rendering dependency. The existing cursor overlay remains separate.

A UUIDv4 session ID comes from `crypto.getRandomValues`, which also works on non-secure HTTP pages; `crypto.randomUUID` is deliberately not required in content scripts. It survives a same-page Retry, changes on new activation, and is bound to one authenticated transport peer. Display-name changes increment a profile revision. Names never serve as identity keys. Color collision handling remains viewer-local, with one participant color shared across that viewer's roster/cursor/effects/notes.

v2 messages use strict exact-field schemas: `participant`, `click`, `laser_start/move/end/clear`, `note_create/update/delete/sync`. Transient sequence numbers reject duplicate/reordered updates. Note revisions and tombstones handle duplicates independently. The handshake gates outgoing features; legacy v1 clients ignore v2 and continue cursor sharing.

The pinned Trystero core creates `pc.createDataChannel("data")` with default reliable ordered delivery. Its public action API does not expose per-action unreliable channels. All features deliberately reuse that channel. Lasers batch at 100 ms, cap batches at 12 points and strokes at 120 points, and expire with no durable history. Clicks sample at 5 Hz. SVG effects are pointer-transparent, use animation frames only while active, and respect reduced motion. No image/canvas frames or native DOM actions cross the wire.

Notes are author-owned monotonic registers keyed by authenticated session ID plus immutable note UUID. Higher revisions win; serialized-record lexical ordering resolves equal-revision live conflicts; deletion wins a tie and is permanent for that ID. Each author has 16 IDs including tombstones, each note at most 600 characters. Local changes use a capped serial send queue. New capable peers receive the owner's own live records/tombstones directly; forwarded third-party snapshots cannot spoof ownership. An author disconnect removes their records from receivers. Same-page Retry retains local authored records for resynchronization; leave/navigation discards all local notes.

Anchors combine a bounded tag path, sibling indices/counts, child-tag shape and offset, without text, IDs, classes or attributes. Existing live node references track DOM moves. Detached targets resolve through the structural path; a narrowly scoped final-child fallback handles a unique shape after sibling insertion. Ambiguity or deletion yields an unplaced card. Replacement/scroll/layout fixtures are tested; identical structural reorderings are an acknowledged semantic limitation.

`NoteView` observes local child-list and class/style/hidden invalidations, target/body resizing, window resizing and capture-phase scrolling. It coalesces positioning into one animation frame, hides offscreen cards, and disconnects observers/listeners on destruction. It never serializes mutation records or attribute values. No frame loop runs for stationary notes. The toolbar intercepts only its own controls; its drag grip uses pointer capture and viewport clamping. Arrow keys move it, Escape exits modes, and only page-lifetime module memory remembers its position. Forms/editables, custom/shadow elements and embedded contexts are excluded conservatively.

See [security](SECURITY.md) for exact resource limits and [verification](VERIFICATION.md) for measured results. Bounded resources are implementation constraints, not latency/CPU guarantees.

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

## Phase 3 browser and reliability adapter

`src/browser/api.ts` selects native Promise APIs. `SessionHost.ensure()` in `session-host.ts` isolates Chromium offscreen creation from Firefox networking-tab creation/readiness. Firefox has its own plain Vite HTML and background IIFE builds; CRXJS continues to own only the Chromium manifest/worker build. Both content bundles use the same application code with a compile-time browser target. Test flags and loopback permissions are separate builds.

Firefox's non-persistent background script only routes activation/control. A visible extension-owned session tab imports the shared transport host, and therefore owns WebSocket/WebRTC and the content runtime port. An explicit ping ensures it is ready; duplicate starts share a creation promise and reuse an existing host. Closing it revokes participation. Its idle document may remain open without an active room; it never stores invitations or notes durably. Tests force the Firefox background to `stopped` and continue exchanging cursors, proving the event page does not own networking.

An additive strict v1 `compat` message advertises suite bounds 1–2. A nonintersecting range suppresses the peer and shows an update error. Current v1 cursors and v2 annotations retain their formats, HMAC topic context and Trystero action names. Unknown schemas are never guessed or coerced. The bound session ID is retained even when displayed presence expires.

A four-attempt jittered exponential recovery budget wraps recoverable transport failures, with a restart lock and generation checks. The content page can ask the routing background to restore a Chromium host before retrying. Firefox host closure is explicit end, not recovery. A single empty creator does not cause repeated room recreation. The pinned Nostr implementation also has its own relay health cooldowns; websocket handshake probing is recorded separately from actual room connectivity.

Security-sensitive API or host errors are classified, never reflected verbatim with raw tokens/URLs. Permission-removal notifications route to host revocation. Input messages are rate limited before IPC, then schema/identity checked in the page state machine. Annotation queue and size limits remain unchanged.

Node traversal is bounded, note invalidations are throttled to 20 Hz, hidden-page annotation work pauses, and detached body observation is replaced. No broad redesign or UI framework was introduced. See the measured renderer scope and audit exception in the current verification/security reports.
