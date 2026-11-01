import { writeFile } from 'node:fs/promises';
import type {} from '../src/collaboration/driver.ts';
import { expect, test } from '@playwright/test';
import { ChangeSet } from '@codemirror/state';
import { scenarios } from '../src/scenarios.ts';
import { ConvexHttpClient } from 'convex/browser';
import { probeApi } from '../src/collaboration/transport.ts';

const backend = new ConvexHttpClient('http://127.0.0.1:3212');
test('real local Convex connects the highlighted-source collaboration harness', async ({
  page,
}) => {
  const key = crypto.randomUUID();
  await backend.mutation(probeApi.create, {
    key,
    source: '- Task ~3\n',
    ownerToken: 'owner-fixture',
    editorTokens: ['alice-fixture'],
    mode: 'ot',
  });
  await page.goto(`/?lab=collaboration&note=${key}&token=alice-fixture&mode=ot&client=alice`);
  await expect(page.getByRole('heading', { name: 'Collaboration probe' })).toBeVisible();
});

test('two browsers converge, retain remote edits during undo, and keep distinct instance IDs', async ({
  browser,
}) => {
  const key = crypto.randomUUID();
  const initial = '- Task ~3\r\nlast\rline\n';
  await backend.mutation(probeApi.create, {
    key,
    source: initial,
    ownerToken: 'owner-fixture',
    editorTokens: ['alice-fixture', 'bob-fixture'],
    mode: 'ot',
  });
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  try {
    await Promise.all([
      a.goto(`/?lab=collaboration&note=${key}&token=alice-fixture&mode=ot&client=alice`),
      b.goto(`/?lab=collaboration&note=${key}&token=bob-fixture&mode=ot&client=alice`),
    ]);
    for (const page of [a, b])
      await expect.poll(() => page.evaluate(() => Boolean(window.collabLab))).toBe(true);
    await a.evaluate(() => window.collabLab!.pause());
    await b.evaluate(() => window.collabLab!.pause());
    await a.evaluate(() => window.collabLab!.edit(2, 2, 'A '));
    await b.evaluate(() => window.collabLab!.edit(2, 2, 'B '));
    await a.evaluate(() => window.collabLab!.resume());
    await expect.poll(() => a.evaluate(() => window.collabLab!.info().pending)).toBe(0);
    await b.evaluate(() => window.collabLab!.resume());
    await expect.poll(() => b.evaluate(() => window.collabLab!.info().pending)).toBe(0);
    const current = (await backend.query(probeApi.open, { key, token: 'owner-fixture' })).source;
    expect(current).toContain('A ');
    expect(current).toContain('B ');
    await expect.poll(() => a.evaluate(() => window.collabLab!.source())).toBe(current);
    await expect.poll(() => b.evaluate(() => window.collabLab!.source())).toBe(current);
    await a.evaluate(() => window.collabLab!.undo());
    await expect.poll(() => a.evaluate(() => window.collabLab!.info().pending)).toBe(0);
    await expect
      .poll(
        async () => (await backend.query(probeApi.open, { key, token: 'owner-fixture' })).source
      )
      .toBe('- B Task ~3\r\nlast\rline\n');
  } finally {
    await aContext.close();
    await bContext.close();
  }
});

test('a disconnected tab flushes more than one authority batch without losing edits', async ({
  page,
}) => {
  const key = crypto.randomUUID();
  await backend.mutation(probeApi.create, {
    key,
    source: 'start',
    ownerToken: 'owner-fixture',
    editorTokens: ['alice-fixture'],
    mode: 'ot',
  });
  await page.goto(`/?lab=collaboration&note=${key}&token=alice-fixture&mode=ot&client=alice`);
  await expect.poll(() => page.evaluate(() => Boolean(window.collabLab))).toBe(true);
  await page.evaluate(() => {
    const driver = window.collabLab!;
    driver.pause();
    for (let i = 0; i < 130; i++) driver.edit(driver.source().length, driver.source().length, 'x');
    driver.resume();
  });
  await expect
    .poll(() => page.evaluate(() => window.collabLab!.info().pending), { timeout: 15_000 })
    .toBe(0);
  expect((await backend.query(probeApi.open, { key, token: 'owner-fixture' })).source).toBe(
    'start' + 'x'.repeat(130)
  );
  const retained = await backend.query(probeApi.stats, { key, token: 'owner-fixture' });
  expect(retained.logCount).toBeLessThanOrEqual(128);
});

test('an accepted submission whose acknowledgment is ignored is deduplicated on retry', async () => {
  const key = crypto.randomUUID();
  await backend.mutation(probeApi.create, {
    key,
    source: 'hello',
    ownerToken: 'owner-fixture',
    editorTokens: ['alice-fixture'],
    mode: 'ot',
  });
  const packet = {
    key,
    token: 'alice-fixture',
    version: 0,
    epoch: 0,
    updates: [
      { clientID: 'lost-response', changes: ChangeSet.of({ from: 5, insert: '!' }, 5).toJSON() },
    ],
  };
  await backend.mutation(probeApi.push, packet); // Deliberately do not consume a pull acknowledgment.
  await backend.mutation(probeApi.push, packet);
  expect(await backend.query(probeApi.open, { key, token: 'owner-fixture' })).toMatchObject({
    source: 'hello!',
    version: 1,
  });
  await backend.mutation(probeApi.compact, { key, token: 'owner-fixture' });
  expect(await backend.mutation(probeApi.push, packet)).toMatchObject({
    kind: 'recovery',
    snapshot: { source: 'hello!', version: 1 },
  });
});

test('1000-task editor supports keyboard input, scrolling, checkbox source edits and undo', async ({
  page,
}, testInfo) => {
  const key = crypto.randomUUID();
  const source = scenarios.workload.source;
  await backend.mutation(probeApi.create, {
    key,
    source,
    ownerToken: 'owner-fixture',
    editorTokens: ['alice-fixture'],
    mode: 'ot',
  });
  const frames = { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0 };
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      frames.sent++;
      frames.sentBytes += Buffer.byteLength(payload);
    });
    socket.on('framereceived', ({ payload }) => {
      frames.received++;
      frames.receivedBytes += Buffer.byteLength(payload);
    });
  });
  const openedAt = performance.now();
  await page.goto(`/?lab=collaboration&note=${key}&token=alice-fixture&mode=ot&client=alice`);
  await expect.poll(() => page.evaluate(() => Boolean(window.collabLab))).toBe(true);
  const openMs = performance.now() - openedAt;
  const editable = page.locator('.cm-content');
  await editable.click({ position: { x: 20, y: 10 } });
  await page.keyboard.press('Control+Home');
  for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowRight');
  const typedAt = performance.now();
  await page.keyboard.type('Typing ');
  await expect
    .poll(async () =>
      (await backend.query(probeApi.open, { key, token: 'owner-fixture' })).source.startsWith(
        '- [ ] Typing '
      )
    )
    .toBe(true);
  const typingToServerMs = performance.now() - typedAt;
  await page.evaluate(() => window.collabLab!.pause());
  await page.locator('.cm-scroller').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => page.locator('.cm-scroller').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.locator('.cm-scroller').evaluate((element) => {
    element.scrollTop = 0;
  });
  const firstCheckbox = page.locator('[data-checkbox-from]').first();
  const before = await page.evaluate(() => window.collabLab!.source());
  await firstCheckbox.click();
  await expect
    .poll(() => page.evaluate(() => window.collabLab!.source()))
    .toBe(before.replace('[ ]', '[x]'));
  await page.evaluate(() => window.collabLab!.undo());
  expect(await page.evaluate(() => window.collabLab!.source())).toBe(before);
  await page.evaluate(() => window.collabLab!.resume());
  await expect.poll(() => page.evaluate(() => window.collabLab!.info().pending)).toBe(0);
  await writeFile(
    '/tmp/tabootask-probe-interactions.json',
    JSON.stringify(
      {
        openMs,
        typingToServerMs,
        frames,
        info: await page.evaluate(() => window.collabLab!.info()),
      },
      null,
      2
    )
  );
  await testInfo.attach('interaction-measurements.json', {
    body: JSON.stringify(
      {
        openMs,
        typingToServerMs,
        frames,
        info: await page.evaluate(() => window.collabLab!.info()),
        caveat:
          'Chromium development-build observation. Frame payload bytes exclude HTTP, TLS and transport framing; input not native mobile IME.',
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
});
