import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { apiKey, getLatestData } from '@/utils/helper';
import { getPriceData, calculateLatestMainListData } from '@/utils/price-data-utils';

// Coins the backend maps (price?wkn=<symbol> answered as the instrument's USD pair). Made-up account data only.
const COINS: Record<string, string> = {
  BTC: 'XC000A2YY636', ETH: 'XC000A2YY651', SOL: 'XC000A3D1PB0', XRP: 'XC000A2YY644', LINK: 'XC000A3DJUE9',
  ADA: 'XC000A3DJU27', XLM: 'XC000A3DJUL4', BCH: 'XC000A3DJU43', ALGO: 'XC000A4ARUM9', XTZ: 'XC000A3D1PA2',
  DOT: 'XC000A3DJU92', POL: 'XC000A3D1XA6', AAVE: 'XC000A3DJU01', LTC: 'XC000A3DJUG4', UNI: 'XC000A3DJUK6',
  AVAX: 'XC000A3D1PD6', CRV: 'XC000A4ARUR8', MANA: 'XC000A4ARUN7', AXS: 'XC000A4ARUQ0', NEAR: 'XC000A4ARUS6',
  ONDO: 'XC000A4ARUT4', CHZ: 'XC000A4ARUP2', SNX: 'XC000A4ARUU2',
};
const SYMBOLS = Object.keys(COINS);
const UNMAPPED = 'FOO';
const EURUSD = 1.25;

const coinRow = (wkn: string, i: number) => ({
  id: `row-${wkn}`, broker: 'justTRADE', account_id: '90000001', stock_name: `Coin ${wkn}`,
  isin: '', wkn, type: 'crypto', stocks_owned: 0.5, total_entry_value: 10, bid: 100 + i, page_bid: 100 + i,
  timestamp: 1,
});
const depot = () => [...SYMBOLS, UNMAPPED].map(coinRow);

// The backend's answer for one tick: each mapped coin in USD, bid = tick * 1000 + index.
let tick = 1;
const usdBid = (symbol: string) => tick * 1000 + SYMBOLS.indexOf(symbol);
const requested: string[] = [];

const fakeBackend = async (url: string) => {
  const u = new URL(url);
  requested.push(`${u.pathname.split('/').pop()}?${u.searchParams.toString()}`);
  if (u.searchParams.has('currencies')) {
    return new Response(JSON.stringify({ status: 1, data: [{ currencyID: 'USD', bid: String(EURUSD) }] }));
  }
  const wkns = (u.searchParams.get('wkn') || '').split(',');
  const data = wkns.filter((w) => COINS[w]).map((w) => ({
    wkn: w, isin: COINS[w], bid: String(usdBid(w)), ask: String(usdBid(w) + 1), currency: 'USD', timestamp: tick,
  }));
  return new Response(JSON.stringify({ status: 1, data }));
};
const backend = vi.fn(fakeBackend);

const stored = async () => Object.fromEntries(((await storage.getItem('local:MAIN_LIST')) as any[]).map((r) => [r.wkn, r]));

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  apiKey.value = 'qxp_test';
  tick = 1;
  requested.length = 0;
  // Reset, not clear: a test that swaps the implementation must not leak it.
  backend.mockReset();
  backend.mockImplementation(fakeBackend);
  vi.stubGlobal('fetch', backend);
  await storage.setItem('local:MAIN_LIST', depot());
});

afterEach(() => {
  apiKey.value = '';
  vi.unstubAllGlobals();
});

describe('justTRADE crypto priced by symbol', () => {
  it('sends every coin as wkn and stores the feed price in EUR', async () => {
    await getPriceData(true);

    const wknCalls = requested.filter((r) => r.includes('wkn='));
    const sent = wknCalls.flatMap((r) => new URLSearchParams(r.split('?')[1]).get('wkn')!.split(','));
    expect(sent.sort()).toEqual([...SYMBOLS, UNMAPPED].sort());
    expect(requested.filter((r) => r.includes('currencies=USD'))).toHaveLength(1);

    const rows = await stored();
    for (const symbol of SYMBOLS) {
      expect(rows[symbol]).toMatchObject({
        bid: usdBid(symbol) / EURUSD,
        ask: (usdBid(symbol) + 1) / EURUSD,
        currency: 'EUR',
        price_source: 'feed',
        isin: '',
        priceUpdatedAt: expect.any(String),
      });
    }
  });

  it('keeps the broker price for a coin the feed does not know', async () => {
    await getPriceData(true);

    const foo = (await stored())[UNMAPPED];
    expect(foo.bid).toBe(coinRow(UNMAPPED, SYMBOLS.length).page_bid);
    expect(foo.price_source).toBe('broker');
  });

  it('picks up the latest feed price on the next tick', async () => {
    await getPriceData(true);
    const first = await stored();
    tick = 2;
    await getPriceData(true);
    const second = await stored();

    for (const symbol of SYMBOLS) {
      expect(second[symbol].bid).toBe(usdBid(symbol) / EURUSD);
      expect(second[symbol].bid).not.toBe(first[symbol].bid);
    }
  });

  it('never stores a USD price as EUR when the FX rate is missing', async () => {
    backend.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.has('currencies')) return new Response('{}', { status: 502 });
      const wkns = (u.searchParams.get('wkn') || '').split(',');
      return new Response(JSON.stringify({ status: 1, data: wkns.filter((w) => COINS[w]).map((w) => ({ wkn: w, bid: '999', currency: 'USD' })) }));
    });

    await getPriceData(true);

    const rows = await stored();
    expect(rows.BTC.bid).toBe(coinRow('BTC', 0).bid);
    expect(rows.BTC.priceUpdatedAt).toBeUndefined();
  });

  it('hands a coin answered without a bid back to the broker price', async () => {
    await getPriceData(true);
    expect((await stored()).BTC.price_source).toBe('feed');

    backend.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.has('currencies')) return fakeBackend(url);
      const wkns = (u.searchParams.get('wkn') || '').split(',');
      return new Response(JSON.stringify({ status: 1, data: wkns.filter((w) => COINS[w]).map((w) => ({ wkn: w, bid: null, currency: 'USD' })) }));
    });
    await getPriceData(true);

    const btc = (await stored()).BTC;
    expect(btc.price_source).toBe('broker');
    expect(btc.bid).toBe(coinRow('BTC', 0).page_bid);

    // The next broker sync may move the price again.
    await storage.setItem('local:JUSTTRADE', depot().map((r) => ({ ...r, bid: 7, page_bid: 7 })));
    await calculateLatestMainListData();
    expect((await stored()).BTC.bid).toBe(7);
  });

  it.each([
    ['calculateLatestMainListData', calculateLatestMainListData],
    ['getLatestData', getLatestData],
  ])('a broker sync (%s) keeps the feed price but still moves an unpriced coin', async (_name, sync: any) => {
    await getPriceData(true);
    const feedBid = (await stored()).BTC.bid;

    const scraped = depot().map((r) => ({ ...r, bid: 1, page_bid: 1 }));
    await storage.setItem('local:JUSTTRADE', scraped);
    await sync();

    const rows = await stored();
    expect(rows.BTC.bid).toBe(feedBid);
    expect(rows.BTC.page_bid).toBe(1);
    expect(rows[UNMAPPED].bid).toBe(1);
  });
});
