import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
interface Event {
  id: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}
interface Filter {
  kinds?: number[];
  '#x'?: string[];
  since?: number;
}
// Deliberately local and ephemeral: a Nostr wire-protocol fixture, not a production relay.
// Signaling is deterministic here; SDP encryption and RTCDataChannels are real Trystero/Chromium.
export async function startFixture() {
  const events: Event[] = [];
  const wire: string[] = [];
  const origins = new Set<string | undefined>();
  const subscriptions = new Map<WebSocket, Map<string, Filter>>();
  const http = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'",
    );
    res.end(
      `<!doctype html><html><head><title>GhostCursor test page</title><style>body{font:18px system-ui;background:#f4f1e9;padding:60px;color:#252531}main{max-width:800px}h1{font-size:48px}button{padding:16px}article{height:1600px}</style></head><body><main><p>GHOSTCURSOR / TEST FIXTURE</p><h1>A place to point together.</h1><p>Real browser instances. Real WebRTC. Local signaling.</p><button id="page-button">A normal page button</button><input type="password" value="NEVER_TRANSMIT_PASSWORD"><article></article></main></body></html>`,
    );
  });
  const relay = new WebSocketServer({ host: '127.0.0.1', port: 8787 });
  const matches = (event: Event, filter: Filter) =>
    (!filter.kinds || filter.kinds.includes(event.kind)) &&
    (!filter['#x'] ||
      event.tags.some(
        ([key, value]) =>
          key === 'x' && value !== undefined && filter['#x']!.includes(value),
      )) &&
    (!filter.since || event.created_at >= filter.since);
  relay.on('connection', (socket, request) => {
    origins.add(request.headers.origin);
    const subs = new Map<string, Filter>();
    subscriptions.set(socket, subs);
    socket.on('close', () => subscriptions.delete(socket));
    socket.on('message', (data) => {
      const raw = data.toString();
      wire.push(raw);
      const message = JSON.parse(raw) as [string, string | Event, Filter?];
      if (
        message[0] === 'REQ' &&
        typeof message[1] === 'string' &&
        message[2]
      ) {
        const id = message[1],
          filter = message[2];
        subs.set(id, filter);
        for (const event of events)
          if (matches(event, filter))
            socket.send(JSON.stringify(['EVENT', id, event]));
        socket.send(JSON.stringify(['EOSE', id]));
      }
      if (message[0] === 'CLOSE' && typeof message[1] === 'string')
        subs.delete(message[1]);
      if (message[0] === 'EVENT' && typeof message[1] === 'object') {
        const event = message[1];
        // NIP-01: 20000–29999 events are ephemeral and must not be replayed.
        if (event.kind < 20000 || event.kind >= 30000) {
          events.push(event);
          if (events.length > 200) events.shift();
        }
        socket.send(JSON.stringify(['OK', event.id, true, '']));
        for (const [client, filters] of subscriptions)
          for (const [id, filter] of filters)
            if (client.readyState === WebSocket.OPEN && matches(event, filter))
              client.send(JSON.stringify(['EVENT', id, event]));
      }
    });
  });
  await Promise.all([
    new Promise<void>((resolve) => http.listen(8788, '127.0.0.1', resolve)),
    new Promise<void>((resolve) => relay.once('listening', resolve)),
  ]);
  return {
    wire,
    origins,
    close: async () => {
      for (const socket of relay.clients) socket.terminate();
      await Promise.all([
        new Promise<void>((resolve) => relay.close(() => resolve())),
        new Promise<void>((resolve) => http.close(() => resolve())),
      ]);
    },
  };
}
