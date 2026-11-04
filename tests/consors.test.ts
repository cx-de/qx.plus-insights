// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mainConsorsBank } from '@/utils/consorsBank-utils';

const row = (fields: any) => `
  <div class="tablecards-row transition--ease-3">
    ${Object.entries(fields).map(([label, value]) =>
      `<div class="tablecards-label">${label}</div><div class="tablecards-values">${value}</div>`).join('')}
  </div>`;

const complete = { Name: 'Product A', WKN: '900001', Kurs: '12,50 EUR', 'Stück/Nominal': '10', 'Datum/Uhrzeit': '24.10.2026 12:00:00' };

const stored = async (): Promise<any> => (await fakeBrowser.storage.local.get('consorsBank')).consorsBank;

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.setItem('wemo.user.info', JSON.stringify({ userId: '90000002' }));
  history.pushState({}, '', '/web/Depot?depotNo=90000003');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

const page = (rows: string) => `<ul><li class="tabs--active"><span>Portfolio</span></li></ul>${rows}`;

describe('mainConsorsBank', () => {
  it('saves complete rows and skips a timestamp it cannot parse', async () => {
    document.body.innerHTML = page(row(complete) + row({ ...complete, WKN: '900002', 'Datum/Uhrzeit': '-' }) + '<div class="tablecards-row transition--ease-3"></div>');

    await mainConsorsBank();

    const rows = await stored();
    expect(rows.map((r: any) => r.wkn)).toEqual(['900001', '900002']);
    expect(rows[0]).toMatchObject({ account_id: '90000002', deposite_number: '90000003', bid: 12.5, stocks_owned: 10 });
    expect(rows[0].timestamp).toBeTruthy();
    expect(rows[1].timestamp).toBeUndefined();
  });

  it('does not save while a row is still rendering', async () => {
    await fakeBrowser.storage.local.set({ consorsBank: [{ broker: 'Consorsbank', account_id: '90000002', deposite_number: '90000003', wkn: '900009' }] });
    document.body.innerHTML = page(row(complete) + row({ Name: 'Product B', WKN: '' }));

    await mainConsorsBank();

    expect((await stored()).map((r: any) => r.wkn)).toEqual(['900009']);
  });

  it('still saves when a summary row has no WKN label', async () => {
    document.body.innerHTML = page(row(complete) + row({ Gesamtwert: '125,00 EUR' }));

    await mainConsorsBank();

    expect((await stored()).map((r: any) => r.wkn)).toEqual(['900001']);
  });
});
