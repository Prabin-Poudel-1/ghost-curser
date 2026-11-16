# Privacy and security review — Phase 2

## Data boundaries

| Recipient                     | Data available                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local popup                   | Chosen name/color, current session state, invitation, participant list                                                                                                    |
| Local content script          | Pointer position, visibility, viewport geometry, local URL for page matching; selected element tag structure and bounds; intentional note text                            |
| Offscreen extension document  | Sanitized origin/path through a private runtime port, invitation, ephemeral identities and peer payloads                                                                  |
| Public Nostr signaling relays | Source IP, timing, extension origin, ephemeral signing keys, hashed topics and encrypted SDP/ICE payloads                                                                 |
| Default STUN services         | Network address and ICE connection metadata                                                                                                                               |
| Room members over WebRTC      | Names/colors, session IDs, presence, cursor/click/laser positions, intentional note text, timestamps, revisions and structural anchors; peers can learn network addresses |
| Webpage itself                | Shared overlay DOM: visible labels, notes and note-editor drafts; not the invitation or isolated extension JavaScript state                                               |

No analytics, cloud database, screenshots, form-value reads, password contents, webpage keystroke streaming, cookies, authentication tokens, account IDs, history API reads or durable note/room storage are implemented. Escape/Enter are inspected locally for tool controls. The intentional name and note editors collect only text the user chooses to share. Query parameters, URL credentials and fragments are discarded before local transport messages. No remote executable scripts or eval are used.

Room discovery derives HMAC-SHA-256 from the 256-bit invitation and versioned origin/path. The invitation also supplies Trystero's signaling password. A relay cannot perform a simple public-URL dictionary attack without the secret. Secret holders can compute candidate topics and join. WebRTC encrypts application traffic with DTLS; Trystero handles encrypted signaling and its identity handshake. This implementation review is not an independent cryptographic audit.

Signaling runs in the extension-owned offscreen document, keeping webpage origins out of WebSocket Origin headers. Local integration tests check extension-origin headers and absence of raw invitations, fixture page paths, note plaintext and sensitive field values in relay traffic. These focused regressions are not a proof of every metadata behavior. Public services still observe IP/timing metadata, and direct peers can learn network addresses.

## Permissions and activation

Production permissions remain `activeTab`, `scripting`, `offscreen`. Create/Join explicitly injects a bundled top-frame script. No production host permissions, automatic content scripts, storage permission, web-accessible scripts or externally connectable API are added. Runtime sender identities and command schemas are checked. Only the isolated test build permits loopback access and accepts a popup target-tab override.

One transport per profile runs outside the popup/worker. Leave removes active UI, observers, page-input listeners, timers and transport participation. A dormant isolated-world command dispatcher remains to allow reactivation; it does not capture page input. Toolbar position survives only within that document's module memory. Refresh/navigation requires explicit rejoining.

## Capture and anchor privacy

Whole forms, input/select/textarea fields, editable regions, custom/shadow components, embedded documents and extension UI are conservatively excluded from local pointer/annotation capture. Synthetic page pointer/click events do not create outgoing feedback. Remote clicks are visual only and are suppressed over sensitive local targets or extension UI. No message dispatches native DOM clicks, edits or script execution.

Anchors contain only a maximum 16-step allowlisted tag path, same-tag sibling indices/counts, up to eight immediate child tag names and normalized offsets. No IDs, class names, CSS selectors, labels, text quotes, values, accessible-name strings, data attributes or account identifiers are harvested. The observer watches child-list and class/style/hidden changes as local invalidation signals; it does not serialize those attribute values.

Resolution checks structure and sensitivity. A restricted fallback can match a formerly unique child's shape after sibling insertion within its resolved parent. Deleted/ambiguous paths become unplaced; no global search for an unrelated lookalike occurs. Replacement nodes and existing live target references support typical rerenders. Structural similarity does not prove semantic equivalence across personalized pages or identical reorderings. Page-matching deliberately excludes query strings, so participants must verify that they are discussing the same content.

## Untrusted peers and bounded protocol

v1 cursor messages retain their exact schema and 512-character decoder bound. The application action now accepts up to **4096 UTF-8 bytes** for v2 annotations. Exact object keys, finite bounded coordinates, safe integer sequences/revisions, UUIDv4 IDs, allowed tag names, bounded text and type-specific fields are validated. Unknown fields/types, malformed JSON, control/bidi characters and oversized messages are rejected. Note text permits newline/tab and is rendered with `textContent`, never interpreted as HTML. Palette indices cannot inject CSS.

A v2 participant handshake follows v1 hello. Each random session ID is bound to the actual transport peer, cannot equal the local ID, cannot change on an existing peer, and cannot duplicate another active peer's ID. Features are sent only to peers that have advertised v2. Names may change by revision without changing identity. A malicious invited participant can still lie about their name and supply arbitrary permitted note content.

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
