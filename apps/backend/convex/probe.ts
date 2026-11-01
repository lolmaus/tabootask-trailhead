/** Local fixture-capability probe; no production authentication or adoption. */
import { mutationGeneric, queryGeneric } from 'convex/server';
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server';
import { v } from 'convex/values';
import { ChangeSet, Text } from '@codemirror/state';
import { rebaseUpdates } from '@codemirror/collab';
import type schema from './schema.ts';
import type { Snapshot } from '../protocol.ts';
type Model = DataModelFromSchemaDefinition<typeof schema>;
type Note = DocumentByName<Model, 'notes'>;
const mutation: MutationBuilder<Model, 'public'> = mutationGeneric;
const query: QueryBuilder<Model, 'public'> = queryGeneric;
const access = { key: v.string(), token: v.string() };
function bounded(source: string) {
  if (source.length > 100_000 || bytes(source) > 140_000)
    throw new Error('Source exceeds probe limit');
}
function snapshot(n: Note): Snapshot {
  return { source: n.source, version: n.version, epoch: n.epoch, floor: n.floor };
}
async function note(ctx: GenericQueryCtx<Model>, key: string, token: string, owner = false) {
  const n = await ctx.db
    .query('notes')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!n || (token !== n.ownerToken && (owner || !n.editorTokens.includes(token))))
    throw new Error('Access denied');
  return n;
}
export const create = mutation({
  args: {
    key: v.string(),
    source: v.string(),
    ownerToken: v.string(),
    editorTokens: v.array(v.string()),
    mode: v.union(v.literal('ot'), v.literal('manual')),
  },
  handler: async (ctx, args) => {
    bounded(args.source);
    if (
      !args.key ||
      args.key.length > 128 ||
      !args.ownerToken ||
      args.ownerToken.length > 256 ||
      args.editorTokens.some((t) => !t || t.length > 256) ||
      args.editorTokens.length > 32
    )
      throw new Error('Invalid fixture capabilities');
    if (
      await ctx.db
        .query('notes')
        .withIndex('by_key', (q) => q.eq('key', args.key))
        .unique()
    )
      throw new Error('Duplicate key');
    await ctx.db.insert('notes', { ...args, version: 0, epoch: 0, floor: 0, history: [] });
    return null;
  },
});
export const open = query({
  args: access,
  handler: async (ctx, args) => snapshot(await note(ctx, args.key, args.token)),
});
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid version or epoch');
}
function retained(entries: Note['history']) {
  const result = entries.slice(-32);
  while (bytes(result) > 300_000) result.shift();
  return result;
}
function historyWith(n: Note, reason: string) {
  return retained([...n.history, { source: n.source, version: n.version, epoch: n.epoch, reason }]);
}
export const save = mutation({
  args: { ...access, version: v.number(), epoch: v.number(), source: v.string() },
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token);
    integer(args.version);
    integer(args.epoch);
    bounded(args.source);
    if (n.mode !== 'manual') throw new Error('Wrong mode');
    if (n.version !== args.version || n.epoch !== args.epoch)
      return { kind: 'conflict' as const, snapshot: snapshot(n) };
    const next = {
      ...n,
      source: args.source,
      version: n.version + 1,
      floor: n.version + 1,
      history: historyWith(n, 'save'),
    };
    await ctx.db.patch(n._id, {
      source: next.source,
      version: next.version,
      floor: next.floor,
      history: next.history,
    });
    return { kind: 'saved' as const, snapshot: snapshot(next) };
  },
});
const position = { ...access, version: v.number(), epoch: v.number() };
const wire = v.object({ clientID: v.string(), changes: v.any() });
function recovery(n: Note, version: number, epoch: number) {
  integer(version);
  integer(epoch);
  const reason =
    epoch !== n.epoch
      ? 'generation changed'
      : version < n.floor
        ? 'log compacted'
        : version > n.version
          ? 'version ahead'
          : '';
  return reason ? { kind: 'recovery' as const, snapshot: snapshot(n), reason } : null;
}
export const push = mutation({
  args: { ...position, updates: v.array(wire) },
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token);
    if (n.mode !== 'ot') throw new Error('Wrong mode');
    const recover = recovery(n, args.version, args.epoch);
    if (recover) return recover;
    if (args.updates.length > 64 || JSON.stringify(args.updates).length > 200_000)
      throw new Error('Batch exceeds probe limit');
    const log = await ctx.db
      .query('ops')
      .withIndex('by_note_version', (q) => q.eq('note', n._id).gt('version', args.version))
      .collect();
    const updates = rebaseUpdates(
      args.updates.map((u) => ({ clientID: u.clientID, changes: ChangeSet.fromJSON(u.changes) })),
      log.map((u) => ({ clientID: u.clientID, changes: ChangeSet.fromJSON(u.changes) }))
    );
    let source = Text.of(n.source.split('\n'));
    let version = n.version;
    for (const u of updates) {
      if (!u.clientID || u.clientID.length > 128) throw new Error('Invalid client identifier');
      source = u.changes.apply(source);
      bounded(source.toString());
      version++;
      await ctx.db.insert('ops', {
        note: n._id,
        version,
        clientID: u.clientID,
        changes: u.changes.toJSON(),
      });
    }
    if (updates.length) {
      const all = await ctx.db
        .query('ops')
        .withIndex('by_note_version', (q) => q.eq('note', n._id))
        .collect();
      let count = all.length;
      let logBytes = bytes(
        all.map(({ version, clientID, changes }) => ({ version, clientID, changes }))
      );
      let expiredCount = 0;
      while (count > 128 || logBytes > 512_000) {
        const op = all[expiredCount]!;
        logBytes -=
          bytes({ version: op.version, clientID: op.clientID, changes: op.changes }) +
          Number(count > 1);
        expiredCount++;
        count--;
      }
      const expired = all.slice(0, expiredCount);
      for (const op of expired) await ctx.db.delete(op._id);
      await ctx.db.patch(n._id, {
        source: source.toString(),
        version,
        floor: expired.at(-1)?.version ?? n.floor,
        history: historyWith(n, 'ot'),
      });
    }
    return { kind: 'ok' as const };
  },
});
export const pull = query({
  args: position,
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token);
    const recover = recovery(n, args.version, args.epoch);
    if (recover) return recover;
    const log = await ctx.db
      .query('ops')
      .withIndex('by_note_version', (q) => q.eq('note', n._id).gt('version', args.version))
      .collect();
    return {
      kind: 'updates' as const,
      version: n.version,
      epoch: n.epoch,
      updates: log.map((u) => ({ clientID: u.clientID, changes: u.changes })),
    };
  },
});
export const compact = mutation({
  args: access,
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token, true);
    for (const op of await ctx.db
      .query('ops')
      .withIndex('by_note_version', (q) => q.eq('note', n._id))
      .collect())
      await ctx.db.delete(op._id);
    await ctx.db.patch(n._id, { floor: n.version });
    return snapshot({ ...n, floor: n.version });
  },
});
function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
export const stats = query({
  args: access,
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token);
    const log = await ctx.db
      .query('ops')
      .withIndex('by_note_version', (q) => q.eq('note', n._id))
      .collect();
    return {
      snapshotBytes: bytes(snapshot(n)),
      logBytes: bytes(
        log.map((o) => ({ version: o.version, clientID: o.clientID, changes: o.changes }))
      ),
      logCount: log.length,
      historyBytes: bytes(n.history),
      historyCount: n.history.length,
      version: n.version,
      floor: n.floor,
      epoch: n.epoch,
    };
  },
});
export const restore = mutation({
  args: { ...access, version: v.number(), source: v.string() },
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token, true);
    integer(args.version);
    bounded(args.source);
    if (n.version !== args.version) throw new Error('Restore conflict');
    const next = {
      ...n,
      source: args.source,
      version: n.version + 1,
      epoch: n.epoch + 1,
      floor: n.version + 1,
    };
    for (const op of await ctx.db
      .query('ops')
      .withIndex('by_note_version', (q) => q.eq('note', n._id))
      .collect())
      await ctx.db.delete(op._id);
    const history = retained([
      ...historyWith(n, 'before restore'),
      { source: next.source, version: next.version, epoch: next.epoch, reason: 'restore' },
    ]);
    await ctx.db.patch(n._id, {
      source: next.source,
      version: next.version,
      epoch: next.epoch,
      floor: next.floor,
      history,
    });
    return snapshot(next);
  },
});
export const history = query({
  args: access,
  handler: async (ctx, args) => (await note(ctx, args.key, args.token)).history,
});
export const revoke = mutation({
  args: { ...access, editorToken: v.string() },
  handler: async (ctx, args) => {
    const n = await note(ctx, args.key, args.token, true);
    await ctx.db.patch(n._id, {
      editorTokens: n.editorTokens.filter((t) => t !== args.editorToken),
    });
    return null;
  },
});
