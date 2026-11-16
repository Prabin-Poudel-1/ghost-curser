# Privacy and security assessment — Phase 3

## Data boundaries

| Recipient                     | Data available                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local popup                   | Chosen name/color, current session state, invitation, participant list                                                                                                    |
| Local content script          | Pointer position, visibility, viewport geometry, local URL for page matching; selected element tag structure and bounds; intentional note text                            |
| Extension networking host     | Sanitized origin/path through a private runtime port, invitation, ephemeral identities and peer payloads                                                                  |
| Public Nostr signaling relays | Source IP, timing, extension origin, ephemeral signing keys, hashed topics and encrypted SDP/ICE payloads                                                                 |
| Default STUN services         | Network address and ICE connection metadata                                                                                                                               |
| Room members over WebRTC      | Names/colors, session IDs, presence, cursor/click/laser positions, intentional note text, timestamps, revisions and structural anchors; peers can learn network addresses |
| Webpage itself                | Shared overlay DOM: visible labels, notes and note-editor drafts; not the invitation or isolated extension JavaScript state                                               |

No analytics, cloud database, screenshots, form-value reads, password contents, webpage keystroke streaming, cookies, authentication tokens, account IDs, history API reads or durable note/room storage are implemented. Escape/Enter are inspected locally for tool controls. The intentional name and note editors collect only text the user chooses to share. Query parameters, URL credentials and fragments are discarded before local transport messages. No remote executable scripts or eval are used.

Room discovery derives HMAC-SHA-256 from the 256-bit invitation and versioned origin/path. The invitation also supplies Trystero's signaling password. A relay cannot perform a simple public-URL dictionary attack without the secret. Secret holders can compute candidate topics and join. WebRTC encrypts application traffic with DTLS; Trystero handles encrypted signaling and its identity handshake. This implementation review is not an independent cryptographic audit.

Signaling runs in the Chromium offscreen document or Firefox session tab, keeping webpage origins out of WebSocket Origin headers. Local integration tests check extension-origin headers and absence of raw invitations, fixture page paths, note plaintext and sensitive field values in relay traffic. These focused regressions are not a proof of every metadata behavior. Public services still observe IP/timing metadata, and direct peers can learn network addresses.

## Permissions and activation

Chromium permissions remain `activeTab`, `scripting`, `offscreen`; Firefox uses `activeTab` and `scripting` with a separate MV3 event-page manifest. Create/Join explicitly injects a bundled top-frame script. No production host permissions, automatic content scripts, storage permission, web-accessible scripts or externally connectable API are added. Runtime sender identities and command schemas are checked. Only the isolated test build permits loopback access and accepts a popup target-tab override.

One transport per profile runs outside the popup/worker. Leave removes active UI, observers, page-input listeners, timers and transport participation. A dormant isolated-world command dispatcher remains to allow reactivation; it does not capture page input. Toolbar position survives only within that document's module memory. Refresh/navigation requires explicit rejoining.

## Capture and anchor privacy

Whole forms, input/select/textarea fields, editable regions, custom/shadow components, embedded documents and extension UI are conservatively excluded from local pointer/annotation capture. Synthetic page pointer/click events do not create outgoing feedback. Remote clicks are visual only and are suppressed over sensitive local targets or extension UI. No message dispatches native DOM clicks, edits or script execution.

Anchors contain only a maximum 16-step allowlisted tag path, same-tag sibling indices/counts, up to eight immediate child tag names and normalized offsets. No IDs, class names, CSS selectors, labels, text quotes, values, accessible-name strings, data attributes or account identifiers are harvested. The observer watches child-list and class/style/hidden changes as local invalidation signals; it does not serialize those attribute values.

Resolution checks structure and sensitivity. A restricted fallback can match a formerly unique child's shape after sibling insertion within its resolved parent. Deleted/ambiguous paths become unplaced; no global search for an unrelated lookalike occurs. Replacement nodes and existing live target references support typical rerenders. Structural similarity does not prove semantic equivalence across personalized pages or identical reorderings. Page-matching deliberately excludes query strings, so participants must verify that they are discussing the same content.

## Untrusted peers and bounded protocol

v1 cursor messages retain exact schemas and now enforce a 512-UTF-8-byte decoder bound. An additive `compat` envelope declares supported protocol suites 1–2; incompatible ranges produce an explicit error and block that peer’s application messages. Legacy clients without the envelope remain supported under their existing strict v1/v2 schemas. The application action now accepts up to **4096 UTF-8 bytes** for v2 annotations. Exact object keys, finite bounded coordinates, safe integer sequences/revisions, UUIDv4 IDs, allowed tag names, bounded text and type-specific fields are validated. Unknown fields/types, malformed JSON, control/bidi characters and oversized messages are rejected. Note text permits newline/tab and is rendered with `textContent`, never interpreted as HTML. Palette indices cannot inject CSS.

A v2 participant handshake follows v1 hello. Each random session ID is bound to the actual transport peer, cannot equal the local ID, cannot change on an existing peer, and cannot duplicate another transport peer's bound ID, including after a presence timeout. Features are sent only to peers that have advertised v2. Names may change by revision without changing identity. A malicious invited participant can still lie about their name and supply arbitrary permitted note content.

Note ownership comes from that transport binding, not a sender-supplied author field. Only an author's own records are accepted from them; third-party forwarding is not trusted. Note IDs are immutable, author-scoped UUIDs. Higher revisions win; equal revisions use a deterministic serialized-record ordering, with deletion winning a tie. A deleted ID never resurrects, even with a higher revision. The view renders the selected record even when its revision ties. Timestamps are display metadata, not authorization or conflict clocks.

Owners send bounded snapshots directly to newly capable peers. A departed author's records are removed from receivers. Local authored notes survive connection retry on the same active page and resynchronize; leave/navigation discards them. This avoids unauthenticated third-party historical snapshots and stale ownership claims. There is no durable or cloud storage.

| Resource                          | Bound                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Participants                      | 8 including self                                                                 |
| Application messages              | 60 per second per peer, including invalid attempts                               |
| Application payload               | 4096 UTF-8 bytes; v1 decoder retains its smaller bound                           |
| Trystero aggregate receive budget | 16 KiB, allowing its authenticated handshake                                     |
| Cursor sampling                   | At most 20 Hz; one pending cursor send                                           |
| Click sampling                    | At most 5 Hz locally; at most 32 rendered ripples                                |
| Laser batches                     | At most 12 points per batch; scheduled at 100 ms; final flush on release         |
| Laser storage                     | 120 points per stroke, 2 strokes per owner, 16 total                             |
| Laser expiry                      | About 3 seconds after latest update; absolute lifetime at most 6 seconds         |
| Notes                             | 16 immutable IDs per author including tombstones; 8 authors; 600 characters each |
| Queued note sends                 | 128; serialized delivery with a visible failure notice                           |
| Extension bridge                  | 16 pending requests; 5-second request deadline                                   |

Cursor, laser and note traffic reuse Trystero's current reliable ordered DataChannel. The installed library does not expose per-action unreliable/unordered channels; no unsupported channel configuration is claimed. Transient updates are batched and bounded, but congestion can delay them. Limits bound application work, not all pre-decoding transport/network resource consumption. Invitees can still deny service below this layer.

## Trust and release limits

An invitation is a bearer capability, not verified identity. There are no admins, bans or global revocation. Leaving cannot erase another participant's copy or recording. Create a new room after an invitation leak. Note author controls prevent ordinary cross-author edits, not a hostile author publishing deceptive notes under their own identity.

Shadow DOM provides CSS isolation, not confidentiality from the host page. Host scripts can inspect, spoof or remove the overlay and read annotation text/drafts. A compromised browser, extension or local system is outside this protection boundary. Use trusted webpages and do not enter secrets in annotations.

No TURN service is configured. Public relay uptime/retention and STUN policies are outside this project's control. Production retains the pinned library's default relays and Google/Cloudflare STUN configuration. Public-relay/cross-NAT connectivity has not been validated across separate external networks. Before a store release, complete browser compatibility, external-network and adversarial load tests, accessibility/permission review, dependency/license review and independent security assessment. No store release or deployment was performed.

## Phase 3 hardening and lifecycle findings

- The native API adapter uses Firefox's Promise-based `browser` namespace and Chromium's `chrome` namespace. Firefox does not receive Chromium's offscreen permission. The networking tab never displays a page URL or invitation, and closing it explicitly ends sharing rather than reopening it. Both popup closure and forced Firefox event-page termination are covered by real-network tests.
- Host admission verifies the content script's extension ID, top-frame identity, supported sender URL and exact sanitized page identity. A content script cannot request a room topic for a different page through the bridge. Only trusted extension contexts may issue host control messages.
- Host revocation terminates transport and clears page participation. Background permission-removal events use that path; a browser-driven permission dialog/disable flow still needs the planned manual matrix. Tab/port closure cleans the active transport. Chromium host loss is recoverable; Firefox host closure is explicit termination.
- Recovery uses at most four attempts, with exponential base delays of 2/4/8/16 seconds and ±25% jitter. Manual Retry or 60 seconds of stable connection resets the budget. Generation counters, a restart lock and a single host prevent stale callbacks/duplicate starts. An empty creator room is not repeatedly restarted. Trystero also implements its own bounded-delay relay cooldown/reconnect behavior; the application budget does not claim to cap every library-level socket retry.
- Transport session IDs remain bound after a heartbeat expires; a different ID on that same transport is rejected. Replayed cursor/laser sequences are ignored. Malformed/unauthorized messages do not renew presence merely by passing JSON parsing. Note ownership remains transport-derived and author-scoped.
- Inbound application rates are limited in the networking host before crossing the extension IPC bridge, as well as in the content state machine. Unknown peers receive no limiter slot; limiter storage is bounded to seven remote peers and cleared on departure/leave. Library-level unauthenticated work still precedes these application checks.
- Anchor walks inspect at most 2048 children per parent, at most 1024 matching siblings, 16 path steps and 64 ancestors for sensitivity checks. Child fingerprints read at most eight tags without allocating a complete child list. No selectors, private attributes or accessibility text were added. Large/ambiguous structures fail closed to an unplaced note.
- Note positioning coalesces events and runs at most about 20 Hz. Hidden pages stop note frames and drop transient effects; live notes still synchronize. Detached body/target ResizeObserver registrations are replaced or released. Existing cursor interpolation and reduced motion remain intact.

## Firefox data-consent review

The Firefox manifest deliberately does **not** declare `none`. Required categories are chosen names (`personallyIdentifyingInfo`), note communications (`personalCommunications`), cursor/click activity (`websiteActivity`), minimal structural anchors (`websiteContent`) and a conservative page-matching declaration (`browsingActivity`). No optional telemetry is implemented. Firefox's required install consent governs these categories; the extension additionally requires explicit Create/Join activation. See [compatibility](COMPATIBILITY.md) for the official Mozilla sources and rationale. This mapping has not been reviewed or signed by AMO.

## Dependency audit finding and scope

The production dependency tree has **zero reported advisories** in the executed audit. The full development tree has **three low-severity findings arising from one upstream issue**: `deepmerge` 4.3.1 → Mozilla `addons-linter` → `web-ext`. [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) describes prototype poisoning during object merging and lists no patched version. The installed current `web-ext` 10.8.0 pins the affected chain. A suggested downgrade to web-ext 3.2.1 would discard modern MV3 validation; it was not applied.

This chain runs only as a local/CI validation tool against the repository's own generated packages. It is not bundled in the extension and never processes peer messages at runtime. The full audit remains nonzero and is reported as such. CI separately gates the production audit and moderate-or-higher tooling findings while retaining disclosure of this low-severity exception. Do not run the affected toolchain against untrusted downloaded add-ons. Update the linter when a compatible fixed dependency is published. No forced audit fix, falsified version or concealed vendored fork is used.

## Public repository review

Before the attempted initial push, all tracked historical trees were scanned for private-key headers, common GitHub/AWS credential patterns, literal full room invitations and sensitive credential filenames. No matches were found. Screenshots contain only fixture content, and invitation-bearing test screenshots remain ignored. Generated builds, dependencies, environment files, private key formats, credential JSON, logs and temporary artifacts are ignored. Pattern scanning is not a proof that no secret can ever exist.

GitHub rejected the normal push with **GH007** because commit metadata contains a private email address. After that rejection, the owner explicitly requested local-only work. No bypass, force push, history rewrite or remote branch creation was performed. New local commits use the supplied noreply address; old commits and their hashes remain unchanged. Remote CI has not run.
