import type { TaskDocument, ClassifiedDate, DateOptions } from './types.ts';
export type * from './types.ts';
export function parseTaskMarkdown(source: string): TaskDocument {
  return { source, tasks: [], roots: [] };
}
export function classifyTaskDates(
  _document: TaskDocument,
  _options: DateOptions
): ClassifiedDate[] {
  return [];
}
