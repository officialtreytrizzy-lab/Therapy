import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const optionalAddons = [
  'email-auth-fallback-addon.js',
  'email-link-confirmation.js',
  'google-auth-addon.js',
  'relationship-v2.js',
  'luxury-ui.js',
  'experience-polish.js',
  'inclusive-foundation.js',
  'real-loop.js',
  'premium-motion.js',
];

async function installDeterministicAuth(page, user = null) {
  await page.addInitScript(() => {
    window.__relationshipV2Rendered = true;
  });
  for (const asset of optionalAddons) {
    await page.route(`**/${asset}*`, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  }
  await page.route('**/firebase-client.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.__relationshipV2Rendered=true;window.USFRFirebase={getState:()=>({ready:true,user:${JSON.stringify(user)}}),open:()=>{},call:async()=>({}),guideCall:async()=>({})};window.render?.();window.dispatchEvent(new CustomEvent('usfr-firebase-ready'));`,
  }));
}

function severeViolations(results) {
  return results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
}

test.beforeEach(async ({ page }) => {
  await installDeterministicAuth(page, null);
});

test('landing and sign-in routes render without serious accessibility violations', async ({ page }) => {
  for (const path of ['/', '/sign-in']) {
    await page.goto(path);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#app').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(severeViolations(results), JSON.stringify(severeViolations(results), null, 2)).toEqual([]);
  }
});

test('private dashboard route fails closed for a signed-out visitor', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /sign in to your space/i })).toBeVisible();
  await expect(page.getByText(/checking your account/i)).toHaveCount(0);
  await expect(page.locator('text=Sessions').first()).toHaveCount(0);
});

test('skip link and keyboard focus are available', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.usfr-skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveText(/skip to main content/i);
  await skip.press('Enter');
  await expect(page.locator('#app')).toBeFocused();
});

test('legal and wellness notices are reachable and accessible', async ({ page }) => {
  for (const path of ['/privacy.html', '/terms.html', '/wellness-safety.html']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(severeViolations(results), `${path}\n${JSON.stringify(severeViolations(results), null, 2)}`).toEqual([]);
  }
});

test('policy consent modal inerts all background content and traps keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.USFRFirebase = {
      getState: () => ({ ready: true, user: { uid: 'consent-test-user' } }),
      open: () => {},
      call: async () => ({}),
      guideCall: async () => ({}),
    };
    window.dispatchEvent(new CustomEvent('usfr-firebase-ready'));
  });

  const gate = page.locator('#usfr-consent-gate');
  const dialog = gate.getByRole('dialog');
  await expect(gate).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/consent-open/);

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'late-background-control';
    button.textContent = 'Background control';
    document.body.append(button);
  });

  const unblockedBackground = await page.locator('body > :not(#usfr-consent-gate):not(script):not(noscript)').evaluateAll(elements => (
    elements.filter(element => !element.hasAttribute('inert')).map(element => element.id || element.tagName)
  ));
  expect(unblockedBackground).toEqual([]);

  const first = dialog.getByRole('link', { name: 'Privacy notice' });
  const last = dialog.getByRole('button', { name: 'Accept and enter my space' });
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();

  await page.evaluate(() => document.getElementById('late-background-control')?.focus());
  expect(await page.evaluate(() => document.getElementById('usfr-consent-gate')?.contains(document.activeElement))).toBe(true);

  const results = await new AxeBuilder({ page }).include('#usfr-consent-gate').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(severeViolations(results), JSON.stringify(severeViolations(results), null, 2)).toEqual([]);

  await page.evaluate(() => {
    localStorage.setItem('usfr-policy-consent:consent-test-user', '2026-07-31.1');
    window.dispatchEvent(new CustomEvent('usfr-policy-consent'));
  });
  await expect(gate).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/consent-open/);
  await expect(page.locator('#late-background-control')).not.toHaveAttribute('inert', '');
});
