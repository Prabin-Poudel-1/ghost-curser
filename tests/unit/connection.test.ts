import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Connection } from '../../src/networking/connection';
import { generateInvitation } from '../../src/shared/security';
import { encodeMessage } from '../../src/networking/protocol';
import type { TransportHandlers } from '../../src/networking/transport';
vi.stubGlobal('crypto', webcrypto);
describe('presence and lifecycle (simulated transport)', () => {
  let handlers: TransportHandlers;
  const send = vi.fn(async () => {}),
    close = vi.fn(async () => {});
  const events = {
    state: vi.fn(),
    cursor: vi.fn(),
    hide: vi.fn(),
    remove: vi.fn(),
    feature: vi.fn(),
  };
  const factory = vi.fn(
    (_topic: string, _secret: string, h: TransportHandlers) => {
      handlers = h;
      return { send, close };
    },
  );
  let session: Connection;
  const hello = () =>
    handlers.message(
      encodeMessage({ v: 1, t: 'hello', name: 'Bea', color: 0 }),
      'peer',
    );
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    session = new Connection(factory, events);
    await session.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.com/page',
    );
  });
  afterEach(() => {
    session.leave();
    vi.useRealTimers();
  });
  it('connects only after validated peer identity and avoids color collisions', () => {
    expect(session.snapshot().status).toBe('connecting');
    handlers.join('peer');
    expect(session.snapshot().participants).toHaveLength(0);
    hello();
    expect(session.snapshot().status).toBe('connected');
    expect(session.snapshot().participants[0]?.color).toBe(1);
    handlers.leave('peer');
    expect(session.snapshot().participants).toHaveLength(0);
    expect(events.remove).toHaveBeenCalledWith('peer');
  });
  it('ignores unknown peers, malformed messages and stale cursor sequences', () => {
    hello();
    expect(session.snapshot().participants).toHaveLength(0);
    handlers.join('peer');
    hello();
    handlers.message('broken', 'peer');
    for (const seq of [2, 1, 2])
      handlers.message(
        encodeMessage({ v: 1, t: 'cursor', seq, x: 0.5, y: 0.5 }),
        'peer',
      );
    expect(events.cursor).toHaveBeenCalledTimes(1);
  });
  it('expires presence and recovers when the existing channel resumes', () => {
    handlers.join('peer');
    hello();
    vi.advanceTimersByTime(26000);
    expect(session.snapshot().participants).toHaveLength(0);
    expect(events.remove).toHaveBeenCalled();
    hello();
    expect(session.snapshot().status).toBe('connected');
  });
  it('reports discovery timeout honestly and accepts a later connection', () => {
    vi.advanceTimersByTime(31000);
    expect(session.snapshot().status).toBe('disconnected');
    expect(session.snapshot().error).toContain('No peer');
    handlers.join('peer');
    hello();
    expect(session.snapshot().error).toBeUndefined();
  });
  it('retries and ignores callbacks from an old transport', async () => {
    const old = handlers;
    await session.retry();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    old.error('stale');
    expect(session.snapshot().error).toBeUndefined();
    handlers.join('peer');
    hello();
    expect(session.snapshot().status).toBe('connected');
  });
  it('revokes participation and removes timers on leave', () => {
    handlers.join('peer');
    hello();
    session.leave();
    expect(session.snapshot()).toEqual({
      status: 'disconnected',
      participants: [],
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(close).toHaveBeenCalledOnce();
    hello();
    expect(session.snapshot().participants).toHaveLength(0);
  });
  it('cancels an in-flight start before transport creation', async () => {
    const starting = session.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.com',
    );
    session.leave();
    await starting;
    expect(session.snapshot().status).toBe('disconnected');
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it('clears peers and timers on terminal transport failure while preserving retry credentials', () => {
    handlers.join('peer');
    hello();
    const invitation = session.snapshot().invitation;
    handlers.error('Transport stopped', true);
    expect(session.snapshot().status).toBe('disconnected');
    expect(session.snapshot().participants).toHaveLength(0);
    expect(session.snapshot().invitation).toBe(invitation);
    expect(vi.getTimerCount()).toBe(0);
    expect(events.remove).toHaveBeenCalledWith('peer');
  });
  it('bounds incoming cursor processing', () => {
    handlers.join('peer');
    hello();
    for (let seq = 0; seq < 100; seq++)
      handlers.message(
        encodeMessage({ v: 1, t: 'cursor', seq, x: 0, y: 0 }),
        'peer',
      );
    expect(events.cursor.mock.calls.length).toBeLessThanOrEqual(59);
  });
  it('handles explicit hide and leave messages', () => {
    handlers.join('peer');
    hello();
    handlers.message(encodeMessage({ v: 1, t: 'hide' }), 'peer');
    expect(events.hide).toHaveBeenCalledWith('peer');
    handlers.message(encodeMessage({ v: 1, t: 'bye' }), 'peer');
    expect(session.snapshot().participants).toHaveLength(0);
  });
  it('requires v2 capability before annotations and binds a session ID to its transport', async () => {
    handlers.join('peer');
    hello();
    await session.sendFeature({ v: 2, t: 'click', seq: 1, x: 0, y: 0 });
    const before = send.mock.calls.length;
    const sid = '11111111-1111-4111-8111-111111111111';
    handlers.message(
      JSON.stringify({
        v: 2,
        t: 'participant',
        sid,
        rev: 0,
        name: 'Bea',
        color: 0,
      }),
      'peer',
    );
    expect(session.snapshot().participants[0]?.sessionId).toBe(sid);
    await session.sendFeature({ v: 2, t: 'click', seq: 1, x: 0, y: 0 });
    expect(send.mock.calls.length).toBe(before + 1);
    handlers.message(
      JSON.stringify({
        v: 2,
        t: 'participant',
        sid: '22222222-2222-4222-8222-222222222222',
        rev: 1,
        name: 'Spoof',
        color: 0,
      }),
      'peer',
    );
    expect(session.snapshot().participants[0]?.name).toBe('Bea');
  });
  it('deduplicates transient sequences and preserves assigned colors across feature messages', () => {
    handlers.join('peer');
    hello();
    handlers.message(
      JSON.stringify({
        v: 2,
        t: 'participant',
        sid: '11111111-1111-4111-8111-111111111111',
        rev: 0,
        name: 'Bea',
        color: 0,
      }),
      'peer',
    );
    events.feature.mockClear();
    for (const seq of [2, 2, 1])
      handlers.message(
        JSON.stringify({ v: 2, t: 'click', seq, x: 0.2, y: 0.3 }),
        'peer',
      );
    expect(events.feature).toHaveBeenCalledTimes(1);
    expect(events.feature.mock.calls[0]?.[1].color).toBe(1);
  });
  it('updates names without changing active session identity', () => {
    const sid = session.snapshot().self?.sessionId;
    session.rename('Ada renamed');
    expect(session.snapshot().self?.name).toBe('Ada renamed');
    expect(session.snapshot().self?.sessionId).toBe(sid);
  });
});
