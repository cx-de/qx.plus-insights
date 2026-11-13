import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { versionNextUpdate, versionSnooze, versionUpdateNow, versionApplyUpdate, versionAfterUpdate, versionOnConnect, versionHoldUpdate, versionReopenDashboard, versionRetryUpdate } from '@/utils/version-utils';

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

const stubStore = (impl: () => Promise<any>) => {
  const spy = vi.fn(impl);
  (browser.runtime as any).requestUpdateCheck = spy;
  return spy;
};

describe('versionNextUpdate', () => {
  beforeEach(() => {
    stubStore(async () => ({ status: 'update_available' }));
  });

  it('asks next to the feed base with the installed version', async () => {
    const spy = stubFetch(async () => json(answer()));

    const info: any = await versionNextUpdate();

    expect(info.latest_version).toBe('2.11.0');
    const url = new URL(String(spy.mock.calls[0]![0]));
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

describe('versionNextUpdate store gate', () => {
  it.each([
    ['the store has not released it', async () => ({ status: 'no_update' })],
    ['the store is throttled', async () => ({ status: 'throttled' })],
    ['the check throws', async () => { throw new Error('not supported'); }],
  ])('hides the update when %s', async (_label, impl) => {
    stubFetch(async () => json(answer()));
    stubStore(impl);

    expect(await versionNextUpdate()).toBeNull();
  });

  it('hides a forced update the store does not have', async () => {
    stubFetch(async () => json(answer({ force: true })));
    stubStore(async () => ({ status: 'no_update' }));

    expect(await versionNextUpdate()).toBeNull();
  });

  it('asks the store again only after an hour', async () => {
    stubFetch(async () => json(answer()));
    const store = stubStore(async () => ({ status: 'no_update' }));

    await versionNextUpdate();
    vi.setSystemTime(NOW.getTime() + 30 * 60_000);
    await versionNextUpdate();
    expect(store).toHaveBeenCalledTimes(1);

    store.mockResolvedValue({ status: 'update_available' });
    vi.setSystemTime(NOW.getTime() + 61 * 60_000);
    expect((await versionNextUpdate() as any)?.latest_version).toBe('2.11.0');
    expect(store).toHaveBeenCalledTimes(2);

    await versionNextUpdate();
    expect(store).toHaveBeenCalledTimes(2);
  });

  it('asks the store at once for a newer server version', async () => {
    stubFetch(async () => json(answer()));
    const store = stubStore(async () => ({ status: 'no_update' }));
    await versionNextUpdate();

    await storage.removeItem('local:VERSION_CHECK');
    stubFetch(async () => json(answer({ latest_version: '2.12.0' })));
    await versionNextUpdate();
    expect(store).toHaveBeenCalledTimes(2);
  });

  it('shows a downloaded update without asking the store', async () => {
    stubFetch(async () => json(answer()));
    const store = stubStore(async () => ({ status: 'no_update' }));
    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });

    expect(await versionNextUpdate()).toMatchObject({ latest_version: '2.11.0', ready: true });
    expect(store).not.toHaveBeenCalled();
  });
});

describe('versionNextUpdate offline', () => {
  beforeEach(() => {
    stubStore(async () => ({ status: 'update_available' }));
  });

  it('skips the request while the browser is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const spy = stubFetch(async () => json(answer()));

    expect(await versionNextUpdate()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('backs off for 15 minutes after a failed request', async () => {
    const spy = stubFetch(async () => { throw new TypeError('Failed to fetch'); });

    expect(await versionNextUpdate()).toBeNull();
    await versionNextUpdate();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();

    vi.setSystemTime(NOW.getTime() + 16 * 60_000);
    const ok = stubFetch(async () => json(answer()));
    expect((await versionNextUpdate() as any)?.latest_version).toBe('2.11.0');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('local:VERSION_CHECK_FAIL')).toBeNull();
  });

  it('announces a downloaded update as ready even without a server answer', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    await storage.setItem('local:UPDATE_READY', { version: '2.12.0' });

    const info: any = await versionNextUpdate();
    expect(info).toMatchObject({ latest_version: '2.12.0', current_version: '1.0.0', ready: true });
  });

  it('takes notes and force only from a server answer for the downloaded version', async () => {
    stubFetch(async () => json(answer({ latest_version: '2.13.0', force: true })));
    await storage.setItem('local:UPDATE_READY', { version: '2.12.0' });

    const info: any = await versionNextUpdate();
    expect(info).toMatchObject({ latest_version: '2.12.0', ready: true });
    expect(info.force).toBeUndefined();
    expect(info.notes).toBeUndefined();

    await storage.removeItem('local:VERSION_CHECK');
    stubFetch(async () => json(answer({ latest_version: '2.12.0', force: true })));
    expect(await versionNextUpdate()).toMatchObject({ latest_version: '2.12.0', force: true, notes: { en: 'New' } });
  });

  it('ignores a ready marker for the version already installed', async () => {
    stubFetch(async () => json(answer({ update_available: false })));
    await storage.setItem('local:UPDATE_READY', { version: '1.0.0' });

    expect(await versionNextUpdate()).toBeNull();
  });
});

describe('versionUpdateNow', () => {
  let reload: any;
  let createTab: any;

  const stubCheck = (impl: () => Promise<any>) => {
    (browser.runtime as any).requestUpdateCheck = vi.fn(impl);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    reload = vi.spyOn(browser.runtime, 'reload').mockImplementation(() => {});
    createTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as any);
  });

  it('reloads only once the update has downloaded', async () => {
    stubCheck(async () => ({ status: 'update_available' }));

    const pending = versionUpdateNow();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reload).not.toHaveBeenCalled();

    await fakeBrowser.runtime.onUpdateAvailable.trigger({ version: '2.11.0' });
    expect(await pending).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('reloads after the timeout when no download event comes', async () => {
    stubCheck(async () => ['update_available', { version: '2.11.0' }]);

    const pending = versionUpdateNow();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reports pending when the check never answers', async () => {
    stubCheck(() => new Promise(() => {}));

    const pending = versionUpdateNow();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toBe('pending');
    expect(createTab).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'no_update' }],
    [{ status: 'throttled' }],
  ])('reports pending without opening the store for %o', async (status) => {
    stubCheck(async () => status);

    expect(await versionUpdateNow()).toBe('pending');
    expect(createTab).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports pending when update checks are unsupported', async () => {
    stubCheck(async () => { throw new Error('not supported'); });

    expect(await versionUpdateNow()).toBe('pending');
  });

  it('skips a second check when the store probe already confirmed the update', async () => {
    const check = vi.fn();
    (browser.runtime as any).requestUpdateCheck = check;
    await storage.setItem('local:UPDATE_STORE_CHECK', { version: '2.11.0', status: 'update_available', checked_at: Date.now() });

    const pending = versionUpdateNow();
    await vi.advanceTimersByTimeAsync(1_000);
    await fakeBrowser.runtime.onUpdateAvailable.trigger({ version: '2.11.0' });

    expect(await pending).toBe('reloading');
    expect(check).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('restarts straight away when the update is already downloaded', async () => {
    const check = vi.fn();
    (browser.runtime as any).requestUpdateCheck = check;
    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });

    expect(await versionUpdateNow()).toBe('reloading');
    expect(check).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('local:REOPEN_DASHBOARD')).toBe(true);
  });
});

describe('versionApplyUpdate', () => {
  let reload: any;

  beforeEach(() => {
    reload = vi.spyOn(browser.runtime, 'reload').mockImplementation(() => {});
  });

  it('reloads at once when no dashboard answers', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(new Error('Receiving end does not exist.'));

    expect(await versionApplyUpdate('2.11.0')).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('local:UPDATE_READY')).toEqual({ version: '2.11.0' });
  });

  it('defers while a broker tab runs the content script', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(new Error('Receiving end does not exist.'));
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    const tabSend = vi.spyOn(browser.tabs, 'sendMessage').mockImplementation((async (id: number) => {
      if (id === 2) return true;
      throw new Error('Receiving end does not exist.');
    }) as any);

    expect(await versionApplyUpdate('2.11.0')).toBe('deferred');
    expect(tabSend).toHaveBeenCalledWith(2, { type: 'qx:in-use' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries after a tab closes and installs once nothing is in use', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(new Error('Receiving end does not exist.'));
    const query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 2 }] as any);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(true as any);
    await versionApplyUpdate('2.11.0');
    expect(reload).not.toHaveBeenCalled();

    query.mockResolvedValue([] as any);
    expect(await versionRetryUpdate()).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('retries nothing without a downloaded update', async () => {
    expect(await versionRetryUpdate()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves it to an open dashboard', async () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(true as any);

    expect(await versionApplyUpdate('2.11.0')).toBe('deferred');
    expect(send).toHaveBeenCalledWith({ type: 'qx:update-ready', version: '2.11.0' });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('versionAfterUpdate', () => {
  it('clears the ready marker and the store answer', async () => {
    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });
    await storage.setItem('local:UPDATE_STORE_CHECK', { version: '2.11.0', status: 'update_available', checked_at: 0 });

    await versionAfterUpdate();

    expect(await storage.getItem('local:UPDATE_READY')).toBeNull();
    expect(await storage.getItem('local:UPDATE_STORE_CHECK')).toBeNull();
  });
});

describe('versionReopenDashboard', () => {
  it('reopens the dashboard once after a restart from it', async () => {
    const createTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as any);
    await storage.setItem('local:REOPEN_DASHBOARD', true);

    await versionReopenDashboard();
    await versionReopenDashboard();

    expect(createTab).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('local:REOPEN_DASHBOARD')).toBeNull();
  });

  it('opens nothing on a normal startup', async () => {
    const createTab = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as any);

    await versionReopenDashboard();

    expect(createTab).not.toHaveBeenCalled();
  });
});

describe('versionOnConnect', () => {
  const fakePort = (name = 'qx:update-hold') => {
    const listeners: any[] = [];
    return {
      name,
      onDisconnect: { addListener: (fn: any) => listeners.push(fn) },
      close: () => Promise.all(listeners.map((fn) => fn())),
    };
  };
  let reload: any;
  let send: any;

  beforeEach(() => {
    reload = vi.spyOn(browser.runtime, 'reload').mockImplementation(() => {});
    send = vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(new Error('Receiving end does not exist.'));
  });

  it('installs the waiting update when the last holding dashboard closes', async () => {
    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });
    const first = fakePort();
    const second = fakePort();
    versionOnConnect(first);
    versionOnConnect(second);

    await first.close();
    expect(reload).not.toHaveBeenCalled();

    await second.close();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits when another dashboard still answers', async () => {
    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });
    send.mockResolvedValue(true as any);
    const port = fakePort();
    versionOnConnect(port);

    await port.close();

    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing without a waiting update or for other ports', async () => {
    const port = fakePort();
    versionOnConnect(port);
    versionOnConnect(fakePort('other'));

    await port.close();

    expect(send).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('versionHoldUpdate', () => {
  it('holds a port only while an update waits, and releases it', async () => {
    const disconnect = vi.fn();
    const connect = vi.spyOn(browser.runtime, 'connect').mockReturnValue({ onDisconnect: { addListener: () => {} }, disconnect } as any);

    versionHoldUpdate();
    await vi.waitFor(() => {});
    expect(connect).not.toHaveBeenCalled();

    await storage.setItem('local:UPDATE_READY', { version: '2.11.0' });
    const release = versionHoldUpdate();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledWith({ name: 'qx:update-hold' }));

    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
