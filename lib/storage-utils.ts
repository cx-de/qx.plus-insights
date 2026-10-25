import { browser, storage } from '#imports';

// Values whose localStorage form is JSON text; everything else is restored as the plain string.
const jsonLocalKeys = ['tableSortState', 'columnOrder', 'stickyColumns', 'tableExpanded', 'accountViewSelected'];

// At least one of these must be present, or the file is not a portfolio backup.
const coreKeys = ['local:MAIN_LIST', 'local:LIST_DATA', 'local:settings'];
const arrayKeys = ['local:MAIN_LIST', 'local:LIST_DATA', 'local:ALERTS', 'local:scenarios', 'local:DAILY_TOTAL', 'local:ACCOUNTS'];

// Credentials and server-controlled state: never written to a backup file, never taken from one.
// The flatex probe trio stays together: a hash from this device with an account from the file would mislabel positions.
const privateKeys = ['local:api_key', 'local:api_auth_failed', 'local:api_auth_failed_at', 'local:api_auth_fail_count',
  'local:flatexProbedToken', 'local:flatexProbedTokenHash', 'local:flatexProbedAccount', 'local:flatexProbeFailedAt', 'local:flatexUserSync',
  'local:VERSION_CHECK', 'local:api_rate_limit', 'local:UPDATE_SNOOZE', 'local:ACCOUNT_SNOOZE', 'local:FLATEX_SYNC_LOCK'];
const privateSettings = ['telegram_bot_token', 'telegram_channel_id'];

const isCash = (row: any) => String(row?.stock_name ?? '').trim().toLowerCase() === 'cash';
const countOf = (value: any) => (Array.isArray(value) ? value.length : 0);

export function backupSummary(entries: any[]) {
  const byKey: Record<string, any> = {};
  for (const item of entries || []) {
    if (item?.key) byKey[item.key] = item.value;
  }
  const mainList = Array.isArray(byKey['local:MAIN_LIST']) ? byKey['local:MAIN_LIST'] : [];
  const listData = Array.isArray(byKey['local:LIST_DATA']) ? byKey['local:LIST_DATA'] : [];
  return {
    positions: mainList.filter((row: any) => !isCash(row)).length,
    cash_lines: mainList.filter(isCash).length,
    groups: listData.filter((row: any) => row?.isGroup).length,
    history_days: countOf(byKey['local:portfolio_history']),
    daily_totals: countOf(byKey['local:DAILY_TOTAL']),
    scenarios: countOf(byKey['local:scenarios']),
    virtual_puts: countOf(byKey['local:SCENARIO_VIRTUAL_PUTS']),
    alerts: countOf(byKey['local:ALERTS']),
    accounts: countOf(byKey['local:ACCOUNTS']),
    settings: !!byKey['local:settings'],
  };
}

async function getAllData() {
  // Every key, not an allowlist: a list kept by hand silently dropped each new store.
  const snapshot = await storage.snapshot('local');
  const extension = Object.entries(snapshot)
    .map(([key, value]) => ({ key: `local:${key}`, value }))
    .filter(item => !privateKeys.includes(item.key))
    .map(item => (item.key === 'local:settings' ? { ...item, value: withoutPrivateSettings(item.value) } : item));

  const localData: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      try {
        localData[key] = JSON.parse(localStorage.getItem(key) as string);
      } catch {
        /* a plain string such as theme is not JSON; keep it as is */
        localData[key] = localStorage.getItem(key);
      }
    }
  }

  return {
    format: 'qx-insights-backup',
    version: 2,
    app_version: browser.runtime.getManifest().version,
    created_at: new Date().toISOString(),
    summary: backupSummary(extension),
    extension,
    local: localData,
  };
}

export async function exportAll(filename = 'backup.json') {
  const allData = await getAllData();
  const blob = new Blob([JSON.stringify(allData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return allData.summary;
}

function withoutPrivateSettings(settings: any) {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...settings };
  for (const field of privateSettings) delete copy[field];
  return copy;
}

function isSafeLink(link: any, token: string) {
  if (typeof link !== 'string' || link === '') return true;
  try {
    const url = new URL(link);
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && link.includes(token);
  } catch {
    /* not a URL at all, so it cannot be a usable link template */
    return false;
  }
}

// A backup may come from anyone: keep this device's credentials and drop link templates that are not plain web URLs.
function sanitizeSettings(imported: any, current: any) {
  if (!imported || typeof imported !== 'object') return imported;
  const settings = withoutPrivateSettings(imported);
  for (const field of privateSettings) {
    if (current?.[field] !== undefined) settings[field] = current[field];
  }
  if (!isSafeLink(settings.wkn_link, '$WKN')) settings.wkn_link = '';
  if (!isSafeLink(settings.isin_link, '$ISIN')) settings.isin_link = '';
  return settings;
}

function validateBackupFile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("Extension data must be an array.");
    return { valid: false, errors };
  }

  const keysInBackup = data.filter(item => item && item.key).map(item => item.key);

  if (keysInBackup.some((key: any) => typeof key !== 'string' || !key.startsWith('local:'))) {
    errors.push("Backup contains keys outside local storage.");
  }
  if (!coreKeys.some(key => keysInBackup.includes(key))) {
    errors.push("No portfolio data found in backup.");
  }
  // Wrong shapes pass the key checks, then throw on every load (e.g. MAIN_LIST.filter on an object).
  const valueOf = (key: string) => data.find((item: any) => item?.key === key)?.value;
  const badList = arrayKeys.find(key => valueOf(key) != null && !Array.isArray(valueOf(key)));
  if (badList) errors.push(`${badList} must be a list.`);
  const settings = valueOf('local:settings');
  if (settings != null && (typeof settings !== 'object' || Array.isArray(settings))) {
    errors.push("local:settings must be an object.");
  }

  return { valid: errors.length === 0, errors };
}

function readBackupFile(file: File) {
  return new Promise<any>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Read-only preview, so the user sees what an import will put back before it overwrites anything.
export async function previewBackup(file: File) {
  const parsed = await readBackupFile(file);
  const { valid, errors } = validateBackupFile(parsed?.extension);
  return { valid, errors, summary: valid ? backupSummary(parsed.extension) : null, created_at: parsed?.created_at ?? null };
}

export async function importAll(file: File) {
  const parsed = await readBackupFile(file);
  const { valid, errors } = validateBackupFile(parsed?.extension);
  if (!valid) throw errors;

  const kept = await storage.getItems(privateKeys as any);
  const currentSettings: any = await storage.getItem('local:settings');

  // A failed write after clear() would otherwise leave the user with no data at all.
  const before = await storage.snapshot('local');
  // A restore, not a merge: keys absent from the backup would otherwise mix two portfolios.
  await storage.clear('local');
  const entries = parsed.extension
    .filter((item: any) => item?.key && !privateKeys.includes(item.key) && item.value !== null && item.value !== undefined)
    .map((item: any) => (item.key === 'local:settings' ? { ...item, value: sanitizeSettings(item.value, currentSettings) } : item));
  // The file has no settings to merge into, so carry this device's Telegram credentials over on their own.
  const credentials = Object.fromEntries(privateSettings.filter(field => currentSettings?.[field] !== undefined)
    .map(field => [field, currentSettings[field]]));
  const keptSettings = !entries.some((item: any) => item.key === 'local:settings') && Object.keys(credentials).length
    ? [{ key: 'local:settings', value: credentials }] : [];
  try {
    await storage.setItems([
      ...entries.map((item: any) => ({ key: item.key, value: item.value })),
      ...keptSettings,
      ...kept.filter((item: any) => item.value !== null && item.value !== undefined),
    ]);
  } catch (err) {
    console.error('importAll error:', err);
    await storage.clear('local');
    await storage.restoreSnapshot('local', before);
    throw err;
  }

  if (parsed.local) {
    localStorage.clear();
    for (const [key, value] of Object.entries(parsed.local)) {
      try {
        localStorage.setItem(key, jsonLocalKeys.includes(key) ? JSON.stringify(value) : (value as any));
      } catch (err) {
        /* one unwritable preference must not abort the rest of the restore */
        console.error(`importAll key "${key}" error:`, err);
      }
    }
  }

  // Restored rows may predate account_id; clearing the flag lets accountMigrate
  // stamp them on next load instead of leaving them keyed as "Broker::".
  if (!entries.some((item: any) => item.key === 'local:ACCOUNTS_SCHEMA')) {
    await storage.removeItem('local:ACCOUNTS_SCHEMA');
  }

  return { valid: true, summary: backupSummary(entries) };
}

// Back to a fresh install, minus the API key and the user's language and theme; removes loaded sample data.
export async function resetAll() {
  console.log('resetAll');
  const kept = await storage.getItems(privateKeys as any);
  await storage.clear('local');
  await storage.setItems(kept.filter((item: any) => item.value !== null && item.value !== undefined));
  const keepLocal = ['theme', 'lang'].map(key => [key, localStorage.getItem(key)]);
  localStorage.clear();
  for (const [key, value] of keepLocal) if (value) localStorage.setItem(key as string, value);
}
