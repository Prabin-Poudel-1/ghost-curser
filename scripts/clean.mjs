import { rmSync } from 'node:fs';
const target = process.argv[2];
if (
  !['dist', 'dist-test', 'dist-firefox', 'dist-firefox-test'].includes(target)
)
  throw new Error('Only generated extension builds can be cleaned');
rmSync(target, { recursive: true, force: true });
