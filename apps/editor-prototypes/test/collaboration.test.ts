import { expect, test } from 'vitest';
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
