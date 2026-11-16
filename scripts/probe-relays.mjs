import { setTimeout, clearTimeout } from 'node:timers';
import { WebSocket } from 'ws';
import { defaultRelayUrls } from 'trystero';
import { mkdirSync, writeFileSync } from 'node:fs';
// Connectivity only: no room, invitation, application data or subscription.
const results = await Promise.all(
  defaultRelayUrls.slice(0, 5).map(
    (url) =>
      new Promise((resolve) => {
        const started = Date.now();
        const socket = new WebSocket(url);
        let done = false;
        const finish = (outcome) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          socket.terminate();
          resolve({ url, outcome, milliseconds: Date.now() - started });
        };
        const timer = setTimeout(() => finish('timeout'), 10000);
        socket.once('open', () => finish('websocket-open'));
        socket.once('error', () => finish('connection-error'));
      }),
  ),
);
mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/relay-probe.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        'WebSocket handshakes to five library defaults from one machine; not a room, ICE, public-peer or cross-network test',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(results, null, 2));
