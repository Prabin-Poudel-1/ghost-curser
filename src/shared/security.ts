import { COLORS } from './constants';
import type { Command } from './types';
const INVITATION = /^gc1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
export function generateInvitation(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    'gc1_' +
    btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  );
}
export function parseInvitation(value: unknown): string {
  if (typeof value !== 'string' || !INVITATION.test(value.trim()))
    throw new Error(
      'Enter a complete GhostCursor invitation (gc1_ followed by 43 characters).',
    );
  return value.trim();
}
export function validName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 24 &&
    !/[\p{C}]/u.test(value)
  );
}
export function validColor(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= 0 &&
    Number(value) < COLORS.length
  );
}
export function supportedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      ![
        'chromewebstore.google.com',
        'chrome.google.com',
        'microsoftedge.microsoft.com',
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
// Query strings and fragments may contain credentials; never use them in the room topic.
export function pageIdentity(value: string): string {
  const url = new URL(value);
  return url.origin + url.pathname;
}
export async function roomTopic(
  invitation: string,
  url: string,
): Promise<string> {
  const secret = parseInvitation(invitation).slice(4);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode('ghostcursor:v1:' + pageIdentity(url)),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export function validCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (c.type === 'state' || c.type === 'leave' || c.type === 'retry')
    return Object.keys(c).length === 1;
  if (
    c.type !== 'start' ||
    Object.keys(c).length !== 4 ||
    !validName(c.name) ||
    !validColor(c.color)
  )
    return false;
  try {
    parseInvitation(c.invitation);
    return true;
  } catch {
    return false;
  }
}
