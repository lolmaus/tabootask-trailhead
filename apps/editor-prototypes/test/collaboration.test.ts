import { expect, test } from 'vitest';
import { collab } from '@codemirror/collab';
import { sourceState } from '../src/document.ts';
import { pendingUpdates } from '../src/collaboration/state.ts';

test('pending updates serialize real edits without normalizing mixed source', () => {
  const initial = sourceState('- Task ~3\r\nlast\rline\n', [collab({ clientID: 'alice' })]);
  const edited = initial.update({ changes: { from: 2, insert: '😀 ' } }).state;
  expect(pendingUpdates(edited)).toHaveLength(1);
});
