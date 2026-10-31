export const scenarios = {
  introduction: {
    label: 'Start here · nested tasks',
    source:
      '# A small release\n\nOne continuous Markdown document. Try selecting across lines.\n\n- [ ] **Ship the prototype** ~003 2026-11-07 @alice #release\n  Keep this multiline note, including its spacing.\n  - [x] Compare the editors ~5\n    - Check *selection* and undo ~2\n  - Explicit zero ~0\n  - No estimate\n\n  Parent continuation ~99 stays literal.\n\n## Literal examples\n\n- Keep `~90 @code` and [link labels @bob](https://example.test/~80) intact\n- Escaped \\~9 \\@alice and invalid ~3.5 stay plain\n- An overdue deadline 2026-11-06T00:00Z\n\n> - Quoted ~80 is not a task\n\n```markdown\n- Code ~60\n```\n',
  },
  ownership: {
    label: 'A–D · ownership, totals, zero',
    source:
      '  - Parent ~003    \n    Own note @alice #release\n    - [x] Child ~5\n      - Grandchild ~2\n\n- Parent\n  - Child ~5\n\n  Own continuation ~3 ~99\n\nOutside a task: @outside #outside ~90 2026-11-06\n\n1. First ~2\n2. Second ~4\n\nA paragraph separates lists.\n\n* Third ~6\n+ Fourth ~8\n\n- Empty\n- Explicit ~0\n- Parent\n  - Child ~0\n',
  },
  tokens: {
    label: 'E–G · escapes and incomplete input',
    source:
      '- \\2026-11-06 \\@alice \\#release \\~9 ~4 2026-11-07 @bob #next\n- \\\\~4 \\\\@alice \\\\#release \\\\2026-11-07\n- 2026-02-30 2026-11-06T ~3.5 ~-3 ~+3 ~1e3 ~1_000 ~4 2026-11-07\n- 2026-11-07 2026-11-06 @alice @alice #release #release ~2 ~9\n- First @alice #release\n  Second @bob #next ~3 ~99\n',
  },
  literals: {
    label: 'H–J · literals, Unicode, boundaries',
    source:
      '- Prose\n  `~90 2026-11-06 @code #code`\n\n  > ~80 2026-11-06 @quote #quote\n  > - Quoted item ~70\n\n  ```markdown\n  - Example ~60 2026-11-06\n  ```\n\n      ~50 2026-11-06 @indented #indented\n\n- [Ask @alice #release](https://example.test/2026-11-06/~90) ![~80](https://example.test/image) <https://example.test/2026-11-06> <span title="~70"></span>\n- (2026-11-07), **@алиса** #дом-работа #release_v2 ~3.\n- report-2026-11-06.md user@example.com fix#release x~3\n- 2026-**11**-06 ~**3**\n',
  },
  dates: {
    label: 'K–M · exact integers and date times',
    source:
      '- Parent ~9007199254740993\n  - Child ~1\n\n- Local midnight 2026-11-06\n- Floating 2026-11-06T00:00\n- Offset equality 2026-11-06T03:00+03:00\n- UTC equality 2026-11-06T00:00Z\n- Future 2026-11-06T00:00:00.001Z\n- Future 2026-11-06T00:00:00.01Z\n- Future 2026-11-06T00:00:00.1Z\n- Literal 2026-11-06T24:00\n- Literal 2026-11-06 14:30\n- Literal 2026-11-06T14:30:60Z\n- Berlin spring gap 2026-03-29T02:30\n- Berlin repeated hour 2026-10-25T02:30\n',
  },
  endings: {
    label: 'Fidelity · mixed line endings',
    source:
      '  - [ ] Parent ~003    \r\n    - Child ~0\n\r\n- **Keep** marker choices ~2\rlast bare CR\n',
  },
  workload: {
    label: '1,000 tasks · nested and multiline',
    source: Array.from(
      { length: 200 },
      (_, i) =>
        `- [${i % 2 ? 'x' : ' '}] Parent ${i} ~003 2026-11-07 @alice\n  Before #release\n  - Child ~5 2026-11-06T03:00+03:00\n    - Grandchild ~2 2026-11-06T00:00Z\n  - Empty \`~90 @code\`\n  - Zero ~0 [label](https://example.test/~80)\n\n  After ~99 #end\n`
    ).join('\n'),
  },
} as const;
export type Scenario = keyof typeof scenarios;
