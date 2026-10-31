import { expect, test } from 'vitest';
import { parseTaskMarkdown } from '../src/index.ts';

test('ordinary list items own continuations and independent descendants', () => {
  const source =
    'Outside @none\r\n\r\n  - Parent 😀   \r\n    Before\r\n    - [x] Child\r\n\r\n    After\r\n\r\n1. Ordered\r\n\r\n* Last\r\n';
  const doc = parseTaskMarkdown(source);
  expect(doc.source).toBe(source);
  expect(doc.tasks).toHaveLength(4);
  expect(doc.roots.map((t) => t.id)).toEqual([0, 2, 3]);
  const parent = doc.tasks[0]!;
  expect(parent.children.map((t) => t.id)).toEqual([1]);
  expect(doc.tasks[1]!.parentId).toBe(0);
  expect(doc.tasks[1]!.checked).toBe(true);
  expect(parent.checked).toBe(null);
  expect(parent.ownRanges.map((r) => source.slice(r.start, r.end)).join('')).toContain('After');
  expect(parent.ownRanges.map((r) => source.slice(r.start, r.end)).join('')).not.toContain('Child');
  expect(source.slice(parent.range.start, parent.range.end)).toContain('Child');
  expect(parent.proseRanges.map((r) => source.slice(r.start, r.end))).toEqual([
    'Parent 😀',
    'Before',
    'After',
  ]);
});

test('code, quotations, URLs, images and raw HTML remain literal', () => {
 const source = '- Prose [Ask @alice #release](https://example.test/2026-11-06/~90) ![~80 @image](image) <https://example.test/2026-11-06> <span title="~70">@html ~60</span>\n  `~90 2026-11-06 @code #code`\n\n  > ~80 @quote\n  > - Quoted ~70\n\n  ```markdown\n  - Example ~60 2026-11-06\n  ```\n\n      ~50 2026-11-06 @indented #indented\n';
 const doc = parseTaskMarkdown(source);
 expect(doc.tasks).toHaveLength(1);
 expect(doc.tasks[0]!.tokens.map(t=>t.source)).toEqual(['@alice','#release']);
 expect(doc.tasks[0]!.hasEstimate).toBe(false);
 expect(doc.source).toBe(source);
 expect(parseTaskMarkdown('Outside ~3 @alice\n\n> - Quoted ~5\n\n<div>\n- HTML ~9\n</div>').tasks).toEqual([]);
});
