import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // `__PROD__` is a build-time constant in electron-vite (see
  // `src/main/build-constants.d.ts`). Vitest imports source files directly, so
  // we declare it `false` here to mirror dev (`electron-vite dev`) — without
  // this, any `src/main/**` module reading `__PROD__` would throw ReferenceError
  // at evaluation time.
  define: {
    __PROD__: 'false',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
});
