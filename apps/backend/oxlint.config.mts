import config from '@repo/oxlint-config';
import { defineConfig } from 'oxlint';
export default defineConfig({ extends: [config], ignorePatterns: ['convex/_generated/**'] });
