import { PeerRateLimit } from '../../src/networking/rate-limit';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Connection } from '../../src/networking/connection';
import { retryDelay } from '../../src/networking/retry';
import { generateInvitation, supportedUrl } from '../../src/shared/security';
import { decodeMessage } from '../../src/networking/protocol';
import { decodeFeature } from '../../src/networking/collaboration-protocol';
import {
  createAnchor,
  resolveAnchor,
} from '../../src/content/collaboration/anchors';
import { NoteStore } from '../../src/collaboration/notes';
import type { TransportHandlers } from '../../src/networking/transport';
const sid = '11111111-1111-4111-8111-111111111111';
function setup() {
  let handlers: TransportHandlers;
  const events = {
    state: vi.fn(),
    cursor: vi.fn(),
    hide: vi.fn(),
    remove: vi.fn(),
    feature: vi.fn(),
    end: vi.fn(),
  };
  const factory = vi.fn((_p: string, _s: string, h: TransportHandlers) => {
    handlers = h;
    return { send: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  });
  const connection = new Connection(factory, events);
  return {
    connection,
    factory,
    events,
    get handlers() {
      return handlers!;
    },
  };
}
const profile = (value = sid) =>
  JSON.stringify({
    v: 2,
    t: 'participant',
    sid: value,
    rev: 0,
    name: 'Peer',
    color: 1,
  });
const hello = JSON.stringify({ v: 1, t: 'hello', name: 'Peer', color: 1 });
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe('Phase 3 protocol and identity hardening', () => {
  it('rejects coercible message types and invalid version negotiation', () => {
    expect(decodeMessage('{"v":1,"t":["bye"]}')).toBeNull();
    expect(decodeMessage('{"v":1,"t":"compat","min":9,"max":2}')).toBeNull();
    expect(
      decodeMessage('{"v":1,"t":"compat","min":1,"max":2,"url":"private"}'),
    ).toBeNull();
    expect(decodeFeature('{"v":3,"t":"click","seq":1,"x":0,"y":0}')).toBeNull();
  });
  it('rejects unsupported suites with a clear error and no peer data processing', async () => {
    const s = setup();
    await s.connection.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.test/',
    );
    s.handlers.join('p');
    s.handlers.message('{"v":1,"t":"compat","min":3,"max":5}', 'p');
    s.handlers.message(hello, 'p');
    s.handlers.message(profile(), 'p');
    expect(s.connection.snapshot().participants).toHaveLength(0);
    expect(s.connection.snapshot().error).toContain('Incompatible');
    expect(s.events.feature).not.toHaveBeenCalled();
    s.connection.leave();
  });
  it('retains transport identity binding across a heartbeat expiry', async () => {
    vi.useFakeTimers();
    const s = setup();
    await s.connection.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.test/',
    );
    s.handlers.join('p');
    s.handlers.message(hello, 'p');
    s.handlers.message(profile(), 'p');
    vi.advanceTimersByTime(26000);
    s.handlers.message(hello, 'p');
    s.handlers.message(profile('22222222-2222-4222-8222-222222222222'), 'p');
    expect(s.connection.snapshot().participants[0]?.sessionId).toBeUndefined();
    s.handlers.message(profile(), 'p');
    expect(s.connection.snapshot().participants[0]?.sessionId).toBe(sid);
    s.connection.leave();
  });
  it('uses a bounded jittered recovery budget and cancels it on leave', async () => {
    vi.useFakeTimers();
    const s = setup();
    await s.connection.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.test/',
    );
    for (let i = 0; i < 4; i++) {
      s.handlers.error('Temporary network failure', true, true);
      expect(s.connection.snapshot().retryAttempt).toBe(i + 1);
      await vi.advanceTimersByTimeAsync(21000);
    }
    expect(s.factory).toHaveBeenCalledTimes(5);
    s.handlers.error('Temporary network failure', true, true);
    expect(s.connection.snapshot().error).toContain('4 attempts');
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.factory).toHaveBeenCalledTimes(5);
    s.connection.leave();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('jitter stays within a capped exponential delay window', () => {
    expect(retryDelay(0, () => 0)).toBe(1500);
    expect(retryDelay(0, () => 1)).toBe(2500);
    expect(retryDelay(3, () => 0.5)).toBe(16000);
    expect(retryDelay(99, () => 1)).toBe(37500);
  });
  it('deduplicates concurrent retries and respects explicit host termination', async () => {
    const s = setup();
    await s.connection.start(
      generateInvitation(),
      'Ada',
      0,
      'https://example.test/',
    );
    await Promise.all([
      s.connection.retry(),
      s.connection.retry(),
      s.connection.retry(),
    ]);
    expect(s.factory).toHaveBeenCalledTimes(2);
    s.handlers.ended?.();
    expect(s.connection.snapshot().invitation).toBeUndefined();
    expect(s.events.end).toHaveBeenCalledOnce();
    s.connection.leave();
  });
  it('excludes browser-internal and Firefox restricted pages', () => {
    for (const url of [
      'about:config',
      'moz-extension://x/page',
      'https://addons.mozilla.org/en-US/firefox/',
      'https://accounts.firefox.com/',
    ])
      expect(supportedUrl(url)).toBe(false);
  });
});
describe('bounded annotation work', () => {
  it('fails closed on excessive sibling traversal without global selectors', () => {
    document.body.innerHTML =
      '<main><button><span>Target</span></button></main>';
    const button = document.querySelector('button')!;
    const anchor = createAnchor(button)!;
    const parent = button.parentElement!;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 2100; i++)
      fragment.append(document.createElement('div'));
    parent.append(fragment);
    expect(createAnchor(button)).toBeNull();
    expect(resolveAnchor(anchor)).toBeNull();
  });
  it('bounds eight authors and keeps unauthorized tombstones isolated', () => {
    document.body.innerHTML = '<button>Target</button>';
    const anchor = createAnchor(document.querySelector('button')!)!;
    const notes = new NoteStore();
    const original = notes.create('owner', 'Safe', anchor);
    notes.merge('attacker', { id: original.id, rev: 999, deleted: true });
    expect(notes.own('owner')[0]).toMatchObject({ text: 'Safe' });
    for (let author = 2; author < 8; author++)
      for (let i = 0; i < 16; i++)
        notes.create(String(author), 'Bounded', anchor);
    expect(notes.merge('ninth', { ...original, id: sid })).toBe(false);
    expect(notes.all().length).toBeLessThanOrEqual(128);
    notes.clear();
    expect(notes.all()).toHaveLength(0);
  });
});

it('drops floods before the extension IPC bridge and bounds peer limiter state', () => {
  const limit = new PeerRateLimit(60, 2);
  limit.add('a');
  limit.add('b');
  limit.add('overflow');
  expect(
    Array.from({ length: 10000 }, () => limit.allow('a', 1000)).filter(Boolean),
  ).toHaveLength(60);
  expect(limit.allow('a', 2000)).toBe(true);
  expect(limit.allow('overflow', 2000)).toBe(false);
  limit.remove('a');
  expect(limit.allow('a', 2000)).toBe(false);
  limit.clear();
  expect(limit.allow('b', 2000)).toBe(false);
});
