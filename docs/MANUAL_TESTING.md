# Manual Phase 2 verification

Use two **independent Chrome profiles**, not two tabs in one profile. Install the production `dist/` folder or extracted 0.2.0 ZIP in both via `chrome://extensions` → Developer mode → Load unpacked. The same workflow applies to Edge, but Edge has not been executed in the automated suite.

## Reusable webpage

From the repository root:

```sh
python3 -m http.server 8788 --bind 127.0.0.1 --directory tests/fixtures
```

Open `http://127.0.0.1:8788/collaboration.html` in both profiles. It contains buttons, cards, mock sensitive fields, long and nested scroll sections, and a responsive layout. Its sample values are dummy test data. This command serves only the webpage; the production extension still uses its normal public signaling services. If those services are unavailable, use `npm run test:e2e` for reproducible local signaling with real WebRTC. Do not leave the test extension installed for everyday browsing.

## Acceptance checklist

1. Set profile A to approximately 1000 × 800 pixels and B to 1200 × 800. In A's extension popup, choose a name/color and create a private room. Close the popup.
2. Before B joins, select **Sticky note** in A's floating toolbar, then click **Review card**. Type a comment and choose **Share note**. It should appear beside the button. Native page clicks still execute; hover + Enter is useful for links.
3. In B, open GhostCursor from the actual browser toolbar, enter a name, paste A's complete invitation and join. Both profiles should show Connected and the other participant. B should receive A's preexisting note. Close both popups.
4. Move each pointer over a safe page area. The remote labeled cursor should follow. Click a safe area: the other profile should see a short matching-color ripple. Click/type in a password or form field: no field content or click ripple should be shared. Extension toolbar/editor clicks should not create shared ripples.
5. Select **Laser** in A, hold and move across a safe area, then release. B should see the trail, which expires in about three seconds. Repeat and use **Clear temporary drawings** to remove A's trail immediately. Ordinary wheel/trackpad scrolling should work. Escape returns to Navigate.
6. Edit A's note. B should update. B should see author and timestamp, but no edit/delete controls for A's note. Add a second note from B. Open A's popup, change A's display name and choose **Update**; cursor/roster/note labels should reflect the new name without creating a new participant.
7. Scroll each profile independently so the review button stays visible. Its note should follow its local element, while cursors/lasers remain viewport-relative. Resize the windows and exercise the nested scroll area. Test a narrow window for toolbar clamping; notes may be clamped or crowded.
8. In B's page DevTools console, replace the target with an equivalent node:

   ```js
   const target = document.querySelector('#review-button');
   const replacement = target.cloneNode(true);
   target.replaceWith(replacement);
   ```

   The note should remain anchored. Remove `replacement`; the card should move into the unplaced-note area. Reinsert it in its original structural position; it should resolve again. Ambiguous sibling changes should stay unplaced. This test deliberately uses page scripting; GhostCursor itself never sends or executes these commands.

9. Drag the toolbar grip, including near viewport edges. Tab to the grip and use arrow keys. Confirm selected tools expose their state and every button is keyboard reachable. Hide/show remote cursors. Enable the OS reduced-motion preference and confirm ripples stay static until they disappear.
10. Delete A's note; it should disappear in B. Leave A via the toolbar; A's overlays should vanish and its remaining remote notes/cursor should be removed from B. B's own note stays until B leaves. Repeat activation several times: no duplicate toolbar or overlays should remain.
11. For recovery, keep A active with an authored note and choose **Retry connection**. On reconnection its local note should resynchronize. Refresh or navigate A: it should leave and lose its session notes. Rejoining after refresh starts a new identity and has no authored history.

## Record results honestly

Record extension version, browser/version, operating system, viewport widths, page URL (keep private URLs out of public reports), network topology, observations and failures. The automated tests use two independent Chromium processes, encrypted Trystero signaling, real DataChannels, and a local relay. They do not establish public-relay or cross-network reliability.

Phase 1 had a reported successful manual run in two Chrome profiles. Phase 2's delivered evidence is automated independent-profile testing and actual screenshots; this guide is not itself a claim that a separate human manual run was performed.
