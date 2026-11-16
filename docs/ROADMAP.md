# Four-phase delivery plan

## Phase 1 — complete, preserved

Private 256-bit invitations, page-scoped discovery, real Trystero WebRTC, offscreen networking, named viewport cursors, interpolation/idle hiding, bounded traffic, presence, retry, explicit activation and minimal popup. All 54 original unit tests and both original browser integration tests remain in the suite. Original history: `f347eac` implementation and `ac63045` documentation.

## Phase 2 — implemented

- Validated v2 capability/profile handshake on existing encrypted connections, with v1 cursor compatibility.
- Sensitive-target-excluding click ripples with bounded lifetime and reduced-motion support.
- Bounded laser batches, SVG rendering, expiry, owner-scoped remote clear and local clear.
- Shadow DOM floating toolbar: navigation, laser, note, clear, visibility, leave; pointer/keyboard positioning, Escape and accessible native controls.
- Plain-text author-owned notes, immutable IDs/revisions/tombstones, deterministic conflicts, direct-owner snapshots for late joiners and retry.
- Privacy-minimal structural anchoring, target replacement recovery, observer/scroll-driven positioning and an explicit unplaced-note fallback.
- Session-specific random identities and popup name editing. Viewer-local color collision handling preserves Phase 1 behavior and consistent colors across that viewer's cursor/effects/notes.
- New unit and genuine local WebRTC profile tests, sensitive-form fixtures, measured bundle/renderer resources, repeated cleanup checks and real screenshots. See the current verification report for executed counts.

The former proposal for text quotes, element IDs and accessible-name anchors was deliberately dropped: Phase 2 sends no webpage text or private attributes as metadata. Reliable ordered delivery is retained because the installed Trystero API does not expose separate per-action channel options.

Possible follow-up collaboration improvements, outside this task: explicit orphan reattachment, note-card collision layout, stronger room-wide color convergence, optional note history with a reviewed trust/persistence model, and broader responsive/animation/accessibility fixtures. Structural ambiguity is surfaced rather than hidden.

## Phase 3 — planned, not implemented here

- Verify Chrome/Edge/Brave manually across browser versions and policies; review permissions, accessibility, dependencies/licenses, hostile-page/peer behavior and external-network connectivity.
- Prepare a separate Firefox manifest/build and session-host adapter. Chrome's offscreen lifecycle is not portable; test Firefox's supported background document model before claiming compatibility.
- Prioritize Edge and Firefox publication under the initial $0 budget, checking current enrollment/signing policies when submission is authorized. Chrome/Brave initially use local installation.
- Expand schema fuzzing, pre-auth resource protection, reconnect/packet-delay stress tests, eight-peer load benchmarks and security review. Consider TURN only as a separately authorized infrastructure/privacy decision; no guaranteed-connectivity claim.

## Phase 4 — planned, not implemented here

Build a separate React + Tailwind demonstration website after extension acceptance. Include product explanation, clearly labeled split-screen demonstration, installation/privacy pages, a real GitHub link and store links only when listings exist. Keep web dependencies out of the extension.

Evaluate free static hosting such as Cloudflare Pages at launch time. Distinguish local simulations from real networking. Deployment/store publication require authorization. No landing page, Firefox conversion, TURN infrastructure or public publishing is part of Phase 2.

## Extensible seams

- `Transport` / `TransportFactory` / `RoomTransportFactory`: rendering-independent networking adapters.
- `Connection` / `SessionEvents.feature`: validated identity, presence, recovery and feature dispatch.
- `FeatureMessage` / `DomAnchor` / `NoteRecord`: strict versioned wire schemas.
- `NoteStore` / `LaserSampler`: browser-independent collaboration logic.
- `Collaboration` / `Effects` / `NoteView` / `Toolbar`: isolated page interaction and rendering.

Future capabilities must negotiate their schema version and preserve resource/privacy bounds; do not silently broaden anchor metadata or persistence.
