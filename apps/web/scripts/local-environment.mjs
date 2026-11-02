/** A temporary directory alone does not override a Convex deployment key. */
export function isolatedEnvironment(parent) {
  const result = Object.fromEntries(
    Object.entries(parent).filter(
      ([name]) =>
        !/^(?:CONVEX_|CLOUDFLARE_|CF_|GOOGLE_|GITHUB_CLIENT_|VITE_)/u.test(name) &&
        !['BETTER_AUTH_SECRET', 'SITE_URL', 'PROBE_LOCAL_OAUTH'].includes(name)
    )
  );
  return { ...result, CONVEX_AGENT_MODE: 'anonymous' };
}
