import type { TransportFactory } from './transport';
export const createTransport: TransportFactory = (page, secret, handlers) => {
  const port = chrome.runtime.connect({ name: 'ghostcursor-transport-v1' });
  const pending = new Map<
    number,
    {
      resolve: () => void;
      reject: () => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let sequence = 0;
  let closed = false;
  let finishClose: (() => void) | undefined;
  function clearPending() {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject();
    }
    pending.clear();
  }
  port.onMessage.addListener((value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const m = value as Record<string, unknown>;
    if (m.type === 'closed') {
      finishClose?.();
      return;
    }
    if (closed) return;
    if (m.type === 'ack' && typeof m.id === 'number') {
      const item = pending.get(m.id);
      if (item) {
        clearTimeout(item.timer);
        pending.delete(m.id);
        if (m.ok === true) item.resolve();
        else item.reject();
      }
      return;
    }
    if (m.type === 'join' && typeof m.peer === 'string') handlers.join(m.peer);
    if (m.type === 'leave' && typeof m.peer === 'string')
      handlers.leave(m.peer);
    if (m.type === 'message' && typeof m.peer === 'string')
      handlers.message(m.raw, m.peer);
    if (m.type === 'error' && typeof m.message === 'string') {
      if (m.terminal === true) {
        closed = true;
        clearPending();
      }
      handlers.error(m.message, m.terminal === true);
      if (m.terminal === true) port.disconnect();
    }
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    clearPending();
    if (!closed)
      handlers.error(
        'The extension transport stopped. Leave the room and join again.',
        true,
      );
    closed = true;
  });
  port.postMessage({ type: 'open', page, secret });
  return {
    send: (raw, target) =>
      new Promise<void>((resolve, reject) => {
        if (closed || pending.size >= 16) {
          reject(new Error('Transport unavailable'));
          return;
        }
        const id = sequence++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Transport timed out'));
        }, 5000);
        pending.set(id, {
          resolve,
          reject: () => reject(new Error('Transport send failed')),
          timer,
        });
        try {
          port.postMessage({ type: 'send', id, raw, target });
        } catch {
          clearTimeout(timer);
          pending.delete(id);
          reject(new Error('Transport unavailable'));
        }
      }),
    close: () =>
      new Promise<void>((resolve) => {
        closed = true;
        clearPending();
        const done = () => {
          clearTimeout(timeout);
          finishClose = undefined;
          port.disconnect();
          resolve();
        };
        const timeout = setTimeout(done, 1500);
        finishClose = done;
        try {
          port.postMessage({ type: 'close' });
        } catch {
          done();
        }
      }),
  };
};
