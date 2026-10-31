import { Temporal } from '@js-temporal/polyfill';
import type { ClassifiedDate, DateOptions, TaskDocument } from './types.ts';

export function validDate(source: string): boolean {
  try {
    Temporal.PlainDate.from(source, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function classifyTaskDates(document: TaskDocument, options: DateOptions): ClassifiedDate[] {
  const result: ClassifiedDate[] = [];
  for (const task of document.tasks) {
    if (!task.date) continue;
    const epochMilliseconds = Temporal.PlainDate.from(task.date.source).toZonedDateTime(
      options.viewerZone
    ).epochMilliseconds;
    result.push({
      taskId: task.id,
      token: task.date,
      epochMilliseconds,
      classification: options.nowEpochMilliseconds >= epochMilliseconds ? 'overdue' : 'future',
    });
  }
  return result;
}
