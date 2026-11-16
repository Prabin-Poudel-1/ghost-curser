// Both supported engines implement the Promise APIs used here. Prefer Firefox's
// browser namespace; Chrome's MV3 namespace is the fallback. No polyfill runtime.
export const api: typeof chrome =
  (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ??
  chrome;
