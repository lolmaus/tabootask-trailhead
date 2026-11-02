import config from '@repo/oxlint-config';
import { defineConfig } from 'oxlint';
export default defineConfig({
  extends: [config],
  ignorePatterns: ['src/routeTree.gen.ts', 'dist/**'],
});
