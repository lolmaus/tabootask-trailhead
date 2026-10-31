import { Temporal } from '@js-temporal/polyfill';
import type { ClassifiedDate, DateOptions, TaskDocument } from './types.ts';

export function validDate(source: string): boolean {
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,3})?)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])?)?$/u.test(
      source
    )
  )
    return false;
  try {
    Temporal.PlainDate.from(source.slice(0, 10), { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function classifyTaskDates(document: TaskDocument, options: DateOptions): ClassifiedDate[] {
  const result: ClassifiedDate[] = [];
  for (const task of document.tasks) {
    if (!task.date) continue;
    const written = task.date.source;
    let epochMilliseconds: number;
    if (written.length === 10) {
      epochMilliseconds = Temporal.PlainDate.from(written).toZonedDateTime(
        options.viewerZone
      ).epochMilliseconds;
    } else if (/(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(written)) {
      epochMilliseconds = Temporal.Instant.from(written).epochMilliseconds;
    } else {
      epochMilliseconds = Temporal.PlainDateTime.from(written).toZonedDateTime(options.viewerZone, {
        disambiguation: 'compatible',
      }).epochMilliseconds;
    }
    result.push({
      taskId: task.id,
      token: task.date,
      epochMilliseconds,
      classification: options.nowEpochMilliseconds >= epochMilliseconds ? 'overdue' : 'future',
    });
  }
  return result;
}
