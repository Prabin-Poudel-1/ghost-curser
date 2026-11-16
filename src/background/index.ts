import { sessionHost } from '../browser/session-host';
import { api } from '../browser/api';
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
    Object.keys(r).length === 3 &&
    r.channel === 'ghostcursor' &&
    Number.isInteger(r.tabId) &&
    Number(r.tabId) >= 0 &&
    validCommand(r.command)
  );
}
async function handle({ tabId, command }: Request): Promise<Response> {
  try {
    const tab = await api.tabs.get(tabId);
    if (command.type === 'start') {
      if (!tab.url || !supportedUrl(tab.url))
        return {
          ok: false,
          error:
            'Open a regular HTTP or HTTPS webpage, then click the extension icon. Browser pages, stores, PDFs, and extension pages are not supported.',
        };
      await sessionHost.ensure();
      await api.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ['content.js'],
      });
    }
    try {
      return (await api.tabs.sendMessage(tabId, command, {
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
api.runtime.onMessage.addListener(
  (message: unknown, sender, respond: (r: Response) => void) => {
    if (
      sender.id === api.runtime.id &&
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      sender.url &&
      supportedUrl(sender.url) &&
      (message as { channel?: string })?.channel === 'ghostcursor-recover'
    ) {
      void sessionHost.ensure().then(
        () => respond({ ok: true, state: emptyState() }),
        () => respond({ ok: false, error: 'Could not restart networking.' }),
      );
      return true;
    }
    if (
      sender.id !== api.runtime.id ||
      sender.url?.split('?')[0] !==
        api.runtime.getURL('src/popup/index.html') ||
      !validRequest(message)
    )
      return false;
    void handle(message).then(respond);
    return true;
  },
);

// Revoking an extension permission ends active sharing rather than silently
// continuing with a stale capability. No permission is requested automatically.
api.permissions.onRemoved.addListener(() => {
  void api.runtime
    .sendMessage({ channel: 'ghostcursor-host', type: 'revoke' })
    .catch(() => {});
});
