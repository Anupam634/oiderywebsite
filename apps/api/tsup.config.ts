import { defineConfig } from 'tsup';

/* One ESM bundle for production. Workspace packages are inlined; npm dependencies stay external. */
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: ['@store/shared'],
});
