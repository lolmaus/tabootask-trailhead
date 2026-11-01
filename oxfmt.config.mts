import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  trailingComma: 'es5',
  ignorePatterns: [
    'apps/editor-prototypes/src/routeTree.gen.ts',
    'apps/backend/convex/_generated/**',
  ],
});
