# Browser compatibility — v0.3.0

## Executed and unverified combinations

| Browser / combination                         | Status                                     | Evidence or limitation                                                                                       |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Playwright Chromium 159.0.8154.6 ↔ same       | Automated, genuine local WebRTC passed     | Original cursor/annotation tests plus host recovery and cleanup                                              |
| Firefox 159.0 ↔ Firefox 159.0                 | Automated, genuine local WebRTC passed     | Real temporarily installed MV3 packages; cursors, ripples, laser, notes, names, late joining and termination |
| Firefox 159.0 ↔ Chromium 159.0.8154.6         | Automated, genuine local WebRTC passed     | Same invitation/topic/encryption/wire protocol; bidirectional cursor/click checks and annotation sync        |
| Branded Chrome ↔ Chrome                       | Phase 3 manual run pending                 | Compatible Chromium package; earlier Phase 1 manual success is historical, not a v0.3.0 result               |
| Edge ↔ Chrome                                 | Unverified                                 | Same Chromium package; no Edge execution in this task                                                        |
| Firefox ↔ branded Chrome / Edge               | Unverified branded pair                    | Firefox ↔ Playwright Chromium passed; do not conflate it with a branded-browser run                          |
| Brave                                         | Unverified                                 | Chromium package; Shields/WebRTC settings can affect connectivity                                            |
| Firefox desktop 142–158 / Chromium 127–158    | Manifest targets only; unverified versions | Minimum versions do not establish a tested support matrix                                                    |
| Firefox Android, mobile browsers, Safari      | Unsupported/unverified                     | No mobile or Safari build/lifecycle work                                                                     |
| Different external networks/public-relay room | Unverified                                 | No TURN; local networking tests do not exercise NAT traversal                                                |

Firefox automation uses Playwright's downloaded Firefox 159 binary as a real Gecko process, driven by Selenium 4.41 and geckodriver 0.37.1. The extension is installed with Firefox's temporary add-on API. Playwright itself does not provide the Chromium extension-loading mechanism for Firefox. A test-only system-access flag lets WebDriver open extension pages and explicitly terminate the event page; that flag is never part of the production manifest or normal installation instructions.

## Lifecycle architecture

Chromium retains MV3 service-worker routing and a `WEB_RTC` offscreen document. Firefox has a non-persistent MV3 background script that routes activation, plus a separate extension-owned session tab hosting the same transport. No offscreen permission/API is used in its package. There are no hidden keepalive tricks or repeated alarms to fight event-page suspension.

The Firefox popup can close. Tests also explicitly call Firefox's background termination mechanism and verify its state becomes `stopped` before cursor exchange continues. The session tab owns the port and WebRTC, so that event-page interruption does not own or destroy the connection. Closing the session tab is explicit termination: no automatic tab reopening, and local notes/overlays are discarded. Browser crashes/discards can still end that host; rejoining is explicit. Chromium host interruption is recovered with a bounded retry budget while its content page remains active.

Both browsers use a tiny native API adapter (`browser` when available, otherwise `chrome`) for the supported Promise APIs. No polyfill/runtime framework is added. Invitations remain `gc1_` with 256-bit entropy. Room HMAC context and Trystero app/action names stay compatible with Phases 1–2.

## Mozilla consent declaration

Firefox uses stable extension ID `ghostcursor@prabin-poudel.dev` and a minimum version of 142. The manifest declares required `personallyIdentifyingInfo` (chosen display name), `personalCommunications` (intentional note comments), `websiteActivity` (pointer/click activity), `websiteContent` (minimal structural anchor metadata) and `browsingActivity` (conservative declaration for keyed page matching shared with invite holders). No `none` claim or optional telemetry category is used. It does not collect page form contents, page keystrokes, passwords, account credentials or full history.

Required categories are presented by Firefox's built-in installation consent. Rejecting installation prevents use; there is no optional data collection to silently enable. These declarations cover sharing with other peers as well as service metadata. They are an implementation policy mapping, not an AMO approval. Signing and review have not occurred.

Official documentation consulted on 16 November 2026:

- [MDN background lifecycle](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts): MV3 event pages are non-persistent, and open ports alone are not a lifetime guarantee.
- [MDN background manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background): browser-specific background mechanisms.
- [Mozilla data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): data transmission categories and required install consent.
- [MDN Gecko settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings): extension ID and data permissions.
- [geckodriver flags](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html): explicit system access for privileged test automation.
