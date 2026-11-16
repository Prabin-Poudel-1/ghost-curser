import { chromium, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
const extension = resolve('dist-test');
export async function browser(width = 1000) {
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
export async function join(popup: Page, name: string, invitation?: string) {
  await popup.locator('#name').fill(name);
  if (invitation) {
    await popup.locator('#join-code').fill(invitation);
    await popup.locator('#join').click();
  } else await popup.locator('#create').click();
  await expect(popup.locator('#session')).toBeVisible();
}
