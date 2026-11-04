// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { smartBrokerSaveDataToLocalStorage } from '@/utils/smartBrokerPlus-utils';

const card = (cells: any) => `
  <a data-testid="depot-asset-card" href="/instrument/DE0009000001">
    <div>
      <div><p>Product A</p><p>Aktien</p><p>900001</p></div>
      <div><p>${cells.total}</p><p>${cells.qty}</p></div>
      <div><p>${cells.bid}</p></div>
      <div></div>
      <div>${cells.perf}</div>
    </div>
  </a>`;

const stored = async (): Promise<any> => (await fakeBrowser.storage.local.get('SMART_BROKER_PLUS')).SMART_BROKER_PLUS;

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('smartBrokerSaveDataToLocalStorage', () => {
  it('still saves a position whose P/L cell is blank', async () => {
    history.pushState({}, '', '/depot/90000001');
    document.body.innerHTML = `<main><div><div>${card({ total: '1.000,00', qty: '10', bid: '110,00 €', perf: '' })}</div></div></main>`;

    await smartBrokerSaveDataToLocalStorage();

    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account_id: '90000001', wkn: '900001', total_entry_value: 1000, stocks_owned: 10, bid: 110, profit_loss_price: 0, profit_loss_percentage: 0 });
  });

  it('keeps the stored cash when the balance is masked', async () => {
    await fakeBrowser.storage.local.set({
      ACCOUNTS: [{ broker: 'Smartbroker+', account_id: '90000001' }],
      CUR_SMARTBROKERID: '90000001',
      SMART_BROKER_PLUS: [{ broker: 'Smartbroker+', account_id: '90000001', stock_name: 'Cash', total_entry_value: 500 }],
    });
    history.pushState({}, '', '/finance');
    document.body.innerHTML = `<a><div data-testid="portfolio-Verrechnungskonto"><h4><span aria-hidden="true">••••</span></h4></div></a>`;

    await smartBrokerSaveDataToLocalStorage();

    expect((await stored())[0].total_entry_value).toBe(500);
  });
});
