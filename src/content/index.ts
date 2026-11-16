import { Connection } from '../networking/connection';
import { createTransport } from '../networking/bridge';
import { normalize } from '../networking/protocol';
import { CURSOR_INTERVAL_MS } from '../shared/constants';
import { pageIdentity, validCommand } from '../shared/security';
import type { Response } from '../shared/types';
import { CursorOverlay } from './overlay';
// The guard lives in Chrome's isolated world, never on the webpage's window.
const scope = globalThis as typeof globalThis & {
  __ghostcursorInstalled?: boolean;
};
if (!scope.__ghostcursorInstalled) {
  scope.__ghostcursorInstalled = true;
  let overlay: CursorOverlay | undefined;
  let active: AbortController | undefined;
  let pageCheck: ReturnType<typeof setInterval> | undefined;
  let lastMove = 0;
  const connection = new Connection(createTransport, {
    state: () => {},
    cursor: (id, point, participant) => {
      if (!document.hidden) overlay?.move(id, point, participant);
    },
    hide: (id) => overlay?.hide(id),
    remove: (id) => overlay?.remove(id),
  });
  function cleanup() {
    active?.abort();
    active = undefined;
    clearInterval(pageCheck);
    pageCheck = undefined;
    overlay?.destroy();
    overlay = undefined;
  }
  function leave() {
    epoch++;
    cleanup();
    connection.leave();
  }
  function activate() {
    cleanup();
    active = new AbortController();
    overlay = new CursorOverlay();
    const options = { signal: active.signal, passive: true };
    const identity = pageIdentity(location.href);
    // Catch SPA path changes too; query and fragment changes intentionally do not change rooms.
    pageCheck = setInterval(() => {
      if (pageIdentity(location.href) !== identity) leave();
    }, 500);
    window.addEventListener(
      'pointermove',
      (event) => {
        if (
          document.hidden ||
          performance.now() - lastMove < CURSOR_INTERVAL_MS
        )
          return;
        lastMove = performance.now();
        const point = normalize(
          event.clientX,
          event.clientY,
          innerWidth,
          innerHeight,
        );
        if (point) connection.cursor(point);
      },
      options,
    );
    document.addEventListener('pointerleave', () => connection.hide(), options);
    window.addEventListener('blur', () => connection.hide(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          connection.hide();
          overlay?.hideAll();
        }
      },
      options,
    );
    window.addEventListener('resize', () => overlay?.resize(), options);
    window.addEventListener('pagehide', leave, options);
  }
  let queue = Promise.resolve();
  let epoch = 0;
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, respond: (r: Response) => void) => {
      if (
        sender.id !== chrome.runtime.id ||
        !sender.url?.startsWith(chrome.runtime.getURL('')) ||
        !validCommand(message)
      )
        return false;
      // Leave is immediate, including while an asynchronous start is deriving its key.
      if (message.type === 'leave') {
        leave();
        respond({ ok: true, state: connection.snapshot() });
        return false;
      }
      if (message.type === 'state') {
        respond({ ok: true, state: connection.snapshot() });
        return false;
      }
      const requestEpoch = epoch;
      queue = queue
        .then(async () => {
          if (requestEpoch !== epoch) {
            respond({ ok: true, state: connection.snapshot() });
            return;
          }
          if (message.type === 'start') {
            activate();
            await connection.start(
              message.invitation,
              message.name,
              message.color,
              location.href,
            );
          }
          if (message.type === 'retry') await connection.retry();
          respond({ ok: true, state: connection.snapshot() });
        })
        .catch(() => {
          leave();
          respond({
            ok: false,
            error:
              'Unable to start this page session. Reload the page and retry.',
          });
        });
      return true;
    },
  );
}
