// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mainWikiFolioSaveDataToLocalStorage } from '@/utils/wikifolio-utils';

const table = `
  <script id="global-data" type="application/json">{"gtmData":{"userId":"90000005"}}</script>
  <table class="c-r-table"><tbody>
    <tr class="c-r-table__tr table-group-row"><td>Aktien</td></tr>
    <tr class="c-r-table__tr">
      <td><a class="hbo-link area" href="https://www.wikifolio.com/de/de/s/de0009000001"><span>Product A</span></a><span class="isin">DE0009000001</span></td>
      <td class="tick-data"><span class="nowrap">10,00</span></td>
      <td class="tick-data-quantity">5</td>
      <td>50,00</td>
      <td><span class="nowrap">0,00</span><span class="nowrap">0,00 %</span></td>
    </tr>
  </tbody></table>`;

beforeEach(() => {
  fakeBrowser.reset();
  localStorage.clear();
  vi.stubGlobal('chrome', fakeBrowser);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  document.documentElement.lang = 'de';
  document.body.innerHTML = table;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('mainWikiFolioSaveDataToLocalStorage', () => {
  it('refuses to save outside the trade page', async () => {
    history.pushState({}, '', '/de/de/w/wf90000006');

    await expect(mainWikiFolioSaveDataToLocalStorage(true)).rejects.toThrow('not on the trade page');
    expect((await fakeBrowser.storage.local.get('WIKIFOLIO')).WIKIFOLIO).toBeUndefined();
  });

  it('falls back to the ISIN and caches a failed WKN lookup', async () => {
    history.pushState({}, '', '/de/de/my-wikifolios/trade/wf90000006');
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await mainWikiFolioSaveDataToLocalStorage(true);
    expect(rows![0]).toMatchObject({ isin: 'DE0009000001', wkn: 'DE0009000001', account_id: '90000005' });
    expect(JSON.parse(localStorage.getItem('wikifolioWknCache')!).DE0009000001.failedAt).toBeTypeOf('number');

    await mainWikiFolioSaveDataToLocalStorage(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
