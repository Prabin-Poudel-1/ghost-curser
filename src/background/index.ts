import { supportedUrl, validCommand } from '../shared/security';
import { emptyState, type Command, type Response } from '../shared/types';
interface Request {
  channel: 'ghostcursor';
  tabId: number;
  command: Command;
}
function validRequest(input: unknown): input is Request {
  if (!input || typeof input !== 'object') return false;
  const r = input as Record<string, unknown>;
  return (
    r.channel === 'ghostcursor' &&
    Number.isInteger(r.tabId) &&
    Number(r.tabId) >= 0 &&
    validCommand(r.command)
  );
}
let creating: Promise<void> | undefined;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: 'src/networking/offscreen.html',
      reasons: [chrome.offscreen.Reason.WEB_RTC],
      justification:
        'Keep user-activated peer connections alive without exposing webpage origins to signaling services.',
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}
async function handle({ tabId, command }: Request): Promise<Response> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (command.type === 'start') {
      if (!tab.url || !supportedUrl(tab.url))
        return {
          ok: false,
          error:
            'Open a regular HTTP or HTTPS webpage, then click the extension icon. Browser pages, stores, PDFs, and extension pages are not supported.',
        };
      await ensureOffscreen();
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ['content.js'],
      });
    }
    try {
      return (await chrome.tabs.sendMessage(tabId, command, {
        frameId: 0,
      })) as Response;
    } catch {
      if (command.type === 'state' || command.type === 'leave')
        return { ok: true, state: emptyState() };
      return {
        ok: false,
        error:
          'The page session is unavailable. Reload the page, open GhostCursor from its toolbar icon, and try again.',
      };
    }
  } catch {
    return {
      ok: false,
      error:
        'Page access was denied or the tab closed. Open a supported page and activate GhostCursor from the toolbar.',
    };
  }
}
chrome.runtime.onMessage.addListener(
  (message: unknown, sender, respond: (r: Response) => void) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url?.split('?')[0] !==
        chrome.runtime.getURL('src/popup/index.html') ||
      !validRequest(message)
    )
      return false;
    void handle(message).then(respond);
    return true;
  },
);
