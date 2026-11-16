import { defineConfig } from 'vite';
import { firefoxManifest } from './manifest.firefox.ts';
export default defineConfig(({ mode }) => {
  const test = mode.includes('test');
  const background = mode.includes('background');
  return {
    define: { __TEST_BUILD__: JSON.stringify(test), __BROWSER__: '"firefox"' },
    plugins: background
      ? []
      : [
          {
            name: 'firefox-manifest',
            generateBundle() {
              this.emitFile({
                type: 'asset',
                fileName: 'manifest.json',
                source: JSON.stringify(firefoxManifest(test), null, 2),
              });
            },
          },
        ],
    build: {
      outDir: test ? 'dist-firefox-test' : 'dist-firefox',
      emptyOutDir: false,
      sourcemap: false,
      ...(background
        ? {
            lib: {
              entry: 'src/background/index.ts',
              name: 'GhostCursorBackground',
              formats: ['iife'] as const,
              fileName: () => 'background.js',
            },
          }
        : {
            rollupOptions: {
              input: {
                popup: 'src/popup/index.html',
                session: 'src/networking/session.html',
              },
            },
          }),
    },
  };
});
