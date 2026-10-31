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
  const invalid = [
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-11-06T',
    '2026-11-06T24:00',
    '2026-11-06T14:60',
    '2026-11-06T14:30:60Z',
    '2026-11-06 14:30',
    '2026-11-06t14:30',
    '2026-11-06T14:30z',
    '2026-11-06T14:30.1',
    '2026-11-06T14:30:00.1234',
    '2026-11-06T14:30+24:00',
    '2026-11-06T14:30+03',
    '2026-11-06T14:30+03:',
    '2026-11-06T14:30+03:000',
    '12026-11-06',
    '2026-11-06.md',
    'report-2026-11-06',
    '2026-**11**-06',
  ];
  for (const candidate of invalid) {
    const source = '- ' + candidate + ' 2026-11-07';
    expect(parseTaskMarkdown(source).tasks[0]!.date?.source, candidate).toBe('2026-11-07');
  }
});

test('viewer zones, clock transitions, reclassification and checkbox states', () => {
  const doc = parseTaskMarkdown('- [x] 2026-11-06\n- 2026-11-06T00:00\n- 2026-11-06T03:00+03:00');
  for (const [zone, offset] of [
    ['Etc/GMT-3', -10800000],
    ['Etc/GMT+5', 18000000],
  ] as const) {
    expect(
      classifyTaskDates(doc, { nowEpochMilliseconds: now, viewerZone: zone }).map(
        (d) => d.epochMilliseconds - now
      )
    ).toEqual([offset, offset, 0]);
  }
  const transitions = parseTaskMarkdown('- 2026-03-29T02:30\n- 2026-10-25T02:30');
  expect(
    classifyTaskDates(transitions, { nowEpochMilliseconds: now, viewerZone: 'Europe/Berlin' }).map(
      (d) => new Date(d.epochMilliseconds).toISOString()
    )
  ).toEqual(['2026-03-29T01:30:00.000Z', '2026-10-25T00:30:00.000Z']);
  const before = classifyTaskDates(doc, { nowEpochMilliseconds: now - 1, viewerZone: 'UTC' });
  const at = classifyTaskDates(doc, { nowEpochMilliseconds: now, viewerZone: 'UTC' });
  expect(before.map((d) => d.classification)).toEqual(['future', 'future', 'future']);
  expect(at.map((d) => d.classification)).toEqual(['overdue', 'overdue', 'overdue']);
  expect(
    classifyTaskDates(parseTaskMarkdown(doc.source.replace('[x]', '[ ]')), {
      nowEpochMilliseconds: now,
      viewerZone: 'UTC',
    })
  ).toEqual(at);
  expect(doc.source).toBe('- [x] 2026-11-06\n- 2026-11-06T00:00\n- 2026-11-06T03:00+03:00');
});

test('all token kinds share odd/even backslash parity', () => {
  for (const count of [1, 2, 3, 4]) {
    const slash = '\\'.repeat(count);
    const source = `- ${slash}2026-11-06 ${slash}@alice ${slash}#release ${slash}~3`;
    const doc = parseTaskMarkdown(source);
    expect(doc.tasks[0]!.tokens.map((t) => t.source)).toEqual(
      count % 2 === 0 ? ['2026-11-06', '@alice', '#release', '~3'] : []
    );
    expect(doc.source).toBe(source);
  }
});
