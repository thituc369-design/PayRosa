import { describe, expect, it } from 'vitest';
import { buildSep7Uri, formatAmount } from '@/server/service/invoice.service';

describe('formatAmount', () => {
  it('trims trailing zeros', () => {
    expect(formatAmount('12.500')).toBe('12.5');
  });

  it('leaves whole numbers untouched', () => {
    expect(formatAmount('100')).toBe('100');
  });

  it('drops a bare trailing dot', () => {
    expect(formatAmount('5.0')).toBe('5');
  });

  it('keeps significant decimals', () => {
    expect(formatAmount('1.2345')).toBe('1.2345');
  });
});

describe('buildSep7Uri', () => {
  const dest = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

  it('builds a native (XLM) URI without asset params', () => {
    const uri = buildSep7Uri({ destination: dest, amount: '10.5', asset: 'XLM', memo: 'Job001' });
    expect(uri).toMatch(/^web\+stellar:pay/);
    expect(uri).toContain(`destination=${dest}`);
    expect(uri).toContain('amount=10.5');
    expect(uri).not.toContain('asset_code');
    expect(uri).toContain('memo=Job001');
    expect(uri).toContain('memo_type=text');
  });

  it('includes USDC asset params for USDC invoices', () => {
    const uri = buildSep7Uri({ destination: dest, amount: '200', asset: 'USDC', memo: 'Job002' });
    expect(uri).toContain('asset_code=USDC');
    expect(uri).toContain('asset_issuer=');
  });

  it('url-encodes the memo', () => {
    const uri = buildSep7Uri({ destination: dest, amount: '1', asset: 'XLM', memo: 'Acme Studio' });
    expect(uri).toContain('memo=Acme%20Studio');
  });
});
