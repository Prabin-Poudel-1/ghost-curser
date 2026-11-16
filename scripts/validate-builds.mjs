import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(directory, e.name))
      : [join(directory, e.name)],
  );
}
for (const [root, browser] of [
  ['dist', 'chromium'],
  ['dist-firefox', 'firefox'],
]) {
  const manifest = JSON.parse(
    readFileSync(join(root, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.version, version);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(
    manifest.permissions,
    browser === 'firefox'
      ? ['activeTab', 'scripting']
      : ['activeTab', 'scripting', 'offscreen'],
  );
  for (const key of [
    'host_permissions',
    'content_scripts',
    'externally_connectable',
    'web_accessible_resources',
  ])
    assert.equal(manifest[key], undefined, `${browser}: unexpected ${key}`);
  const references = [
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...(manifest.background.scripts ?? [manifest.background.service_worker]),
  ];
  for (const path of references)
    assert.ok(existsSync(join(root, path)), `Missing ${path}`);
  if (browser === 'firefox') {
    assert.equal(manifest.background.service_worker, undefined);
    assert.equal(
      manifest.browser_specific_settings.gecko.id,
      'ghostcursor@prabin-poudel.dev',
    );
    assert.ok(
      !manifest.browser_specific_settings.gecko.data_collection_permissions.required.includes(
        'none',
      ),
    );
  }
  for (const file of files(root)) {
    if (!/\.(?:js|html|json)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    assert.ok(
      !/127\.0\.0\.1:8787|NEVER_TRANSMIT_PASSWORD|LOCAL TEST ONLY/.test(source),
      `Test data in ${file}`,
    );
    if (file.endsWith('.js'))
      assert.ok(
        !/\beval\s*\(|new\s+Function\s*\(/.test(source),
        `Executable string in ${file}`,
      );
    if (file.endsWith('.html'))
      for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const path = match[1];
        assert.ok(
          !/^(?:https?:|\/\/)/.test(path),
          `Remote resource in ${file}`,
        );
        if (!path.startsWith('#'))
          assert.ok(
            existsSync(
              path.startsWith('/')
                ? resolve(root, path.slice(1))
                : resolve(dirname(file), path),
            ),
            `Missing ${path}`,
          );
      }
  }
  console.log(
    `${browser}: production manifest, resources, script and test-data checks passed`,
  );
}
