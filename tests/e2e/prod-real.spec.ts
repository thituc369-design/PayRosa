import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';
import {
  approveOnce,
  cleanup,
  launchWithFreighter,
  onboardFreighter,
} from '../../../../../shared/freighter/freighter-fixture';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://payrosa.vercel.app';
const SHOTS = path.resolve(__dirname, '../../../screen-shot');
mkdirSync(SHOTS, { recursive: true });

const result = {
  project: '006',
  appname: 'payrosa',
  url: BASE_URL,
  fixtureImported: true,
  stubRemoved: true,
  connectPopupApproved: false,
  coreActionApproved: false,
  txHash: null as string | null,
  shots: [] as string[],
  steps: [] as string[],
};

function shot(name: string): string {
  const p = path.join(SHOTS, name);
  result.shots.push(p);
  return p;
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: shot(name), type: 'jpeg', quality: 85 });
}

let context: BrowserContext;
let userDataDir: string;
let extensionId: string;

test.beforeAll(async () => {
  const launched = await launchWithFreighter(chromium);
  context = launched.context;
  userDataDir = launched.userDataDir;
  extensionId = launched.extensionId;
  await onboardFreighter(context);
});

test.afterAll(async () => {
  writeFileSync(path.join(SHOTS, 'result.json'), JSON.stringify(result, null, 2));
  if (context) await cleanup(context, userDataDir);
});

const APPROVE_TESTIDS = [
  'grant-access-connect-button',
  'grant-access-connect-anyway-button',
  'sign-transaction-sign',
  'sign-auth-entry-approve-button',
  'sign-message-approve-button',
];

async function pageHasApproveButton(page: Page): Promise<boolean> {
  for (const tid of APPROVE_TESTIDS) {
    const loc = page.locator(`[data-testid=${tid}]`);
    if ((await loc.count().catch(() => 0)) > 0 && (await loc.first().isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}

async function waitForApprovalPopup(timeout = 45_000): Promise<Page | null> {
  const prefix = `chrome-extension://${extensionId}`;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const p of context.pages()) {
      if (p.isClosed()) continue;
      if (!p.url().startsWith(prefix)) continue;
      if (await pageHasApproveButton(p)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function captureFreighterPopup(name: string): Promise<void> {
  const popup = await waitForApprovalPopup();
  if (!popup) return;
  await popup.screenshot({ path: shot(name), type: 'jpeg', quality: 85 }).catch(() => {});
}

async function realConnectAndAuthenticate(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/connect`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const connectBtn = page.getByTestId('connect-wallet');
  await expect(connectBtn).toBeEnabled({ timeout: 20_000 });
  await connectBtn.click();

  await captureFreighterPopup('02-connect-popup.jpg');
  await approveOnce(context, { timeout: 60_000 });
  result.connectPopupApproved = true;
  result.steps.push('grant popup approved');

  await captureFreighterPopup('03-approve.jpg');
  await approveOnce(context, { timeout: 60_000 });
  result.steps.push('SEP-10 challenge sign popup approved');

  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function assertConnectedChip(page: Page): Promise<void> {
  const chip = page.getByTestId('account-chip');
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const chipText = (await chip.textContent())?.trim() ?? '';
  expect(chipText).toContain('GBL5');
  expect(chipText).toContain('IE47');
  result.steps.push(`connected chip "${chipText}"`);
}

async function createXlmInvoice(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/dashboard/invoices/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const xlmBtn = page.getByTestId('asset-XLM');
  await expect(xlmBtn).toBeVisible({ timeout: 20_000 });
  await xlmBtn.click();
  await page.locator('input').first().fill('Acme Studio');
  await page.locator('textarea').fill('Brand identity sprint — milestone 1');
  await page.locator('input[inputmode="decimal"]').fill('1');
  await capture(page, '05-new-invoice.jpg');

  const createBtn = page.getByRole('button', { name: /create invoice/i });
  await expect(async () => {
    await createBtn.click();
    await page.waitForURL(/\/dashboard\/invoices\/[0-9a-f-]{36}/, { timeout: 8_000 });
  }).toPass({ timeout: 45_000 });

  const invoiceId = page.url().split('/').pop()!.split('?')[0];
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.getByText('Share this invoice')).toBeVisible({ timeout: 20_000 });
  result.steps.push(`invoice created ${invoiceId}`);
  return invoiceId;
}

function trackPayTxHash(page: Page, invoiceId: string): void {
  page.on('response', async (r) => {
    if (
      new URL(r.url()).pathname !== `/api/invoices/${invoiceId}/pay` ||
      r.request().method() !== 'POST'
    ) {
      return;
    }
    try {
      const json = JSON.parse(await r.text());
      const hash = json?.data?.txHash ?? json?.txHash ?? null;
      if (hash) result.txHash = hash;
    } catch {
      return;
    }
  });
}

async function waitForPayOutcome(page: Page): Promise<'paid' | 'error'> {
  const success = page.getByTestId('pay-success');
  const failure = page.getByTestId('pay-error');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await success.isVisible().catch(() => false)) return 'paid';
    if (await failure.isVisible().catch(() => false)) return 'error';
    await page.waitForTimeout(500);
  }
  return 'error';
}

async function payInvoiceOnChain(page: Page, invoiceId: string): Promise<void> {
  trackPayTxHash(page, invoiceId);
  await page.goto(`${BASE_URL}/pay/${invoiceId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const payBtn = page.getByTestId('pay-button');
  let outcome: 'paid' | 'error' = 'error';
  for (let attempt = 1; attempt <= 4 && outcome !== 'paid'; attempt++) {
    await expect(payBtn).toBeVisible({ timeout: 20_000 });
    await payBtn.click();
    if (attempt === 1) await captureFreighterPopup('06-pay-popup.jpg');
    await approveOnce(context, { timeout: 90_000 });
    result.coreActionApproved = true;
    outcome = await waitForPayOutcome(page);
    result.steps.push(`pay attempt ${attempt}: ${outcome}`);
    if (outcome === 'error') await page.waitForTimeout(2500);
  }

  await expect(page.getByTestId('pay-success')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await capture(page, '07-pay-success.jpg');

  expect(result.txHash).toBeTruthy();
  const explorer = page.getByRole('link', { name: /view transaction/i });
  await expect(explorer.first()).toHaveAttribute(
    'href',
    new RegExp(`stellar\\.expert/explorer/testnet/tx/${result.txHash}`),
  );
  result.steps.push(`paid on-chain txHash=${result.txHash}`);
}

test.describe.configure({ mode: 'serial' });

test('real Freighter: connect popup + SEP-10 + on-chain invoice payout', async () => {
  test.setTimeout(300_000);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await capture(page, '01-landing.jpg');

  await realConnectAndAuthenticate(page);
  await assertConnectedChip(page);
  await capture(page, '04-dashboard.jpg');

  const invoiceId = await createXlmInvoice(page);
  await payInvoiceOnChain(page, invoiceId);

  await page.goto(`${BASE_URL}/stats`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  await capture(page, '08-stats.jpg');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await capture(page, '09-mobile.jpg');

  expect(result.connectPopupApproved).toBe(true);
  expect(result.coreActionApproved).toBe(true);
  expect(result.txHash).toBeTruthy();
});
