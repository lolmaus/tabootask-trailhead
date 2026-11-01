import { Session } from '../src/collaboration/session.ts';
import type { Transport } from '../src/collaboration/transport.ts';
import type { EditorController } from '../src/editor.ts';
import type { SaveResult } from '../../backend/protocol.ts';
import { expect, test, vi } from 'vitest';
import { collab } from '@codemirror/collab';
import { sourceState } from '../src/document.ts';
import { pendingUpdates, receivePacket } from '../src/collaboration/state.ts';

test('pending updates serialize real edits without normalizing mixed source', () => {
  const initial = sourceState('- Task ~3\r\nlast\rline\n', [collab({ clientID: 'alice' })]);
  const edited = initial.update({ changes: { from: 2, insert: '😀 ' } }).state;
  expect(pendingUpdates(edited)).toHaveLength(1);
});

test('receiving an overlapping delivery twice confirms an edit exactly once', () => {
  const initial = sourceState('hello', [collab({ clientID: 'alice' })]);
  const local = initial.update({ changes: { from: 5, insert: '!' } }).state;
  const packet = pendingUpdates(local);
  const confirmed = receivePacket(local, 0, packet).state;
  expect(pendingUpdates(confirmed)).toHaveLength(0);
  expect(receivePacket(confirmed, 0, packet).state.doc.toString()).toBe('hello!');
});

test('manual autosave continues when another edit occurs during an in-flight save', async () => {
  vi.useFakeTimers();
  let draft = 'first';
  let finish: (value: SaveResult) => void = () => {};
  const save = vi.fn(
    () =>
      new Promise<SaveResult>((resolve) => {
        finish = resolve;
      })
  );
  const editor = { source: () => draft } as EditorController;
  const transport = { save, watchSnapshot: () => () => {} } as unknown as Transport;
  const session = new Session(
    editor,
    transport,
    { key: 'fixture', token: 'fixture' },
    'manual',
    { source: '', version: 0, epoch: 0, floor: 0 },
    () => {}
  );
  try {
    session.changed();
    await vi.advanceTimersByTimeAsync(120);
    expect(save).toHaveBeenCalledTimes(1);
    draft = 'second';
    session.changed();
    await vi.advanceTimersByTimeAsync(120);
    finish({ kind: 'saved', snapshot: { source: 'first', version: 1, epoch: 0, floor: 1 } });
    await vi.advanceTimersByTimeAsync(120);
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    session.stop();
    vi.useRealTimers();
  }
});
