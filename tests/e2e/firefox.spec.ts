import { test, expect } from '@playwright/test';
import { firefoxClient } from './firefox';
import { startFixture } from './relay';
test('Firefox loads its MV3 popup and session tab, creates a room and cleans up', async () => {
  const fixture = await startFixture();
  const a = await firefoxClient();
  try {
    await a.popup();
    await expect.poll(() => a.text('h1')).toBe('GhostCursor');
    await a.fill('#name', 'Firefox Ada');
    await a.click('#create');
    await expect.poll(() => a.text('#status')).toBe('Connecting');
    await a.closePopup();
    await expect.poll(() => a.count('.toolbar')).toBe(1);
    await a.click('[aria-label="Sticky note"]');
    await a.click('#review-button');
    await a.fill('[aria-label="Note text"]', 'Firefox note');
    await a.click('[aria-label="Save note"]');
    await expect.poll(() => a.text('.note-body')).toBe('Firefox note');
    for (const handle of await a.driver.getAllWindowHandles()) {
      await a.driver.switchTo().window(handle);
      if (
        (await a.driver.getCurrentUrl()).includes(
          '/src/networking/session.html',
        )
      )
        break;
    }
    await a.click('#stop-session');
    await expect
      .poll(() => a.text('#host-status'))
      .toContain('No active connection');
    await a.page();
    await expect.poll(() => a.count('[data-ghostcursor]')).toBe(0);
  } finally {
    await a.driver.quit();
    await fixture.close();
  }
});

import { browser as chromiumClient, join } from './extension';
import { writeFileSync } from 'node:fs';
for (const other of ['firefox', 'chromium'] as const) {
  test(`Firefox ↔ ${other}: genuine WebRTC cursors, clicks, laser, notes, late join and host cleanup`, async () => {
    const fixture = await startFixture();
    const a = await firefoxClient();
    let closeOther: (() => Promise<void>) | undefined;
    try {
      await a.popup();
      await a.fill('#name', 'Firefox Ada');
      await a.click('#create');
      await expect.poll(() => a.text('#status')).toBe('Connecting');
      const invitation = await (
        await a.element('#invitation')
      ).getAttribute('value');
      await a.closePopup();
      await a.click('[aria-label="Sticky note"]');
      await a.click('#review-button');
      await a.fill(
        '[aria-label="Note text"]',
        'Cross-browser note before joining',
      );
      await a.click('[aria-label="Save note"]');
      const b = await (async () => {
        if (other === 'firefox') {
          const f = await firefoxClient();
          closeOther = () => f.driver.quit();
          await f.popup();
          await f.fill('#name', 'Bea');
          await f.fill('#join-code', invitation!);
          await f.click('#join');
          await expect
            .poll(() => f.text('#status'), { timeout: 45000 })
            .toBe('Connected');
          await f.closePopup();
          return f;
        }
        const c = await chromiumClient(1000);
        closeOther = () => c.context.close();
        const p = await c.popup();
        await join(p, 'Bea', invitation!);
        await expect(p.locator('#status')).toHaveText('Connected', {
          timeout: 45000,
        });
        await p.close();
        await c.page.bringToFront();
        return {
          text: async (s: string) =>
            (await c.page.locator(s).first().textContent()) ?? '',
          count: (s: string) => c.page.locator(s).count(),
          move: (x: number, y: number) => c.page.mouse.move(x, y),
          point: (x: number, y: number) => c.page.mouse.click(x, y),
          click: (s: string) => c.page.locator(s).click(),
        };
      })();
      await expect
        .poll(() => b.text('.note-body'))
        .toBe('Cross-browser note before joining');
      await expect.poll(() => b.count('[aria-label="Edit note"]')).toBe(0);
      expect(await a.stopBackground()).toMatchObject({
        supported: true,
        state: 'stopped',
      });
      await a.move(180, 200);
      await expect.poll(() => b.count('.cursor:not([hidden])')).toBe(1);
      await b.move(300, 220);
      await expect.poll(() => a.count('.cursor:not([hidden])')).toBe(1);
      await a.point(100, 200);
      await expect
        .poll(() => b.count('.ripple'), { intervals: [30, 50, 100] })
        .toBe(1);
      await expect.poll(() => b.count('.ripple')).toBe(0);
      await b.point(200, 200);
      await expect
        .poll(() => a.count('.ripple'), { intervals: [30, 50, 100] })
        .toBe(1);
      await a.click('[aria-label="Laser"]');
      await a.draw();
      await expect.poll(() => b.count('.laser')).toBe(1);
      await a.click('[aria-label="Clear temporary drawings"]');
      await expect.poll(() => b.count('.laser')).toBe(0);
      await a.click('[aria-label="Navigate"]');
      await a.click('[aria-label="Edit note"]');
      await a.fill('[aria-label="Note text"]', 'Edited across engines');
      await a.click('[aria-label="Save note"]');
      await expect
        .poll(() => b.text('.note-body'))
        .toBe('Edited across engines');
      await a.popup();
      await a.fill('#session-name', 'Ada updated');
      await a.click('#rename');
      await a.closePopup();
      await expect.poll(() => b.text('.note-author')).toBe('Ada updated');
      writeFileSync(
        `test-results/phase3-${other}.png`,
        await a.driver.takeScreenshot(),
        'base64',
      );
      await a.click('[aria-label="Delete note"]');
      await expect.poll(() => b.count('.note-card')).toBe(0);
      // Closing Firefox's separate networking tab is an explicit end, not an
      // invitation to reopen it or restart sharing behind the user's back.
      let hostClosed = false;
      for (const handle of await a.driver.getAllWindowHandles()) {
        await a.driver.switchTo().window(handle);
        if (
          (await a.driver.getCurrentUrl()).includes(
            '/src/networking/session.html',
          )
        ) {
          await a.driver.close();
          hostClosed = true;
          break;
        }
      }
      expect(hostClosed).toBe(true);
      await a.page();
      await expect.poll(() => a.count('[data-ghostcursor]')).toBe(0);
      await expect.poll(() => b.count('.cursor')).toBe(0);
      await b.click('[aria-label="Leave session"]');
      for (const secret of [
        invitation!,
        'Cross-browser note before joining',
        'Edited across engines',
        'NEVER_TRANSMIT_PASSWORD',
      ])
        expect(fixture.wire.some((m) => m.includes(secret))).toBe(false);
      expect(
        [...fixture.origins].every(
          (o) =>
            o?.startsWith('moz-extension://') ||
            o?.startsWith('chrome-extension://'),
        ),
      ).toBe(true);
    } finally {
      await closeOther?.();
      await a.driver.quit();
      await fixture.close();
    }
  });
}
