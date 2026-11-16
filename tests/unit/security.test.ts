import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  generateInvitation,
  randomId,
  parseInvitation,
  roomTopic,
  pageIdentity,
  supportedUrl,
  validCommand,
  validName,
} from '../../src/shared/security';
vi.stubGlobal('crypto', webcrypto);
describe('private invitations', () => {
  it('draws exactly 32 bytes from the secure random generator', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    const token = generateInvitation();
    expect(token).toHaveLength(47);
    expect(parseInvitation(token)).toBe(token);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]?.byteLength).toBe(32);
  });
  it('generates independent tokens', () =>
    expect(new Set(Array.from({ length: 200 }, generateInvitation)).size).toBe(
      200,
    ));
  it.each([
    'ABCD',
    'gc1_foo',
    'https://site.test/#secret',
    'gc1_' + 'a'.repeat(43),
    '',
    null,
  ])('rejects invalid invitation %s', (token) =>
    expect(() => parseInvitation(token)).toThrow(),
  );
  it('trims pasted whitespace', () => {
    const token = generateInvitation();
    expect(parseInvitation('  ' + token + '\n')).toBe(token);
  });
  it('binds discovery to secret and origin/path, excluding credentials, query and fragment', async () => {
    const a = generateInvitation(),
      b = generateInvitation();
    const topic = await roomTopic(
      a,
      'https://user:password@example.com/path?q=token#secret',
    );
    expect(topic).toMatch(/^[a-f0-9]{64}$/);
    expect(topic).toBe(
      await roomTopic(a, 'https://example.com/path?different'),
    );
    expect(topic).not.toBe(await roomTopic(b, 'https://example.com/path'));
    expect(topic).not.toBe(await roomTopic(a, 'https://example.com/other'));
    expect(pageIdentity('https://example.com/a?q=secret#private')).toBe(
      'https://example.com/a',
    );
  });
});
describe('activation boundary', () => {
  it.each([
    'chrome://settings',
    'file:///tmp/file',
    'about:blank',
    'chrome-extension://abc/index.html',
    'https://chromewebstore.google.com/detail/a',
    'javascript:alert(1)',
  ])('rejects unsupported %s', (url) => expect(supportedUrl(url)).toBe(false));
  it('allows HTTP(S) pages', () =>
    expect(supportedUrl('https://example.com')).toBe(true));
  it('validates privileged commands', () => {
    expect(
      validCommand({
        type: 'start',
        invitation: generateInvitation(),
        name: 'Ada',
        color: 2,
      }),
    ).toBe(true);
    expect(validCommand({ type: 'leave', extra: 'bad' })).toBe(false);
    expect(
      validCommand({
        type: 'start',
        invitation: generateInvitation(),
        name: 'Ada',
        color: 90,
      }),
    ).toBe(false);
    expect(validName('invisible\u202e')).toBe(false);
  });
});

describe('session random IDs', () => {
  it('uses secure random bytes with valid UUIDv4 bits without requiring randomUUID', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    spy.mockClear();
    const value = randomId();
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(spy.mock.calls[0]?.[0]?.byteLength).toBe(16);
    expect(new Set(Array.from({ length: 100 }, randomId)).size).toBe(100);
  });
});
