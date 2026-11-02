import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, it, vi } from 'vitest';
import schema from '../convex/schema.ts';
import betterAuth from '@convex-dev/better-auth/test';
import { components, api } from '../convex/_generated/api.js';
import { createAuth } from '../convex/auth.ts';

const modules = import.meta.glob('../convex/**/*.ts');
const read = makeFunctionReference<'query'>('authProbe:read');
const history = makeFunctionReference<'query'>('authProbe:history');
const update = makeFunctionReference<'mutation'>('authProbe:update');

it('refuses the substitute provider configuration on a hosted backend', async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv('SITE_URL', 'https://frontend.example');
  vi.stubEnv('CONVEX_SITE_URL', 'https://isolated.convex.site');
  vi.stubEnv('PROBE_LOCAL_OAUTH', '1');
  try {
    await expect(
      t.run(async (ctx) => {
        createAuth(ctx);
      })
    ).rejects.toThrow('Local OAuth fixture refused');
  } finally {
    vi.unstubAllEnvs();
  }
});

async function fixture() {
  const t = convexTest(schema, modules);
  betterAuth.register(t);
  async function user(name: string, expiresAt = Date.now() + 60_000) {
    const account = await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'user',
          data: {
            name,
            email: `${name}@example.invalid`,
            emailVerified: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      })
    );
    const session = await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'session',
          data: {
            userId: account._id,
            token: `test-session-${name}`,
            expiresAt,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      })
    );
    return {
      client: t.withIdentity({ subject: account._id, sessionId: session._id }),
      userId: account._id,
      sessionId: session._id,
    };
  }
  return { t, user };
}

it('allows signed-out current reads but rejects writes and restricted history', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('authProbeNotes', {
      key: 't22-public',
      owner: 'owner',
      source: 'public fixture',
      revision: 0,
      history: [],
    });
  });
  expect(await t.query(read, { key: 't22-public' })).toMatchObject({ source: 'public fixture' });
  await expect(t.query(history, { key: 't22-public' })).rejects.toThrow();
  await expect(t.mutation(update, { key: 't22-public', source: 'intrusion' })).rejects.toThrow();
});

it('preserves ownership by auth user ID and denies outsider reads/writes of protected data', async () => {
  const { t, user } = await fixture();
  const owner = await user('owner');
  const outsider = await user('outsider');
  const key = 't22-owned';
  await owner.client.mutation(api.authProbe.create, { key });
  await owner.client.mutation(api.authProbe.update, { key, source: 'owner edit' });
  expect(await owner.client.query(api.authProbe.identity)).toEqual({
    userId: owner.userId,
    name: 'owner',
  });
  expect(await owner.client.query(api.authProbe.history, { key })).toEqual([
    'Disposable public fixture',
  ]);
  expect(await t.query(api.authProbe.read, { key })).toMatchObject({
    source: 'owner edit',
    revision: 1,
  });
  await expect(
    outsider.client.mutation(api.authProbe.update, { key, source: 'intrusion' })
  ).rejects.toThrow('Fixture owner required');
  await expect(outsider.client.query(api.authProbe.history, { key })).rejects.toThrow(
    'Fixture owner required'
  );
  await expect(outsider.client.mutation(api.authProbe.remove, { key })).rejects.toThrow(
    'Fixture owner required'
  );
});

it('rejects an expired session and a valid-looking JWT without a stored session', async () => {
  const { t, user } = await fixture();
  const expired = await user('expired', Date.now() - 1000);
  expect(await expired.client.query(api.authProbe.identity)).toBeNull();
  await expect(
    expired.client.mutation(api.authProbe.create, { key: 't22-expired' })
  ).rejects.toThrow();
  const owner = await user('owner');
  const revoked = t.withIdentity({ subject: owner.userId, sessionId: 'nonexistent-session' });
  expect(await revoked.query(api.authProbe.identity)).toBeNull();
  await expect(revoked.mutation(api.authProbe.create, { key: 't22-revoked' })).rejects.toThrow();
});

it('unlinks through a session-backed mutation while retaining the last sign-in method', async () => {
  const { t, user } = await fixture();
  const owner = await user('unlink-owner');
  const ref = makeFunctionReference<'mutation'>('authProbe:unlinkAccount');
  for (const providerId of ['google', 'github'])
    await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'account',
          data: {
            accountId: `${providerId}-owner`,
            providerId,
            userId: owner.userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      })
    );
  vi.stubEnv('SITE_URL', 'http://localhost:3200');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3213');
  vi.stubEnv('BETTER_AUTH_SECRET', 'unit-fixture-only-secret-that-is-never-used-outside-tests');
  try {
    expect(await owner.client.mutation(ref, { providerId: 'github' })).toEqual({ status: true });
    await expect(owner.client.mutation(ref, { providerId: 'google' })).rejects.toThrow(
      /last account/u
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
