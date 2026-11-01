import type {} from '../src/collaboration/driver.ts';
import { expect, test } from '@playwright/test';
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
