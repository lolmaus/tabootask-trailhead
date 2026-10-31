import { expect, test } from 'vitest';
import { parseTaskMarkdown } from '../src/index.ts';

test('Unicode names preserve spelling, repeated occurrences and raw ranges', () => {
 const source = '- **@алиса** #дом-работа #release_v2 @alice @alice !area';
 const doc = parseTaskMarkdown(source);
 expect(doc.tasks[0]!.tokens.map(t => [t.kind, t.source])).toEqual([
 ['reference', '@алиса'], ['tag', '#дом-работа'], ['tag', '#release_v2'], ['reference', '@alice'], ['reference', '@alice']
 ]);
 for (const token of doc.tasks[0]!.tokens) expect(source.slice(token.range.start, token.range.end)).toBe(token.source);
 expect(doc.source).toBe(source);
});
