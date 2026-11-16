# Combined Phase 2 + Phase 3 manual guide

This guide is for the later manual test round. No manual testing is required to build the project or run the automated suite now. Use dummy information and a trusted test webpage. Notes disappear when their author leaves or refreshes.

## 1. Install Chromium v0.3.0

1. Extract `ghostcursor-0.3.0-chromium.zip` into a folder you will keep.
2. In Chrome, enter `chrome://extensions` in the address bar. In Edge, use `edge://extensions`.
3. Turn on **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin GhostCursor using the browser's extensions menu.
5. Repeat in a **second browser profile**. Two ordinary tabs in one profile are not independent participants.

Developers can instead run `npm ci` and `npm run build:all`, then load the `dist` folder. Brave can use its extensions page, but its privacy settings may affect WebRTC; do not weaken them automatically.

## 2. Load Firefox v0.3.0 temporarily

1. Use Firefox desktop **142 or newer**.
2. Extract `ghostcursor-0.3.0-firefox.zip`.
3. Open `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on** and select the extracted `manifest.json`.
5. Find GhostCursor in Firefox's extensions menu and pin it if desired.

The Firefox ZIP is **unsigned**. Temporary installation lasts until Firefox restarts. It is not a signed, publicly installable add-on. Developers can load `dist-firefox/manifest.json` after `npm run build:firefox`. No Mozilla submission or signing has occurred.

Firefox creates a separate **GhostCursor session** tab when you start collaboration. Keep that tab open and return to the webpage. Closing the popup is fine. Closing the session tab or choosing its **End collaboration** button deliberately ends this profile's participation.

## 3. Open a matching webpage

Both participants must open the same URL origin and pathname. Begin with a normal trusted page, or use the included fixture:

```sh
python3 -m http.server 8788 --bind 127.0.0.1 --directory tests/fixtures
```

Open `http://127.0.0.1:8788/collaboration.html` in both browsers on the same computer. The fixture has buttons, responsive cards, mock sensitive fields, a long page and a nested scroll area. It uses dummy values. This command serves the webpage only: the production extensions still use public signaling. For deterministic local signaling, run `npm run test:e2e`; that is automated real WebRTC, not a manual production-relay test.

Use one window about 1000 pixels wide and another about 1200 pixels wide. Keep the same content visible initially. Page queries/fragments are excluded from matching; two personalized pages can therefore match while showing different content.

## 4. Create and join

1. In browser A, click the actual GhostCursor extension icon while the webpage is active.
2. Choose a display name and color, then **Create a private room**.
3. Copy the entire `gc1_…` invitation. Share it privately; it is the room's bearer secret.
4. In browser B, open GhostCursor, enter a different name, paste the invitation, and choose **Join**.
5. Both popups should show **Connected** and the other participant. Close both popups.

The room creator waits in **Connecting** until a peer joins. A timeout message does not prove the invitation is wrong. Public relays, NATs and firewalls can prevent connections; there is no TURN fallback. Do not report cross-network success unless the test actually uses separate networks.

## 5. Check cursors and clicks

Move both pointers on safe areas. Each browser should see the other's labeled cursor. Leave a pointer still for six seconds; the remote cursor should hide. Click a safe area: the peer should see a short color-matched ripple. Click/type into the dummy password/form fields: no content or click ripple should be shared. Clicking extension controls must not create page ripples.

Resize and scroll independently. Cursors/clicks use viewport fractions, so they may point at different elements when layouts or scroll positions differ. The extension does not scroll or click the remote webpage.

## 6. Check lasers and toolbar

Choose **Laser**, hold the primary pointer button and move across a safe area, then release. The other browser should show the trail, fading after about three seconds. Draw again and choose **Clear temporary drawings**. Your trail should disappear remotely; other authors keep control of their own drawings.

Ordinary scrolling should work. Touch scrolling may cancel a stroke. Long strokes hit a point limit; release and start another. Press **Escape** to return to Navigate. Drag the toolbar grip near the edges, then Tab to it and use arrow keys. Try **Hide remote cursors** and **Show remote cursors**. Every control should be keyboard reachable. With reduced motion enabled in the OS, ripples should stay static until removal.

## 7. Check notes, ownership and late joining

1. Choose **Sticky note**, click **Review card**, enter a comment and choose **Share note**. Hover + Enter selects without a native click, useful for links.
2. Confirm the peer sees the author, timestamp and text beside the same button.
3. Edit your note and verify the peer updates. Only its author has Edit/Delete controls. Each participant can create their own notes.
4. Change your display name in the popup and choose **Update**; the peer's labels should change without a new identity appearing.
5. Scroll/resize while the target remains visible; its note should track its local element.
6. Delete the note and verify deletion remotely.
7. For late joining, first create a note in A before starting B's session. B should receive it after joining.

Optional DOM replacement test for developers: use the webpage DevTools console to replace `document.querySelector('#review-button')` with a clone. The note should resolve again. Remove it entirely: the note should move to the unplaced-note area. Reinsert it in the same structure: it should recover. Ambiguous structure stays unplaced. GhostCursor never sends or executes these DOM commands remotely.

Limits: 16 note IDs per author per session, including deleted IDs; 600 characters per note. Notes may overlap in crowded layouts. Structural anchors cannot prove semantic equivalence of personalized or identically reordered pages.

## 8. Check Firefox ↔ Chrome / Edge

Install the Firefox ZIP in Firefox and the Chromium ZIP in Chrome or Edge. Open the same fixture and repeat steps 4–7 with the same invitation. Leave Firefox's session tab open. Reverse who creates the room. No conversion or different invitation format is needed.

Automated Firefox ↔ Playwright Chromium and Firefox ↔ Firefox tests passed. Branded Chrome/Edge combinations and public cross-network traversal still need this manual round. See [compatibility](COMPATIBILITY.md).

## 9. Check recovery and cleanup

- Reopen/close the popup repeatedly; the session should stay connected.
- Choose **Retry connection** after a temporary failure. The popup should show accurate feedback; retained local authored notes should resynchronize after recovery.
- Briefly disconnect/reconnect the network. Allow heartbeat expiry and bounded retry time; record exact timing. Automatic host recreation is limited to four jittered attempts. A fresh manual Retry resets the budget. Public relay reconnection also has the library's own backoff.
- Leave from the toolbar. All local GhostCursor overlays should disappear; the peer should lose your cursor and notes. Rejoin explicitly. Repeat several times and check for duplicate toolbars.
- Refresh, close or navigate the collaboration page: participation should end. There is no automatic restoration of session notes.
- In Firefox, close the **session tab**: local overlays should disappear and the peer should lose you. The tab must not silently reopen. Start again from the popup if desired.
- Disable/remove the extension or revoke its permissions using browser controls. Sharing must stop. If a browser does not emit its expected disconnect/revocation event promptly, record the browser version and reload the webpage; this UI path remains part of manual verification.

## 10. Report a failure

Record version **0.3.0**, browser names/versions, operating system, window sizes, whether the browsers were on the same machine/network, and the exact steps and timing. State whether you used production public signaling or the automated local fixture. Include the visible error text and whether popups/session tabs were open. A screenshot of the dummy test page is useful, but remove invitations, real notes and private URLs before sharing it.

Do not post room secrets, cookies, authentication tokens, real form data or full private browsing URLs. Reproduce with a fresh room and the dummy fixture if possible. The source and [verification report](VERIFICATION.md) distinguish confirmed automated results from pending manual and external-network tests.
