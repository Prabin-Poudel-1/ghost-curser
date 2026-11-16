import { api } from './api';
export interface SessionHost {
  ensure(): Promise<void>;
}
let creating: Promise<void> | undefined;
const chromiumHost: SessionHost = {
  async ensure() {
    if (await api.offscreen.hasDocument()) return;
    creating ??= api.offscreen
      .createDocument({
        url: 'src/networking/offscreen.html',
        reasons: [api.offscreen.Reason.WEB_RTC],
        justification:
          'Keep activated WebRTC sessions alive under the extension origin.',
      })
      .finally(() => {
        creating = undefined;
      });
    await creating;
  },
};
async function hostReady() {
  try {
    return (
      (
        await api.runtime.sendMessage({
          channel: 'ghostcursor-host',
          type: 'ping',
        })
      )?.ready === true
    );
  } catch {
    return false;
  }
}
const firefoxHost: SessionHost = {
  async ensure() {
    if (await hostReady()) return;
    creating ??= (async () => {
      const url = api.runtime.getURL('src/networking/session.html');
      // Own extension tabs are inspectable without a broad tabs permission.
      const tabs = await api.tabs.query({});
      if (!tabs.some((t) => t.url === url))
        await api.tabs.create({ url, active: false });
      for (let i = 0; i < 40; i++) {
        if (await hostReady()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(
        'The Firefox session tab could not start. Close it and retry.',
      );
    })().finally(() => {
      creating = undefined;
    });
    await creating;
  },
};
export const sessionHost =
  __BROWSER__ === 'firefox' ? firefoxHost : chromiumHost;
