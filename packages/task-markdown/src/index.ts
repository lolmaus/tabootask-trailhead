import { structure } from './structure.ts';
import type { TaskDocument, ClassifiedDate, DateOptions } from './types.ts';
export type * from './types.ts';
export function parseTaskMarkdown(source: string): TaskDocument {
  return structure(source);
}
export function classifyTaskDates(
  _document: TaskDocument,
  _options: DateOptions
): ClassifiedDate[] {
  return [];
}
