import { expect, test } from 'vitest';
import { parseTaskMarkdown } from '../src/index.ts';

test('Unicode names preserve spelling, repeated occurrences and raw ranges', () => {
  const source = '- **@алиса** #дом-работа #release_v2 @alice @alice !area';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks[0]!.tokens.map((t) => [t.kind, t.source])).toEqual([
    ['reference', '@алиса'],
    ['tag', '#дом-работа'],
    ['tag', '#release_v2'],
    ['reference', '@alice'],
    ['reference', '@alice'],
  ]);
  for (const token of doc.tasks[0]!.tokens)
    expect(source.slice(token.range.start, token.range.end)).toBe(token.source);
  expect(doc.source).toBe(source);
});

test('only standalone whole names activate and odd raw backslashes escape', () => {
  const source = String.raw`- user@example.com fix#release @alice.smith #release.md @ok. (#fine), \@one \\@two \\\#three \\\\#four @é @7 _@bad @bad_name`;
  expect(parseTaskMarkdown(source).tasks[0]!.tokens.map((t) => t.source)).toEqual([
    '@ok',
    '#fine',
    '@two',
    '#four',
    '@é',
    '@7',
    '@bad_name',
  ]);
});

test('source slices never assemble tokens across formatting or lines', () => {
  const source =
    '- (2026-11-07), **@алиса** #дом-работа #release_v2 ~3.\n- report-2026-11-06.md user@example.com fix#release x~3\n- 2026-**11**-06 ~**3** @\n  alice #\n  release\n- [**@alice** #release](target) ![ignored @image][pic] <user@example.com>\n\n[pic]: https://example.test/~7\n';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => t.tokens.map((k) => k.source))).toEqual([
    ['2026-11-07', '@алиса', '#дом-работа', '#release_v2', '~3'],
    [],
    [],
    ['@alice', '#release'],
  ]);
  expect(doc.tasks[1]!.hasEstimate).toBe(false);
  for (const task of doc.tasks)
    for (const token of task.tokens)
      expect(source.slice(token.range.start, token.range.end)).toBe(token.source);
  expect(doc.source).toBe(source);
});

test('sentence punctuation surrounds tokens without accepting date extensions', () => {
  const doc = parseTaskMarkdown('- @alice: #release; ~3: 2026-11-07!');
  expect(doc.tasks[0]!.tokens.map((t) => t.source)).toEqual([
    '@alice',
    '#release',
    '~3',
    '2026-11-07',
  ]);
  expect(
    parseTaskMarkdown('- 2026-11-06T00:00[Europe/Berlin] 2026-11-07').tasks[0]!.date?.source
  ).toBe('2026-11-07');
});

test('formatted tokens remain standalone and bare URL query text stays literal', () => {
  const source =
    '- a**~3** word**@alice** **@bob**tail _@carol_ **~4**\n- https://example.test/?who=@alice&size=~3&tag=#release&date=2026-11-06 @real';
  expect(parseTaskMarkdown(source).tasks.map((t) => t.tokens.map((k) => k.source))).toEqual([
    ['@carol', '~4'],
    ['@real'],
  ]);
});
