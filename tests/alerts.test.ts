import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { evaluateAlerts, runAlertCheck, alertsNewlyPending, alertPriceTick } from '@/utils/alert-utils';

const row = (over: any = {}) => ({
  broker: 'flatex', account_id: '90000001', wkn: 'AAA111', isin: 'DE000AAA1111', stock_name: 'Alpha',
  type: 'stock', stocks_owned: 10, bid: 12, total_entry_value: 100, total_value: 120, profit_loss_percentage: 20,
  ...over,
});
const alert = (over: any = {}) => ({
  id: 'a1', alert_name: 'High', type: 'stock', field: 'bid', condition: '>=', alert_value: '10.00',
  type_id: 'AAA111', stock_name: 'Alpha', broker: 'flatex', account_id: '90000001', status: 0,
  ...over,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateAlerts', () => {
  it('matches a stock alert on its own account row', () => {
    const matches = evaluateAlerts([alert()], [row({ account_id: '90000002', bid: 5 }), row()], []);
    expect(matches).toHaveLength(1);
    expect(matches[0].currentValue).toBe(12);
    expect(matches[0].instrumentType).toBe('stock');
  });

  it('keeps matching legacy alerts without an account on wkn alone', () => {
    expect(evaluateAlerts([alert({ account_id: undefined, broker: undefined })], [row()], [])).toHaveLength(1);
  });

  it('returns every match of one pass', () => {
    const alerts = [alert(), alert({ id: 'a2', field: 'profit_loss_percentage', condition: '>', alert_value: '15' })];
    expect(evaluateAlerts(alerts, [row()], []).map((m: any) => m.alert.id)).toEqual(['a1', 'a2']);
  });

  it('skips completed alerts, missing values and unknown conditions', () => {
    const alerts = [
      alert({ status: 1 }),
      alert({ id: 'a2', field: 'underlying_price' }),
      alert({ id: 'a3', condition: '~' }),
      alert({ id: 'a4', type_id: 'GONE00' }),
    ];
    expect(evaluateAlerts(alerts, [row()], [])).toEqual([]);
  });

  it('compares a string alert value as a number', () => {
    expect(evaluateAlerts([alert({ condition: '>', alert_value: '9.00' })], [row({ bid: 10 })], [])).toHaveLength(1);
    expect(evaluateAlerts([alert({ condition: '==', alert_value: '12.00' })], [row()], [])).toHaveLength(1);
  });

  it('sums total alerts over every account, whatever the view filter', () => {
    const rows = [row(), row({ account_id: '90000002', total_value: 80, total_entry_value: 100 })];
    const matches = evaluateAlerts([alert({ type: 'total', type_id: undefined, field: 'total_value', condition: '>=', alert_value: '200' })], rows, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].currentValue).toBe(200);
  });

  it('prices group members from MAIN_LIST, not the stale LIST_DATA copy', () => {
    const stale = row({ bid: 1 });
    const listData = [{ id: 'g1', isGroup: true, group_name: 'Tech', items: [stale] }];
    const groupAlert = alert({ type: 'group', type_id: 'g1', field: 'total_value', condition: '>=', alert_value: '120' });
    expect(evaluateAlerts([groupAlert], [row()], listData)).toHaveLength(1);
  });

  it('never fires on an empty list or a group with no members left', () => {
    const below = alert({ type: 'total', field: 'total_value', condition: '<', alert_value: '1' });
    expect(evaluateAlerts([below], [], [])).toEqual([]);
    const listData = [{ id: 'g1', isGroup: true, items: [row({ wkn: 'SOLD00' })] }];
    expect(evaluateAlerts([alert({ type: 'group', type_id: 'g1', field: 'total_value', condition: '<', alert_value: '1' })], [row()], listData)).toEqual([]);
  });
});

describe('runAlertCheck', () => {
  it('completes each match once, even when called twice at once', async () => {
    await storage.setItem('local:MAIN_LIST', [row()]);
    await storage.setItem('local:ALERTS', [alert(), alert({ id: 'a2', condition: '<', alert_value: '1' })]);
    await Promise.all([runAlertCheck(), runAlertCheck()]);
    const alerts: any = await storage.getItem('local:ALERTS');
    expect(alerts.map((a: any) => a.status)).toEqual([1, 0]);
    const events: any = await storage.getItem('local:ALERT_EVENTS');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'a1', alertName: 'High', contextKey: 'stock_name', currentValue: 12, alertValue: 10 });
  });

  it('does not fire an alert deleted before the pass', async () => {
    await storage.setItem('local:MAIN_LIST', [row()]);
    await storage.setItem('local:ALERTS', []);
    await runAlertCheck();
    expect(await storage.getItem('local:ALERT_EVENTS')).toBeNull();
  });

  it('does nothing on sample data', async () => {
    await storage.setItem('local:SAMPLE_DATA', true);
    await storage.setItem('local:MAIN_LIST', [row()]);
    await storage.setItem('local:ALERTS', [alert()]);
    await runAlertCheck();
    expect(((await storage.getItem('local:ALERTS')) as any)[0].status).toBe(0);
  });
});

describe('alertsNewlyPending', () => {
  it('counts a create or a re-armed edit, not a completion', () => {
    expect(alertsNewlyPending([], [alert()])).toBe(true);
    expect(alertsNewlyPending([alert()], [alert({ status: 1 })])).toBe(false);
    expect(alertsNewlyPending([alert({ status: 1 })], [alert()])).toBe(true);
    expect(alertsNewlyPending([alert()], [alert({ alert_value: '11.00' })])).toBe(true);
    expect(alertsNewlyPending([alert(), alert({ id: 'a2' })], [alert()])).toBe(false);
  });
});

describe('alertPriceTick', () => {
  it('spends nothing without pending alerts or right after a page refresh', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await storage.setItem('local:api_key', 'test-key');
    await storage.setItem('local:ALERTS', [alert({ status: 1 })]);
    expect(await alertPriceTick()).toBe(false);
    await storage.setItem('local:ALERTS', [alert()]);
    await storage.setItem('local:PRICES_UPDATED_AT', Date.now());
    expect(await alertPriceTick()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('languageMigrateLocal', () => {
  it('moves the old localStorage choice into extension storage once and drops the copy', async () => {
    const { languageMigrateLocal, languageGet } = await import('@/utils/language-utils');
    localStorage.setItem('lang', 'en');
    await languageMigrateLocal();
    expect(await languageGet()).toBe('en');
    expect(localStorage.getItem('lang')).toBeNull();
  });

  it('never overrides a language already in extension storage, and falls back to de', async () => {
    const { languageMigrateLocal, languageGet } = await import('@/utils/language-utils');
    await storage.setItem('local:LANG', 'de');
    localStorage.setItem('lang', 'en');
    await languageMigrateLocal();
    expect(await languageGet()).toBe('de');
    await storage.setItem('local:LANG', 'xx');
    expect(await languageGet()).toBe('de');
  });
});

describe('alert text language', () => {
  it('writes the notification in the stored language', async () => {
    const create = vi.fn().mockResolvedValue('id');
    (fakeBrowser as any).notifications = { create };
    await storage.setItem('local:LANG', 'en');
    await storage.setItem('local:MAIN_LIST', [row()]);
    await storage.setItem('local:ALERTS', [alert()]);
    await runAlertCheck();
    expect((create.mock.calls[0] as any)[1].title).toBe('Alert Triggered: High');
    delete (fakeBrowser as any).notifications;
  });
});
