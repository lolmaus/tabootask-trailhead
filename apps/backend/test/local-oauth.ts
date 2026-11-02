/** Loopback-only provider substitute. This is not Google/GitHub smoke evidence. */
import type { BetterAuthPlugin } from 'better-auth';

export function localOAuthFixture(): BetterAuthPlugin {
  return {
    id: 't22-loopback-oauth-fixture',
    init(ctx) {
      ctx.socialProviders = ctx.socialProviders.map((provider): typeof provider => ({
        ...provider,
        createAuthorizationURL: async ({ state, redirectURI }) => {
          const url = new URL('http://localhost:3201/authorize');
          url.searchParams.set('provider', provider.id);
          url.searchParams.set('state', state);
          url.searchParams.set('redirect_uri', redirectURI);
          return url;
        },
        validateAuthorizationCode: async ({ code }) => {
          const response = await fetch('http://127.0.0.1:3201/token', {
            method: 'POST',
            body: code,
          });
          if (!response.ok) throw new Error('Invalid local fixture code');
          return { accessToken: await response.text() };
        },
        getUserInfo: async (tokens) => {
          const response = await fetch('http://127.0.0.1:3201/userinfo', {
            headers: { Authorization: `Bearer ${tokens.accessToken ?? ''}` },
          });
          if (!response.ok) return null;
          const user = (await response.json()) as {
            id: string;
            email: string;
            name: string;
            emailVerified: boolean;
          };
          return { user, data: user };
        },
      }));
    },
  };
}
