# Privacy and security review

## Data boundaries

| Recipient                     | Data available                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Local popup                   | Chosen name/color, current page session state, invitation, participant names                                                              |
| Local content script          | Pointer coordinates, visibility, viewport size, current URL for local origin/path comparison; no form reads                               |
| Extension offscreen document  | Sanitized origin/path over a private runtime port, invitation, ephemeral identities and peer payloads                                     |
| Public Nostr signaling relays | Source IP, connection timing, extension origin, public ephemeral signing keys, hashed topics/announcements and encrypted SDP/ICE payloads |
| Default STUN services         | Network address and connection metadata needed for ICE                                                                                    |
| Room members over WebRTC      | Cursor coordinates, display name/color, presence, ephemeral peer identity; network addresses can be learned                               |
| Webpage itself                | Shared DOM overlay and visible participant labels; not the invitation or extension JavaScript state                                       |

No analytics, backend database, screenshots, form contents, password values, webpage keystrokes, cookies, authentication tokens, history API reads, or durable room storage are implemented. Query parameters, URL credentials and fragments are discarded before local transport messages. The extension neither loads remote scripts nor uses eval.

Room discovery derives HMAC-SHA-256 from the 256-bit invitation and a versioned origin/path. The invitation also supplies Trystero's signaling password. Public relays cannot perform a simple public-URL dictionary attack without the secret. A secret holder can compute candidate topics and join. WebRTC encrypts application traffic using DTLS; Trystero handles its signaling encryption and peer identity handshake. This is not an independent audit of Trystero or browser WebRTC.

WebSocket Origin metadata was explicitly tested. Keeping signaling in a page content script leaked the page origin; using the offscreen extension document fixed it. Tests assert extension-origin headers and absence of the test page path, invitation, display names, and password fixture from relay payloads. These are focused regression checks, not proof of all possible browser metadata behavior.

## Permissions

- `activeTab`: temporary access following the user's toolbar activation.
- `scripting`: inject the bundled top-frame overlay only when Create/Join is selected.
- `offscreen`: run WebRTC and signaling under the extension origin, independently of popup/worker lifetime.

No production `host_permissions`, static content scripts, content resource exposure, storage permission, externally connectable API, or web-accessible resources. The isolated test manifest alone grants `http://127.0.0.1/*` so Playwright can drive a popup as an extension page; this is not a production permission. Runtime senders are restricted to the expected extension popup or top-frame tab port and command schemas are validated.

## Untrusted participants and pages

Names render with `textContent`, never as markup. Controls reject control/bidi-format characters and cap names at 24 UTF-16 code units. Numeric fields are bounded and finite, message fields/version are exact, and unknown types cannot invoke browser APIs. Colors are palette indices. Incoming payloads, participant count and application message rates are bounded. Invitations are never deliberately logged, and networking errors expose a classification rather than raw exceptions containing internal data.

The shared invitation is a bearer capability, not identity verification. Anyone who receives it can impersonate a display name. There are no owner/admin roles, bans, or global revocation in Phase 1. Leave ends the local transport; it cannot remove messages other peers received or force them to leave. Create a new room if a secret leaks. Do not reuse invitations for unrelated confidential sessions.

Shadow DOM isolates CSS. It does not make the overlay confidential from the host page. A hostile page can inspect or delete it. The overlay cannot protect users against a compromised browser, malicious extension, local system access, or a peer recording the coordinates received. Network peers can also consume transport resources below the application rate limit; additional abuse hardening is planned before broad public release.

## Limits and release gates

There is no TURN service, so restrictive NAT/firewall environments can fail. Relay uptime, storage retention, public service policies, and STUN metadata are outside this project's control. Production uses the pinned library's default relay list and default Google/Cloudflare STUN configuration; neither cursor messages nor names are intentionally relayed through Nostr.

Before store release: audit full dependency licenses and code, test Edge/Brave and supported browser versions manually, run external-network tests and adversarial peer stress tests, review accessibility/permissions, publish accurate privacy disclosures, and define a support/security contact. No release, deployment, or store submission has been performed.
