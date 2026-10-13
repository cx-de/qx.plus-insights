import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { versionNextUpdate, versionSnooze, versionIsStoreUrl } from '@/utils/version-utils';

const NOW = new Date('2026-10-12T12:00:00Z');
const HOUR = 3_600_000;

const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status });

const answer = (data: any = {}) => ({
  success: true,
  data: {
    current_version: '1.0.0',
    latest_version: '2.11.0',
    min_version: null,
    update_available: true,
    force: false,
    notes: { de: 'Neu', en: 'New' },
    store_url: 'https://store.example.test',
    ...data,
  },
});

const stubFetch = (response: () => Promise<Response>) => {
  const spy = vi.fn(async (_url: string, _init: any) => response());
  vi.stubGlobal('fetch', spy);
  return spy;
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // fakeBrowser's manifest has no version; the cache is keyed on it.
  vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '1.0.0' } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('versionNextUpdate', () => {
  it('asks next to the feed base with the installed version', async () => {
    const spy = stubFetch(async () => json(answer()));

    const info: any = await versionNextUpdate();

    expect(info.latest_version).toBe('2.11.0');
    const url = new URL(String(spy.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/extension\/version$/);
    expect(url.pathname).not.toContain('/feed/');
    expect(url.searchParams.get('current')).toBe('1.0.0');
  });

  it('returns null when up to date', async () => {
    stubFetch(async () => json(answer({ update_available: false })));

    expect(await versionNextUpdate()).toBeNull();
  });

  it('reuses the answer for 6 hours', async () => {
    const spy = stubFetch(async () => json(answer()));

    await versionNextUpdate();
    vi.setSystemTime(NOW.getTime() + 5 * HOUR);
    await versionNextUpdate();
    expect(spy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW.getTime() + 7 * HOUR);
    await versionNextUpdate();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops a cached answer from before the extension updated', async () => {
    await storage.setItem('local:VERSION_CHECK', { checked_at: NOW.getTime(), data: answer({ current_version: '0.9.0' }).data });
    const spy = stubFetch(async () => json(answer({ update_available: false })));

    expect(await versionNextUpdate()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps showing a cached forced update while offline', async () => {
    stubFetch(async () => json(answer({ force: true })));
    await versionNextUpdate();

    vi.setSystemTime(NOW.getTime() + 7 * HOUR);
    stubFetch(async () => { throw new TypeError('offline'); });

    expect((await versionNextUpdate() as any)?.force).toBe(true);
  });

  it('hides a snoozed version for 24 hours, but not a newer one', async () => {
    stubFetch(async () => json(answer()));
    await versionSnooze('2.11.0');

    expect(await versionNextUpdate()).toBeNull();

    vi.setSystemTime(NOW.getTime() + 25 * HOUR);
    expect(await versionNextUpdate()).not.toBeNull();

    await versionSnooze('2.11.0');
    await storage.removeItem('local:VERSION_CHECK');
    stubFetch(async () => json(answer({ latest_version: '2.12.0' })));
    expect((await versionNextUpdate() as any)?.latest_version).toBe('2.12.0');
  });

  it('ignores the snooze for a forced update', async () => {
    stubFetch(async () => json(answer({ force: true })));
    await versionSnooze('2.11.0');

    expect((await versionNextUpdate() as any)?.force).toBe(true);
  });
});

describe('versionIsStoreUrl', () => {
  it.each([
    ['https://chromewebstore.google.com/detail/abc', true],
    ['https://addons.mozilla.org/firefox/addon/qx/', true],
    ['https://microsoftedge.microsoft.com/addons/detail/abc', true],
    ['http://addons.mozilla.org/firefox/addon/qx/', false],
    ['https://evil.example/addons.mozilla.org', false],
    ['javascript:alert(1)', false],
    [null, false],
  ])('%s -> %s', (url, expected) => {
    expect(versionIsStoreUrl(url)).toBe(expected);
  });
});
