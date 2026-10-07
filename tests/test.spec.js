const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://smood.zcodia.in';

test.use({ baseURL: BASE_URL });

async function gotoLanding(page) {
  await page.goto('/');
  await expect(page.locator('.landing-page')).toBeVisible();
  await expect(page).toHaveTitle(/Landing Page/, { timeout: 15000 });
  await expect(page.locator('.hero-headline')).toBeVisible();
}

async function expectScrolledIntoView(page, selector) {
  await expect
    .poll(
      async () => {
        const box = await page.locator(selector).boundingBox();
        return box === null ? Number.POSITIVE_INFINITY : Math.abs(box.y);
      },
      { timeout: 7000, message: `Expected section "${selector}" to be scrolled into the viewport` }
    )
    .toBeLessThan(300);
}

function collectErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return {
    pageErrors,
    appConsoleErrors: () =>
      consoleErrors.filter((text) => !/Failed to load resource|net::ERR_|404/i.test(text)),
  };
}

test.describe('Front page navigation links', () => {
  test('landing page loads with the main navigation visible', async ({ page }) => {
    await gotoLanding(page);

    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.nav-logo')).toBeVisible();
    await expect(nav.locator('.nav-links a')).toHaveCount(3);
    await expect(nav.locator('.nav-cta')).toBeVisible();
  });

  test('nav link "How it works" scrolls to the How-it-works section', async ({ page }) => {
    await gotoLanding(page);

    await page.locator('nav .nav-links a[href="/#how"]').click();

    await expect(page).toHaveURL(/\/#how$/);
    await expectScrolledIntoView(page, '#how');
    await expect(page.locator('#how')).toBeVisible();
  });

  test('nav link "Features" scrolls to the Features section', async ({ page }) => {
    await gotoLanding(page);

    await page.locator('nav .nav-links a[href="/#features"]').click();

    await expect(page).toHaveURL(/\/#features$/);
    await expectScrolledIntoView(page, '#features');
    await expect(page.locator('#features')).toBeVisible();
  });

  test('nav link "Pricing" navigates to the Pricing page', async ({ page }) => {
    await gotoLanding(page);

    await page.locator('nav .nav-links a[href="/pricing"]').click();

    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole('heading', { name: /Simple pricing/ })).toBeVisible();
    await expect(page).toHaveTitle(/Pricing/, { timeout: 15000 });

    await expect(page.locator('nav .nav-links a[href="/pricing"]')).toHaveClass(/active/);
  });

  test('nav CTA "Get Started Free" navigates to the sign-up page', async ({ page }) => {
    await gotoLanding(page);

    await page.locator('nav .nav-cta').click();

    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByText('Start for free today')).toBeVisible();
    await expect(page.locator('form')).toBeVisible();
    expect(await page.locator('input').count()).toBeGreaterThan(0);
  });

  test('logo navigates back to the home page from another page', async ({ page }) => {
    await page.goto('/pricing');

    await expect(page.getByRole('heading', { name: /Simple pricing/ })).toBeVisible();
    await expect(page).toHaveTitle(/Pricing/, { timeout: 15000 });

    await page.locator('nav .nav-logo').click();

    await expect(page).toHaveURL(new RegExp(`^${BASE_URL}/$`));
    await expect(page.locator('.hero-headline')).toBeVisible();
    await expect(page).toHaveTitle(/Landing Page/, { timeout: 15000 });
  });

  test('footer links are clickable and keep the user on the site', async ({ page }) => {
    const errors = collectErrors(page);
    await gotoLanding(page);

    for (const label of ['Privacy', 'Terms', 'Contact']) {
      const link = page.locator(`.footer-links a:text-is("${label}")`);
      await expect(link).toBeVisible();
      await link.click();

      expect(new URL(page.url()).origin).toBe(BASE_URL);
      await expect(page.locator('.landing-page')).toBeVisible();
    }

    expect(errors.pageErrors).toEqual([]);
    expect(errors.appConsoleErrors()).toEqual([]);
  });
});

test.describe('Front page active buttons', () => {
  const activeButtons = [
    { name: 'nav CTA "Get Started Free →"', selector: 'nav .nav-cta' },
    { name: 'hero primary "Start Hiring Smarter →"', selector: '.hero-actions .btn-hero-primary' },
    { name: 'hero secondary "See how it works"', selector: '.hero-actions .btn-hero-secondary' },
    { name: 'final CTA "Start Free — Post Your First Role →"', selector: '.cta-section .btn-cta' },
  ];

  test('all active buttons are present, visible, enabled and have a non-zero size', async ({
    page,
  }) => {
    await gotoLanding(page);

    for (const { name, selector } of activeButtons) {
      const button = page.locator(selector);
      await expect(button, `"${name}" should be visible`).toBeVisible();
      await expect(button, `"${name}" should be enabled`).toBeEnabled();
      const box = await button.boundingBox();
      expect(box, `"${name}" should have a bounding box`).not.toBeNull();
      expect(box?.width ?? 0, `"${name}" should have width > 0`).toBeGreaterThan(0);
      expect(box?.height ?? 0, `"${name}" should have height > 0`).toBeGreaterThan(0);
    }
  });

  test('hero primary button is clickable and scrolls to the sign-up section', async ({ page }) => {
    await gotoLanding(page);

    await page.locator('.hero-actions .btn-hero-primary').click();

    await expect(page).toHaveURL(/\/#signup$/);
    await expectScrolledIntoView(page, '#signup');
  });

  test('hero secondary button is clickable and scrolls to the How-it-works section', async ({
    page,
  }) => {
    await gotoLanding(page);

    await page.locator('.hero-actions .btn-hero-secondary').click();

    await expect(page).toHaveURL(/\/#how$/);
    await expectScrolledIntoView(page, '#how');
  });

  test('final CTA button is clickable and keeps the user on the landing page without errors',
    async ({ page }) => {
      const errors = collectErrors(page);
      await gotoLanding(page);

      const cta = page.locator('.cta-section .btn-cta');
      await expect(cta).toBeVisible();
      await cta.click();

      expect(new URL(page.url()).origin).toBe(BASE_URL);
      await expect(page.locator('.landing-page')).toBeVisible();

      await expect(page.locator('nav .nav-links a[href="/pricing"]')).toBeVisible();

      expect(errors.pageErrors).toEqual([]);
      expect(errors.appConsoleErrors()).toEqual([]);
    });

  test('nav CTA button is clickable and opens the sign-up page', async ({ page }) => {
    await gotoLanding(page);

    const navCta = page.locator('nav .nav-cta');
    await expect(navCta).toBeVisible();
    await navCta.click();

    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByText('Start for free today')).toBeVisible();
    await expect(page.locator('form')).toBeVisible();
  });
});

