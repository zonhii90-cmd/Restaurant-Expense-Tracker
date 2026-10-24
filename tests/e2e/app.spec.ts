import { test, expect, type Page } from '@playwright/test';
import { today, type PurchaseLine, type DraftLine } from '../../src/domain';

const userId = '00000000-0000-4000-8000-000000000001';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'manager@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
const session = { access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const oil = { id: 'i1', name: 'Cooking Oil' };
const supplier = { id: 's1', name: 'ABC Trading' };
const initial: PurchaseLine[] = [
  { id: 'l1', purchase_id: 'p1', purchase_date: today(), invoice_number: 'INV-1', created_by: userId, supplier_id: supplier.id, supplier_name: supplier.name, item_id: oil.id, item_name: oil.name, quantity: 2, unit: 'tin', total_amount: 180, unit_price: 90 },
  { id: 'l2', purchase_id: 'p2', purchase_date: today(), invoice_number: 'INV-2', created_by: userId, supplier_id: supplier.id, supplier_name: supplier.name, item_id: oil.id, item_name: oil.name, quantity: 3, unit: 'tin', total_amount: 270, unit_price: 90 },
];
async function backend(page: Page, role: 'manager' | 'staff' = 'manager', loggedIn = true, extra: PurchaseLine[] = []) {
  const records = [...initial, ...extra];
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
    else if (url.pathname.endsWith('/purchase_history')) {
      const owner = url.searchParams.get('created_by')?.replace(/^eq\./, '');
      data = records.filter(line => (!owner || line.created_by === owner) && (role === 'manager' || line.created_by === userId));
    }
    else if ((url.pathname.endsWith('/restaurant_save_purchase') || url.pathname.endsWith('/restaurant_save_purchase_with_receipt'))) {
      const request = route.request().postDataJSON();
      calls.push(request);
      request.p_lines.forEach((line: Pick<DraftLine, 'name' | 'quantity' | 'unit' | 'amount'>, index: number) => records.push({
        ...initial[0], id: `${request.p_id}:${index}`, purchase_id: request.p_id,
        purchase_date: request.p_date, invoice_number: request.p_invoice, receipt_path: request.p_receipt_path ?? null,
        item_name: line.name, quantity: Number(line.quantity), unit: line.unit,
        item_id: line.name === oil.name ? oil.id : `item-${line.name}`,
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
  await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
  await page.getByRole('button', { name: 'Purchases', exact: true }).click();
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
  await page.getByRole('button', { name: 'Staff workspace', exact: true }).click();
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
  await page.getByRole('button', { name: 'Back to management', exact: true }).click();
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
  await page.goto('/#/staff/add');
  await expect(page.getByRole('heading', { name: 'Add a purchase.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monthly reports' })).toHaveCount(0);
  await page.getByRole('button', { name: 'My purchases', exact: true }).click();
  await expect(page.getByText('My purchases · MYR')).toBeVisible();
  const records = page.getByRole('list', { name: 'Purchase records' });
  await records.scrollIntoViewIfNeeded();
  await expect(records.getByText('RM 180.00', { exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Add purchase', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Save purchase', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

for (const width of [320, 360, 430]) {
  test(`phone ${width}px supports card reports and a persistent save action`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    const calls = await backend(page);
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
    await nav.getByRole('button', { name: 'Monthly reports' }).click();
    const totals = page.getByRole('list', { name: 'Item totals' });
    await expect(totals.getByText('5 tin', { exact: true })).toBeVisible();
    await expect(totals.getByText('RM 450.00', { exact: true })).toBeVisible();
    await totals.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/phone-report-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await totals.getByRole('button', { name: 'View purchases' }).click();
    await expect(page.getByRole('textbox', { name: 'Search items' })).toHaveValue('Cooking Oil');
    await expect(page.getByRole('list', { name: 'Purchase records' }).getByRole('listitem')).toHaveCount(2);
    await nav.getByRole('button', { name: 'Monthly reports' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole('button', { name: 'By supplier', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Supplier totals' }).getByText('ABC Trading')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh records', exact: true }).click();
    await expect(page.getByRole('button', { name: 'By supplier', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Staff workspace', exact: true }).click();
    await page.getByLabel('Supplier name').fill('ABC Trading');
    await page.getByLabel('Item 1 name').fill('Cooking Oil');
    await page.getByLabel('Item 1 quantity').fill('2');
    await page.getByLabel('Item 1 unit').selectOption('tin');
    await page.getByLabel('Item 1 amount').fill('180');
    await nav.getByRole('button', { name: 'Add purchase', exact: true }).click();
    expect(dialogs).toEqual([]);
    await expect(page.getByLabel('Item 1 name')).toHaveValue('Cooking Oil');
    await page.getByRole('button', { name: 'Add another item' }).click();
    await expect(page.getByLabel('Item 2 name')).toBeFocused();
    await page.getByLabel('Item 2 name').fill('Flour');
    await page.getByLabel('Item 2 quantity').fill('5');
    await page.getByLabel('Item 2 amount').fill('25');
    const save = page.getByRole('button', { name: 'Save purchase', exact: true });
    await expect(page.locator('.primary:visible')).toHaveCount(1);
    await expect(save).toHaveCSS('background-color', 'rgb(236, 102, 8)');
    await expect(save).toHaveCSS('color', 'rgb(17, 17, 17)');
    await expect(save).toBeInViewport();
    const saveBox = (await save.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(saveBox.height).toBeGreaterThanOrEqual(44);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(navBox.y);
    expect(Number(await page.getByLabel('Item 2 name').evaluate(el => getComputedStyle(el).fontSize.replace('px', '')))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/phone-entry-${width}.png`, fullPage: true });
    await page.screenshot({ path: `test-results/phone-entry-viewport-${width}.png` });
    await save.click();
    await expect(page.getByRole('status')).toContainText('Purchase saved');
    expect(calls).toHaveLength(1);
    expect(calls[0].p_lines).toHaveLength(2);
    await page.getByRole('button', { name: 'Add another', exact: true }).click();
    await expect(page.getByLabel('Supplier name')).toHaveValue('');
  });
}

test('login form sends credentials and opens authenticated workspace', async ({ page }) => {
  await backend(page, 'manager', false);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
});

test('failed save keeps input and retries the same invoice ID', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
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
  await page.goto('/#/staff/add');
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

test('small-phone sign-in fits the screen and uses readable input text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await backend(page, 'manager', false);
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const email = page.getByLabel('Email', { exact: true });
  expect(await email.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await email.fill('manager@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
});


test('staff purchase form has one primary action and optional details', async ({ page }) => {
  await backend(page);
  await page.goto('/#/staff/add');
  await expect(page.getByRole('heading', { name: 'Add a purchase.' })).toBeVisible();
  await expect(page.locator('.entry-assurance')).toContainText('Approved restaurant accounts only');
  await expect(page.locator('.primary:visible')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save purchase', exact: true })).toHaveCSS('background-color', 'rgb(236, 102, 8)');
  await expect(page.getByLabel('Invoice number')).not.toBeVisible();
  await page.getByText('Invoice number & notes', { exact: false }).click();
  await page.getByLabel('Invoice number').fill('INV-2026-TEST');
  await page.getByLabel('Notes', { exact: true }).fill('Delivered in the morning');
  await expect(page.getByLabel('Invoice number')).toHaveValue('INV-2026-TEST');
  await page.getByLabel('Notes', { exact: true }).blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/form-focused-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.primary:visible')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save purchase', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/form-focused-phone.png' });
});


const receiptPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64');
const receiptFile = { name: 'invoice.png', mimeType: 'image/png', buffer: receiptPng };
async function fillPurchase(page: Page) {
  await page.getByLabel('Supplier name').fill('ABC Trading');
  await page.getByLabel('Item 1 name').fill('Cooking Oil');
  await page.getByLabel('Item 1 quantity').fill('2');
  await page.getByLabel('Item 1 amount').fill('180');
}
async function mockStorage(page: Page, failFirst = false, conflictOnRetry = false) {
  const uploads: string[] = [];
  const signs: string[] = [];
  await page.route('**/storage/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/object/sign/')) {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON().expiresIn).toBe(300);
        signs.push(path);
        await route.fulfill({ json: { signedURL: path.replace('/storage/v1', '') + '?token=test-only' } });
      } else await route.fulfill({ contentType: 'image/png', body: receiptPng });
    } else {
      uploads.push(path);
      expect(route.request().headers()['x-upsert']).toBe('false');
      expect(route.request().postDataBuffer()?.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBeTruthy();
      if (failFirst && uploads.length === 1) await route.fulfill({ status: 500, json: { statusCode: '500', error: 'upload failed', message: 'unavailable' } });
      else if (conflictOnRetry) await route.fulfill({ status: 409, json: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } });
      else await route.fulfill({ json: { Key: path } });
    }
  });
  return { uploads, signs };
}

for (const width of [320, 390]) {
  test(`receipt photo at ${width}px can be selected, saved and viewed from history`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const calls = await backend(page);
    const { uploads, signs } = await mockStorage(page);
    await page.goto('/#/staff/add');
    await fillPurchase(page);
    await expect(page.getByLabel('Take receipt photo')).toHaveAttribute('capture', 'environment');
    await expect(page.getByLabel('Choose receipt photo')).not.toHaveAttribute('capture');
    await page.getByLabel('Choose receipt photo').setInputFiles(receiptFile);
    await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
    await page.getByRole('heading', { name: 'Receipt photo optional' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await expect(page.locator('.primary:visible')).toHaveCount(1);
    await page.screenshot({ path: `test-results/receipt-entry-${width}.png` });
    await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Purchase saved');
    expect(uploads).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].p_receipt_path).toMatch(new RegExp(`^${userId}/${calls[0].p_id}/[0-9a-f-]{36}\\.jpg$`));
    await page.getByRole('button', { name: 'View receipt for Cooking Oil', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Receipt photo' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: /^Receipt from / })).toBeVisible();
    await expect(dialog.getByRole('img', { name: /^Receipt from / })).toHaveJSProperty('naturalWidth', 1);
    expect(signs).toHaveLength(1);
    await expect(dialog.getByRole('button', { name: 'Close receipt' })).toBeFocused();
    await page.screenshot({ path: `test-results/receipt-view-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('failed receipt upload preserves the photo and fields and does not submit a purchase', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  const calls = await backend(page);
  const { uploads } = await mockStorage(page, true, true);
  await page.goto('/#/staff/add');
  await fillPurchase(page);
  await page.getByLabel('Take receipt photo').setInputFiles(receiptFile);
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your purchase has not been submitted');
  expect(calls).toHaveLength(0);
  await expect(page.getByLabel('Supplier name')).toHaveValue('ABC Trading');
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  expect(calls).toHaveLength(1);
  expect(uploads).toHaveLength(2);
  expect(uploads[0]).toBe(uploads[1]);
});

test('retry after invoice failure reuses the uploaded photo and stable invoice ID', async ({ page }) => {
  const calls = await backend(page);
  const { uploads } = await mockStorage(page);
  let first: Record<string, any> | null = null;
  await page.route('**/rest/v1/rpc/restaurant_save_purchase_with_receipt', async route => {
    const payload = route.request().postDataJSON();
    if (!first) {
      first = payload;
      await route.fulfill({ status: 503, json: { message: 'unavailable' } });
    } else {
      expect(payload).toEqual(first);
      await route.fallback();
    }
  });
  await page.goto('/#/staff/add');
  await fillPurchase(page);
  await page.getByLabel('Choose receipt photo').setInputFiles(receiptFile);
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  expect(uploads).toHaveLength(1);
  expect(calls).toHaveLength(1);
});

test('invalid photos preserve the selection and removal saves an invoice without a photo', async ({ page }) => {
  const calls = await backend(page);
  const { uploads } = await mockStorage(page);
  await page.goto('/#/staff/add');
  await fillPurchase(page);
  await page.getByLabel('Choose receipt photo').setInputFiles(receiptFile);
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByLabel('Choose receipt photo').setInputFiles({ name: 'not-photo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPG');
  await expect(page.getByAltText('Receipt photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByAltText('Receipt photo preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  expect(uploads).toHaveLength(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]).not.toHaveProperty('p_receipt_path');
});

const flourLine: PurchaseLine = { ...initial[1], id: 'l3', item_id: 'i2', item_name: 'Flour', quantity: 5, unit: 'kg', total_amount: 25, unit_price: 5 };
for (const width of [320, 390, 1280]) {
  test(`management ${width}px supports supplier drill-down and complete invoice details`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await backend(page, 'manager', true, [flourLine]);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
    await expect(page.locator('.management-shell')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Purchase summary' }).getByText('RM 475.00', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Top items' }).getByText('Flour', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/management-dashboard-${width}.png`, fullPage: true });
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('button', { name: 'View purchases', exact: true }).click();
    await expect(page.getByLabel('Filter suppliers')).toHaveValue('s1');
    await page.getByRole('textbox', { name: 'Search items' }).fill('Flour');
    await page.getByRole('button', { name: 'View purchase', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Purchase details' });
    await expect(details).toBeVisible();
    await expect(details.getByRole('list', { name: 'Invoice items' }).getByRole('listitem')).toHaveCount(2);
    await expect(details.getByText('Cooking Oil', { exact: true })).toBeVisible();
    await expect(details.getByText('Flour', { exact: true })).toBeVisible();
    await expect(details.getByText('RM 295.00', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/management-purchase-${width}.png` });
    await details.getByRole('button', { name: 'Close purchase details' }).click();
    await expect(details).toHaveCount(0);
    await nav.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Purchase summary' }).getByText('RM 475.00', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
}

test('management sees all records while staff workspace requests only the current account records', async ({ page }) => {
  const other = { ...flourLine, id: 'other-line', purchase_id: 'p3', created_by: '00000000-0000-4000-8000-000000000002' };
  const queries: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.endsWith('/purchase_history')) queries.push(url.searchParams.get('created_by') || 'all'); });
  await backend(page, 'manager', true, [other]);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Purchase summary' }).getByText('RM 475.00', { exact: true })).toBeVisible();
  expect(queries.at(-1)).toBe('all');
  await page.getByRole('button', { name: 'Staff workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a purchase.' })).toBeVisible();
  await expect(page.locator('.staff-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monthly reports' })).toHaveCount(0);
  await page.getByRole('button', { name: 'My purchases', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Purchase summary' }).getByText('RM 450.00', { exact: true })).toBeVisible();
  expect(queries.at(-1)).toBe(`eq.${userId}`);
  await expect(page.getByRole('table').getByText('Flour')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to management', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Purchase summary' }).getByText('RM 475.00', { exact: true })).toBeVisible();
  expect(queries.at(-1)).toBe('all');
});

test('staff cannot open management URLs', async ({ page }) => {
  await backend(page, 'staff');
  await page.goto('/#/management/reports');
  await expect(page.getByRole('heading', { name: 'Add a purchase.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to management' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/staff\/add$/);
});

test('switching workspaces or changing the address preserves an unsaved purchase until confirmed', async ({ page }) => {
  await backend(page);
  await page.goto('/#/staff/add');
  await page.getByLabel('Supplier name').fill('Draft supplier');
  let allow = false;
  const confirmations: string[] = [];
  page.on('dialog', async dialog => { confirmations.push(dialog.message()); if (allow) await dialog.accept(); else await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Back to management', exact: true }).click();
  await expect(page.getByLabel('Supplier name')).toHaveValue('Draft supplier');
  await page.evaluate(() => { window.location.hash = '#/management/dashboard'; });
  await expect(page).toHaveURL(/#\/staff\/add$/);
  await expect(page.getByLabel('Supplier name')).toHaveValue('Draft supplier');
  expect(confirmations).toHaveLength(2);
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  expect(confirmations).toHaveLength(2);
  allow = true;
  await page.getByRole('button', { name: 'Back to management', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
});

test('a receipt opened from complete purchase details closes back to the invoice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page);
  await mockStorage(page);
  const path = `${userId}/p2/receipt.jpg`;
  await page.route('**/rest/v1/purchase_history*', route => route.fulfill({ json: [initial[0], { ...initial[1], receipt_path: path }, { ...flourLine, receipt_path: path }] }));
  await page.goto('/#/management/purchases');
  await page.getByRole('textbox', { name: 'Search items' }).fill('Flour');
  await page.getByRole('button', { name: 'View purchase', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Purchase details' });
  await details.getByRole('button', { name: 'View receipt', exact: true }).click();
  const photo = page.getByRole('dialog', { name: 'Receipt photo' });
  await expect(photo.getByRole('img', { name: /^Receipt from / })).toHaveJSProperty('naturalWidth', 1);
  await photo.getByRole('button', { name: 'Close receipt' }).click();
  await expect(photo).toHaveCount(0);
  await expect(details).toBeVisible();
  await expect(details.getByRole('list', { name: 'Invoice items' }).getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
});

const staffAccountId='00000000-0000-4000-8000-000000000002';
async function accountBackend(page:Page){
 const accounts=[{user_id:userId,email:'manager@example.test',display_name:'Manager',role:'manager',active:true,created_at:new Date().toISOString(),last_sign_in_at:null},{user_id:staffAccountId,email:'cook@example.test',display_name:'Kitchen staff',role:'staff',active:true,created_at:new Date().toISOString(),last_sign_in_at:new Date(`${today()}T06:00:00Z`).toISOString()}];
 const operations:Record<string,any>[]=[];
 await page.route('**/rest/v1/rpc/restaurant_staff_directory*',route=>route.fulfill({json:accounts}));
 await page.route('**/rest/v1/rpc/restaurant_set_staff_active',async route=>{const payload=route.request().postDataJSON();operations.push(payload);const target=accounts.find(a=>a.user_id===payload.p_user_id)!;target.active=payload.p_active;await route.fulfill({json:null});});
 await page.route('**/functions/v1/staff-admin',async route=>{
  const payload=route.request().postDataJSON();operations.push(payload);
  expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
  if(payload.action==='create_staff')accounts.push({user_id:'00000000-0000-4000-8000-000000000003',email:payload.email,display_name:payload.display_name,role:'staff',active:true,created_at:new Date().toISOString(),last_sign_in_at:null});
  await route.fulfill({json:{ok:true}});
 });
 await page.route('**/rest/v1/restaurant_login_history*',async route=>{
  const url=new URL(route.request().url());const who=url.searchParams.get('user_id')?.replace('eq.','');
  const data=[{id:'login-1',user_id:staffAccountId,email:'cook@example.test',display_name:'Kitchen staff',role_at_login:'staff',access_granted:true,signed_in_at:`${today()}T06:00:00Z`},{id:'login-2',user_id:userId,email:'manager@example.test',display_name:'Manager',role_at_login:'manager',access_granted:true,signed_in_at:`${today()}T05:00:00Z`}].filter(row=>!who||row.user_id===who);
  expect(url.searchParams.get('signed_in_at')).toContain('+08:00');
  await route.fulfill({json:data,headers:{'Content-Range':`0-${data.length-1}/${data.length}`,'Access-Control-Expose-Headers':'Content-Range'}});
 });
 return {accounts,operations};
}
for(const width of [320,1280]){
 test(`manager ${width}px can create staff, reset a password, deactivate and inspect login records`,async({page})=>{
  await page.setViewportSize({width,height:900});await backend(page);const {operations}=await accountBackend(page);
  await page.goto('/#/management/staff');
  await expect(page.getByRole('heading',{name:'Staff accounts.'})).toBeVisible();
  await page.getByLabel('Account status').selectOption('inactive');
  await page.getByRole('button',{name:'Add staff',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Create staff account'});
  await form.getByLabel('Staff name').fill('New staff');await form.getByLabel('Staff email').fill('new@example.test');await form.getByLabel('Initial password').fill('test-password-12345');
  await form.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Staff account created');
  await expect(form).toHaveCount(0);await expect(page.getByLabel('Account status')).toHaveValue('all');expect(operations[0].action).toBe('create_staff');expect(operations[0]).not.toHaveProperty('role');
  await page.getByRole('button',{name:'Reset password for new@example.test',exact:true}).click();
  const reset=page.getByRole('dialog',{name:'Reset staff password'});await reset.getByLabel('New password').fill('replacement-password-123');await reset.getByRole('button',{name:'Save new password'}).click();
  await expect(page.getByRole('status')).toContainText('Staff password updated');expect(operations[1].action).toBe('reset_password');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Deactivate new@example.test',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('deactivated');expect(operations[2].p_active).toBe(false);
  await page.getByLabel('Account status').selectOption('inactive');
  await expect(page.getByRole('button',{name:'Activate new@example.test',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`test-results/staff-accounts-${width}.png`,fullPage:true});
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await nav.getByRole('button',{name:'Login history',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Login history.'})).toBeVisible();
  await page.getByLabel('Account',{exact:true}).selectOption(staffAccountId);
  const records=width<741?page.getByRole('list',{name:'Login records'}):page.getByRole('table');
  await expect(records.getByText('Kitchen staff',{exact:true})).toBeVisible();await expect(records.getByText(/14:00:00/)).toBeVisible();
  await expect(page.getByText('1 sign-in',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/login-history-${width}.png`,fullPage:true});
 });
}
test('account setup errors do not pretend there are no accounts or sign-ins',async({page})=>{
 await backend(page);await page.route('**/rest/v1/rpc/restaurant_staff_directory*',route=>route.fulfill({status:404,json:{code:'PGRST202',message:'missing function'}}));
 await page.goto('/#/management/staff');await expect(page.getByRole('alert')).toContainText('not ready');await expect(page.getByRole('button',{name:'Add staff',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Login history',exact:true}).click();await expect(page.getByRole('alert')).toContainText('not ready');await expect(page.getByText('No sign-ins in this period',{exact:true})).toHaveCount(0);
});
test('staff links cannot open account administration or login history, and deactivation locks an existing workspace',async({page})=>{
 await backend(page,'staff');
 await page.goto('/#/management/staff');await expect(page.getByRole('heading',{name:'Add a purchase.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Staff accounts',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{location.hash='#/management/logins';});await expect(page).toHaveURL(/#\/staff\/add$/);
 await expect(page.getByRole('heading',{name:'Add a purchase.'})).toBeVisible();
 await page.route('**/rest/v1/restaurant_members*',route=>route.fulfill({json:{active:false,role:'staff'}}));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Waiting for account approval'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save purchase',exact:true})).toHaveCount(0);
});


test('an undeployed account function preserves entered fields and never reports a created account',async({page})=>{
 await backend(page);const {accounts}=await accountBackend(page);
 await page.route('**/functions/v1/staff-admin',route=>route.fulfill({status:404,json:{code:'NOT_FOUND',message:'Function not found'}}));
 await page.goto('/#/management/staff');await page.getByRole('button',{name:'Add staff',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Create staff account'});
 await form.getByLabel('Staff name').fill('Pending staff');await form.getByLabel('Staff email').fill('pending@example.test');await form.getByLabel('Initial password').fill('test-password-12345');
 await form.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('not ready');await expect(form.getByLabel('Staff email')).toHaveValue('pending@example.test');
 expect(accounts).toHaveLength(2);await expect(page.getByRole('status')).toHaveCount(0);
 await form.getByRole('button',{name:'Close account form'}).click();await expect(form).toHaveCount(0);
});
