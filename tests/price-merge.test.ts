import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { numberToGerman, apiKey } from '@/utils/helper';
import { accountPositionKey } from '@/utils/account-utils';
import { mainListMergeChanges, mainListSetField, mainListWriteChanges, calculateLatestMainListData, getPriceData } from '@/utils/price-data-utils';

const row = (extra: any = {}) => ({
  broker: 'flatex', account_id: '90000001', deposite_number: '90000001', type: 'certificate',
  isin: 'DE000X', wkn: 'X', stock_name: 'Product X', ...extra,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('mainListMergeChanges', () => {
  it('applies only the fields a pass changed onto the fresh read', () => {
    const before = [row({ bid: 1, notes: '' })];
    const after = [row({ bid: 2, notes: '' })];
    const fresh = [row({ bid: 1, notes: 'saved meanwhile' })];
    expect(mainListMergeChanges(before, after, fresh)).toEqual([row({ bid: 2, notes: 'saved meanwhile' })]);
  });

  it('keeps fresh rows the pass never saw and drops nothing', () => {
    const fresh = [row({ bid: 1 }), row({ wkn: 'Y', isin: 'DE000Y' })];
    const merged = mainListMergeChanges([row({ bid: 1 })], [row({ bid: 3 })], fresh);
    expect(merged).toHaveLength(2);
    expect(merged[0].bid).toBe(3);
    expect(merged[1]).toBe(fresh[1]);
  });
});

describe('MAIN_LIST writers', () => {
  it('a note saved during a price pass survives the pass write', async () => {
    const before = [row({ bid: 1 })];
    await storage.setItem('local:MAIN_LIST', before);
    await mainListSetField(accountPositionKey(row()), 'notes', 'n');
    await mainListWriteChanges(before, [row({ bid: 5 })]);
    const final: any = await storage.getItem('local:MAIN_LIST');
    expect(final[0]).toMatchObject({ bid: 5, notes: 'n' });
  });
});

describe('zero guards', () => {
  it('numberToGerman renders nothing for non-finite values', () => {
    expect(numberToGerman(Infinity)).toBe('');
    expect(numberToGerman(-Infinity)).toBe('');
    expect(numberToGerman(1.5)).not.toBe('');
  });

  it('a zero entry value or total gives 0, never Infinity or "NaN"', async () => {
    await storage.setItem('local:KONTO_FLATEX', [row({ bid: 0, stocks_owned: 10, total_entry_value: 0 })]);
    await calculateLatestMainListData();
    const [item]: any = await storage.getItem('local:MAIN_LIST');
    expect(item.profit_loss_percentage).toBe(0);
    expect(item.profit_loss_target_pa).toBe(0);
    expect(item.position_percentage).toBe('0.00');
  });
});

describe('getPriceData', () => {
  afterEach(() => {
    apiKey.value = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the chunks already fetched when the pass is aborted', async () => {
    // A weekday inside the 08:00-22:00 Berlin feed window.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    apiKey.value = 'qxp_test';
    const isins = Array.from({ length: 21 }, (_, i) => `DE00090000${String(i).padStart(2, '0')}`);
    await storage.setItem('local:MAIN_LIST', isins.map(isin => row({ type: 'stock', isin, wkn: isin.slice(-6), bid: 1 })));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, data: [{ isin: isins[0], bid: '5', ask: '6' }] })))
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await getPriceData();

    const stored: any[] = await storage.getItem('local:MAIN_LIST') || [];
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stored[0]).toMatchObject({ bid: 5, priceUpdatedAt: expect.any(String) });
    expect(stored[20].bid).toBe(1);
    expect(stored[20].priceUpdatedAt).toBeUndefined();
  });
});
