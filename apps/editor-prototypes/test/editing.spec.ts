import { expect, test } from '@playwright/test';
import type { Variant } from '../src/editor.ts';

test('highlighted source gives ordinary Markdown visible formatting without changing source', async ({
  page,
}) => {
  await page.goto('/?variant=highlight');
  await page.waitForFunction(() => !!window.editorLab);
  const source =
    '# Heading one\n\n## Heading two\n\n### Heading three\n\n#### Heading four\n\n##### Heading five\n\n###### Heading six\n\nSetext heading\n==============\n\nPlain text\n\n**Bold words** and *italic words* and `inline code`\n\n[Example link](https://example.test)\n';
  await page.evaluate((text) => window.editorLab!.load(text), source);
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('combobox', { name: 'Appearance' }).click();
    await page.getByRole('option', { name: theme, exact: true }).click();
    const plain = page.locator('.cm-line').filter({ hasText: /^Plain text$/ });
    const bodySize = await plain.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    let previousSize = Number.POSITIVE_INFINITY;
    for (const [index, word] of ['one', 'two', 'three', 'four', 'five', 'six'].entries()) {
      const heading = page
        .locator('.cm-line')
        .filter({ hasText: new RegExp(`^${'#'.repeat(index + 1)} Heading ${word}$`) })
        .locator('span')
        .last();
      const style = await heading.evaluate((el) => {
        const css = getComputedStyle(el);
        return {
          size: Number.parseFloat(css.fontSize),
          weight: Number.parseInt(css.fontWeight, 10),
        };
      });
      expect(style.weight).toBeGreaterThanOrEqual(600);
      expect(style.size).toBeGreaterThanOrEqual(bodySize);
      expect(style.size).toBeLessThan(previousSize);
      previousSize = style.size;
    }
    const setext = page
      .locator('.cm-line')
      .filter({ hasText: /^Setext heading$/ })
      .locator('span');
    await expect(setext).toHaveCSS('font-weight', '700');
    expect(
      await setext.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    ).toBeGreaterThan(bodySize);
    await expect(page.getByText('Bold words', { exact: true })).toHaveCSS('font-weight', '700');
    await expect(page.getByText('italic words', { exact: true })).toHaveCSS('font-style', 'italic');
    await expect(page.getByText('Example link', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'underline'
    );
    const codeBackground = await page
      .getByText('inline code', { exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(codeBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source);
  }
});

test('copy action explains unavailable browser clipboard without throwing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.editorLab);
  await page.getByRole('button', { name: 'Copy as Markdown', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Clipboard unavailable');
  expect(errors).toEqual([]);
});

for (const variant of ['highlight', 'indicators', 'rich'] as const) {
  test(`${variant}: exact untouched source, keyboard edits, source checkbox and undo`, async ({
    page,
  }) => {
    await page.goto(`/?variant=${variant}`);
    await page.waitForFunction(() => !!window.editorLab);
    const source =
      '# Heading\r\n\n- [ ] Parent ~003    \r\n  - Child ~0\n- **Keep** marker choices @alice\n';
    await page.evaluate((text) => window.editorLab!.load(text), source);
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source);
    await page.getByLabel('Markdown editor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('Added');
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source + 'Added');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source);
    await page.evaluate(() => window.editorLab!.select(0));
    await page.locator('[data-checkbox-from]').first().click();
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(
      source.replace('[ ]', '[x]')
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source);
    for (const next of ['highlight', 'indicators', 'rich'] as Variant[])
      await page.evaluate((v) => window.editorLab!.switchVariant(v), next);
    expect(await page.evaluate(() => window.editorLab!.source())).toBe(source);
  });
}

test('rich selected lines reveal source and composition suspends rich replacements', async ({
  page,
}) => {
  await page.goto('/?variant=rich');
  await page.waitForFunction(() => !!window.editorLab);
  await page.evaluate(() => {
    window.editorLab!.load('# Heading\n\n- **First** ~3\n- *Second* ~0\n');
    window.editorLab!.select(10);
  });
  await expect(page.locator('.rich-heading')).toHaveCount(1);
  await page.evaluate(() => window.editorLab!.select(0, 38));
  await expect(page.locator('.rich-heading')).toHaveCount(0);
  expect(await page.getByLabel('Markdown editor').textContent()).toContain('# Heading');
  await page.evaluate(() => window.editorLab!.select(10));
  await expect(page.locator('.rich-heading')).toHaveCount(1);
  await page.getByLabel('Markdown editor').dispatchEvent('compositionstart');
  await expect(page.locator('.rich-heading')).toHaveCount(0);
  await page.getByLabel('Markdown editor').dispatchEvent('compositionend');
  await expect(page.locator('.rich-heading')).toHaveCount(1);
});

test('rich checkbox works with keyboard activation and preserves exact totals', async ({
  page,
}) => {
  await page.goto('/?variant=rich');
  await page.waitForFunction(() => !!window.editorLab);
  await page.evaluate(() => {
    window.editorLab!.load(
      '# Heading\n\n- [ ] Parent ~9007199254740993\n  - Child ~1\n- Explicit ~0\n- Empty\n'
    );
    window.editorLab!.select(0);
  });
  await expect(page.locator('.task-indicator.total').first()).toHaveText('Σ 9007199254740994');
  await expect(page.locator('.task-indicator.total')).toHaveCount(3);
  const check = page.getByRole('button', { name: 'Check task', exact: true });
  await check.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.editorLab!.source())).toContain('- [x] Parent');
});

test('shared large workload measures 1000 tasks without horizontal page overflow', async ({
  page,
}) => {
  await page.goto('/?variant=highlight');
  await page.waitForFunction(() => !!window.editorLab);
  await page.getByRole('combobox', { name: 'Shared scenario' }).click();
  await page.getByRole('option', { name: '1,000 tasks · nested and multiline' }).click();
  expect(await page.evaluate(() => window.editorLab!.metrics().tasks)).toBe(1000);
  for (const next of ['highlight', 'indicators', 'rich'] as Variant[]) {
    await page.evaluate((v) => window.editorLab!.switchVariant(v), next);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }
});
