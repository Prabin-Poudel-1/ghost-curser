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

## Phase 3 — implemented, with explicit release limits

- Separate Chromium and Firefox production builds, a native browser API adapter, and a browser-independent session-host interface.
- Chromium keeps its offscreen context; Firefox uses a visible extension-owned networking tab and non-persistent background routing.
- Genuine Firefox ↔ Firefox and Firefox ↔ Chromium local WebRTC tests, explicit Firefox event-page termination, Chromium host interruption/recovery, and all previous feature tests.
- Stable Firefox ID and reviewed data-consent categories; no unsupported offscreen permission, raw URL signaling, account identities or new host grants.
- Bounded jittered transport recovery, protocol-suite compatibility negotiation, stricter transport identity binding after presence expiry, and pre-IPC rate limiting.
- Bounded anchor traversal, coalesced/throttled note positioning, detached-body observer replacement, visibility-aware transient rendering, and repeated/longer-session resource checks.
- Repeatable ZIP packaging, Mozilla lint validation, full audit disclosure and a combined manual guide. One unpatched low-severity advisory remains in Mozilla's development-only linter dependency chain; production runtime dependencies audit clean.

Still required before a public store release: branded Edge/Chrome/Brave manual runs, older-version coverage, cross-network/NAT tests, broader accessibility and website checks, eight-peer/hour-scale benchmarks, dependency/license review and independent security review. No TURN infrastructure is deployed. No Firefox signing or store submission has occurred.

GitHub `origin` is configured. Initial normal pushes were blocked by commit-email privacy protection. The owner asked to keep history local and not push; all prior commits remain preserved and Phase 3 is unmerged. Resume publishing only after a new authorization resolves that boundary.

## Phase 4 — planned, not implemented here

Build a separate React + Tailwind demonstration website after extension acceptance. Include product explanation, clearly labeled split-screen demonstration, installation/privacy pages, a real GitHub link and store links only when listings exist. Keep web dependencies out of the extension.

Evaluate free static hosting such as Cloudflare Pages at launch time. Distinguish local simulations from real networking. Deployment/store publication require authorization. No landing page, Firefox conversion, TURN infrastructure or public publishing is part of Phase 2.

## Extensible seams

- `SessionHost` / native `api`: browser-specific host activation without a shared lifecycle assumption.
- `Transport` / `TransportFactory` / `RoomTransportFactory`: rendering-independent networking adapters.
- `Connection` / `SessionEvents.feature`: validated identity, presence, recovery and feature dispatch.
- `FeatureMessage` / `DomAnchor` / `NoteRecord`: strict versioned wire schemas.
- `NoteStore` / `LaserSampler`: browser-independent collaboration logic.
- `Collaboration` / `Effects` / `NoteView` / `Toolbar`: isolated page interaction and rendering.

Future capabilities must negotiate their schema version and preserve resource/privacy bounds; do not silently broaden anchor metadata or persistence.
