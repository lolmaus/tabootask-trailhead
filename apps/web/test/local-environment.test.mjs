import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isolatedEnvironment } from '../scripts/local-environment.mjs';

test('local proof cannot inherit deployment selectors, service secrets or frontend origins', () => {
  const result = isolatedEnvironment({
    PATH: '/bin',
    CI: 'true',
    CONVEX_DEPLOY_KEY: 'must-never-reach-a-child',
    CONVEX_DEPLOYMENT: 'prod:must-never-be-selected',
    CONVEX_SELF_HOSTED_URL: 'https://must-never-be-used.example',
    CONVEX_SELF_HOSTED_ADMIN_KEY: 'must-never-reach-a-child',
    CONVEX_SITE_URL: 'https://must-never-be-used.convex.site',
    CONVEX_AGENT_MODE: 'cloud',
    CLOUDFLARE_API_TOKEN: 'must-never-reach-a-child',
    GOOGLE_CLIENT_SECRET: 'must-never-reach-a-child',
    GITHUB_CLIENT_SECRET: 'must-never-reach-a-child',
    BETTER_AUTH_SECRET: 'must-never-reach-a-child',
    VITE_CONVEX_URL: 'https://must-never-be-used.convex.cloud',
    SITE_URL: 'https://must-never-be-used.example',
    PROBE_LOCAL_OAUTH: '0',
  });
  assert.deepEqual(result, { PATH: '/bin', CI: 'true', CONVEX_AGENT_MODE: 'anonymous' });
});
