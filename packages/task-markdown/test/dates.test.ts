import { expect, test } from 'vitest';
import { parseTaskMarkdown, classifyTaskDates } from '../src/index.ts';
const now = Date.parse('2026-11-06T00:00:00Z');

test('first active date preserves spelling and classifies at midnight equality', () => {
  const source = '- [x] 2026-11-06 2026-11-07\n- 2026-11-07 2026-11-06';
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => t.date?.source)).toEqual(['2026-11-06', '2026-11-07']);
  expect(
    classifyTaskDates(doc, { nowEpochMilliseconds: now, viewerZone: 'UTC' }).map((d) => [
      d.epochMilliseconds,
      d.classification,
    ])
  ).toEqual([
    [now, 'overdue'],
    [now + 86400000, 'future'],
  ]);
  expect(doc.source).toBe(source);
});

test('strict date-times retain written offsets and millisecond precision', () => {
  const forms = [
    '2026-11-06T00:00',
    '2026-11-06T00:00:00',
    '2026-11-06T00:00Z',
    '2026-11-06T03:00+03:00',
    '2026-11-06T00:00:00.001Z',
    '2026-11-06T00:00:00.01Z',
    '2026-11-06T00:00:00.1Z',
    '2026-11-06T00:00-23:59',
    '2026-11-06T00:00+23:59',
  ];
  const source = forms.map((f) => '- ' + f).join('\n');
  const doc = parseTaskMarkdown(source);
  expect(doc.tasks.map((t) => t.date?.source)).toEqual(forms);
  expect(
    classifyTaskDates(doc, { nowEpochMilliseconds: now, viewerZone: 'UTC' }).map(
      (d) => d.epochMilliseconds - now
    )
  ).toEqual([0, 0, 0, 0, 1, 10, 100, 86340000, -86340000]);
  expect(doc.source).toBe(source);
});

test('malformed, unfinished and unsupported whole dates do not consume slots', () => {
 const invalid = ['2026-02-30','2026-13-01','2026-00-01','2026-11-06T','2026-11-06T24:00','2026-11-06T14:60','2026-11-06T14:30:60Z','2026-11-06 14:30','2026-11-06t14:30','2026-11-06T14:30z','2026-11-06T14:30.1','2026-11-06T14:30:00.1234','2026-11-06T14:30+24:00','2026-11-06T14:30+03','2026-11-06T14:30+03:','2026-11-06T14:30+03:000','12026-11-06','2026-11-06.md','report-2026-11-06','2026-**11**-06'];
 for (const candidate of invalid) {
  const source = '- '+candidate+' 2026-11-07';
  expect(parseTaskMarkdown(source).tasks[0]!.date?.source,candidate).toBe('2026-11-07');
 }
});
