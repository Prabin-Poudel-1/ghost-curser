import { rmSync } from 'node:fs';
const target = process.argv[2];
if (target !== 'dist' && target !== 'dist-test')
  throw new Error('Only generated extension builds can be cleaned');
rmSync(target, { recursive: true, force: true });
