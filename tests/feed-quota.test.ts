import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { fetchFeed, getLatestData, apiBaseUrl, apiKey, apiAuthFailed, apiRateLimit } from '@/utils/helper';
import { getPriceData } from '@/utils/price-data-utils';

// Tuesday 12:00 Berlin (CEST), inside the feed's service hours.
const NOW = new Date('2026-09-29T10:00:00Z').getTime();
const FEED_URL = `${apiBaseUrl}price?apikey=secret`;

const row = (extra: any = {}) => ({
  broker: 'flatex', account_id: '90000001', deposite_number: '90000001', type: 'certificate',
  isin: 'DE000X', wkn: 'X', stock_name: 'Product X', ...extra,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  apiKey.value = 'secret';
  apiAuthFailed.value = false;
  apiRateLimit.value = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchFeed outside service hours', () => {
  it('returns null without probing or latching the key', async () => {
    const feed = vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'service_window_closed' }), { status: 403 }));
    vi.stubGlobal('fetch', feed);
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(feed).toHaveBeenCalledTimes(1);
    expect(apiAuthFailed.value).toBe(false);
    expect(await storage.getItem('local:api_auth_failed')).toBeNull();
  });
});

describe('getPriceData', () => {
  it('skips rows priced within the interval', async () => {
    const feed = vi.fn();
    vi.stubGlobal('fetch', feed);
    await storage.setItem('local:settings', { price_duration: 10 });
    await storage.setItem('local:MAIN_LIST', [row({ bid: 5, priceUpdatedAt: new Date(NOW - 2 * 60_000).toISOString() })]);
    await getPriceData();
    expect(feed).not.toHaveBeenCalled();
  });

  it('refetches once the interval has passed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 1, data: [{ wkn: 'X', bid: '7', ask: '8', timestamp: NOW }] }))));
    await storage.setItem('local:settings', { price_duration: 10 });
    await storage.setItem('local:MAIN_LIST', [row({ bid: 5, priceUpdatedAt: new Date(NOW - 10 * 60_000).toISOString() })]);
    await getPriceData();
    expect((await storage.getItem('local:MAIN_LIST') as any[])[0].bid).toBe(7);
  });

  it('keeps the last feed price when the feed fails, instead of the broker price', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'rate_limited', retry_after: 60 }), { status: 429 })));
    await storage.setItem('local:MAIN_LIST', [row({ bid: 5, page_bid: '3' })]);
    await getPriceData();
    expect((await storage.getItem('local:MAIN_LIST') as any[])[0].bid).toBe(5);
  });

  it('falls back to the broker price when the feed does not know the product', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 1, data: [] }))));
    await storage.setItem('local:MAIN_LIST', [row({ bid: 5, page_bid: '3' })]);
    await getPriceData();
    expect((await storage.getItem('local:MAIN_LIST') as any[])[0].bid).toBe(3);
  });
});

describe('getLatestData', () => {
  it('does not replace a newer feed timestamp with an older broker one', async () => {
    const feedTime = new Date(NOW - 60_000).toISOString();
    await storage.setItem('local:MAIN_LIST', [row({ timestamp: feedTime })]);
    await storage.setItem('local:KONTO_FLATEX', [row({ timestamp: new Date(NOW - 14 * 3_600_000).toISOString(), stocks_owned: 3 })]);
    await getLatestData();
    const [merged] = await storage.getItem('local:MAIN_LIST') as any[];
    expect(merged.timestamp).toBe(feedTime);
    expect(merged.stocks_owned).toBe(3);
  });

  it('takes a newer broker timestamp', async () => {
    const brokerTime = new Date(NOW).toISOString();
    await storage.setItem('local:MAIN_LIST', [row({ timestamp: new Date(NOW - 60_000).toISOString() })]);
    await storage.setItem('local:KONTO_FLATEX', [row({ timestamp: brokerTime })]);
    await getLatestData();
    expect((await storage.getItem('local:MAIN_LIST') as any[])[0].timestamp).toBe(brokerTime);
  });
});
