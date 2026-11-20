import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.PREVIEW_URL;
const password = process.env.PREVIEW_ACCESS_PASSWORD;
assert(/^https:\/\/deploy-preview-699--bannersonthefly\.netlify\.app\/?$/.test(base || ''), 'Real PR #699 preview URL required');
assert(password, 'PREVIEW_ACCESS_PASSWORD secret required; no test bypass permitted');
const browser = await chromium.launch();
const post = '/blog/how-to-create-vinyl-banner-with-ai';
const results = [];
async function fresh(path) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  const gate = page.getByRole('heading', { name: 'Preview Access' });
  assert(await gate.isVisible(), 'Expected real preview password gate');
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Enter Preview' }).click();
  await page.waitForURL(url => url.pathname === new URL(base + path).pathname, { timeout: 30000 });
  await page.getByRole('heading', { name: 'Preview Access' }).waitFor({ state: 'hidden', timeout: 30000 });
  return { context, page };
}
async function check(name, run) {
  try { await run(); results.push({ name, result: 'PASS' }); }
  catch (error) { results.push({ name, result: 'FAIL', message: String(error.message || error).replaceAll(password, '[REDACTED]') }); }
}
try {
  await check('organic popup trigger', async () => {
    const { context, page } = await fresh(post);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.75));
    await page.getByRole('heading', { name: /Get your 25% off code by email/i }).waitFor({ timeout: 40000 });
    await context.close();
  });
  await check('organic popup email success', async () => {
    const { context, page } = await fresh(post);
    await page.getByRole('heading', { name: /Get your 25% off code by email/i }).waitFor({ timeout: 40000 });
    await page.getByLabel('Email address').first().fill('maren-popup-test@example.com');
    await page.getByRole('button', { name: 'Email My 25% Off Code' }).click();
    await page.getByRole('status').filter({ hasText: /Check your inbox/i }).waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole('alert').count(), 0);
    await context.close();
  });
  for (const [name, path] of [
    ['ads landing suppression', '/google-ads-banner?product=banner'],
    ['gclid blog suppression', post + '?gclid=test123']
  ]) {
    await check(name, async () => {
      const { context, page } = await fresh(path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(36000);
      assert.equal(await page.getByRole('heading', { name: /Get your 25% off code by email/i }).count(), 0);
      await context.close();
    });
  }
  await check('mid-article CTA and designer navigation', async () => {
    const { context, page } = await fresh(post);
    const article = page.locator('article .prose');
    const cta = article.getByRole('link', { name: 'Design Your Banner' });
    await cta.waitFor();
    assert.equal(new URL(await cta.getAttribute('href'), base).pathname, '/design');
    await cta.click();
    await page.waitForURL(url => url.pathname === '/design', { timeout: 30000 });
    await context.close();
  });
} finally { await browser.close(); }
for (const item of results) console.log(item.name + ': ' + item.result + (item.message ? ' — ' + item.message : ''));
if (results.length !== 5 || results.some(x => x.result !== 'PASS')) process.exitCode = 1;
