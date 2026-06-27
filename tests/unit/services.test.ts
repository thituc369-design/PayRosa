import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- DB mock ------------------------------------------------------------
const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  updateReturning: vi.fn(),
  deleteResult: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  db: {
    query: {
      freelancers: { findFirst: (...a: unknown[]) => state.findFirst('freelancers', ...a) },
      freelancerInvoices: {
        findFirst: (...a: unknown[]) => state.findFirst('freelancerInvoices', ...a),
        findMany: (...a: unknown[]) => state.findMany('freelancerInvoices', ...a),
      },
      payouts: {
        findFirst: (...a: unknown[]) => state.findFirst('payouts', ...a),
        findMany: (...a: unknown[]) => state.findMany('payouts', ...a),
      },
    },
    insert: () => ({ values: () => ({ returning: () => state.insertReturning() }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => state.updateReturning() }) }),
    }),
    delete: () => ({ where: () => state.deleteResult() }),
  },
}));

// ---- Stellar mock -------------------------------------------------------
const stellar = vi.hoisted(() => ({
  inspectPayment: vi.fn(),
  submitSignedTx: vi.fn(),
}));

vi.mock('@/server/stellar/payment', async () => {
  const actual = await vi.importActual<typeof import('@/server/stellar/payment')>(
    '@/server/stellar/payment',
  );
  return {
    ...actual,
    inspectPayment: (...a: unknown[]) => stellar.inspectPayment(...a),
    submitSignedTx: (...a: unknown[]) => stellar.submitSignedTx(...a),
  };
});

// ---- Escrow contract mock ----------------------------------------------
const escrow = vi.hoisted(() => ({
  submitSigned: vi.fn(),
  getEscrowState: vi.fn(),
  releaseEscrow: vi.fn(),
  refundEscrow: vi.fn(),
}));

vi.mock('@/server/stellar/escrow', () => ({
  submitSigned: (...a: unknown[]) => escrow.submitSigned(...a),
  getEscrowState: (...a: unknown[]) => escrow.getEscrowState(...a),
  releaseEscrow: (...a: unknown[]) => escrow.releaseEscrow(...a),
  refundEscrow: (...a: unknown[]) => escrow.refundEscrow(...a),
}));

import { AppError } from '@/server/lib/http';
import { freelancerService } from '@/server/service/freelancer.service';
import { invoiceService } from '@/server/service/invoice.service';
import { payoutService } from '@/server/service/payout.service';

const FREELANCER = {
  id: 'fl-1',
  publicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  displayName: 'GDQP…W37',
  email: null,
  walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
};

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  for (const fn of Object.values(stellar)) fn.mockReset();
  for (const fn of Object.values(escrow)) fn.mockReset();
});

describe('freelancerService.getOrCreate', () => {
  it('returns existing freelancer when found', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    const result = await freelancerService.getOrCreate(
      FREELANCER.publicKey,
      'X',
      FREELANCER.walletAddress,
    );
    expect(result).toEqual(FREELANCER);
    expect(state.insertReturning).not.toHaveBeenCalled();
  });

  it('creates a new freelancer when not found', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    state.insertReturning.mockResolvedValueOnce([{ ...FREELANCER, id: 'new' }]);
    const result = await freelancerService.getOrCreate(
      FREELANCER.publicKey,
      'X',
      FREELANCER.walletAddress,
    );
    expect(result.id).toBe('new');
  });
});

describe('invoiceService.create', () => {
  it('creates an XLM invoice for a known freelancer', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    state.insertReturning.mockResolvedValueOnce([{ id: 'inv-1', asset: 'XLM' }]);
    const result = await invoiceService.create({
      publicKey: FREELANCER.publicKey,
      clientName: 'Acme Studio',
      description: 'Logo design',
      amount: '150',
      asset: 'XLM',
    });
    expect(result.id).toBe('inv-1');
  });

  it('throws NOT_FOUND when freelancer profile missing', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    await expect(
      invoiceService.create({
        publicKey: 'GABC',
        clientName: 'X',
        description: 'd',
        amount: '1',
        asset: 'XLM',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('invoiceService.settle', () => {
  const PENDING = {
    id: 'inv-1',
    status: 'pending',
    version: 0,
    asset: 'XLM',
    amount: '10',
    freelancerId: FREELANCER.id,
  };

  it('funds the escrow, releases the payout and marks the invoice paid', async () => {
    state.findFirst
      .mockResolvedValueOnce(PENDING) // invoice
      .mockResolvedValueOnce(FREELANCER); // freelancer
    escrow.submitSigned.mockResolvedValueOnce('DEPOSITHASH');
    escrow.getEscrowState.mockResolvedValueOnce({
      client: 'GPAYER',
      freelancer: FREELANCER.walletAddress,
      amount: 100000000n,
      status: 'Funded',
    });
    escrow.releaseEscrow.mockResolvedValueOnce('RELEASEHASH');
    state.updateReturning.mockResolvedValueOnce([
      { id: 'inv-1', status: 'paid', txHash: 'RELEASEHASH' },
    ]);

    const result = await invoiceService.settle('inv-1', 'SIGNED_DEPOSIT_XDR');
    expect(result.status).toBe('paid');
    expect(escrow.submitSigned).toHaveBeenCalledWith('SIGNED_DEPOSIT_XDR');
    expect(escrow.releaseEscrow).toHaveBeenCalledWith('inv-1');
  });

  it('is idempotent when already paid', async () => {
    const paid = { ...PENDING, status: 'paid' };
    state.findFirst.mockResolvedValueOnce(paid);
    const result = await invoiceService.settle('inv-1', 'SIGNED_XDR');
    expect(result).toEqual(paid);
    expect(escrow.submitSigned).not.toHaveBeenCalled();
  });

  it('rejects when the escrow beneficiary does not match', async () => {
    state.findFirst.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(FREELANCER);
    escrow.submitSigned.mockResolvedValueOnce('DEPOSITHASH');
    escrow.getEscrowState.mockResolvedValueOnce({
      client: 'GPAYER',
      freelancer: 'GSOMEONEELSE',
      amount: 100000000n,
      status: 'Funded',
    });
    await expect(invoiceService.settle('inv-1', 'X')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(escrow.releaseEscrow).not.toHaveBeenCalled();
  });

  it('rejects when the escrow was not funded', async () => {
    state.findFirst.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(FREELANCER);
    escrow.submitSigned.mockResolvedValueOnce('DEPOSITHASH');
    escrow.getEscrowState.mockResolvedValueOnce(null);
    await expect(invoiceService.settle('inv-1', 'X')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(escrow.releaseEscrow).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when invoice missing', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    await expect(invoiceService.settle('nope', 'X')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('invoiceService.list', () => {
  it('returns invoices for a freelancer', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    state.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    expect(await invoiceService.list(FREELANCER.publicKey)).toHaveLength(2);
  });

  it('returns empty array when freelancer missing', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    expect(await invoiceService.list('GABC')).toEqual([]);
  });
});

describe('payoutService.send', () => {
  it('submits an on-chain payout and records the hash', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    stellar.inspectPayment.mockReturnValueOnce({
      source: FREELANCER.walletAddress,
      destination: 'GDEST',
      assetCode: 'XLM',
      amount: '5',
    });
    stellar.submitSignedTx.mockResolvedValueOnce('POHASH');
    state.insertReturning.mockResolvedValueOnce([{ id: 'po-1', txHash: 'POHASH' }]);
    const result = await payoutService.send(FREELANCER.publicKey, 'SIGNED');
    expect(result.id).toBe('po-1');
  });

  it('rejects a payout that does not originate from the freelancer wallet', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    stellar.inspectPayment.mockReturnValueOnce({
      source: 'GSOMEONEELSE',
      destination: 'GDEST',
      assetCode: 'XLM',
      amount: '5',
    });
    await expect(payoutService.send(FREELANCER.publicKey, 'SIGNED')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('throws NOT_FOUND when freelancer missing', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    await expect(payoutService.send('GABC', 'X')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('payoutService.list', () => {
  it('returns payouts for a freelancer', async () => {
    state.findFirst.mockResolvedValueOnce(FREELANCER);
    state.findMany.mockResolvedValueOnce([{ id: 'po-1' }]);
    expect(await payoutService.list(FREELANCER.publicKey)).toHaveLength(1);
  });

  it('returns empty when freelancer missing', async () => {
    state.findFirst.mockResolvedValueOnce(undefined);
    expect(await payoutService.list('GABC')).toEqual([]);
  });
});

// AppError is the common error shape across services.
describe('AppError contract', () => {
  it('carries a code and status', () => {
    const e = new AppError('NOT_FOUND', 'x', 404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.status).toBe(404);
  });
});
