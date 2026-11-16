import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  define: { __TEST_BUILD__: JSON.stringify(mode === 'test') },
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
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
