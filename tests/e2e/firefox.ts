import { Builder, Origin, type WebElement } from 'selenium-webdriver';
import {
  Driver,
  Options,
  Context,
  ServiceBuilder,
} from 'selenium-webdriver/firefox.js';
import { firefox } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { FIREFOX_ID } from '../../manifest.firefox';
export async function firefoxClient() {
  process.env.SE_CACHE_PATH ??= resolve('../../work/selenium');
  process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
  const uuid = randomUUID();
  const options = new Options()
    .setBinary(process.env.FIREFOX_BINARY ?? firefox.executablePath())
    .addArguments('-headless')
    .setPreference(
      'extensions.webextensions.uuids',
      JSON.stringify({ [FIREFOX_ID]: uuid }),
    )
    .setPreference('browser.shell.checkDefaultBrowser', false);
  const driver = (await new Builder()
    .forBrowser('firefox')
    .setFirefoxService(
      new ServiceBuilder().addArguments('--allow-system-access'),
    )
    .setFirefoxOptions(options)
    .build()) as Driver;
  try {
    await driver.installAddon(resolve('artifacts/firefox-test.zip'), true);
    await driver.manage().window().setRect({ width: 1200, height: 1000 });
    await driver.get('http://127.0.0.1:8788/same-page');
    const pageHandle = await driver.getWindowHandle();
    const extensionUrl = `moz-extension://${uuid}/`;
    const element = async (selector: string): Promise<WebElement> =>
      driver.executeScript((selector: string) => {
        const roots: (Document | ShadowRoot)[] = [document];
        for (const host of document.querySelectorAll('[data-ghostcursor]'))
          if (host.shadowRoot) roots.push(host.shadowRoot);
        return (
          roots.flatMap((root) =>
            Array.from(root.querySelectorAll(selector)),
          )[0] ?? null
        );
      }, selector);
    async function navigateExtension(url: string) {
      await driver.setContext(Context.CHROME);
      try {
        await driver.executeScript(
          'gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});',
          url,
        );
      } finally {
        await driver.setContext(Context.CONTENT);
      }
      await driver.wait(
        async () => (await driver.getCurrentUrl()) === url,
        10000,
      );
      await driver.wait(
        async () =>
          driver.executeScript('return document.readyState === "complete"'),
        10000,
      );
    }
    return {
      driver,
      pageHandle,
      extensionUrl,
      element,
      async stopBackground() {
        await driver.setContext(Context.CHROME);
        try {
          return await driver.executeAsyncScript(
            `const done = arguments[arguments.length - 1];
            const extension = WebExtensionPolicy.getByID(arguments[0]).extension;
            if (typeof extension.terminateBackground !== 'function') {done({supported:false});return;}
            Promise.resolve(extension.terminateBackground()).then(()=>done({supported:true,state:extension.backgroundState}),()=>done({supported:false}));`,
            FIREFOX_ID,
          );
        } finally {
          await driver.setContext(Context.CONTENT);
        }
      },
      async page() {
        await driver.switchTo().window(pageHandle);
      },
      async popup() {
        await driver.switchTo().newWindow('tab');
        await navigateExtension(extensionUrl + 'src/popup/index.html');
        const tabId = await driver.executeAsyncScript(
          (done: (id: number) => void) => {
            const browser = (
              globalThis as unknown as { browser: typeof chrome }
            ).browser;
            void browser.tabs
              .query({})
              .then((tabs) =>
                done(tabs.find((t) => t.url?.includes('/same-page'))!.id!),
              );
          },
        );
        await navigateExtension(
          extensionUrl + `src/popup/index.html?tab=${tabId}`,
        );
      },
      async closePopup() {
        await driver.close();
        await driver.switchTo().window(pageHandle);
      },
      async click(selector: string) {
        await (await element(selector)).click();
      },
      async fill(selector: string, text: string) {
        const el = await element(selector);
        await el.clear();
        await el.sendKeys(text);
      },
      async text(selector: string) {
        const el = await element(selector);
        return el ? el.getText() : '';
      },
      async count(selector: string): Promise<number> {
        return driver.executeScript((selector: string) => {
          const roots: (Document | ShadowRoot)[] = [document];
          for (const host of document.querySelectorAll('[data-ghostcursor]'))
            if (host.shadowRoot) roots.push(host.shadowRoot);
          return roots.reduce(
            (sum, root) => sum + root.querySelectorAll(selector).length,
            0,
          );
        }, selector);
      },
      async move(x: number, y: number) {
        await driver
          .actions()
          .move({ x, y, origin: Origin.VIEWPORT })
          .perform();
      },
      async point(x: number, y: number) {
        await driver
          .actions()
          .move({ x, y, origin: Origin.VIEWPORT })
          .click()
          .perform();
      },
      async draw() {
        await driver
          .actions()
          .move({ x: 100, y: 200, origin: Origin.VIEWPORT })
          .press()
          .move({ x: 400, y: 230, origin: Origin.VIEWPORT, duration: 300 })
          .release()
          .perform();
      },
    };
  } catch (error) {
    await driver.quit();
    throw error;
  }
}
