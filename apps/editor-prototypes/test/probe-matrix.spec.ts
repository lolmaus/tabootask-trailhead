import { appendFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { parseTaskMarkdown } from '@repo/task-markdown';
import { probeApi } from '../src/collaboration/transport.ts';
import { scenarios } from '../src/scenarios.ts';
import type { ProbeDriver } from '../src/collaboration/driver.ts';

type Mode = 'ot' | 'manual';
type Edit = { from: number; to: number; insert: string };
const backend = new ConvexHttpClient('http://127.0.0.1:3212');
const owner = 'owner-fixture';
const modes: Mode[] = ['ot', 'manual'];
const read = (page: Page) => page.evaluate(() => window.collabLab!.source());
const info = (page: Page) => page.evaluate(() => window.collabLab!.info());
const edit = (page: Page, change: Edit) =>
  page.evaluate(({ from, to, insert }) => window.collabLab!.edit(from, to, insert), change);
const pause = (page: Page) => page.evaluate(() => window.collabLab!.pause());
const resume = (page: Page) => page.evaluate(() => window.collabLab!.resume());
const flush = (page: Page) => page.evaluate(() => window.collabLab!.flush());
const pendingZero = (page: Page) =>
  expect.poll(async () => (await info(page)).pending, { timeout: 15_000 }).toBe(0);
const recovered = (page: Page) =>
  expect.poll(async () => Boolean((await info(page)).recovery), { timeout: 15_000 }).toBe(true);
const semantic = (source: string) =>
  parseTaskMarkdown(source).tasks.map((task) => ({
    parentId: task.parentId,
    ownEstimate: task.ownEstimate?.value.toString() ?? null,
    total: task.total.toString(),
    source: source.slice(task.range.start, task.range.end),
  }));

async function evidence(testInfo: TestInfo, record: unknown): Promise<void> {
  await appendFile(
    '/tmp/tabootask-probe-evidence.jsonl',
    JSON.stringify({ test: testInfo.title, record }) + '\n'
  );
  await testInfo.attach('probe-matrix-evidence.json', {
    body: JSON.stringify(record, null, 2),
    contentType: 'application/json',
  });
}
async function pair(browser: Browser, mode: Mode, source: string) {
  const key = crypto.randomUUID();
  await backend.mutation(probeApi.create, {
    key,
    source,
    ownerToken: owner,
    editorTokens: ['alice-fixture', 'bob-fixture'],
    mode,
  });
  const contexts: BrowserContext[] = [];
  const wire = {
    alice: { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0 },
    bob: { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0 },
  };
  try {
    const pages: Page[] = [];
    for (const client of ['alice', 'bob']) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const frames = wire[client as 'alice' | 'bob'];
      page.on('websocket', (socket) => {
        if (
          !socket.url().includes('/convex/api/') &&
          !socket.url().startsWith('ws://127.0.0.1:3212/')
        )
          return;
        socket.on('framesent', ({ payload }) => {
          frames.sent++;
          frames.sentBytes += Buffer.byteLength(payload);
        });
        socket.on('framereceived', ({ payload }) => {
          frames.received++;
          frames.receivedBytes += Buffer.byteLength(payload);
        });
      });
      pages.push(page);
      await page.goto(
        `/?${new URLSearchParams({ lab: 'collaboration', note: key, token: `${client}-fixture`, mode, client })}`
      );
      await expect
        .poll(() => page.evaluate(() => Boolean(window.collabLab)), { timeout: 15_000 })
        .toBe(true);
      await expect.poll(() => read(page)).toBe(source);
    }
    const a = pages[0]!;
    const b = pages[1]!;
    return {
      key,
      a,
      b,
      contexts,
      wire,
      head: () => backend.query(probeApi.open, { key, token: owner }),
      close: async () => {
        await Promise.all(contexts.map((context) => context.close()));
      },
    };
  } catch (failure) {
    await Promise.all(contexts.map((context) => context.close()));
    throw failure;
  }
}
async function reopenPreserving(page: Page, draft: string, server: string) {
  await page.evaluate(() => window.collabLab!.reopen());
  await expect.poll(() => read(page)).toBe(server);
  expect((await info(page)).drafts.map((copy) => copy.source)).toContain(draft);
}

const cases: Array<{ name: string; source: string; a: Edit[]; b: Edit[]; caveat: string }> = [
  {
    name: 'same estimate replacement',
    source: '- Task ~3\n',
    a: [{ from: 8, to: 9, insert: '5' }],
    b: [{ from: 8, to: 9, insert: '8' }],
    caveat:
      'Text convergence does not decide which estimate the collaborators intended. Exact parser estimates are recorded.',
  },
  {
    name: 'multiline delete versus typing',
    source: '- Parent ~3\n  - Child ~2\n  Child note\n- Other ~5\n',
    a: [{ from: 12, to: 38, insert: '' }],
    b: [{ from: 27, to: 27, insert: 'REMOTE ' }],
    caveat:
      'A deletion can remove the structural context of retained remote typing. Convergence alone does not establish task ownership intent.',
  },
  {
    name: 'cut paste subtree versus remote edit',
    source: '- Parent ~3\n  - Child ~2\n    note\n- Other ~5\n',
    a: [
      { from: 12, to: 34, insert: '' },
      { from: 23, to: 23, insert: '  - Child ~2\n    note\n' },
    ],
    b: [{ from: 29, to: 33, insert: 'REMOTE' }],
    caveat:
      'A cut/paste is separate deletion and insertion, not a semantic move. Remote text may remain at the old position instead of following the subtree.',
  },
];
for (const scenario of cases)
  for (const mode of modes) {
    test(`${mode}: ${scenario.name}, both arrival orders`, async ({ browser }, testInfo) => {
      const observations: unknown[] = [
        {
          phase: 'test-start',
          title: testInfo.title,
          endpoint: 'http://127.0.0.1:3212',
          note: 'Fixture capabilities; evidence counts logical JSON payload bytes, not billing.',
        },
      ];
      try {
        for (const first of ['alice', 'bob']) {
          const p = await pair(browser, mode, scenario.source);
          try {
            await Promise.all([pause(p.a), pause(p.b)]);
            for (const change of scenario.a) await edit(p.a, change);
            for (const change of scenario.b) await edit(p.b, change);
            const drafts = { alice: await read(p.a), bob: await read(p.b) };
            observations.push({
              phase: 'prepared',
              mode,
              first,
              initial: scenario.source,
              actions: { alice: scenario.a, bob: scenario.b },
              preRebaseDrafts: drafts,
              caveat: scenario.caveat,
            });
            const winning = first === 'alice' ? p.a : p.b;
            const losing = first === 'alice' ? p.b : p.a;
            const winnerDraft = first === 'alice' ? drafts.alice : drafts.bob;
            const loserDraft = first === 'alice' ? drafts.bob : drafts.alice;
            await resume(winning);
            await flush(winning);
            await pendingZero(winning);
            if (mode === 'manual')
              await expect.poll(async () => (await p.head()).source).toBe(winnerDraft);
            await resume(losing);
            await flush(losing);
            if (mode === 'ot') {
              await pendingZero(losing);
              await pendingZero(winning);
              const head = await p.head();
              await expect.poll(() => read(p.a)).toBe(head.source);
              await expect.poll(() => read(p.b)).toBe(head.source);
            } else {
              await recovered(losing);
              expect(await read(losing)).toBe(loserDraft);
              expect((await p.head()).source).toBe(winnerDraft);
              await reopenPreserving(losing, loserDraft, winnerDraft);
            }
            const head = await p.head();
            observations.push({
              mode,
              first,
              initial: scenario.source,
              actions: { alice: scenario.a, bob: scenario.b },
              preRebaseDrafts: drafts,
              observed: head,
              parser: semantic(head.source),
              clients: { alice: await info(p.a), bob: await info(p.b) },
              caveat: scenario.caveat,
            });
          } finally {
            await p.close();
          }
        }
      } finally {
        await evidence(testInfo, observations);
      }
    });
  }

for (const mode of modes)
  test(`${mode}: restore boundary and stale compaction preserve recoverable drafts and history`, async ({
    browser,
  }, testInfo) => {
    const observations: unknown[] = [
      {
        phase: 'test-start',
        title: testInfo.title,
        endpoint: 'http://127.0.0.1:3212',
        note: 'Fixture capabilities; evidence counts logical JSON payload bytes, not billing.',
      },
    ];
    try {
      for (const boundary of ['restore', 'compact']) {
        const p = await pair(browser, mode, '- Original ~3\n');
        try {
          await pause(p.b);
          await edit(p.b, { from: 2, to: 2, insert: 'BOB ' });
          const draft = await read(p.b);
          await edit(p.a, { from: 2, to: 2, insert: 'ALICE ' });
          await flush(p.a);
          await pendingZero(p.a);
          const before = await p.head();
          const historyBefore = await backend.query(probeApi.history, { key: p.key, token: owner });
          const result =
            boundary === 'restore'
              ? await backend.mutation(probeApi.restore, {
                  key: p.key,
                  token: owner,
                  version: before.version,
                  source: '- Original ~3\n',
                })
              : await backend.mutation(probeApi.compact, { key: p.key, token: owner });
          expect(result.floor).toBe(result.version);
          expect(result.epoch).toBe(before.epoch + Number(boundary === 'restore'));
          expect(result.version).toBe(before.version + Number(boundary === 'restore'));
          const historyAfter = await backend.query(probeApi.history, { key: p.key, token: owner });
          for (const entry of historyBefore) expect(historyAfter).toContainEqual(entry);
          if (boundary === 'restore')
            expect(historyAfter.map((entry) => entry.source)).toEqual(
              expect.arrayContaining([before.source, result.source])
            );
          await resume(p.b);
          await flush(p.b);
          await recovered(p.b);
          expect(await read(p.b)).toBe(draft);
          expect((await p.head()).source).toBe(result.source);
          await reopenPreserving(p.b, draft, result.source);
          observations.push({
            mode,
            boundary,
            before,
            result,
            draft,
            historyBefore,
            historyAfter,
            client: await info(p.b),
            caveat:
              mode === 'manual'
                ? 'Compaction alone changes no source/version; the intervening remote save makes this manual draft stale.'
                : 'Old pending changes require explicit recovery rather than being reapplied across the generation/log boundary.',
          });
        } finally {
          await p.close();
        }
      }
    } finally {
      await evidence(testInfo, observations);
    }
  });

test('active revocation blocks subscription delivery and pending writes in both modes', async ({
  browser,
}, testInfo) => {
  const observations: unknown[] = [
    {
      phase: 'test-start',
      title: testInfo.title,
      endpoint: 'http://127.0.0.1:3212',
      note: 'Fixture capabilities; evidence counts logical JSON payload bytes, not billing.',
    },
  ];
  try {
    for (const mode of modes) {
      const p = await pair(browser, mode, '- Original ~3\n');
      try {
        const prior = await read(p.b);
        await backend.mutation(probeApi.revoke, {
          key: p.key,
          token: owner,
          editorToken: 'bob-fixture',
        });
        await recovered(p.b);
        await edit(p.b, { from: 2, to: 2, insert: 'DENIED ' });
        const draft = await read(p.b);
        await flush(p.b);
        const deniedPosition = { key: p.key, token: 'bob-fixture', version: 0, epoch: 0 };
        if (mode === 'ot')
          await expect(
            backend.mutation(probeApi.push, { ...deniedPosition, updates: [] })
          ).rejects.toThrow();
        else
          await expect(
            backend.mutation(probeApi.save, { ...deniedPosition, source: draft })
          ).rejects.toThrow();
        await edit(p.a, { from: 2, to: 2, insert: 'SECRET ' });
        await flush(p.a);
        await pendingZero(p.a);
        const head = await p.head();
        expect(head.source).not.toBe(prior);
        // This successful post-revocation server round trip is the observation boundary.
        expect(await read(p.b)).toBe(draft);
        expect(JSON.stringify(await info(p.b))).not.toContain('SECRET');
        await expect(
          backend.query(probeApi.open, { key: p.key, token: 'bob-fixture' })
        ).rejects.toThrow();
        observations.push({
          mode,
          prior,
          deniedDraft: draft,
          server: head,
          revokedClient: await info(p.b),
        });
      } finally {
        await p.close();
      }
    }
  } finally {
    await evidence(testInfo, observations);
  }
});

test('real browser context offline reconnect preserves concurrent drafts in both modes', async ({
  browser,
}, testInfo) => {
  const observations: unknown[] = [
    {
      phase: 'test-start',
      title: testInfo.title,
      endpoint: 'http://127.0.0.1:3212',
      note: 'Fixture capabilities; evidence counts logical JSON payload bytes, not billing.',
    },
  ];
  try {
    for (const mode of modes) {
      const p = await pair(browser, mode, '- Task ~3\n');
      try {
        await p.contexts[1]!.setOffline(true);
        await edit(p.b, { from: 2, to: 2, insert: 'OFFLINE ' });
        const draft = await read(p.b);
        await edit(p.a, { from: 2, to: 2, insert: 'ONLINE ' });
        await flush(p.a);
        await pendingZero(p.a);
        const online = await p.head();
        await p.contexts[1]!.setOffline(false);
        if (mode === 'ot') {
          await pendingZero(p.b);
          await pendingZero(p.a);
          const head = await p.head();
          await expect.poll(() => read(p.a)).toBe(head.source);
          await expect.poll(() => read(p.b)).toBe(head.source);
          expect(head.source).toContain('ONLINE ');
          expect(head.source).toContain('OFFLINE ');
        } else {
          await recovered(p.b);
          expect(await read(p.b)).toBe(draft);
          expect((await p.head()).source).toBe(online.source);
          await reopenPreserving(p.b, draft, online.source);
        }
        observations.push({
          mode,
          offlineDraft: draft,
          onlineHeadBeforeReconnect: online,
          observed: await p.head(),
          clients: { alice: await info(p.a), bob: await info(p.b) },
          caveat:
            'setOffline disconnects actual browser networking; no logical pause is used in this scenario.',
        });
      } finally {
        await p.close();
      }
    }
  } finally {
    await evidence(testInfo, observations);
  }
});

test('1000 task sample records five edit latencies, parser metrics, and logical traffic in both modes', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const observations: unknown[] = [
    {
      phase: 'test-start',
      title: testInfo.title,
      endpoint: 'http://127.0.0.1:3212',
      note: 'Fixture capabilities; evidence counts logical JSON payload bytes, not billing.',
    },
  ];
  try {
    for (const mode of modes) {
      const p = await pair(browser, mode, scenarios.workload.source);
      try {
        const before = {
          wire: structuredClone(p.wire),
          alice: await info(p.a),
          bob: await info(p.b),
          stats: await backend.query(probeApi.stats, { key: p.key, token: owner }),
        };
        expect(parseTaskMarkdown(scenarios.workload.source).tasks).toHaveLength(1000);
        const samples: Array<{
          elapsedMs: number;
          metrics: ReturnType<ProbeDriver['info']>['metrics'];
        }> = [];
        for (let index = 0; index < 5; index++) {
          const started = performance.now();
          await edit(p.a, { from: 6, to: 6, insert: `sample${index} ` });
          await flush(p.a);
          await pendingZero(p.a);
          const head = await p.head();
          if (mode === 'manual') {
            await recovered(p.b);
            await p.b.evaluate(() => window.collabLab!.reopen());
          }
          await expect.poll(() => read(p.b)).toBe(head.source);
          samples.push({
            elapsedMs: performance.now() - started,
            metrics: (await info(p.a)).metrics,
          });
        }
        const after = {
          wire: structuredClone(p.wire),
          alice: await info(p.a),
          bob: await info(p.b),
          stats: await backend.query(probeApi.stats, { key: p.key, token: owner }),
        };
        await backend.mutation(probeApi.compact, { key: p.key, token: owner });
        const afterCompaction = await backend.query(probeApi.stats, { key: p.key, token: owner });
        observations.push({
          mode,
          environment: await p.a.evaluate(() => ({
            userAgent: navigator.userAgent,
            hardwareConcurrency: navigator.hardwareConcurrency,
          })),
          afterCompaction,
          source: scenarios.workload.source,
          observedSource: (await p.head()).source,
          before,
          after,
          samples,
          caveat:
            'Five local samples are observations, not throughput or billing guarantees. Traffic counts logical application JSON payloads, excluding websocket framing. Manual receiver explicitly reopens each newer snapshot.',
        });
      } finally {
        await p.close();
      }
    }
  } finally {
    await evidence(testInfo, observations);
  }
});
