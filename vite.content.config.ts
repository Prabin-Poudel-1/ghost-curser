import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  define: {
    __TEST_BUILD__: JSON.stringify(mode.includes('test')),
    __BROWSER__: JSON.stringify(
      mode.includes('firefox') ? 'firefox' : 'chromium',
    ),
  },
  build: {
    outDir: mode.includes('firefox')
      ? mode.includes('test')
        ? 'dist-firefox-test'
        : 'dist-firefox'
      : mode === 'test'
        ? 'dist-test'
        : 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'GhostCursor',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    sourcemap: false,
  },
}));
