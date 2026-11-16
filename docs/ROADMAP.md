# Four-phase delivery plan

## Phase 1 — implemented MVP

Private 256-bit invitations, page-scoped discovery, real Trystero WebRTC DataChannels, named colored viewport cursors, smooth/low-motion rendering, bounded traffic, presence, retry, cleanup, explicit activation, minimal popup, and automated unit/browser tests. Phase 1 has no annotation rendering, click capture, note persistence, demonstration website, or cross-browser compatibility claim.

## Phase 2 — interactive collaboration

1. Negotiate protocol v2 capabilities before emitting new message kinds. Preserve the `Transport`/`TransportFactory` seam; v1 rejects unknown annotation messages. Add independent collaboration toggles and a clear session-level erase action.
2. Click ripples: send only normalized positions and an event identifier, bounded TTL and rate; never capture form values. Suppress sensitive-field interaction indicators by default. Keep click effects pointer-transparent.
3. Temporary lasers: bounded point batches, sequence/author IDs and TTL, simplification, segment caps, and deterministic expiry. Use a separate SVG layer; do not retransmit every frame or store drawings beyond their lifetime.
4. Cursor colors: extend the existing palette/local collision handling with a negotiated, consistent room-wide assignment. Continue displaying names so meaning never depends solely on color.
5. Sticky notes: implement `DomAnchor` (already defined in the protocol module) with stable IDs, accessible roles, bounded text quote/context, ancestor fingerprints, and normalized geometry. Resolve using multiple signals and a confidence threshold. CSS selectors may be hints, never the only anchor. If confidence is low or the page changes, mark the note unplaced and ask for reattachment.
6. Text anchors can expose webpage content: require an explicit annotation opt-in, avoid password/form/editable regions, bound quote sizes, and document what goes to peers. Never silently collect whole-page DOM or full text.
7. Annotation synchronization: versioned IDs, author ownership rules, Lamport clocks or a deliberately selected CRDT, deduplication, conflict/expiry rules, bounded snapshots for late joins, tombstone limits, and peer-input validation. Add rendering, anchoring-drift, conflict, and cleanup tests before enabling the feature.
8. Cleanup: remove every observer/listener/render loop on leave, clear expired annotations, bound history, and make per-session sharing controls visible and keyboard accessible.

## Phase 3 — browsers, hardening and distribution

- Chrome/Edge: keep MV3 build; manually verify the toolbar activeTab flow, offscreen behavior, updates, restrictive page errors, and enterprise policy behavior. Prepare Edge store assets and permission/privacy explanations first.
- Brave: test local unpacked installation and Shields/WebRTC privacy settings. Document required user-controlled settings without weakening browser protections automatically.
- Firefox: create a separate manifest/build and `BrowserSessionHost` implementation. Chrome's offscreen API is not portable; evaluate Firefox's supported background-page/extension-document lifetime and WebRTC CSP. Add an explicit permission/transport adapter and run Firefox tests before claiming support.
- Initial publishing budget is $0. Prioritize Edge and Firefox, verifying their current enrollment and signing policies at submission time. Chrome/Brave remain local-install targets initially; do not assume one package works everywhere.
- Extend input/schema fuzzing, pre-auth abuse limits, invite-leak threat modeling, network-loss/recovery tests, endpoint allowlisting options, accessibility checks, dependency/license review, external-network NAT testing, and a third-party security review.
- Evaluate opt-in TURN only with explicit metadata/cost disclosures, short-lived credentials, no credentials in the extension bundle, and privacy-policy updates. No guaranteed-connectivity claim without supporting evidence.

## Phase 4 — public demonstration and launch

Begin only after the MVP acceptance suite passes. Build a separate React + Tailwind site; do not add those dependencies to the extension runtime. Include landing/product explanation, clearly labeled local split-screen cursor simulation, installation guide, privacy policy, real repository link, and download links only when real Edge/Firefox listings exist.

Use a free static host such as Cloudflare Pages within its then-current free limits. Distinguish simulated demonstration traffic from actual peer connectivity. Do not auto-start real collaboration or collect visitor page activity. Validate accessibility, mobile presentation, install instructions, and policy accuracy before requesting authorization for deployment or publishing. This task does not build or publish the website.

## Extension interfaces already available

- `Transport`, `TransportHandlers`, `TransportFactory`, `RoomTransportFactory`: rendering-independent networking adapters.
- `Connection` / `SessionEvents`: testable presence and recovery state machine with injectable clock and transport.
- `Point`, `Participant`, `SessionState`: presentation-independent data types.
- `DomAnchor`, `AnnotationCapability`: types for future negotiated annotation support; no nonfunctional annotation controls are shown.
