import { ChangeSet } from '@codemirror/state';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { describe, expect, it } from 'vitest';
import schema from '../convex/schema.ts';
const modules = import.meta.glob('../convex/**/*.ts');
const api = anyApi;
const credentials = { key: 'note', token: 'editor' };
async function fixture(mode: 'ot' | 'manual' = 'ot', source = 'α\r\n\nend\n') {
  const t = convexTest(schema, modules);
  await t.mutation(api.probe!.create!, {
    key: 'note',
    source,
    ownerToken: 'owner',
    editorTokens: ['editor'],
    mode,
  });
  return t;
}
describe('local authority public functions', () => {
  it('persists exact original source', async () => {
    const t = await fixture();
    expect(await t.query(api.probe!.open!, credentials)).toEqual({
      source: 'α\r\n\nend\n',
      version: 0,
      epoch: 0,
      floor: 0,
    });
  });
});

it('rejects stale whole-source save after accepting the head', async () => {
  const t = await fixture('manual');
  await t.mutation(api.probe!.save!, { ...credentials, version: 0, epoch: 0, source: 'new' });
  expect(
    await t.mutation(api.probe!.save!, { ...credentials, version: 0, epoch: 0, source: 'stale' })
  ).toMatchObject({ kind: 'conflict', snapshot: { source: 'new', version: 1 } });
});

it('rebases overlapping same-line edits and deduplicates retry through pull', async () => {
  const t = await fixture('ot', 'hello');
  const a = { clientID: 'a', changes: ChangeSet.of({ from: 1, to: 4, insert: 'A' }, 5).toJSON() };
  const b = { clientID: 'b', changes: ChangeSet.of({ from: 2, to: 3, insert: 'B' }, 5).toJSON() };
  await t.mutation(api.probe!.push!, { ...credentials, version: 0, epoch: 0, updates: [a] });
  await t.mutation(api.probe!.push!, { ...credentials, version: 0, epoch: 0, updates: [b] });
  await t.mutation(api.probe!.push!, { ...credentials, version: 0, epoch: 0, updates: [b] });
  expect(await t.query(api.probe!.pull!, { ...credentials, version: 0, epoch: 0 })).toMatchObject({
    kind: 'updates',
    version: 2,
    updates: [{ clientID: 'a' }, { clientID: 'b' }],
  });
});

it('bounds a log beyond 100 edits and recovers stale clients after compaction', async () => {
  const t = await fixture('ot', '');
  for (let version = 0; version < 140; version++)
    await t.mutation(api.probe!.push!, {
      ...credentials,
      version,
      epoch: 0,
      updates: [
        { clientID: 'a', changes: ChangeSet.of({ from: version, insert: 'x' }, version).toJSON() },
      ],
    });
  expect(await t.query(api.probe!.stats!, credentials)).toMatchObject({
    logCount: 128,
    historyCount: 32,
    floor: 12,
    version: 140,
  });
  await t.mutation(api.probe!.compact!, { ...credentials, token: 'owner' });
  expect(await t.query(api.probe!.pull!, { ...credentials, version: 139, epoch: 0 })).toMatchObject(
    { kind: 'recovery', snapshot: { version: 140, floor: 140 } }
  );
});

it('restores as a new generation retaining intervening snapshots', async () => {
  const t = await fixture('ot', 'old');
  const edit = { clientID: 'a', changes: ChangeSet.of({ from: 3, insert: '!' }, 3).toJSON() };
  await t.mutation(api.probe!.push!, { ...credentials, version: 0, epoch: 0, updates: [edit] });
  await t.mutation(api.probe!.restore!, {
    ...credentials,
    token: 'owner',
    version: 1,
    source: 'old',
  });
  expect(
    await t.mutation(api.probe!.push!, { ...credentials, version: 1, epoch: 0, updates: [] })
  ).toMatchObject({
    kind: 'recovery',
    snapshot: { source: 'old', epoch: 1, version: 2, floor: 2 },
  });
  expect(await t.query(api.probe!.history!, credentials)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: 'old!', reason: 'before restore' }),
      expect.objectContaining({ source: 'old', epoch: 1, reason: 'restore' }),
    ])
  );
});

it('denies revoked fixture capabilities on all reads and writes', async () => {
  const t = await fixture();
  await t.mutation(api.probe!.revoke!, { ...credentials, token: 'owner', editorToken: 'editor' });
  await expect(t.query(api.probe!.open!, credentials)).rejects.toThrow('Access denied');
  for (const name of ['history', 'stats'])
    await expect(t.query(api.probe![name]!, credentials)).rejects.toThrow('Access denied');
  await expect(t.query(api.probe!.pull!, { ...credentials, version: 0, epoch: 0 })).rejects.toThrow(
    'Access denied'
  );
  await expect(
    t.mutation(api.probe!.push!, { ...credentials, version: 0, epoch: 0, updates: [] })
  ).rejects.toThrow('Access denied');
  await expect(
    t.mutation(api.probe!.save!, { ...credentials, version: 0, epoch: 0, source: 'x' })
  ).rejects.toThrow('Access denied');
  await expect(
    t.mutation(api.probe!.restore!, { ...credentials, version: 0, source: 'x' })
  ).rejects.toThrow('Access denied');
  await expect(t.mutation(api.probe!.compact!, credentials)).rejects.toThrow('Access denied');
});

it('bounds snapshot history bytes within one Convex document', async () => {
  const t = await fixture('manual', '');
  for (let version = 0; version < 6; version++)
    await t.mutation(api.probe!.save!, {
      ...credentials,
      version,
      epoch: 0,
      source: 'x'.repeat(100_000),
    });
  expect((await t.query(api.probe!.stats!, credentials)).historyBytes).toBeLessThanOrEqual(300_000);
});
