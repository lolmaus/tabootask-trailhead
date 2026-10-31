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
 const forms = ['2026-11-06T00:00','2026-11-06T00:00:00','2026-11-06T00:00Z','2026-11-06T03:00+03:00','2026-11-06T00:00:00.001Z','2026-11-06T00:00:00.01Z','2026-11-06T00:00:00.1Z','2026-11-06T00:00-23:59','2026-11-06T00:00+23:59'];
 const source = forms.map(f=>'- '+f).join('\n');
 const doc = parseTaskMarkdown(source);
 expect(doc.tasks.map(t=>t.date?.source)).toEqual(forms);
 expect(classifyTaskDates(doc,{nowEpochMilliseconds:now,viewerZone:'UTC'}).map(d=>d.epochMilliseconds-now)).toEqual([0,0,0,0,1,10,100,86340000,-86340000]);
 expect(doc.source).toBe(source);
});
