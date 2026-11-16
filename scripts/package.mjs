import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const output = resolve(process.argv[2] ?? 'artifacts');
await mkdir(output, { recursive: true });
const entries = [];
for (const [browser, directory] of [
  ['chromium', 'dist'],
  ['firefox', 'dist-firefox'],
]) {
  const root = resolve(directory);
  const zip = new JSZip();
  const files = [];
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else files.push(full);
    }
  }
  await visit(root);
  for (const path of files)
    zip.file(relative(root, path).replaceAll('\\', '/'), await readFile(path), {
      date: new Date('2026-01-01T00:00:00Z'),
      createFolders: false,
    });
  zip.file('LICENSE', await readFile('LICENSE'), {
    date: new Date('2026-01-01T00:00:00Z'),
    createFolders: false,
  });
  zip.file(
    'INSTALL.txt',
    `GhostCursor ${version} — ${browser}\n\n${browser === 'firefox' ? 'Unsigned development/distribution package. Extract, open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, and select manifest.json. This installation ends when Firefox restarts. A Mozilla signature is required for ordinary distribution. Keep the GhostCursor session tab open while collaborating.' : 'Extract, open chrome://extensions or edge://extensions, enable Developer mode and choose Load unpacked. Select the extracted folder containing manifest.json.'}\n\nOpen the same HTTP(S) origin/path in independent profiles, create a private room and join using the full invitation. Cursors, clicks, lasers and session-only notes are shared. Leave ends local participation. No TURN guarantee. See the source README and docs/MANUAL_TESTING.md.\n`,
    { date: new Date('2026-01-01T00:00:00Z'), createFolders: false },
  );
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });
  const name = `ghostcursor-${version}-${browser}.zip`;
  await writeFile(join(output, name), bytes);
  entries.push({
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    unpackedBytes: (await Promise.all(files.map((p) => readFile(p)))).reduce(
      (sum, b) => sum + b.length,
      0,
    ),
  });
}
await writeFile(
  join(output, `ghostcursor-${version}-checksums.json`),
  JSON.stringify(entries, null, 2) + '\n',
);
console.log(JSON.stringify(entries, null, 2));
