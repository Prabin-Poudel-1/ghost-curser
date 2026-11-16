import { joinRoom } from 'trystero';
import { MAX_PARTICIPANTS } from '../shared/constants';
import { MAX_MESSAGE_BYTES } from './protocol';
import type { RoomTransportFactory } from './transport';
export const createTransport: RoomTransportFactory = (
  topic,
  secret,
  handlers,
) => {
  const room = joinRoom(
    {
      appId: 'ghostcursor-v1',
      password: secret,
      identity: 'none',
      maxUsers: MAX_PARTICIPANTS,
      // Trystero identity handshakes exceed the 512-byte application budget.
      maxReceiveBytes: 16 * 1024,
      relayConfig: {
        warnOnRelayFailure: false,
        ...(__TEST_BUILD__ ? { urls: ['ws://127.0.0.1:8787'] } : {}),
      },
      ...(__TEST_BUILD__ ? { rtcConfig: { iceServers: [] } } : {}),
    },
    topic,
  );
  const action = room.makeAction<string>('gc-v1');
  action.onReceive(({ byteLength }) => byteLength <= MAX_MESSAGE_BYTES);
  const unsub = [
    action.onMessage((data, { peerId }) => handlers.message(data, peerId)),
    room.onPeerJoin(({ peerId }) => handlers.join(peerId)),
    room.onPeerLeave(({ peerId }) => handlers.leave(peerId)),
    room.onError(({ code }) => {
      handlers.error(
        code === 'peer-connect-failed'
          ? 'Direct WebRTC connection failed. Check your network or try another network; this MVP has no TURN relay.'
          : code === 'decrypt-failed'
            ? 'Could not authenticate the peer. Check the invitation and retry.'
            : code === 'room-full'
              ? 'This room is full (8 participants maximum).'
              : `Peer discovery or connection failed (${code}). Check your network and retry.`,
      );
    }),
  ];
  void room.ready.catch(() =>
    handlers.error(
      'Could not initialize peer discovery. Retry the connection.',
    ),
  );
  return {
    send: (raw, target) => action.send(raw, target ? { target } : undefined),
    close: async () => {
      unsub.forEach((fn) => fn());
      await room.leave();
    },
  };
};
