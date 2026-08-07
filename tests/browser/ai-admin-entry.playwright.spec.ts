import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('signed admin sees in-place reconnect when the preview proxy rejects status', async ({ page }) => {
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
    const requestHeaders = await route.request().allHeaders();
    expect(requestHeaders['x-banners-admin-session']).toBe('browser-test-signed-session');
    expect(route.request().postDataJSON()).toMatchObject({ adminSessionToken: 'browser-test-signed-session' });
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'FORBIDDEN_ORIGIN' }),
    });
  });

  await page.goto('/admin/ai-designer', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/ai-designer$/);
  await expect(page.getByRole('heading', { name: 'Production AI Banner Designer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
  await expect(page.getByLabel('Admin password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconnect admin' })).toBeVisible();

  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Create with AI' })).toBeVisible();
});

test('admin completes the background brief and generation workflow', async ({ page }) => {
  const admin = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'ai-admin-browser-test@example.com',
    is_admin: true,
  };
  await page.addInitScript(({ user }) => {
    window.localStorage.setItem('banners_current_user', JSON.stringify(user));
    window.localStorage.setItem('banners_server_session', 'browser-test-signed-session');
    window.sessionStorage.setItem('banners_server_session', 'browser-test-signed-session');
  }, { user: admin });

  await page.route('**/.netlify/functions/ai-designer-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      authorized: true,
      enabled: true,
      keyConfigured: true,
      temporaryStorageConfigured: true,
      modelAvailable: true,
      validationModelAvailable: true,
      model: 'gpt-image-2-2026-04-21',
      ready: true,
    }),
  }));

  const briefJobRef = 'brief-job-reference';
  const generationJobRef = 'generation-job-reference';
  await page.route('**/.netlify/functions/ai-designer-brief', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobRef: briefJobRef, workerPath: '/.netlify/functions/ai-designer-worker-background', pollPath: '/.netlify/functions/ai-designer-job', pollAfterMs: 1 }),
  }));
  await page.route('**/.netlify/functions/ai-designer-generate', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobRef: generationJobRef, workerPath: '/.netlify/functions/ai-designer-worker-background', pollPath: '/.netlify/functions/ai-designer-job', pollAfterMs: 1 }),
  }));
  await page.route('**/.netlify/functions/ai-designer-worker-background', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toHaveProperty('jobRef');
    await route.fulfill({ status: 202, body: '' });
  });
  await page.route('**/.netlify/functions/ai-designer-job', async (route) => {
    const { jobRef, adminSessionToken } = route.request().postDataJSON();
    expect(adminSessionToken).toBe('browser-test-signed-session');
    if (jobRef === briefJobRef) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'completed',
          action: 'brief',
          brief: {
            structured: true,
            description: 'A polished birthday basketball design.',
            purpose: 'Celebrate a milestone',
            targetAudience: 'Friends and family',
            primaryMessage: 'Happy birthday',
            visualStyle: 'Bold and energetic',
            brandPersonality: 'Fun and confident',
            colorPalette: 'Orange, navy, and white',
            subjectMatter: 'Basketball',
            composition: 'Basketball action on the right with a clean text zone on the left',
            focalPoint: 'Basketball',
            usage: 'outdoor',
            viewingDistance: '20–50 feet',
            widthIn: 96,
            heightIn: 48,
            material: '13oz',
            quantity: 1,
            productType: 'banner',
            textPosition: 'left',
            logoPosition: 'upper-right',
            textColor: '#ffffff',
            accentColor: '#f97316',
            copy: { headline: '', supportingText: '', offer: '', callToAction: '', businessName: '', phone: '', website: '', address: '', date: '', other: '' },
          },
        }),
      });
      return;
    }
    const concept = {
      id: 'concept-1',
      versionId: 'version-1',
      generationId: 'generation-1',
      backgroundRef: 'signed-background-reference',
      imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nE8AAAAASUVORK5CYII=',
      mimeType: 'image/png',
      widthPx: 1920,
      heightPx: 960,
      widthIn: 96,
      heightIn: 48,
      aspectRatio: 2,
      printReady: true,
      textLayers: [],
      logoLayer: null,
      validation: {
        status: 'passed',
        passed: true,
        reasons: [],
        checks: {
          dimensions: { passed: true, width: 1920, height: 960, expectedWidth: 1920, expectedHeight: 960 },
          aspectRatio: { passed: true, requested: 2, actual: 2 },
          edgeCoverage: { passed: true, suspiciousEdges: [] },
          resolution: { passed: true, effectivePpi: 20, minimumPpi: 20 },
          flatArtwork: { passed: true, flags: [], confidence: 1 },
          exactText: { passed: true, required: [], detected: [] },
        },
        vision: { available: true, model: 'gpt-5-mini', requestId: 'vision-request' },
      },
      diagnostics: {
        model: 'gpt-image-2-2026-04-21',
        modelSnapshot: 'gpt-image-2-2026-04-21',
        providerRequestId: 'image-request',
        durationMs: 12000,
        outputDimensions: '1920x960',
        requestedAspectRatio: 2,
        finalAspectRatio: 2,
        ratioStrategy: 'native-exact-ratio',
        repaired: false,
        estimatedCostUsd: null,
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, status: 'completed', action: 'generate', generationId: 'generation-1', concepts: [concept] }),
    });
  });

  await page.goto('/admin/ai-designer', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Describe the design you want').fill('A polished birthday basketball design.');
  await page.getByRole('button', { name: 'Interpret, review, and confirm brief' }).click();
  await expect(page.getByRole('button', { name: 'Brief reviewed' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Generate concepts' }).click();
  await expect(page.getByRole('heading', { name: 'Selected production design' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Print ready')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and use in banner configurator' })).toBeEnabled();
});
