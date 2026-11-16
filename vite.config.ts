import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { manifest } from './manifest.config.ts';
export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest: manifest(mode === 'test') })],
  define: {
    __TEST_BUILD__: JSON.stringify(mode.includes('test')),
    __BROWSER__: JSON.stringify(
      mode.includes('firefox') ? 'firefox' : 'chromium',
    ),
  },
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: { input: { offscreen: 'src/networking/offscreen.html' } },
  },
}));
