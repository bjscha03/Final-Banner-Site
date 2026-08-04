import { expect, test } from '@playwright/test';

test('signed admin keeps the AI route and designer entry when readiness is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const admin = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'ai-admin-browser-test@example.com',
      is_admin: true,
    };
    window.localStorage.setItem('banners_current_user', JSON.stringify(admin));
    window.localStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.sessionStorage.setItem('banners_server_session', 'browser-test-signed-session');
  });

  await page.route('**/.netlify/functions/ai-designer-status', async (route) => {
    // Reproduce the cold-load window that previously redirected an authorized
    // admin before the readiness request had started, then fail readiness to
    // prove provider health does not hide admin entry points.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'STATUS_UNAVAILABLE' }),
    });
  });

  await page.goto('/admin/ai-designer', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/ai-designer$/);
  await expect(page.getByRole('heading', { name: 'Production AI Banner Designer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);

  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Create with AI' })).toBeVisible();
});
