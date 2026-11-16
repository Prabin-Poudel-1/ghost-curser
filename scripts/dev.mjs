import { spawn } from 'node:child_process';
const children = [
  ['build', '--watch'],
  ['build', '--config', 'vite.content.config.ts', '--watch'],
].map((args) => spawn('npx', ['vite', ...args], { stdio: 'inherit' }));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    children.forEach((child) => child.kill(signal));
    process.exit(0);
  });
