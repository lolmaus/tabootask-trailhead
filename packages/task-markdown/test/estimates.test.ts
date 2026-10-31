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

test('first valid own estimate spans continuations and zero differs from absence', () => {
  const source =
    '- Parent\n  Before ~9007199254740993 ~99\n  - Child ~1\n\n  After ~3\n\n- Empty\n- Explicit ~0\n- Ancestor\n  - Zero ~0\n';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => [t.total, t.hasEstimate])).toEqual([
    [9007199254740994n, true],
    [1n, true],
    [0n, false],
    [0n, true],
    [0n, true],
    [0n, true],
  ]);
  expect(doc.tasks[0]!.tokens.filter((t) => t.kind === 'estimate').map((t) => t.source)).toEqual([
    '~9007199254740993',
  ]);
  expect(doc.source).toBe(source);
});

test('invalid estimates and split syntax never consume a first-active slot', () => {
  const source = String.raw`- ~3.5 ~-3 ~+3 ~1e3 ~1_000 ~1,000 ~3/4 x~3 ~**3** \~9 ~4 ~99`;
  expect(parseTaskMarkdown(source).tasks[0]!.ownEstimate?.source).toBe('~4');
});

test('parent continuation after children owns the first estimate; outside prose owns none', () => {
  const source =
    'Outside @outside #outside ~90 2026-11-06\n\n- Parent\n  - Child ~5\n\n  Own continuation ~3 ~99\n\nA paragraph\n\n1. First ~2\n2. Second ~4\n\nOther paragraph\n\n* Third ~6\n+ Fourth ~8\n';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => t.total)).toEqual([8n, 5n, 2n, 4n, 6n, 8n]);
  expect(doc.tasks[0]!.ownEstimate?.source).toBe('~3');
  expect(doc.tasks[0]!.tokens.map((t) => t.source)).toEqual(['~3']);
  expect(doc.source).toBe(source);
});
