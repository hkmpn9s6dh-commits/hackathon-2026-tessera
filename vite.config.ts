import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // One entry, one stylesheet: the two-entry cssCodeSplit trap from the last build is moot here,
    // but keep the default so a future second page cannot silently merge styles.
  },
  server: { port: 4318, strictPort: true },
});
