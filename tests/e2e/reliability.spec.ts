import { test, expect } from '@playwright/test';
import { browser, join } from './extension';
import { startFixture } from './relay';
import { writeFileSync } from 'node:fs';
test('Chromium restores an interrupted offscreen host and preserves local authored notes', async () => {
  const fixture = await startFixture();
  const a = await browser(1000);
  const b = await browser(1200);
  try {
    const pa = await a.popup();
    await join(pa, 'Ada');
    const invitation = await pa.locator('#invitation').inputValue();
    await pa.close();
    const pb = await b.popup();
    await join(pb, 'Bea', invitation);
    await expect(pb.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await pb.close();
    await a.page.bringToFront();
    await a.page
      .getByRole('button', { name: 'Sticky note', exact: true })
      .click();
    await a.page.locator('#review-button').click();
    await a.page
      .getByRole('textbox', { name: 'Note text' })
      .fill('Survive host interruption');
    await a.page
      .getByRole('button', { name: 'Save note', exact: true })
      .click();
    await expect(b.page.locator('.note-body')).toHaveText(
      'Survive host interruption',
    );
    const control = await a.popup();
    await control.evaluate(() => chrome.offscreen.closeDocument());
    await expect(control.locator('#connection-detail')).toContainText('Retry', {
      timeout: 10000,
    });
    await expect(b.page.locator('.note-card')).toHaveCount(0);
    await expect(control.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await expect(b.page.locator('.note-body')).toHaveText(
      'Survive host interruption',
      { timeout: 45000 },
    );
    await control.close();
    await a.page.bringToFront();
    await a.page.mouse.move(120, 200);
    await expect(b.page.locator('.cursor:not([hidden])')).toHaveCount(1);
    const revoke = await a.popup();
    // Exercise the same host-revocation path used by permissions.onRemoved.
    await revoke.evaluate(() =>
      chrome.runtime.sendMessage({
        channel: 'ghostcursor-host',
        type: 'revoke',
      }),
    );
    await expect(a.page.locator('[data-ghostcursor]')).toHaveCount(0);
    await expect(b.page.locator('.note-card')).toHaveCount(0);
    await revoke.close();
    await b.page.close();
    const check = await b.context.newPage();
    const id = new URL(b.worker.url()).host;
    await check.goto(`chrome-extension://${id}/src/popup/index.html`);
    const contexts = await check.evaluate(() =>
      chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      }),
    );
    expect(contexts).toHaveLength(1); // An idle host may remain; its port/room must close.
    await expect
      .poll(() =>
        check.evaluate(
          async () =>
            (
              await chrome.runtime.sendMessage({
                channel: 'ghostcursor-host',
                type: 'ping',
              })
            ).active,
        ),
      )
      .toBe(false);
  } finally {
    await a.context.close();
    await b.context.close();
    await fixture.close();
  }
});

test('prolonged annotated session bounds drawings and idle page work, then releases overlays', async () => {
  test.setTimeout(120000);
  const fixture = await startFixture();
  const a = await browser(1200);
  try {
    const cdp = await a.context.newCDPSession(a.page);
    await cdp.send('Performance.enable');
    const popup = await a.popup();
    await join(popup, 'Performance');
    await popup.close();
    await a.page.bringToFront();
    for (let i = 0; i < 12; i++) {
      await a.page
        .getByRole('button', { name: 'Sticky note', exact: true })
        .click();
      await a.page.locator('#review-button').click();
      await a.page
        .getByRole('textbox', { name: 'Note text' })
        .fill(`Session note ${i + 1}`);
      await a.page
        .getByRole('button', { name: 'Save note', exact: true })
        .click();
    }
    await expect(a.page.locator('.note-card')).toHaveCount(12);
    await a.page.getByRole('button', { name: 'Laser', exact: true }).click();
    for (let i = 0; i < 20; i++) {
      await a.page.mouse.move(100, 180);
      await a.page.mouse.down();
      await a.page.mouse.move(400, 220, { steps: 20 });
      await a.page.mouse.up();
      expect(await a.page.locator('.laser').count()).toBeLessThanOrEqual(2);
    }
    await a.page
      .getByRole('button', { name: 'Clear temporary drawings', exact: true })
      .click();
    await a.page.getByRole('button', { name: 'Navigate', exact: true }).click();
    const sample = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const metrics = (await cdp.send('Performance.getMetrics')).metrics;
      return {
        ...(await cdp.send('Memory.getDOMCounters')),
        heap: metrics.find((m) => m.name === 'JSHeapUsedSize')!.value,
        task: metrics.find((m) => m.name === 'TaskDuration')!.value,
        timestamp: metrics.find((m) => m.name === 'Timestamp')!.value,
      };
    };
    const start = await sample();
    await a.page.waitForTimeout(60000);
    const idle = await sample();
    expect(await a.page.locator('.note-card').count()).toBe(12);
    expect(await a.page.locator('.laser').count()).toBe(0);
    expect(idle.nodes).toBeLessThanOrEqual(start.nodes + 20);
    expect(idle.jsEventListeners).toBeLessThanOrEqual(
      start.jsEventListeners + 5,
    );
    // Retargeting should not retain the replaced DOM nodes indefinitely.
    for (let i = 0; i < 10; i++)
      await a.page
        .locator('#review-button')
        .evaluate((el) => el.replaceWith(el.cloneNode(true)));
    await expect(a.page.locator('.note-status').first()).toHaveText('');
    await a.page
      .getByRole('button', { name: 'Leave session', exact: true })
      .click();
    await expect(a.page.locator('[data-ghostcursor]')).toHaveCount(0);
    const cleaned = await sample();
    writeFileSync(
      'test-results/phase3-performance.json',
      JSON.stringify(
        {
          scope:
            'Chromium page renderer, 12 notes, 20 laser strokes, 60-second idle interval; offscreen excluded',
          start,
          idle,
          cleaned,
          idleTaskSeconds: idle.task - start.task,
          idleWallSeconds: idle.timestamp - start.timestamp,
        },
        null,
        2,
      ),
    );
  } finally {
    await a.context.close();
    await fixture.close();
  }
});
