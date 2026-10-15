import { test, expect, type Page } from '@playwright/test';
import { today } from '../../src/domain';

const userId = '00000000-0000-4000-8000-000000000001';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'manager@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
const session = { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const oil = { id: 'i1', name: 'Cooking Oil' };
const supplier = { id: 's1', name: 'ABC Trading' };
const initial = [
  { id: 'l1', purchase_id: 'p1', purchase_date: today(), invoice_number: 'INV-1', created_by: userId, supplier_id: supplier.id, supplier_name: supplier.name, item_id: oil.id, item_name: oil.name, quantity: 2, unit: 'tin', total_amount: 180, unit_price: 90 },
  { id: 'l2', purchase_id: 'p2', purchase_date: today(), invoice_number: 'INV-2', created_by: userId, supplier_id: supplier.id, supplier_name: supplier.name, item_id: oil.id, item_name: oil.name, quantity: 3, unit: 'tin', total_amount: 270, unit_price: 90 },
];
async function backend(page: Page, role: 'manager' | 'staff' = 'manager', loggedIn = true) {
  const records = [...initial];
  const calls: Record<string, any>[] = [];
  if (loggedIn) await page.addInitScript(value => localStorage.setItem('sb-restaurant-test-auth-token', JSON.stringify(value)), session);
  await page.route('https://restaurant-test.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/token')) data = session;
    else if (url.pathname.endsWith('/user')) data = user;
    else if (url.pathname.endsWith('/restaurant_members')) data = { active: true, role };
    else if (url.pathname.endsWith('/items')) data = [oil];
    else if (url.pathname.endsWith('/suppliers')) data = [supplier];
    else if (url.pathname.endsWith('/purchase_history')) data = records;
    else if (url.pathname.endsWith('/restaurant_save_purchase')) {
      const request = route.request().postDataJSON();
      calls.push(request);
      request.p_lines.forEach((line: Record<string, string>, index: number) => records.push({
        ...initial[0], id: `${request.p_id}:${index}`, purchase_id: request.p_id,
        purchase_date: request.p_date, invoice_number: request.p_invoice,
        item_name: line.name, quantity: Number(line.quantity), unit: line.unit,
        total_amount: Number(line.amount), unit_price: Number(line.amount) / Number(line.quantity),
      }));
      data = request.p_id;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return calls;
}

test('manager can search, summarize, export an Excel file, and save a multi-item invoice', async ({ page }) => {
  const calls = await backend(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Purchase overview.' })).toBeVisible();
  await expect(page.getByText('RM 450.00', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/manager-overview.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Search items' }).fill('cooking oil');
  await expect(page.getByRole('table').getByText('Cooking Oil')).toHaveCount(2);
  await page.getByRole('button', { name: 'Monthly reports' }).click();
  const oilRow = page.getByRole('row').filter({ hasText: 'Cooking Oil' });
  await expect(oilRow.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(oilRow.getByRole('cell', { name: '450.00', exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Excel' }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/^restaurant-purchases-.*\.xlsx$/);
  await page.getByRole('button', { name: 'Add purchase', exact: true }).first().click();
  await page.getByLabel('Supplier name').fill('ABC Trading');
  await page.getByLabel('Item 1 name').fill('Cooking Oil');
  await page.getByLabel('Item 1 quantity').fill('2');
  await page.getByLabel('Item 1 unit').selectOption('tin');
  await page.getByLabel('Item 1 amount').fill('180');
  await page.getByRole('button', { name: 'Add another item' }).click();
  await page.getByLabel('Item 2 name').fill('Flour');
  await page.getByLabel('Item 2 quantity').fill('5');
  await page.getByLabel('Item 2 amount').fill('25');
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  expect(calls).toHaveLength(1);
  expect(calls[0].p_lines).toHaveLength(2);
  expect(calls[0].p_supplier).toBe('ABC Trading');
  await expect(page.getByRole('table').getByText('Flour')).toBeVisible();
  await expect(page.getByText('RM 655.00', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: 'Monthly reports' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/manager-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile staff can enter purchases without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page, 'staff');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Purchase overview.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monthly reports' })).toHaveCount(0);
  await expect(page.getByText('My purchases · MYR')).toBeVisible();
  await page.getByRole('table').scrollIntoViewIfNeeded();
  await expect(page.getByRole('cell', { name: '180.00', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Add purchase', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Save purchase', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('login form sends credentials and opens authenticated workspace', async ({ page }) => {
  await backend(page, 'manager', false);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchase overview.' })).toBeVisible();
});

test('failed save keeps input and retries the same invoice ID', async ({ page }) => {
  const calls = await backend(page);
  let firstId = '';
  await page.route('**/rest/v1/rpc/restaurant_save_purchase', async route => {
    const request = route.request().postDataJSON();
    if (!firstId) {
      firstId = request.p_id;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) });
    } else {
      expect(request.p_id).toBe(firstId);
      await route.fallback();
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).first().click();
  await page.getByLabel('Supplier name').fill('ABC Trading');
  await page.getByLabel('Item 1 name').fill('Cooking Oil');
  await page.getByLabel('Item 1 quantity').fill('2');
  await page.getByLabel('Item 1 amount').fill('180');
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Item 1 name')).toHaveValue('Cooking Oil');
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  expect(calls).toHaveLength(1);
});
