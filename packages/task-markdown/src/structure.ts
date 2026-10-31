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
    if ('children' in node) {
      const htmlTags: string[] = [];
      for (const child of node.children) {
        if (child.type === 'html') {
          // The AST has already validated HTML syntax, including quoted '>'.
          // Read only tag identity rather than revalidating its attributes.
          const tag = /^<(\/?)([a-z][a-z0-9-]*)\b/iu.exec(child.value);
          if (tag) {
            const name = tag[2]!.toLowerCase();
            if (tag[1] === '/') {
              if (htmlTags.at(-1) === name) htmlTags.pop();
            } else if (
              !/\/\s*>$/u.test(child.value) &&
              ![
                'area',
                'base',
                'br',
                'col',
                'embed',
                'hr',
                'img',
                'input',
                'link',
                'meta',
                'param',
                'source',
                'track',
                'wbr',
              ].includes(name)
            ) {
              htmlTags.push(name);
            }
          }
          continue;
        }
        if (htmlTags.length === 0) visit(child, owner);
      }
    }
  }
  visit(ast, null);
  return document;
}
