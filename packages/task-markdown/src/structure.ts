import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import type { Nodes } from 'mdast';
import type { SourceRange, Task, TaskDocument } from './types.ts';

function range(node: Nodes): SourceRange {
  return { start: node.position!.start.offset!, end: node.position!.end.offset! };
}

export function structure(source: string): TaskDocument {
  const ast = fromMarkdown(source, {
    extensions: [gfmTaskListItem()],
    mdastExtensions: [gfmTaskListItemFromMarkdown()],
  });
  const document: TaskDocument = { source, tasks: [], roots: [] };
  function visit(node: Nodes, owner: Task | null): void {
    if (
      [
        'blockquote',
        'code',
        'inlineCode',
        'html',
        'image',
        'imageReference',
        'definition',
      ].includes(node.type)
    )
      return;
    if (node.type === 'listItem') {
      const task: Task = {
        id: document.tasks.length,
        parentId: owner?.id ?? null,
        children: [],
        range: range(node),
        ownRanges: [],
        proseRanges: [],
        checked: node.checked ?? null,
        tokens: [],
        ownEstimate: null,
        date: null,
        total: 0n,
        hasEstimate: false,
      };
      document.tasks.push(task);
      (owner?.children ?? document.roots).push(task);
      // Whole own blocks preserve syntax; child lists are excluded from ownership.
      for (const block of node.children) {
        if (block.type !== 'list') task.ownRanges.push(range(block));
        visit(block, task);
      }
      return;
    }
    if (owner && node.type === 'text') owner.proseRanges.push(range(node));
    // Autolink labels are represented as text too, so identify their raw syntax.
    if (node.type === 'link' && source[range(node).start] === '<') return;
    if ('children' in node) for (const child of node.children) visit(child, owner);
  }
  visit(ast, null);
  return document;
}
