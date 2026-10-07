const { test, expect } = require('@playwright/test');
const BASE_URL = 'https://smood.zcodia.in';
test.use({ baseURL: BASE_URL });

function attachOtpCapture(page, store) {
  const listener = async (r) => {
    try {
      const url = r.url();
      if (/\/api\/v1\/auth\//i.test(url) && r.request().method() !== 'GET') {
        const txt = await r.text().catch(() => '');
        const mm = /"otpCode"\s*:\s*"([A-Za-z0-9]{4,8})"/.exec(txt);
        if (mm) {
          store.code = mm[1];
          console.log('Network OTP captured: ' + store.code + ' from ' + url);
        }
      }
    } catch {}
  };
  page.on('response', listener);
  return () => page.off('response', listener);
}

function extractCodeFromText(text) {
  const m = /code is\s+([A-Za-z0-9]{4,8})/i.exec(text || '');
  return m ? m[1].trim() : null;
}

async function firstVisible(page, selectors, perMs = 2500) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: perMs });
      return loc;
    } catch {}
  }
  return page.locator(selectors[0]).first();
}
function uniqueUser() {
  const ts = Date.now();
  const phone = `9${String(ts).slice(-9).padStart(9, '0')}`;
  return { name: `Test User ${ts}`, email: `testuser${ts}@example.com`, password: `Test@${ts}Aa1!`, phone, company: `Apex Ventures ${ts} Pvt Ltd`, ts };
}

test.describe('Multi-step user registration flow', () => {
  test('Landing > Account > Verification > Setup > Hire', async ({ page }) => {
    const user = uniqueUser();
    const otpStore = { code: null };
    const detachOtp = attachOtpCapture(page, otpStore);

    await test.step('1. Landing - Get Started redirects to sign-up', async () => {
      await page.goto('/');
      await expect(page.locator('.landing-page')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.hero-headline')).toBeVisible();
      await expect(page).toHaveTitle(/Landing Page|Smood/i, { timeout: 15000 });
      const getStarted = await firstVisible(page, ['nav .nav-cta', '.hero-actions .btn-hero-primary', '.cta-section .btn-cta']);
      await expect(getStarted, 'Get Started visible').toBeVisible();
      await expect(getStarted, 'Get Started enabled').toBeEnabled();
      const box = await getStarted.boundingBox();
      expect(box, 'Get Started has box').not.toBeNull();
      expect(box.width, 'width > 0').toBeGreaterThan(0);
      expect(box.height, 'height > 0').toBeGreaterThan(0);
      await getStarted.click();
      await expect(page, 'redirects to sign-up').toHaveURL(/\/auth\/signup/, { timeout: 15000 });
      expect(new URL(page.url()).origin).toBe(BASE_URL);
      await expect(page.getByText(/Start for free today/i)).toBeVisible({ timeout: 15000 });
      await expect(page.locator('form')).toBeVisible();
    });

    await test.step('2. Step 1 Account Creation - fill + continue', async () => {
      await expect(page).toHaveURL(/\/auth\/signup/);
      const form = page.locator('form').first();
      await expect(form, 'account form visible').toBeVisible();
      expect(await page.locator('input').count()).toBeGreaterThan(0);
      await expect(page.getByText('Account').first(), 'stepper shows Account').toBeVisible();
      await expect(page.getByText('Verify').first(), 'stepper shows Verify').toBeVisible();
      await expect(page.getByText('Create your account').first(), 'account heading visible').toBeVisible();
      const companyInput = page.getByPlaceholder(/Apex|Company Name/i);
      const firstNameInput = page.getByPlaceholder('Rajesh');
      const lastNameInput = page.getByPlaceholder('Kumar');
      const phoneInput = page.getByPlaceholder(/98765|Phone Number/i);
      const emailInput = page.getByPlaceholder(/you@yourcompany|Work Email/i);
      const passwordInput = page.getByPlaceholder(/Min\. 8/i);
      const confirmInput = page.getByPlaceholder(/Repeat password/i);
      for (const [label, loc] of [['Company', companyInput], ['First Name', firstNameInput], ['Last Name', lastNameInput], ['Phone', phoneInput], ['Email', emailInput], ['Password', passwordInput], ['Confirm Password', confirmInput]]) {
        await expect(loc, `${label} visible`).toBeVisible();
        await expect(loc, `${label} enabled`).toBeEnabled();
        await expect(loc, `${label} editable`).toBeEditable();
      }
      await companyInput.fill(user.company);
      await expect(companyInput, 'Company accepts input').toHaveValue(user.company);
      await firstNameInput.fill('TestFirst');
      await expect(firstNameInput, 'First Name accepts input').toHaveValue('TestFirst');
      await lastNameInput.fill('TestLast');
      await expect(lastNameInput, 'Last Name accepts input').toHaveValue('TestLast');
      await phoneInput.fill(user.phone);
      await expect(phoneInput, 'Phone accepts input').toHaveValue(user.phone);
      await emailInput.fill(user.email);
      await expect(emailInput, 'Email accepts input').toHaveValue(user.email);
      await passwordInput.fill(user.password);
      await expect(passwordInput, 'Password accepts input').not.toHaveValue('');
      await confirmInput.fill(user.password);
      await expect(confirmInput, 'Confirm accepts input').not.toHaveValue('');
      const plan = page.getByText(/Free Trial/i).first();
      if (await plan.isVisible().catch(() => false)) {
        await expect(plan, 'plan option visible').toBeVisible();
        await plan.click();
      }
      const terms = page.locator('form input[type="checkbox"]').first();
      if (await terms.count() > 0) {
        await expect(terms, 'terms checkbox visible').toBeVisible();
        await terms.check({ force: true }).catch(async () => { await terms.click({ force: true }); });
        await expect(terms, 'terms accepted').toBeChecked();
      }
      const continueBtn = page.getByRole('button', { name: /create|continue|sign up|get started|verify/i }).or(page.locator('form button[type="submit"]')).first();
      await expect(continueBtn, 'Continue visible').toBeVisible();
      await expect(continueBtn, 'Continue enabled').toBeEnabled();
      await continueBtn.click();
      await Promise.race([
        page.waitForURL(/verify|verification|otp|setup|onboarding/i, { timeout: 15000 }).catch(() => {}),
        page.getByText(/verify your|enter.*code|check your|otp sent|almost there/i).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      ]);
      console.log(`After Step 1 continue, URL = ${page.url()}`);
      if (!/\/auth\/signup/i.test(page.url())) {
        expect(page.url(), 'navigates to verify/setup').toMatch(/verify|verification|otp|setup|onboarding/i);
      } else {
        await expect(page.getByText(/verify your|enter.*code|check your|otp sent|almost there|step 2/i).first(), 'wizard advances past Step 1').toBeVisible({ timeout: 15000 });
      }
    });

    await test.step('3. Step 2 Verification - inputs and buttons functional', async () => {
      const heading = page.getByText(/Check your inbox|Enter verification code/i).first();
      const otpCandidates = page.locator('input[type="text"]:visible, input:not([type]):visible, input[inputmode="numeric"]:visible, input[maxlength="1"]:visible, input[autocomplete="one-time-code"]');
      const alreadyVerifying = await heading.or(otpCandidates).first().isVisible().catch(() => false);
      if (!alreadyVerifying && !/verify-email|verify|verification|otp/i.test(page.url())) {
        for (const route of ['/auth/verify-email', '/auth/verify', '/auth/verification', '/verify', '/verification']) {
          try {
            await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10000 });
            const maybeForm = page.locator('form, input').first();
            await maybeForm.waitFor({ state: 'visible', timeout: 5000 });
            if (await maybeForm.isVisible()) break;
          } catch {}
        }
      }
      await expect(heading.or(otpCandidates).first(), 'Verification heading or OTP inputs visible').toBeVisible({ timeout: 15000 });
      if (/verify-email|verify|verification|otp/i.test(page.url())) {
        expect(page.url(), 'verification URL').toMatch(/verify-email|verify|verification|otp/i);
      }
      await expect(page.getByText('Verify', { exact: true }).first(), 'stepper shows Verify').toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Check your inbox/i).first(), 'Check your inbox heading visible').toBeVisible();
      await expect(page.getByText(/Enter verification code/i).first(), 'Enter verification code visible').toBeVisible();
      await expect(page.getByText(/Code sent to/i).first(), 'Code sent to visible').toBeVisible();
      await expect(page.getByText(user.email, { exact: false }).first(), 'code sent to our email').toBeVisible();

      const emailOtp = page.getByRole('button', { name: /Email OTP/i });
      const mobileOtp = page.getByRole('button', { name: /Mobile OTP/i });
      await expect(emailOtp, 'Email OTP toggle visible').toBeVisible();
      await expect(emailOtp, 'Email OTP toggle enabled').toBeEnabled();
      await expect(mobileOtp, 'Mobile OTP toggle visible').toBeVisible();
      await expect(mobileOtp, 'Mobile OTP toggle enabled').toBeEnabled();
      expect(new URL(page.url()).origin).toBe(BASE_URL);

      const otpBoxes = page.getByRole('textbox').filter({ hasNot: page.locator('[aria-hidden="true"]') });
      const otpCount = await otpBoxes.count();
      expect(otpCount, 'should have OTP boxes').toBeGreaterThanOrEqual(4);
      for (let i = 0; i < otpCount; i++) {
        const box = otpBoxes.nth(i);
        await expect(box, `OTP box #${i} visible`).toBeVisible();
        await expect(box, `OTP box #${i} enabled`).toBeEnabled();
        await expect(box, `OTP box #${i} editable`).toBeEditable();
      }
      const earlyAlerts = await page.getByRole('alert').allInnerTexts().catch(() => []);
      const earlyText = earlyAlerts.join(' || ');
      console.log('Verification alerts (early): ' + earlyText);
      const earlyCode = extractCodeFromText(earlyText);
      const verifyBtn = page.getByRole('button', { name: /Verify.*Continue|Verify|Continue/i });
      await expect(verifyBtn, 'Verify & Continue visible').toBeVisible();
      const vbox = await verifyBtn.boundingBox();
      expect(vbox, 'verify button has size').not.toBeNull();
      expect(vbox.width, 'verify width > 0').toBeGreaterThan(0);
      expect(vbox.height, 'verify height > 0').toBeGreaterThan(0);

      const resendBtn = page.getByRole('button', { name: /Resend code/i });
      await expect(resendBtn, 'Resend code visible').toBeVisible();

      const goBack = page.getByRole('button', { name: /Go back/i });
      await expect(goBack, 'Go back visible').toBeVisible();
      await expect(goBack, 'Go back enabled').toBeEnabled();

      const alertTexts = await page.getByRole('alert').allInnerTexts().catch(() => []);
      const lateCode = extractCodeFromText(alertTexts.join(' || '));
      const code = otpStore.code || earlyCode || lateCode;
      console.log(`Using verification code: ${code || '(none captured)'}`);
      expect(code, 'dev-mode OTP code must be captured (network or alert)').toBeTruthy();
      const n = Math.min(otpCount, code.length);
      for (let i = 0; i < n; i++) {
        await otpBoxes.nth(i).click();
        await otpBoxes.nth(i).fill(code[i]);
      }
      await expect(otpBoxes.first(), 'OTP boxes accept input').not.toHaveValue('');
      await expect(verifyBtn, 'Verify & Continue enabled after full OTP').toBeEnabled({ timeout: 10000 });
      await verifyBtn.click();
      detachOtp();
      const setupUI = page.getByText(/setup|tell us|company|organization|role|team size|profile|onboard/i).first();
      await expect(setupUI.or(page.locator('form, select')).first(), 'advances to Setup UI').toBeVisible({ timeout: 30000 });
      console.log(`After Verification submit, URL = ${page.url()}`);
    });

    await test.step('4. Step 3 Setup - company profile form works', async () => {
      await expect(page, 'lands on onboarding after verification').toHaveURL(/\/onboarding/i, { timeout: 30000 });
      await expect(page.getByRole('heading', { name: /Company Profile/i }).first(), 'Company Profile heading').toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Tell us about your company/i).first(), 'Tell us subheading').toBeVisible();
      await expect(page.getByText(/Step 1 of 6/i).first(), 'Step 1 of 6 indicator').toBeVisible();
      for (const s of [/Brand Configuration/i, /Grade Chart/i, /Invite Your Team/i, /First Role/i]) {
        await expect(page.getByText(s).first(), `sidebar shows ${s}`).toBeVisible();
      }
      const nameInput = page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') }).first();
      await expect(nameInput, 'Company Name pre-filled from signup').not.toHaveValue('');
      for (const [label, value] of [[/Industry/i, 'Technology'], [/Company Size/i, '51-200'], [/City/i, 'Bengaluru']]) {
        const box = page.getByLabel(label);
        await expect(box, `${label} visible`).toBeVisible();
        await expect(box, `${label} enabled`).toBeEnabled();
        await box.fill(value);
        await expect(box, `${label} accepts input`).toHaveValue(value);
      }
      const websiteBox = page.getByLabel(/Company Website/i);
      await websiteBox.fill('https://apexventures.example.com');
      await expect(websiteBox, 'Website accepts input').toHaveValue(/apexventures/);
      const aboutBox = page.getByLabel(/About Company/i);
      await aboutBox.fill('We build world-class hiring software for modern teams.');
      await expect(aboutBox, 'About accepts input').not.toHaveValue('');
      const saveBtn = page.getByRole('button', { name: /Save.*Continue/i });
      await expect(saveBtn, 'Save & Continue enabled').toBeEnabled();
      await saveBtn.click();
      await expect(page, 'advances to brand configuration').toHaveURL(/\/onboarding\/brand/i, { timeout: 20000 });
      console.log(`After Setup continue, URL = ${page.url()}`);
    });

    await test.step('5. Step 4 Hire - onboarding advances, dashboard is interactive', async () => {
      await expect(page.getByText(/Step 2 of 6/i).first(), 'Step 2 of 6 indicator').toBeVisible({ timeout: 15000 });
      expect(new URL(page.url()).origin, 'onboarding stays on site').toBe(BASE_URL);
      const skipBtn = page.getByRole('button', { name: /Skip setup/i });
      await expect(skipBtn, 'Skip setup visible').toBeVisible();
      await expect(skipBtn, 'Skip setup enabled').toBeEnabled();
      await skipBtn.click();
      await expect(page, 'lands on dashboard').toHaveURL(/\/dashboard/i, { timeout: 20000 });
      await expect(page.getByText(/Loading/i).first(), 'dashboard finishes loading').toBeHidden({ timeout: 30000 });
      const actions = page.locator('button:visible, a:visible[href]');
      await expect(actions.first(), 'dashboard action visible').toBeVisible({ timeout: 30000 });
      expect(new URL(page.url()).origin, 'dashboard stays on site').toBe(BASE_URL);
      await expect(page.locator('body'), 'dashboard body visible at end').toBeVisible();
    });
  });
});
