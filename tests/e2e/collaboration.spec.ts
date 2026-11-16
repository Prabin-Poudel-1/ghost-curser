import { test, expect, type BrowserContext } from '@playwright/test';
import { browser, join } from './extension';
import { startFixture } from './relay';
import { writeFileSync } from 'node:fs';
test('clicks, lasers, author notes, late join, rename, anchor recovery and cleanup across profiles', async () => {
  const fixture = await startFixture();
  const contexts: BrowserContext[] = [];
  try {
    const a = await browser(1000);
    contexts.push(a.context);
    const metrics = await a.context.newCDPSession(a.page);
    await metrics.send('Performance.enable');
    await metrics.send('HeapProfiler.collectGarbage');
    const baseline = await metrics.send('Memory.getDOMCounters');
    const pa = await a.popup();
    await join(pa, 'Ada');
    const invitation = await pa.locator('#invitation').inputValue();
    await pa.close();
    await a.page.bringToFront();
    const toolbar = a.page.getByRole('toolbar', {
      name: 'GhostCursor collaboration',
    });
    await expect(toolbar).toBeVisible();
    await a.page
      .getByRole('button', { name: 'Sticky note', exact: true })
      .click();
    await a.page.locator('#review-button').click();
    await a.page
      .getByRole('textbox', { name: 'Note text' })
      .fill('Give this button a little more breathing room.');
    await a.page
      .getByRole('button', { name: 'Save note', exact: true })
      .click();
    await expect(a.page.locator('.note-card .note-body')).toHaveText(
      'Give this button a little more breathing room.',
    );
    // The note predates the second participant: the owner must send a bounded snapshot.
    const b = await browser(1200);
    contexts.push(b.context);
    const pb = await b.popup();
    await join(pb, 'Bea', invitation);
    await expect(pb.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await pb.close();
    await b.page.bringToFront();
    await b.page.locator('#review-button').scrollIntoViewIfNeeded();
    const noteB = b.page.locator('.note-card');
    await expect(noteB.locator('.note-body')).toHaveText(
      'Give this button a little more breathing room.',
      { timeout: 10000 },
    );
    await expect(noteB.locator('.note-author')).toHaveText('Ada');
    await expect(noteB.getByRole('button', { name: 'Edit note' })).toHaveCount(
      0,
    );
    await a.page.locator('#review-button').scrollIntoViewIfNeeded();
    await a.page.mouse.click(120, 220);
    await expect(b.page.locator('.ripple')).toHaveCount(1);
    await expect(b.page.locator('.ripple')).toHaveCount(0, { timeout: 2000 });
    // A field interaction must never create remote click feedback.
    await a.page
      .locator('#review-button')
      .evaluate((el: HTMLButtonElement) => el.click());
    await expect(b.page.locator('.ripple')).toHaveCount(0);
    await a.page.locator('#sensitive-password').click();
    await a.page.waitForTimeout(300);
    await expect(b.page.locator('.ripple')).toHaveCount(0);
    await a.page.getByRole('button', { name: 'Laser', exact: true }).click();
    await a.page.mouse.move(100, 180);
    await a.page.mouse.down();
    await a.page.mouse.move(400, 230, { steps: 12 });
    await a.page.mouse.up();
    const laser = b.page.locator('.laser');
    await expect(laser).toHaveCount(1);
    await expect(laser).toHaveAttribute('d', /L/);
    await b.page.screenshot({ path: 'test-results/phase2-laser.png' });
    await a.page
      .getByRole('button', { name: 'Clear temporary drawings', exact: true })
      .click();
    await expect(laser).toHaveCount(0);
    await a.page.getByRole('button', { name: 'Navigate', exact: true }).click();
    await a.page.locator('#review-button').scrollIntoViewIfNeeded();
    await a.page
      .locator('.note-card')
      .getByRole('button', { name: 'Edit note' })
      .click();
    await a.page
      .getByRole('textbox', { name: 'Note text' })
      .fill('Updated: use 16 px of breathing room.');
    await a.page
      .getByRole('button', { name: 'Save note', exact: true })
      .click();
    await expect(noteB.locator('.note-body')).toHaveText(
      'Updated: use 16 px of breathing room.',
    );
    const pr = await a.popup();
    await pr.locator('#session-name').fill('Ada renamed');
    await pr.locator('#rename').click();
    await pr.close();
    await a.page.bringToFront();
    await expect(noteB.locator('.note-author')).toHaveText('Ada renamed');
    // Replace the target without any text or identifier-based anchor lookup.
    await b.page
      .locator('#review-button')
      .evaluate((el) => el.replaceWith(el.cloneNode(true)));
    await expect(noteB.locator('.note-status')).toHaveText('');
    await b.page.evaluate(() => window.scrollTo(0, 100));
    await expect
      .poll(async () => {
        const target = await b.page.locator('#review-button').boundingBox();
        const card = await noteB.boundingBox();
        return target && card ? Math.abs(target.y - card.y) : 999;
      })
      .toBeLessThan(3);
    await b.page.screenshot({ path: 'test-results/phase2-notes.png' });
    // Removal produces an explicit orphan, reinsertion resolves the same structural anchor.
    await b.page.locator('#review-button').evaluate((el) => {
      const saved = el.cloneNode(true);
      el.replaceWith(document.createComment('replacement slot'));
      (window as unknown as { restoreTarget: () => void }).restoreTarget =
        () => {
          const comments = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_COMMENT,
          );
          let node: Node | null;
          while ((node = comments.nextNode()))
            if (node.textContent === 'replacement slot') {
              node.parentNode!.replaceChild(saved, node);
              break;
            }
        };
    });
    await expect(noteB.locator('.note-status')).toContainText('unplaced');
    await b.page.evaluate(() =>
      (window as unknown as { restoreTarget: () => void }).restoreTarget(),
    );
    await expect(noteB.locator('.note-status')).toHaveText('');
    await a.page
      .getByRole('button', { name: 'Hide remote cursors', exact: true })
      .click();
    await expect(a.page.locator('[data-ghostcursor="overlay"]')).toHaveCSS(
      'visibility',
      'hidden',
    );
    await a.page
      .getByRole('button', { name: 'Show remote cursors', exact: true })
      .click();
    const grip = a.page.getByRole('button', {
      name: 'Move toolbar',
      exact: true,
    });
    const beforeDrag = await toolbar.boundingBox();
    const gripBox = (await grip.boundingBox())!;
    await a.page.mouse.move(gripBox.x + 8, gripBox.y + 8);
    await a.page.mouse.down();
    await a.page.mouse.move(gripBox.x - 72, gripBox.y - 32, { steps: 5 });
    await a.page.mouse.up();
    await expect
      .poll(async () => (await toolbar.boundingBox())!.x)
      .toBeLessThan(beforeDrag!.x - 50);
    await a.page.getByRole('button', { name: 'Laser', exact: true }).click();
    await a.page.keyboard.press('Escape');
    await expect(
      a.page.getByRole('button', { name: 'Navigate', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await grip.focus();
    await grip.press('ArrowLeft');
    await expect(toolbar).toBeVisible();
    await a.page.screenshot({ path: 'test-results/phase2-toolbar.png' });
    await a.page
      .locator('.note-card')
      .getByRole('button', { name: 'Delete note' })
      .click();
    await expect(noteB).toHaveCount(0);
    await expect(a.page.locator('.note-card')).toHaveCount(0);
    await metrics.send('HeapProfiler.collectGarbage');
    const activeResources = await metrics.send('Memory.getDOMCounters');
    const activePerf = (await metrics.send('Performance.getMetrics')).metrics;
    await a.page
      .getByRole('button', { name: 'Leave session', exact: true })
      .click();
    await expect(a.page.locator('[data-ghostcursor]')).toHaveCount(0);
    await b.page
      .getByRole('button', { name: 'Leave session', exact: true })
      .click();
    await expect(b.page.locator('[data-ghostcursor]')).toHaveCount(0);
    await metrics.send('HeapProfiler.collectGarbage');
    const cleanedResources = await metrics.send('Memory.getDOMCounters');
    const cleanedPerf = (await metrics.send('Performance.getMetrics')).metrics;
    writeFileSync(
      'test-results/phase2-resources.json',
      JSON.stringify(
        {
          scope:
            'Chromium page renderer; includes page and extension, not offscreen transport',
          baseline,
          activeResources,
          cleanedResources,
          activeHeap: activePerf.find((m) => m.name === 'JSHeapUsedSize')
            ?.value,
          cleanedHeap: cleanedPerf.find((m) => m.name === 'JSHeapUsedSize')
            ?.value,
        },
        null,
        2,
      ),
    );
    for (const value of [
      'breathing room',
      'PRIVATE_EMAIL@example.test',
      'PRIVATE_FORM_TEXT',
      'NEVER_TRANSMIT_PASSWORD',
      invitation,
    ])
      expect(fixture.wire.some((raw) => raw.includes(value))).toBe(false);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await fixture.close();
  }
});

test('repeated annotation activation releases renderer resources after leave', async () => {
  const fixture = await startFixture();
  const a = await browser(1000);
  try {
    const metrics = await a.context.newCDPSession(a.page);
    const samples = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      const popup = await a.popup();
      await join(popup, 'Cleanup');
      await popup.close();
      await a.page.bringToFront();
      await a.page
        .getByRole('button', { name: 'Sticky note', exact: true })
        .click();
      await a.page.locator('#review-button').click();
      await a.page
        .getByRole('textbox', { name: 'Note text' })
        .fill('Session-only cleanup check');
      await a.page
        .getByRole('button', { name: 'Save note', exact: true })
        .click();
      await expect(a.page.locator('.note-card')).toHaveCount(1);
      await a.page.getByRole('button', { name: 'Laser', exact: true }).click();
      await a.page.mouse.move(100, 180);
      await a.page.mouse.down();
      await a.page.mouse.move(300, 200, { steps: 4 });
      await a.page.mouse.up();
      await a.page
        .getByRole('button', { name: 'Leave session', exact: true })
        .click();
      await expect(a.page.locator('[data-ghostcursor]')).toHaveCount(0);
      // Allow asynchronous runtime.Port close acknowledgments to settle.
      await a.page.waitForTimeout(250);
      await metrics.send('HeapProfiler.collectGarbage');
      samples.push(await metrics.send('Memory.getDOMCounters'));
    }
    writeFileSync(
      'test-results/phase2-cleanup.json',
      JSON.stringify(
        {
          scope:
            'Page renderer after leave and GC; repeated same-page activations',
          samples,
        },
        null,
        2,
      ),
    );
    for (const sample of samples.slice(1)) {
      expect(sample.nodes).toBe(samples[0]!.nodes);
      expect(sample.jsEventListeners).toBe(samples[0]!.jsEventListeners);
      expect(sample.documents).toBe(samples[0]!.documents);
    }
  } finally {
    await a.context.close();
    await fixture.close();
  }
});
