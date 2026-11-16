import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { startFixture } from './relay';
const extension = resolve('dist-test');
async function browser(width = 1000) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width, height: 800 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8788/same-page');
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url?.includes('/same-page'))?.id;
  });
  if (tabId === undefined) throw new Error('Fixture tab was not found');
  const popup = async () => {
    const p = await context.newPage();
    await p.goto(`chrome-extension://${id}/src/popup/index.html?tab=${tabId}`);
    return p;
  };
  return { context, page, popup, worker };
}
async function join(popup: Page, name: string, invitation?: string) {
  await popup.locator('#name').fill(name);
  if (invitation) {
    await popup.locator('#join-code').fill(invitation);
    await popup.locator('#join').click();
  } else await popup.locator('#create').click();
  await expect(popup.locator('#session')).toBeVisible();
}
test('two independent extension profiles exchange cursors over genuine WebRTC, survive popup close, retry and leave', async () => {
  const fixture = await startFixture();
  const contexts: BrowserContext[] = [];
  try {
    const a = await browser();
    contexts.push(a.context);
    const b = await browser(1200);
    contexts.push(b.context);
    expect(await a.page.locator('[data-ghostcursor]').count()).toBe(0);
    const pa = await a.popup();
    await expect(pa.locator('#setup')).toBeVisible();
    await pa
      .locator('main')
      .screenshot({ path: 'test-results/popup-setup.png' });
    await pa.locator('#join-code').fill('ABCD');
    await pa.locator('#join').click();
    await expect(pa.locator('#error')).toContainText('complete GhostCursor');

    await join(pa, 'Ada');
    const invitation = await pa.locator('#invitation').inputValue();
    const pb = await b.popup();
    await join(pb, 'Bea', invitation);
    await expect(pa.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await expect(pb.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await expect(pa.locator('#participants')).toContainText('Bea');
    await expect(pb.locator('#participants')).toContainText('Ada');
    await pa
      .locator('main')
      .screenshot({ path: 'test-results/popup-connected.png' });
    await pa.close();
    await pb.close();
    await a.page.bringToFront();
    await b.page.bringToFront();
    const cdp = await a.context.newCDPSession(a.page);
    const versions = new Map<
      string,
      { versionId: string; scriptURL: string; runningStatus: string }
    >();
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: updates }) => {
      for (const v of updates) versions.set(v.versionId, v);
    });
    await cdp.send('ServiceWorker.enable');
    await expect
      .poll(() =>
        [...versions.values()].some((v) => v.scriptURL === a.worker.url()),
      )
      .toBe(true);
    const version = [...versions.values()].find(
      (v) => v.scriptURL === a.worker.url(),
    )!;
    await cdp.send('ServiceWorker.stopWorker', {
      versionId: version.versionId,
    });
    await expect
      .poll(() => versions.get(version.versionId)?.runningStatus)
      .toBe('stopped');
    await a.page.mouse.move(400, 240);
    const remoteB = b.page.locator('[data-ghostcursor] .cursor');
    await expect(remoteB).toBeVisible({ timeout: 10000 });
    await expect(remoteB.locator('.label')).toHaveText('Ada');
    await expect
      .poll(async () =>
        remoteB.evaluate((e) => Math.round(e.getBoundingClientRect().x)),
      )
      .toBe(480);
    await b.page.mouse.move(600, 320);
    const remoteA = a.page.locator('[data-ghostcursor] .cursor');
    await expect(remoteA).toBeVisible({ timeout: 10000 });
    await expect(remoteA.locator('.label')).toHaveText('Bea');
    await b.page.screenshot({ path: 'test-results/remote-cursor.png' });
    // Overlays never intercept normal page interactions.
    await b.page.locator('#page-button').click();
    await expect(b.page.locator('#page-button')).toBeFocused();
    await expect(remoteB).toBeHidden({ timeout: 8000 });
    const pb2 = await b.popup();
    await expect(pb2.locator('#status')).toHaveText('Connected');
    // Exercise the same retry command used by the popup after a failure.
    await pb2.evaluate(async () => {
      const tabId = Number(new URLSearchParams(location.search).get('tab'));
      const r = await chrome.runtime.sendMessage({
        channel: 'ghostcursor',
        tabId,
        command: { type: 'retry' },
      });
      document.getElementById('status')!.textContent = r.state.status;
    });
    await expect(pb2.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    const paRetry = await a.popup();
    await expect(paRetry.locator('#status')).toHaveText('Connected', {
      timeout: 45000,
    });
    await paRetry.close();
    await a.page.bringToFront();
    await pb2.close();
    await b.page.bringToFront();
    await b.page.mouse.move(300, 200);
    await expect(remoteA).toBeVisible({ timeout: 10000 });
    const pb3 = await b.popup();
    await pb3.locator('#leave').click();
    await expect(pb3.locator('#setup')).toBeVisible();
    await expect(b.page.locator('[data-ghostcursor]')).toHaveCount(0);
    await expect(remoteA).toHaveCount(0, { timeout: 10000 });
    const pa2 = await a.popup();
    await expect(pa2.locator('#participants li')).toHaveCount(1, {
      timeout: 10000,
    });
    expect(
      [...fixture.origins].every((origin) =>
        origin?.startsWith('chrome-extension://'),
      ),
    ).toBe(true);
    const signaling = fixture.wire.join('');
    for (const secret of [invitation, 'NEVER_TRANSMIT_PASSWORD', '/same-page'])
      expect(signaling.includes(secret)).toBe(false);
    // Inspect decoded signaling objects: random ciphertext can contain short names by chance.
    const payloads = fixture.wire
      .map((raw) => JSON.parse(raw) as unknown[])
      .filter((m) => m[0] === 'EVENT')
      .map(
        (m) =>
          JSON.parse((m[1] as { content: string }).content) as Record<
            string,
            unknown
          >,
      );
    expect(payloads.some((p) => 'name' in p || 'x' in p || 'y' in p)).toBe(
      false,
    );
    await pa2.locator('#leave').click();
    await expect(a.page.locator('[data-ghostcursor]')).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.close();
  }
});
test('production manifest has only activation permissions and no test relay', () => {
  const manifest = JSON.parse(
    readFileSync('dist/manifest.json', 'utf8'),
  ) as chrome.runtime.ManifestV3;
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'offscreen']);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
  const scripts = [
    readFileSync('dist/content.js', 'utf8'),
    ...readdirSync('dist/assets')
      .filter((p) => p.endsWith('.js'))
      .map((p) => readFileSync('dist/assets/' + p, 'utf8')),
  ].join('');
  expect(scripts).not.toContain('127.0.0.1:8787');
});
