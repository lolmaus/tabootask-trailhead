import { expect, test } from 'vitest';
import { parseTaskMarkdown } from '../src/index.ts';

test('own estimates sum exact direct-child totals independently of checkboxes', () => {
  const source =
    '  - Parent ~003    \n    Own note @alice #release\n    - [x] Child ~5\n      - Grandchild ~2\n';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => [t.ownEstimate?.value, t.total, t.hasEstimate])).toEqual([
    [3n, 10n, true],
    [5n, 7n, true],
    [2n, 2n, true],
  ]);
  expect(doc.tasks[0]!.ownEstimate?.source).toBe('~003');
  expect(doc.source).toBe(source);
  expect(parseTaskMarkdown(source.replace('[x]', '[ ]')).tasks.map((t) => t.total)).toEqual([
    10n,
    7n,
    2n,
  ]);
});
