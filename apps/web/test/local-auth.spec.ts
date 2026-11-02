import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function oauth(page: Page, action: string, identity = 'alice') {
  await page.getByRole('button', { name: action, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Local substitute, not real OAuth' })
  ).toBeVisible();
  await page.getByRole('link', { name: `Continue as ${identity}` }).click();
  await expect(page.getByRole('heading', { name: 'Static OAuth fixture' })).toBeVisible();
}

test('local substituted providers exercise real callbacks, explicit linking, sessions and reactive owner access', async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(90_000);
  const key = `t22-${Date.now()}`;
  const route = `/probe/${key}`;
  await page.goto(route);
  await oauth(page, 'Sign in with google');
  await expect(page.getByTestId('identity')).not.toHaveText(/Signed out|Loading/u);
  const userId = await page.getByTestId('identity').textContent();
  expect(new URL(page.url()).searchParams.has('ott')).toBe(false);
  await page.getByRole('button', { name: 'Create fixture', exact: true }).click();
  await expect(page.getByTestId('action-result')).toContainText('Success');
  const tab = await context.newPage();
  await tab.goto(route);
  await expect(tab.getByTestId('identity')).toHaveText(userId!);
  await page.reload();
  await expect(page.getByTestId('identity')).toHaveText(userId!);

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`http://localhost:3200${route}`);
  await expect(visitor.getByTestId('identity')).toHaveText('Signed out');

  await oauth(visitor, 'Sign in with github', 'bob');
  await expect(visitor.getByTestId('identity')).not.toHaveText(/Signed out|Loading/u);
  await visitor.getByLabel('Replacement fixture text').fill('Outsider write');
  await visitor.getByRole('button', { name: 'Update fixture', exact: true }).click();
  await expect(visitor.getByTestId('action-result')).toContainText('Fixture owner required');
  await visitor.getByRole('button', { name: 'Read restricted history' }).click();
  await expect(visitor.getByTestId('action-result')).toContainText('Fixture owner required');
  await oauth(page, 'Connect github', 'bob');
  await expect(page).toHaveURL(/error=email/u);
  await oauth(page, 'Connect github', 'owned');
  await expect(page).toHaveURL(/error=account_already_linked_to_different_user/u);
  await expect(page.getByTestId('identity')).toHaveText(userId!);
  await expect(visitor.getByTestId('public-note')).toContainText('Disposable public fixture');
  await page.getByLabel('Replacement fixture text').fill('Reactive owner edit');
  await page.getByRole('button', { name: 'Update fixture', exact: true }).click();
  await expect(visitor.getByTestId('public-note')).toContainText('Reactive owner edit');
  await visitor.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(visitor.getByTestId('identity')).toHaveText('Signed out');
  await oauth(visitor, 'Sign in with github');
  await expect(visitor).toHaveURL(/error=account_not_linked/u);
  await expect(visitor.getByTestId('identity')).toHaveText('Signed out');

  await oauth(page, 'Connect github');
  await expect(page.getByTestId('identity')).toHaveText(userId!);
  await page.getByRole('button', { name: 'List sign-in methods' }).click();
  await expect(page.getByRole('button', { name: 'Unlink google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlink github', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByTestId('identity')).toHaveText('Signed out');
  await expect(tab.getByTestId('identity')).toHaveText('Signed out');
  await oauth(page, 'Sign in with github');
  await expect(page.getByTestId('identity')).toHaveText(userId!);
  await page.getByRole('button', { name: 'Read restricted history' }).click();
  await expect(page.getByTestId('action-result')).toContainText('Disposable public fixture');
  await page.getByRole('button', { name: 'List sign-in methods' }).click();
  await page.getByRole('button', { name: 'Unlink github', exact: true }).click();
  await expect(page.getByTestId('action-result')).toContainText('true');
  await page.getByRole('button', { name: 'Unlink google', exact: true }).click();
  await expect(page.getByTestId('action-result')).toContainText('last account');
  await oauth(page, 'Connect github', 'different');
  await expect(page).toHaveURL(/error=email/u);
  await expect(page.getByTestId('identity')).toHaveText(userId!);
  await oauth(page, 'Connect github');
  // A tab that was signed out does not automatically adopt a new OAuth session.
  await tab.reload();
  await expect(tab.getByTestId('identity')).toHaveText(userId!);
  await page.getByRole('button', { name: 'List sign-in methods' }).click();
  await tab.getByRole('button', { name: 'List sign-in methods' }).click();
  await Promise.all([
    page.getByRole('button', { name: 'Unlink github', exact: true }).click(),
    tab.getByRole('button', { name: 'Unlink google', exact: true }).click(),
  ]);
  await expect(page.getByTestId('action-result')).toContainText(/"status": true|last account/u);
  await expect(tab.getByTestId('action-result')).toContainText(/"status": true|last account/u);
  const unlinkResults = [
    await page.getByTestId('action-result').textContent(),
    await tab.getByTestId('action-result').textContent(),
  ];
  expect(unlinkResults.filter((result) => result?.includes('last account'))).toHaveLength(1);
  expect(unlinkResults.filter((result) => result?.includes('"status": true'))).toHaveLength(1);
  await page.getByRole('button', { name: 'List sign-in methods' }).click();
  await expect(page.getByRole('button', { name: /^Unlink /u })).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete fixture', exact: true }).click();
  await expect(visitor.getByTestId('public-note')).toHaveText('null');
  await page.getByRole('button', { name: 'Revoke all sessions' }).click();
  await expect(page.getByTestId('identity')).toHaveText('Signed out');
  await visitorContext.close();
});
