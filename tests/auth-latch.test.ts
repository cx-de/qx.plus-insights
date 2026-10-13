import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { getApiKey, setApiAuthFailed, fetchFeed, apiKey, apiAuthFailed,
  apiRateLimit, isApiRateLimited } from '@/utils/helper';

const NOW = new Date('2026-09-24T10:00:00Z').getTime();
const FEED_URL = 'https://api.qx.plus/v1/feed/price?apikey=secret';

// Routes feed and /validate calls separately so each test can script the probe verdict.
const stubFetch = (feedStatus: number, validate: () => Promise<Response>) => {
  const probe = vi.fn(validate);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/validate')) return probe();
    return new Response(JSON.stringify({ ok: true }), { status: feedStatus });
  }));
  return probe;
};

const status = (code: number) => async () => new Response('', { status: code });

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  apiKey.value = 'secret';
  apiAuthFailed.value = false;
  apiRateLimit.value = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setApiAuthFailed', () => {
  it('counts each rejection and stamps its time', async () => {
    await setApiAuthFailed(true);
    await setApiAuthFailed(true);
    expect(await storage.getItem('local:api_auth_failed')).toBe(true);
    expect(await storage.getItem('local:api_auth_fail_count')).toBe(2);
    expect(await storage.getItem('local:api_auth_failed_at')).toBe(NOW);
  });

  it('resets the count once the key is accepted again', async () => {
    await setApiAuthFailed(true);
    await setApiAuthFailed(false);
    expect(await storage.getItem('local:api_auth_failed')).toBe(false);
    expect(await storage.getItem('local:api_auth_fail_count')).toBe(0);
  });
});

describe('fetchFeed', () => {
  it('returns parsed JSON on success without probing', async () => {
    const probe = stubFetch(200, status(200));
    expect(await fetchFeed(FEED_URL)).toEqual({ ok: true });
    expect(probe).not.toHaveBeenCalled();
  });

  it('returns null on a non-auth error without probing', async () => {
    const probe = stubFetch(500, status(200));
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('shares one probe across concurrent 401s and latches a rejected key', async () => {
    const probe = stubFetch(401, status(401));
    const results = await Promise.all([fetchFeed(FEED_URL), fetchFeed(FEED_URL), fetchFeed(FEED_URL)]);
    expect(results).toEqual([null, null, null]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(apiAuthFailed.value).toBe(true);
    expect(await storage.getItem('local:api_auth_failed')).toBe(true);
  });

  it('does not latch when the probe accepts the key', async () => {
    stubFetch(403, status(200));
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(apiAuthFailed.value).toBe(false);
  });

  it('keeps the current state when the probe cannot reach the server', async () => {
    // Offline must not latch a good key dead, as the overnight /price 403s once did.
    stubFetch(401, async () => { throw new TypeError('network down'); });
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(apiAuthFailed.value).toBe(false);
    expect(await storage.getItem('local:api_auth_failed')).toBeNull();
  });

  it('never logs the API key', async () => {
    stubFetch(401, status(401));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await fetchFeed(FEED_URL);
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret');
  });
});

describe('fetchFeed rate limit', () => {
  const LIMIT_BODY = { success: false, error: 'rate_limited', limit: 200, used: 193, window_seconds: 60, retry_after: 41 };

  const stubBody = (httpStatus: number, body: any) => {
    const feed = vi.fn(async () => new Response(JSON.stringify(body), { status: httpStatus }));
    vi.stubGlobal('fetch', feed);
    return feed;
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('latches on a 429 and persists the retry time', async () => {
    stubBody(429, LIMIT_BODY);
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(isApiRateLimited()).toBe(true);
    expect(apiRateLimit.value.until).toBe(NOW + 41_000);
    expect(apiRateLimit.value.used).toBe(193);
    expect((await storage.getItem('local:api_rate_limit') as any).until).toBe(NOW + 41_000);
  });

  it('latches on a 200 whose body says rate_limited', async () => {
    stubBody(200, LIMIT_BODY);
    expect(await fetchFeed(FEED_URL)).toBeNull();
    expect(isApiRateLimited()).toBe(true);
  });

  it('sends no request while latched, and resumes once retry_after passes', async () => {
    const feed = stubBody(429, LIMIT_BODY);
    await fetchFeed(FEED_URL);
    await fetchFeed(FEED_URL);
    expect(feed).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 41_000);
    const ok = stubBody(200, { ok: true });
    expect(await fetchFeed(FEED_URL)).toEqual({ ok: true });
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('getApiKey restores an unexpired limit and drops an expired one', async () => {
    stubFetch(200, status(200));
    await storage.setItem('local:api_rate_limit', { until: NOW + 30_000 });
    await getApiKey();
    expect(isApiRateLimited()).toBe(true);

    await storage.setItem('local:api_rate_limit', { until: NOW - 1 });
    await getApiKey();
    expect(apiRateLimit.value).toBeNull();
  });
});

describe('getApiKey cooldown', () => {
  const latch = async (count: number) => {
    await storage.setItem('local:api_key', 'secret');
    await storage.setItem('local:api_auth_failed', true);
    await storage.setItem('local:api_auth_fail_count', count);
    await storage.setItem('local:api_auth_failed_at', NOW);
  };

  it('loads the key and the latch from storage', async () => {
    apiKey.value = '';
    await storage.setItem('local:api_key', 'stored');
    stubFetch(200, status(200));
    await getApiKey();
    expect(apiKey.value).toBe('stored');
    expect(apiAuthFailed.value).toBe(false);
  });

  it('does not re-probe inside the first 5 minute window', async () => {
    await latch(1);
    const probe = stubFetch(200, status(200));
    vi.setSystemTime(NOW + 4 * 60_000);
    await getApiKey(true);
    expect(probe).not.toHaveBeenCalled();
    expect(apiAuthFailed.value).toBe(true);
  });

  it('re-probes after 5 minutes and unlatches an accepted key', async () => {
    await latch(1);
    const probe = stubFetch(200, status(200));
    vi.setSystemTime(NOW + 5 * 60_000);
    await getApiKey(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(apiAuthFailed.value).toBe(false);
  });

  it('stretches the wait to 15 minutes after a second rejection', async () => {
    await latch(2);
    const probe = stubFetch(200, status(200));
    vi.setSystemTime(NOW + 10 * 60_000);
    await getApiKey(true);
    expect(probe).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 15 * 60_000);
    await getApiKey(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('caps the wait at 60 minutes however many rejections', async () => {
    await latch(9);
    const probe = stubFetch(401, status(401));
    vi.setSystemTime(NOW + 60 * 60_000);
    await getApiKey(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(apiAuthFailed.value).toBe(true);
  });

  it('restarts the wait when the probe gets no verdict', async () => {
    await latch(1);
    stubFetch(200, async () => { throw new TypeError('network down'); });
    const later = NOW + 6 * 60_000;
    vi.setSystemTime(later);
    await getApiKey(true);
    expect(apiAuthFailed.value).toBe(true);
    expect(await storage.getItem('local:api_auth_failed_at')).toBe(later);
  });
});
