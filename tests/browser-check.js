import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:3000');
  await page.getByText('Product catalogue', { exact: true }).waitFor();
  await page.getByText('4,900', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Quantity for Soap', { exact: true }).isDisabled(), true);
  await page.screenshot({ path: 'screenshots/catalogue.png', fullPage: true });
  await page.getByLabel('Quantity for Premium Rice', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Order placed: Confirmed' }).waitFor();
  await page.getByText('5,021', { exact: true }).waitFor();
  await page.getByText('Gold', { exact: true }).waitFor();
  await page.screenshot({ path: 'screenshots/order-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Order is now Cancelled' }).waitFor();
  await page.getByText('4,900', { exact: true }).waitFor();

  await page.getByLabel('Acting as', { exact: true }).selectOption({ label: 'Bronze Distributors' });
  await page.getByText('Bronze', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByLabel('Quantity for Premium Rice', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Order placed: PendingApproval' }).waitFor();
  await page.getByLabel('Acting as', { exact: true }).selectOption({ label: 'Sales Manager' });
  await page.getByRole('button', { name: 'Approval queue (1)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Approval queue (1)', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor();
  await page.screenshot({ path: 'screenshots/approval.png', fullPage: true });

  // Leave the demo with original points and available stock.
  await page.getByLabel('Acting as', { exact: true }).selectOption({ label: 'Bronze Distributors' });
  await page.getByText('Bronze', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'My orders', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Order is now Cancelled' }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.screenshot({ path: 'screenshots/mobile.png', fullPage: true });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(horizontalOverflow, false);
  assert.deepEqual(errors, []);
  console.log('PASS: browser worked example, tier upgrade, cancellation, manager queue and mobile layout.');
} finally { await browser.close(); }
