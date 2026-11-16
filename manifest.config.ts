import { defineManifest } from '@crxjs/vite-plugin';
export function manifest(test = false) {
  return defineManifest({
    manifest_version: 3,
    name: test ? 'GhostCursor • LOCAL TEST ONLY' : 'GhostCursor',
    version: '0.1.0',
    description:
      'Browse together. Point anywhere. Private, peer-to-peer live cursors.',
    minimum_chrome_version: '127',
    permissions: ['activeTab', 'scripting', 'offscreen'],
    ...(test ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'GhostCursor',
    },
    background: { service_worker: 'src/background/index.ts', type: 'module' },
    icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'",
    },
  });
}
