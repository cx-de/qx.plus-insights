import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { exportAll, importAll } from '@/lib/storage-utils';

// Node has no FileReader or DOM; importAll only needs readAsText, exportAll only a link to click.
const backupFile = (data: any) => ({ text: JSON.stringify(data) }) as any;

const exportedBackup = async () => {
  let blob: any;
  // spyOn, not Object.assign: restoreAllMocks puts the real URL statics back for later tests.
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => { blob = b; return 'blob:x'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ click: () => {} }) });
  await exportAll();
  return JSON.parse(await blob.text());
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({ version: '1.0.0' } as any);
  vi.stubGlobal('FileReader', class {
    result: any; onload: any; onerror: any;
    readAsText(file: any) { this.result = file.text; this.onload(); }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportAll', () => {
  it('leaves credentials out of the backup file', async () => {
    await storage.setItem('local:MAIN_LIST', [{ wkn: 'X' }]);
    await storage.setItem('local:api_key', 'qxp_secret');
    await storage.setItem('local:flatexProbedTokenHash', 'abc');
    await storage.setItem('local:settings', { price_duration: 1, telegram_bot_token: '1:AA', telegram_channel_id: '-100' });

    const backup = await exportedBackup();
    const keys = backup.extension.map((item: any) => item.key);

    expect(keys).toContain('local:MAIN_LIST');
    expect(keys).not.toContain('local:api_key');
    expect(keys).not.toContain('local:flatexProbedTokenHash');
    expect(backup.extension.find((item: any) => item.key === 'local:settings').value).toEqual({ price_duration: 1 });
  });
});

describe('importAll', () => {
  it('keeps this device credentials and ignores the ones in the file', async () => {
    await storage.setItem('local:api_key', 'mine');
    await storage.setItem('local:settings', { telegram_bot_token: 'my-bot', telegram_channel_id: 'my-chat' });

    await importAll(backupFile({
      extension: [
        { key: 'local:MAIN_LIST', value: [{ wkn: 'X' }] },
        { key: 'local:api_key', value: 'attacker' },
        { key: 'local:VERSION_CHECK', value: { data: { store_url: 'https://evil.example' } } },
        { key: 'local:settings', value: { telegram_bot_token: 'evil-bot', telegram_channel_id: 'evil-chat', price_duration: 2 } },
      ],
    }));

    expect(await storage.getItem('local:api_key')).toBe('mine');
    expect(await storage.getItem('local:VERSION_CHECK')).toBeNull();
    expect(await storage.getItem('local:settings')).toEqual({ telegram_bot_token: 'my-bot', telegram_channel_id: 'my-chat', price_duration: 2 });
    expect(await storage.getItem('local:MAIN_LIST')).toEqual([{ wkn: 'X' }]);
  });

  it('keeps Telegram credentials when the file has no settings', async () => {
    await storage.setItem('local:settings', { telegram_bot_token: 'my-bot', telegram_channel_id: 'my-chat', price_duration: 1 });

    await importAll(backupFile({ extension: [{ key: 'local:MAIN_LIST', value: [] }] }));

    expect(await storage.getItem('local:settings')).toEqual({ telegram_bot_token: 'my-bot', telegram_channel_id: 'my-chat' });
  });

  it('keeps the flatex probe pairing of this device together', async () => {
    await storage.setItem('local:flatexProbedTokenHash', 'mine');
    await storage.setItem('local:flatexProbedAccount', 'A');
    await storage.setItem('local:flatexUserSync', '2026-10-13');

    await importAll(backupFile({
      extension: [
        { key: 'local:MAIN_LIST', value: [] },
        { key: 'local:flatexProbedAccount', value: 'B' },
        { key: 'local:flatexUserSync', value: '2026-10-13' },
      ],
    }));

    expect(await storage.getItem('local:flatexProbedTokenHash')).toBe('mine');
    expect(await storage.getItem('local:flatexProbedAccount')).toBe('A');
  });

  it('rejects a backup whose list keys are not lists', async () => {
    await storage.setItem('local:MAIN_LIST', [{ wkn: 'KEEP' }]);

    await expect(importAll(backupFile({ extension: [{ key: 'local:MAIN_LIST', value: { wkn: 'X' } }] }))).rejects.toBeTruthy();

    expect(await storage.getItem('local:MAIN_LIST')).toEqual([{ wkn: 'KEEP' }]);
  });

  it('puts the old data back when the write fails', async () => {
    await storage.setItem('local:MAIN_LIST', [{ wkn: 'KEEP' }]);
    vi.spyOn(storage, 'setItems').mockRejectedValueOnce(new Error('quota'));

    await expect(importAll(backupFile({ extension: [{ key: 'local:MAIN_LIST', value: [{ wkn: 'NEW' }] }] }))).rejects.toThrow('quota');

    expect(await storage.getItem('local:MAIN_LIST')).toEqual([{ wkn: 'KEEP' }]);
  });

  it('never takes the rate limit from the file', async () => {
    await importAll(backupFile({
      extension: [{ key: 'local:MAIN_LIST', value: [] }, { key: 'local:api_rate_limit', value: { until: 9e15 } }],
    }));

    expect(await storage.getItem('local:api_rate_limit')).toBeNull();
  });

  it('drops link templates that are not web URLs', async () => {
    await importAll(backupFile({
      extension: [{ key: 'local:settings', value: { isin_link: 'javascript:alert(1)//$ISIN', wkn_link: 'https://ariva.de/$WKN' } }],
    }));

    expect(await storage.getItem('local:settings')).toEqual({ isin_link: '', wkn_link: 'https://ariva.de/$WKN' });
  });
});
