import { createTransport } from './room';
import type { Transport } from './transport';
import { decodeMessage } from './protocol';
import { parseInvitation, supportedUrl, roomTopic } from '../shared/security';
interface Active {
  port: chrome.runtime.Port;
  tabId: number;
  transport: Transport;
}
let active: Active | undefined;
let opening = Promise.resolve();
// One explicitly activated tab per profile. Separate profiles are independent peers.
chrome.runtime.onConnect.addListener((port) => {
  const sender = port.sender;
  if (
    port.name !== 'ghostcursor-transport-v1' ||
    sender?.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.url ||
    !supportedUrl(sender.url)
  )
    return;
  const tabId = sender.tab.id;
  let transport: Transport | undefined;
  let opened = false;
  let closed = false;
  const post = (message: object) => {
    try {
      port.postMessage(message);
    } catch {
      /* The owning page has gone away. */
    }
  };
  function close() {
    closed = true;
    if (active?.port === port) active = undefined;
    const previous = transport;
    transport = undefined;
    return previous?.close().catch(() => {});
  }
  port.onDisconnect.addListener(close);
  port.onMessage.addListener((value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const m = value as Record<string, unknown>;
    if (m.type === 'close') {
      void Promise.resolve(close()).then(() => post({ type: 'closed' }));
      return;
    }
    if (m.type === 'open' && !opened) {
      opened = true;
      if (typeof m.page !== 'string' || !supportedUrl(m.page)) return;
      const page = m.page;
      let secret: string;
      try {
        secret = parseInvitation(m.secret);
      } catch {
        return;
      }
      opening = opening
        .then(async () => {
          const topic = await roomTopic(secret, page);
          if (closed) return;
          if (active && active.tabId !== tabId) {
            post({
              type: 'error',
              terminal: true,
              message:
                'Another tab already has a GhostCursor session. Leave that room before starting one here.',
            });
            return;
          }
          if (active) {
            const previous = active;
            active = undefined;
            await previous.transport.close().catch(() => {});
            previous.port.disconnect();
          }
          if (closed) return;
          try {
            transport = createTransport(topic, secret, {
              join: (peer) => post({ type: 'join', peer }),
              leave: (peer) => post({ type: 'leave', peer }),
              message: (raw, peer) => post({ type: 'message', raw, peer }),
              error: (message) => post({ type: 'error', message }),
            });
            active = { port, tabId, transport };
          } catch {
            post({
              type: 'error',
              terminal: true,
              message:
                'Could not initialize the private transport. Leave and try again.',
            });
          }
        })
        .catch(() =>
          post({
            type: 'error',
            terminal: true,
            message:
              'Could not initialize room encryption. Leave and try again.',
          }),
        );
    }
    if (
      m.type === 'send' &&
      transport &&
      Number.isSafeInteger(m.id) &&
      decodeMessage(m.raw) &&
      (m.target === undefined || typeof m.target === 'string')
    ) {
      void transport
        .send(m.raw as string, m.target as string | undefined)
        .then(() => post({ type: 'ack', id: m.id, ok: true }))
        .catch(() => post({ type: 'ack', id: m.id, ok: false }));
    }
  });
});
