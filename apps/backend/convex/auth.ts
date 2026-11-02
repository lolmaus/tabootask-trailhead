import { createClient } from '@convex-dev/better-auth';
import type { GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import type { DataModelFromSchemaDefinition } from 'convex/server';
import { components } from './_generated/api.js';
import authConfig from './auth.config.ts';
import type schema from './schema.ts';
import { localOAuthFixture } from '../test/local-oauth.ts';

// Convex supplies environment variables, without exposing Node runtime APIs.
declare const process: { env: Record<string, string | undefined> };
type Model = DataModelFromSchemaDefinition<typeof schema>;
export const authComponent = createClient<Model>(components.betterAuth);

export function createAuth(ctx: GenericCtx<Model>) {
  const siteUrl = process.env['SITE_URL'];
  const baseURL = process.env['CONVEX_SITE_URL'];
  if (!siteUrl || !baseURL) throw new Error('Set SITE_URL and CONVEX_SITE_URL for the auth probe');
  const localTest = process.env['PROBE_LOCAL_OAUTH'] === '1';
  if (localTest && baseURL !== 'http://127.0.0.1:3213')
    throw new Error('Local OAuth fixture refused outside the exact loopback deployment');
  return betterAuth({
    appName: 'Taboo Task disposable auth probe',
    // Unlinking must run in one serializable Convex mutation, not HTTP actions
    // whose separate adapter calls can race and delete the last two accounts.
    disabledPaths: ['/unlink-account'],
    baseURL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    secret: process.env['BETTER_AUTH_SECRET'],
    socialProviders: {
      google: {
        clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
      },
      github: {
        clientId: process.env['GITHUB_CLIENT_ID'] ?? '',
        clientSecret: process.env['GITHUB_CLIENT_SECRET'] ?? '',
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowUnlinkingAll: false,
        // Differing-email policy is deliberately left at the library default.
        allowDifferentEmails: false,
      },
    },
    session: { expiresIn: 60 * 60, updateAge: 10 * 60, cookieCache: { enabled: false } },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      ...(localTest ? [localOAuthFixture()] : []),
    ],
  });
}
