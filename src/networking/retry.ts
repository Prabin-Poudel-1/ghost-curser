export const MAX_AUTO_RETRIES = 4;
export function retryDelay(attempt: number, random = Math.random): number {
  const base = Math.min(30_000, 2000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random())) * 0.5));
}
