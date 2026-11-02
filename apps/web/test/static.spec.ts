import { expect, test } from '@playwright/test';

test('loads a nested route and refreshes from static assets with cross-origin Convex and no BFF', async ({
  page,
}) => {
  const frontendRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:3200')
      frontendRequests.push(request.url());
  });
  const response = await page.goto('/probe/t22-public-browser');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('identity')).toHaveText('Signed out');
  await expect(page.getByTestId('public-note')).toHaveText('null');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Static OAuth fixture' })).toBeVisible();
  await expect(page.getByTestId('identity')).toHaveText('Signed out');
  await page.getByRole('button', { name: 'Update fixture', exact: true }).click();
  await expect(page.getByTestId('action-result')).toContainText('Unauthenticated');
  await page.getByRole('button', { name: 'Read restricted history' }).click();
  await expect(page.getByTestId('action-result')).toContainText('Unauthenticated');
  expect(frontendRequests.filter((url) => /\/(?:api\/auth|_serverFn)/u.test(url))).toEqual([]);
});
