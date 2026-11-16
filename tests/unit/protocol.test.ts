import { describe, it, expect } from 'vitest';
import {
  decodeMessage,
  encodeMessage,
  normalize,
  type Message,
} from '../../src/networking/protocol';
describe('bounded v1 protocol', () => {
  it.each<Message>([
    { v: 1, t: 'hello', name: 'Ada', color: 0 },
    { v: 1, t: 'cursor', seq: 1, x: 0.5, y: 1 },
    { v: 1, t: 'hide' },
    { v: 1, t: 'beat' },
    { v: 1, t: 'bye' },
  ])('round trips $t', (message) =>
    expect(decodeMessage(encodeMessage(message))).toEqual(message),
  );
  it.each([
    null,
    {},
    'not JSON',
    '[]',
    'null',
    'x'.repeat(513),
    '{"v":2,"t":"beat"}',
    '{"v":1,"t":"beat","url":"leak"}',
    '{"v":1,"t":"cursor","x":-1,"y":0,"seq":1}',
    '{"v":1,"t":"cursor","x":0,"y":1e999,"seq":1}',
    '{"v":1,"t":"hello","name":"","color":0}',
    '{"v":1,"t":"hello","name":"Ada","color":99}',
  ])('rejects malformed input', (value) =>
    expect(decodeMessage(value)).toBeNull(),
  );
});
describe('viewport coordinates', () => {
  it('normalizes different viewport sizes identically', () =>
    expect(normalize(200, 100, 800, 400)).toEqual(
      normalize(400, 200, 1600, 800),
    ));
  it('clamps out of range coordinates', () =>
    expect(normalize(-2, 1000, 100, 100)).toEqual({ x: 0, y: 1 }));
  it('rejects degenerate/nonfinite dimensions', () => {
    expect(normalize(0, 0, 0, 100)).toBeNull();
    expect(normalize(NaN, 0, 100, 100)).toBeNull();
  });
});
