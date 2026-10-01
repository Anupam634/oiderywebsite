import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['test/global-setup.ts'],
    // the test files share one database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
