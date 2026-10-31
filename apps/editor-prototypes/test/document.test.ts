import { expect, test } from 'vitest';
import { sourceState } from '../src/document.ts';

test('opening and editing one position preserves all untouched mixed line endings', () => {
  const source = '  - [ ] Parent ~003    \r\n    - Child ~0\n\r\nlast\rline';
  const state = sourceState(source);
  expect(state.doc.toString()).toBe(source);
  const next = state.update({ changes: { from: 4, to: 4, insert: 'added ' } }).state;
  expect(next.doc.toString()).toBe(source.slice(0, 4) + 'added ' + source.slice(4));
});
