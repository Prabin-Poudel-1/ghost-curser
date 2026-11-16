import { validColor, validName } from '../shared/security';
import type { Point } from '../shared/types';
export type Message =
  | { v: 1; t: 'compat'; min: number; max: number }
  | { v: 1; t: 'hello'; name: string; color: number }
  | { v: 1; t: 'cursor'; seq: number; x: number; y: number }
  | { v: 1; t: 'hide' | 'beat' | 'bye' };
export const MAX_MESSAGE_BYTES = 512;
export function decodeMessage(raw: unknown): Message | null {
  if (
    typeof raw !== 'string' ||
    raw.length > MAX_MESSAGE_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES
  )
    return null;
  try {
    const m: unknown = JSON.parse(raw);
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const d = m as Record<string, unknown>;
    if (d.v !== 1) return null;
    const keys = Object.keys(d).sort().join(',');
    if (
      d.t === 'compat' &&
      keys === 'max,min,t,v' &&
      Number.isInteger(d.min) &&
      Number.isInteger(d.max) &&
      Number(d.min) >= 1 &&
      Number(d.max) <= 255 &&
      Number(d.min) <= Number(d.max)
    )
      return d as Message;
    if (
      d.t === 'hello' &&
      keys === 'color,name,t,v' &&
      validName(d.name) &&
      validColor(d.color)
    )
      return d as Message;
    if (
      d.t === 'cursor' &&
      keys === 'seq,t,v,x,y' &&
      Number.isSafeInteger(d.seq) &&
      Number(d.seq) >= 0 &&
      unit(d.x) &&
      unit(d.y)
    )
      return d as Message;
    if (
      typeof d.t === 'string' &&
      ['hide', 'beat', 'bye'].includes(d.t) &&
      keys === 't,v'
    )
      return d as Message;
  } catch {
    /* Untrusted input is discarded. */
  }
  return null;
}
const unit = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
export const encodeMessage = (message: Message): string =>
  JSON.stringify(message);
export function normalize(
  x: number,
  y: number,
  width: number,
  height: number,
): Point | null {
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  const clamp = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  return { x: clamp(x / width), y: clamp(y / height) };
}
