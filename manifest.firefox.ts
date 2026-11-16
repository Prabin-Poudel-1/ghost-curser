export const FIREFOX_ID = 'ghostcursor@prabin-poudel.dev';
export function firefoxManifest(test = false) {
  return {
    manifest_version: 3,
    name: test ? 'GhostCursor • LOCAL TEST ONLY' : 'GhostCursor',
    version: '0.3.0',
    description:
      'Browse together. Point anywhere. Private peer-to-peer cursors and annotations.',
    permissions: ['activeTab', 'scripting'],
    ...(test ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'GhostCursor',
    },
    background: { scripts: ['background.js'] },
    icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'",
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: [
            'personallyIdentifyingInfo',
            'personalCommunications',
            'websiteActivity',
            'websiteContent',
            'browsingActivity',
          ],
        },
      },
    },
  };
}
