import { expect, test } from 'vitest';
import { parseTaskMarkdown, classifyTaskDates } from '../src/index.ts';

test('representative 1000-item nested multiline workload preserves ownership and exact totals', () => {
  const source = Array.from(
    { length: 200 },
    (_, i) =>
      `- [${i % 2 ? 'x' : ' '}] Parent ${i} ~003 2026-11-07 @alice\n  Before #release\n  - Child ~5 2026-11-06T03:00+03:00\n    - Grandchild ~2 2026-11-06T00:00Z\n  - Empty \`~90 @code\`\n  - Zero ~0 [label](https://example.test/~80)\n\n  After ~99 #end\n`
  ).join('\n');
  const options = { nowEpochMilliseconds: Date.parse('2026-11-06T00:00:00Z'), viewerZone: 'UTC' };
  const doc = parseTaskMarkdown(source);
  expect(doc.source).toBe(source);
  expect(doc.tasks).toHaveLength(1000);
  expect(doc.roots).toHaveLength(200);
  expect(doc.roots[0]!.children.map((t) => t.id)).toEqual([1, 3, 4]);
  expect(doc.tasks.slice(0, 5).map((t) => [t.total, t.hasEstimate])).toEqual([
    [10n, true],
    [7n, true],
    [2n, true],
    [0n, false],
    [0n, true],
  ]);
  expect(doc.roots[199]!.total).toBe(10n);
  expect(doc.roots[0]!.tokens.map((t) => t.source)).toEqual([
    '~003',
    '2026-11-07',
    '@alice',
    '#release',
    '#end',
  ]);
  expect(classifyTaskDates(doc, options)).toHaveLength(600);
  // Observe after warmup, without a timing pass/fail threshold.
  for (let i = 0; i < 3; i++) {
    parseTaskMarkdown(source);
    classifyTaskDates(doc, options);
  }
  const iterations = 10;
  let start = performance.now();
  for (let i = 0; i < iterations; i++) parseTaskMarkdown(source);
  const parseMilliseconds = (performance.now() - start) / iterations;
  start = performance.now();
  for (let i = 0; i < iterations; i++) classifyTaskDates(doc, options);
  const classifyMilliseconds = (performance.now() - start) / iterations;
  console.log(
    JSON.stringify({
      workload: { utf16Length: source.length, items: 1000, maxDepth: 3, iterations, warmup: 3 },
      parseMilliseconds,
      classifyMilliseconds,
    })
  );
}, 30000);
