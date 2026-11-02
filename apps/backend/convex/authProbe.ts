/** Disposable #22 fixture. No email-based ownership and no production note model. */
import { mutationGeneric, queryGeneric } from 'convex/server';
import type {
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
  GenericQueryCtx,
} from 'convex/server';
import { v } from 'convex/values';
import { authComponent, createAuth } from './auth.ts';
import type schema from './schema.ts';

type Model = DataModelFromSchemaDefinition<typeof schema>;
const query: QueryBuilder<Model, 'public'> = queryGeneric;
const mutation: MutationBuilder<Model, 'public'> = mutationGeneric;
const args = { key: v.string() };

export const unlinkAccount = mutation({
  args: {
    providerId: v.union(v.literal('google'), v.literal('github')),
    accountId: v.optional(v.string()),
  },
  handler: async (ctx, body): Promise<{ status: boolean }> => {
    await authComponent.getAuthUser(ctx);
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    // Nested component reads/writes participate in this parent transaction.
    return await auth.api.unlinkAccount({ body, headers });
  },
});

async function owned(ctx: GenericQueryCtx<Model>, key: string) {
  const user = await authComponent.getAuthUser(ctx);
  const note = await ctx.db
    .query('authProbeNotes')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!note || note.owner !== user._id) throw new Error('Fixture owner required');
  return note;
}

export const identity = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    return user ? { userId: user._id, name: user.name } : null;
  },
});

export const create = mutation({
  args,
  handler: async (ctx, { key }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!/^t22-[a-zA-Z0-9-]{1,80}$/u.test(key))
      throw new Error('Use a disposable t22- fixture key');
    const existing = await ctx.db
      .query('authProbeNotes')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (existing) throw new Error('Fixture already exists');
    await ctx.db.insert('authProbeNotes', {
      key,
      owner: user._id,
      source: 'Disposable public fixture',
      revision: 0,
      history: [],
    });
  },
});

export const read = query({
  args,
  handler: async (ctx, { key }) => {
    const note = await ctx.db
      .query('authProbeNotes')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    return note ? { key: note.key, source: note.source, revision: note.revision } : null;
  },
});

export const history = query({
  args,
  handler: async (ctx, { key }) => (await owned(ctx, key)).history,
});
export const update = mutation({
  args: { ...args, source: v.string() },
  handler: async (ctx, { key, source }) => {
    const note = await owned(ctx, key);
    if (source.length > 2000) throw new Error('Fixture limited to 2000 characters');
    await ctx.db.patch(note._id, {
      source,
      revision: note.revision + 1,
      history: [...note.history, note.source].slice(-8),
    });
  },
});
export const remove = mutation({
  args,
  handler: async (ctx, { key }) => ctx.db.delete((await owned(ctx, key))._id),
});
