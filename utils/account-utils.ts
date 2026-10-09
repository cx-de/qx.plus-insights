/*
    Multi-account support: the registry of known broker accounts, the identity
    keys every merge path shares, and the one-time migration that stamps
    account_id onto data scraped before accounts existed.

    Public API is small on purpose: everything not consumed by another file is
    module-private, because WXT turns every export into a project-wide global.
*/
import { storage } from '#imports';

const ACCOUNTS_KEY = 'local:ACCOUNTS';
const SCHEMA_KEY = 'local:ACCOUNTS_SCHEMA';
const PENDING_KEY = 'local:NEW_ACCOUNTS';
const SNOOZE_KEY = 'local:ACCOUNT_SNOOZE';
const SCHEMA_VERSION = 1;
const SNOOZE_MS = 15 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000;

// Pre-2.8 single-account identity keys. Read only to seed the registry during migration.
// Consors kept its id in the broker page's localStorage, which the popup cannot read.
const LEGACY_ID_KEYS:any = {
  'Flatex': 'local:CUR_FLATEXID',
  'Wikifolio': 'local:CUR_WIKIFOLIO',
};

// Where each broker's live id lives now, so removing the last account resets it.
const CUR_ID_KEYS:any = {
  'Flatex': 'local:CUR_FLATEXID',
  'Wikifolio': 'local:CUR_WIKIFOLIO',
  'Consors Bank': 'local:CUR_CONSORSBANKID',
  'Smart Broker +': 'local:CUR_SMARTBROKERID',
  'justTRADE': 'local:CUR_JUSTTRADEID',
};

// Every store that holds position rows, so migration and pruning never miss one.
const ROW_STORES = [
  'local:MAIN_LIST',
  'local:LIST_DATA',
  'local:KONTO_FLATEX',
  'local:consorsBank',
  'local:SMART_BROKER_PLUS',
  'local:WIKIFOLIO',
  'local:JUSTTRADE',
] as const;


/* ------------------------------------------------------------------------- *
 *  View preference - shared across Home, List and Forecast
 * ------------------------------------------------------------------------- */

// Module-level refs, the repo's existing cross-route reactive pattern (see apiKey in
// helper.ts). Read synchronously so a route never paints unscoped data first.
function accountViewRead() {
  try {
    const raw = localStorage.getItem('accountViewSelected');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Content scripts auto-import this too, where localStorage is the broker page's.
    console.error('accountViewRead error:', err);
    return [];
  }
}

// Account keys to show. Empty means every account - there is no separate "all" flag.
export const accountViewSelected = ref<any[]>(accountViewRead());

// Bumped whenever the set of known accounts changes, so every open page can reload
// itself. Same module-ref pattern as apiKey in helper.ts.
export const accountsVersion = ref(0);

export function accountViewSave() {
  try {
    localStorage.setItem('accountViewSelected', JSON.stringify(accountViewSelected.value));
  } catch (err) {
    // A view preference is not worth failing a render over.
    console.error('accountViewSave error:', err);
  }
}

function accountViewCombinedRead() {
  try {
    return localStorage.getItem('accountViewCombined') === 'true';
  } catch (err) {
    // Same content-script caveat as accountViewRead; off is the safe default.
    console.error('accountViewCombinedRead error:', err);
    return false;
  }
}

// Off by default: combining is opt-in, so nobody's view changes until they flip it.
export const accountViewCombined = ref<boolean>(accountViewCombinedRead());

export function accountViewCombinedSave() {
  try {
    localStorage.setItem('accountViewCombined', String(accountViewCombined.value));
  } catch (err) {
    // A view preference is not worth failing a render over.
    console.error('accountViewCombinedSave error:', err);
  }
}

// A stored id is a safe fallback only while the broker has at most one account.
// With several, guessing which one this session is stamps rows onto the wrong
// account and accountReplaceRows then deletes that account's real holdings.
export async function accountMayFallback(broker:any) {
  return (await accountList()).filter((r:any) => r.broker === broker).length <= 1;
}

export function accountViewIsAll() {
  return !accountViewSelected.value.length;
}

// The single filter every page applies. Empty selection shows every account.
export function accountViewFilter(rows:any) {
  if (!Array.isArray(rows)) return [];
  if (accountViewIsAll()) return rows;
  return rows.filter((row:any) => accountViewSelected.value.includes(accountKeyOf(row)));
}

// Drops keys for accounts that no longer exist, so a deleted account cannot leave
// the whole portfolio filtered down to nothing. Returns true when it changed.
export function accountViewPrune(validKeys:any) {
  const kept = accountViewSelected.value.filter((key:any) => validKeys.includes(key));
  if (kept.length === accountViewSelected.value.length) return false;
  accountViewSelected.value = kept;
  accountViewSave();
  return true;
}


/* ------------------------------------------------------------------------- *
 *  Identity keys - one vocabulary shared by every merge path
 * ------------------------------------------------------------------------- */

export function accountKeyOf(item:any) {
  return `${item?.broker || ''}::${item?.account_id || ''}`;
}

// Consors is the one broker whose account id spans several depots (see accountRekey), and
// its depot number comes from the row, not the URL, so it is stable enough to key on.
// SmartBroker+ and Wikifolio derive theirs from the path, which changes per sub-route.
function accountDepotPart(item:any) {
  return item?.broker === 'Consors Bank' && item?.deposite_number
    ? `|${item.deposite_number}` : '';
}

// Pipe, not underscore: broker names contain spaces and wkn may be an ISIN.
export function accountPositionKey(item:any) {
  const key = `${accountKeyOf(item)}${accountDepotPart(item)}`;
  // Cash carries no wkn, so it needs its own namespace inside the account.
  return item?.stock_name === "Cash" ? `cash|${key}` : `${item?.wkn}|${key}`;
}

// ISIN-based sibling of accountPositionKey, for the List where rows are matched by ISIN.
export function accountRowKey(item:any) {
  return `${item?.isin}|${accountKeyOf(item)}${accountDepotPart(item)}`;
}

// The depot half of accountPositionKey, for the merge paths that match field by field.
export function accountSameDepot(a:any, b:any) {
  return accountDepotPart(a) === accountDepotPart(b);
}

export function accountLabel(broker:any, accountId:any) {
  return accountId ? `${broker} (${accountId})` : `${broker}`;
}

/* ------------------------------------------------------------------------- *
 *  Combined view - one display row per product per broker, never persisted
 * ------------------------------------------------------------------------- */

// Scale with quantity, so the combined figure is the plain sum of the children.
const COMBINE_SUM_FIELDS = [
  'stocks_owned', 'total_entry_value', 'total_value', 'profit_loss_price',
  'future_total_value', 'profit_loss_target', 'profit_loss_target_per_day',
  'position_percentage',
];

// Per account by nature: a merged value here would describe no real position.
const COMBINE_BLANK_FIELDS = [
  'id', 'account_id', 'deposite_number', 'notes', 'position_target_percentage',
  'purchase_date', 'purchase_dates', 'days_since_purchase', 'yield_pa_since_purchase',
  'page_bid', 'page_timestamp',
];

function accountCombineKey(row:any) {
  // Same broker only: the same isin at two brokers stays two rows, by design.
  if (isCashRow(row)) return `cash|${row.broker}`;
  return `${row.broker}|${row.isin || row.wkn}`;
}

function accountCombineBucket(children:any) {
  // Product fields come from a child that holds units: a zero-quantity child carries
  // sideways_return_pa 0 and would copy that onto the whole combined row.
  const base = children.find((c:any) => Number(c.stocks_owned) > 0) || children[0];
  const row:any = { ...base };
  for (const field of COMBINE_BLANK_FIELDS) delete row[field];

  for (const field of COMBINE_SUM_FIELDS) {
    // parseFloat, not +: position_percentage is stored as a toFixed string.
    row[field] = children.reduce((sum:any, c:any) => sum + (parseFloat(c[field]) || 0), 0);
  }

  // Recomputed from the sums; averaging percentages would weight a tiny lot like a big one.
  row.profit_loss_percentage = row.total_entry_value
    ? ((row.total_value / row.total_entry_value) - 1) * 100 : 0;
  row.profit_loss_target_pa = row.total_value
    ? (row.profit_loss_target / row.total_value) * 100 : 0;

  // Cost-weighted, as savePortfolioHistory folds it; a plain mean describes no real position.
  const cost = children.reduce((sum:any, c:any) =>
    sum + (parseFloat(c.stocks_owned) || 0) * (parseFloat(c.buy_price) || 0), 0);
  row.buy_price = row.stocks_owned ? cost / row.stocks_owned : 0;

  row.account_id = '';
  row.isCombined = true;
  row.combined_count = children.length;
  row.combined_accounts = children.map((c:any) => c.account_id);
  return row;
}

// Display only: callers feed this from a computed and must never write its output back.
// Groups pass through untouched, as does any product held by a single account.
export function accountCombineRows(rows:any) {
  if (!Array.isArray(rows)) return [];
  const buckets = new Map();
  const order:any[] = [];
  for (const row of rows) {
    // No isin and no wkn would key every such row as `broker|` and merge strangers.
    if (row?.isGroup || (!isCashRow(row) && !row?.isin && !row?.wkn)) { order.push(row); continue; }
    const key = accountCombineKey(row);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key).push(row);
  }
  return order.map((entry:any) => {
    if (typeof entry !== 'string') return entry;
    const children = buckets.get(entry);
    return children.length > 1 ? accountCombineBucket(children) : children[0];
  });
}


// Page injection must read the account whose page this is, not the first row carrying
// that isin. An unresolved id falls back to everything rather than injecting nothing.
export async function accountOwnRows(rows:any, broker:any, accountId:any) {
  if (!Array.isArray(rows)) return [];
  if (accountId) return rows.filter((row:any) => row.broker === broker && row.account_id === accountId);

  // Unknown id with several accounts is the state flatexResolveAccountId deliberately
  // leaves behind, and guessing there paints the other depot's figures onto the page.
  if (!await accountMayFallback(broker)) return [];
  return rows.filter((row:any) => row.broker === broker);
}


/* ------------------------------------------------------------------------- *
 *  Registry
 * ------------------------------------------------------------------------- */

export async function accountList() {
  const rows = await storage.getItem(ACCOUNTS_KEY);
  return Array.isArray(rows) ? rows : [];
}

async function accountRegister(broker:any, accountId:any) {
  console.log("accountRegister", broker, accountId);
  if (!broker) return [];

  const rows = await accountList();
  const now = new Date().toISOString();
  const existing = rows.find((r:any) => r.broker === broker && r.account_id === accountId);

  if (existing) {
    const label = accountLabel(broker, accountId);
    // The scrapers call this every 10s tick. Writing every time fires
    const stale = !existing.last_seen
      || (Date.now() - Date.parse(existing.last_seen)) > LAST_SEEN_THROTTLE_MS;
    if (!stale && existing.label === label) return rows;
    existing.last_seen = now;
    existing.label = label;
    await storage.setItem(ACCOUNTS_KEY, rows);
    return rows;
  }

  // A real id arriving for a broker that only had a blank placeholder means those
  // unattributed rows belong to it - adopt them instead of leaving a duplicate account.
  if (accountId) {
    const placeholderAt = rows.findIndex((r:any) => r.broker === broker && !r.account_id);
    if (placeholderAt !== -1) {
      await accountStampBlankRows(broker, accountId);
      rows.splice(placeholderAt, 1);
    }
  }

  rows.push({
    broker,
    account_id: accountId || '',
    label: accountLabel(broker, accountId),
    first_seen: now,
    last_seen: now,
  });
  await storage.setItem(ACCOUNTS_KEY, rows);
  return rows;
}

async function accountRemove(broker:any, accountId:any) {
  console.log("accountRemove", broker, accountId);
  const rows = await accountList();
  const kept = rows.filter((r:any) => !(r.broker === broker && r.account_id === accountId));
  await storage.setItem(ACCOUNTS_KEY, kept);
  return kept;
}


/* ------------------------------------------------------------------------- *
 *  Row walking
 * ------------------------------------------------------------------------- */

// LIST_DATA nests rows one level deep inside user-made groups; every other store is flat.
function accountWalkRows(entries:any, visit:any) {
  if (!Array.isArray(entries)) return false;
  let touched = false;
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.isGroup && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (item && visit(item)) touched = true;
      }
      continue;
    }
    if (visit(entry)) touched = true;
  }
  return touched;
}

// Adopts rows left unattributed by migration once the broker's real id is known.
async function accountStampBlankRows(broker:any, accountId:any) {
  console.log("accountStampBlankRows", broker, accountId);
  for (const key of ROW_STORES) {
    const rows = await storage.getItem(key);
    const touched = accountWalkRows(rows, (row:any) => {
      if (row.broker !== broker || row.account_id) return false;
      row.account_id = accountId;
      return true;
    });
    if (touched) await storage.setItem(key, rows);
  }
  await accountRekeyDailyTotals(`${broker}::`, `${broker}::${accountId}`);
  // Blank history rows match no account, so Top Movers would drop them under any filter.
  await accountEditHistory((rows:any) => accountWalkRows(rows, (row:any) => {
    if (row.broker !== broker || row.account_id) return false;
    row.account_id = accountId;
    return true;
  }));
}


/* ------------------------------------------------------------------------- *
 *  Slice writes
 * ------------------------------------------------------------------------- */

// Replaces only the scraped account's rows. A plain overwrite would delete every
// sibling account of the same broker, which is what made multi-account impossible.
// depositeNumber narrows the slice further for Consors, whose depot switcher shows
// several depots under one customer id - without it, switching depot wipes the other.
export function accountReplaceRows(stored:any, fresh:any, brokerName:any, accountId:any, depositeNumber:any = undefined) {
  const rows = Array.isArray(stored) ? stored : [];
  const incoming = Array.isArray(fresh) ? fresh : [];
  const kept = rows.filter((row:any) => {
    if (row?.broker !== brokerName) return true;
    if (row?.account_id !== accountId) return true;
    if (depositeNumber !== undefined && row?.deposite_number !== depositeNumber) return true;
    return false;
  });
  return [...kept, ...incoming];
}


/* ------------------------------------------------------------------------- *
 *  Write freeze
 * ------------------------------------------------------------------------- */

async function accountPendingList() {
  const rows = await storage.getItem(PENDING_KEY);
  return Array.isArray(rows) ? rows : [];
}

async function accountPendingAdd(broker:any, accountId:any) {
  const rows = await accountPendingList();
  if (rows.some((r:any) => r.broker === broker && r.account_id === accountId)) return rows;
  console.log("accountPendingAdd", broker, accountId);
  rows.push({ broker, account_id: accountId, detected_at: new Date().toISOString() });
  await storage.setItem(PENDING_KEY, rows);
  return rows;
}

async function accountPendingRemove(broker:any, accountId:any) {
  console.log("accountPendingRemove", broker, accountId);
  const rows = await accountPendingList();
  const kept = rows.filter((r:any) => !(r.broker === broker && r.account_id === accountId));
  await storage.setItem(PENDING_KEY, kept);
  return kept;
}

// Extension storage, not localStorage: the content script and the popup have separate
// localStorage, which is why the old flatexSnoozeUntil removal never actually worked.
export async function accountSnooze(broker:any, accountId:any) {
  console.log("accountSnooze", broker, accountId);
  const map:any = (await storage.getItem(SNOOZE_KEY)) || {};
  map[`${broker}::${accountId}`] = Date.now() + SNOOZE_MS;
  await storage.setItem(SNOOZE_KEY, map);
  return map;
}

async function accountSnoozeClear(broker:any, accountId:any) {
  const map:any = (await storage.getItem(SNOOZE_KEY)) || {};
  delete map[`${broker}::${accountId}`];
  await storage.setItem(SNOOZE_KEY, map);
}

// Brokers whose writes are frozen by an unanswered account prompt. Per-broker on
// purpose: the old global flag let a flatex prompt freeze the other three too.
export async function accountFrozenBrokers() {
  try {
    const rows = await accountPendingList();
    return rows.map((r:any) => r.broker);
  } catch (err) {
    // Freezing is a safety net, not a correctness requirement - never block a merge on it.
    console.error('accountFrozenBrokers error:', err);
    return [];
  }
}

// The prompt the popup should show next, or null while every pending one is snoozed.
export async function accountNextPrompt() {
  const rows = await accountPendingList();
  if (!rows.length) return null;
  const map:any = (await storage.getItem(SNOOZE_KEY)) || {};
  const now = Date.now();
  return rows.find((r:any) => !(map[`${r.broker}::${r.account_id}`] > now)) || null;
}

// Migration could only see deposite_number for Consors, so its real customer id would
// otherwise look like a brand-new account and pop a prompt the user never caused.
async function accountRekey(broker:any, oldId:any, newId:any) {
  console.log("accountRekey", broker, oldId, newId);
  for (const key of ROW_STORES) {
    const rows = await storage.getItem(key);
    const touched = accountWalkRows(rows, (row:any) => {
      if (row.broker !== broker || row.account_id !== oldId) return false;
      row.account_id = newId;
      return true;
    });
    if (touched) await storage.setItem(key, rows);
  }
  await accountRekeyDailyTotals(`${broker}::${oldId}`, `${broker}::${newId}`);
  // Old ids left in history make Top Movers find no movers once the new id is filtered on.
  await accountEditHistory((rows:any) => accountWalkRows(rows, (row:any) => {
    if (row.broker !== broker || row.account_id !== oldId) return false;
    row.account_id = newId;
    return true;
  }));
  const accounts = await accountList();
  const entry = accounts.find((r:any) => r.broker === broker && r.account_id === oldId);
  if (!entry) return;

  // Several depots can fold into one customer id; keep a single registry row.
  const target = accounts.find((r:any) => r.broker === broker && r.account_id === newId);
  if (target) {
    accounts.splice(accounts.indexOf(entry), 1);
  } else {
    entry.account_id = newId;
    entry.label = accountLabel(broker, newId);
  }
  await storage.setItem(ACCOUNTS_KEY, accounts);
}

// Without this a rekeyed account loses its Forecast history under the account filter.
async function accountRekeyDailyTotals(oldKey:any, newKey:any) {
  console.log("accountRekeyDailyTotals", oldKey, newKey);
  const days = await storage.getItem('local:DAILY_TOTAL');
  if (!Array.isArray(days)) return;
  let touched = false;
  for (const day of days as any[]) {
    if (!day?.accounts || day.accounts[oldKey] === undefined) continue;
    // Several depots fold into one customer id, so their values add up rather than overwrite.
    day.accounts[newKey] = (day.accounts[newKey] || 0) + day.accounts[oldKey];
    delete day.accounts[oldKey];
    touched = true;
  }
  if (touched) await storage.setItem('local:DAILY_TOTAL', days);
}

// Kept out of ROW_STORES: accountKeysInRows would re-register deleted accounts from old days.
async function accountEditHistory(edit:any) {
  const history = await storage.getItem('local:portfolio_history');
  if (!Array.isArray(history)) return;
  let touched = false;
  for (const entry of history as any[]) {
    if (!Array.isArray(entry?.accounts)) continue;
    const next = edit(entry.accounts);
    if (next === false) continue;
    if (next !== true) entry.accounts = next;
    touched = true;
  }
  console.log("accountEditHistory touched", touched);
  if (touched) await storage.setItem('local:portfolio_history', history);
}

// Depot numbers actually stamped on this broker's rows. Migration used these as
// account ids, so they identify the ghost entries a real customer id should absorb.
async function accountDepositeNumbers(broker:any) {
  const found = new Set();
  for (const key of ROW_STORES) {
    accountWalkRows(await storage.getItem(key), (row:any) => {
      if (row.broker === broker && row.deposite_number) found.add(String(row.deposite_number));
      return false;
    });
  }
  return found;
}

// One decision point for all four brokers. Returns the id to stamp on rows, or null
// while a prompt is pending - which is what keeps that broker's writes frozen.
export async function accountDetect(broker:any, accountId:any, legacyId:any = undefined) {
  if (!accountId) return null;
  const accounts = await accountList();

  if (accounts.some((r:any) => r.broker === broker && r.account_id === accountId)) {
    await accountRegister(broker, accountId);
    return accountId;
  }

  // Same account under the id migration had to guess with - adopt it, do not prompt.
  // Consors stamps one entry per depot, so fold every depot-numbered entry of this
  // broker into the real customer id or the others stay as duplicate ghost accounts.
  if (legacyId !== undefined && legacyId !== null && legacyId !== accountId
      && accounts.some((r:any) => r.broker === broker && r.account_id === legacyId)) {
    // Only ids that are depot numbers of this broker, never another real customer
    // the user has already accepted - folding that would silently merge two accounts.
    const depotNumbers = await accountDepositeNumbers(broker);
    const depotIds = accounts
      .filter((r:any) => r.broker === broker && r.account_id !== accountId
        && (r.account_id === legacyId || depotNumbers.has(String(r.account_id))))
      .map((r:any) => r.account_id);
    for (const oldId of depotIds) await accountRekey(broker, oldId, accountId);
    return accountId;
  }

  // First account ever seen for this broker: adopt silently, as before multi-account.
  // A blank placeholder from migration counts as "none yet" - prompting against a
  // ghost would ask the user about an account they already have.
  const real = accounts.filter((r:any) => r.broker === broker && r.account_id);
  if (!real.length) {
    await accountRegister(broker, accountId);
    return accountId;
  }

  await accountPendingAdd(broker, accountId);
  return null;
}

export async function accountAccept(broker:any, accountId:any) {
  console.log("accountAccept", broker, accountId);
  await accountRegister(broker, accountId);
  await accountPendingRemove(broker, accountId);
  await accountSnoozeClear(broker, accountId);
  accountsVersion.value++;
}


/* ------------------------------------------------------------------------- *
 *  Reconcile
 * ------------------------------------------------------------------------- */

// Every distinct broker + account_id actually present in the stored rows.
async function accountKeysInRows() {
  const found = new Map();
  for (const key of ROW_STORES) {
    accountWalkRows(await storage.getItem(key), (row:any) => {
      if (!row.broker) return false;
      found.set(`${row.broker}::${row.account_id || ''}`,
        { broker: row.broker, account_id: row.account_id || '' });
      return false;
    });
  }
  return found;
}

// The picker filters on accountKeyOf(row), so any drift between the registry and the
// ids actually stamped on rows makes a selection match nothing. Rows written by an
// older build, a half-finished migration or a broker seen before its id resolved all
// cause that, so heal both directions instead of trusting either side.
export async function accountReconcile() {
  try {
    const found = await accountKeysInRows();
    const accounts = await accountList();
    let changed = false;

    // Rows still unattributed: adopt them when the broker has exactly one real account.
    for (const entry of found.values() as any) {
      if (entry.account_id) continue;
      const real = accounts.filter((r:any) => r.broker === entry.broker && r.account_id);
      if (real.length !== 1) continue;
      await accountStampBlankRows(entry.broker, real[0].account_id);
      changed = true;
    }

    // Ids present on rows but missing from the registry - otherwise those positions
    // are unreachable from the picker and silently vanish whenever a filter is on.
    for (const entry of found.values() as any) {
      if (!entry.account_id) continue;
      if (accounts.some((r:any) => r.broker === entry.broker && r.account_id === entry.account_id)) continue;
      await accountRegister(entry.broker, entry.account_id);
      changed = true;
    }

    // Deliberately does not bump accountsVersion: the watcher that reloads accounts
    // calls this, and bumping here would re-enter it.
    if (changed) console.log("accountReconcile repaired", await accountList());
    return changed;
  } catch (err) {
    // Reconciling is a repair pass; a failure must not stop the picker rendering.
    console.error('accountReconcile error:', err);
    return false;
  }
}


/* ------------------------------------------------------------------------- *
 *  Scoped clear
 * ------------------------------------------------------------------------- */

// Drops one account's rows from a store. Groups are one level deep (combineRows
// pushes base items only), and a group emptied by the removal goes with them.
function accountPruneRows(entries:any, broker:any, accountId:any) {
  if (!Array.isArray(entries)) return null;
  const kept = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.isGroup && Array.isArray(entry.items)) {
      const items = entry.items.filter((i:any) => !(i?.broker === broker && i?.account_id === accountId));
      if (!items.length) continue;
      kept.push({ ...entry, items });
      continue;
    }
    if (entry.broker === broker && entry.account_id === accountId) continue;
    kept.push(entry);
  }
  return kept;
}

// Replace deletes one account, never the whole portfolio - clearAllStockData wiped
// every broker, so switching a flatex login also destroyed Consors and Wikifolio data.
export async function accountClearData(broker:any, accountId:any) {
  console.log("accountClearData", broker, accountId);
  try {
    for (const key of ROW_STORES) {
      const kept = accountPruneRows(await storage.getItem(key), broker, accountId);
      if (kept) await storage.setItem(key, kept);
    }
    // The merged `data` fold stays: it cannot be split per account, and it is only a fallback.
    await accountEditHistory((rows:any) => {
      const kept:any = accountPruneRows(rows, broker, accountId);
      return kept.length === rows.length ? false : kept;
    });
    // A removed account's DAILY_TOTAL slice would otherwise linger in Forecast history.
    const days = await storage.getItem('local:DAILY_TOTAL');
    if (Array.isArray(days)) {
      const dead = `${broker}::${accountId}`;
      let touched = false;
      for (const day of days as any[]) {
        if (!day?.accounts || day.accounts[dead] === undefined) continue;
        delete day.accounts[dead];
        touched = true;
      }
      if (touched) await storage.setItem('local:DAILY_TOTAL', days);
    }

    await accountRemove(broker, accountId);
    await accountPendingRemove(broker, accountId);
    await accountSnoozeClear(broker, accountId);

    const left = (await accountList()).filter((r:any) => r.broker === broker);
    const idKey = CUR_ID_KEYS[broker];
    if (idKey) {
      if (!left.length) {
        // Last account for this broker: drop the identity key so the next login is
        // adopted silently again instead of prompting against a registry ghost.
        await storage.removeItem(idKey);
      } else if (String(await storage.getItem(idKey)) === String(accountId)) {
        // Never leave it pointing at the account we just deleted - the flatex daily
        // guard reuses this value and would stamp rows with a dead id.
        await storage.setItem(idKey, left[0].account_id);
      }
    }
    if (broker === 'Flatex' && !left.length) await storage.removeItem('local:FLATEX_PURCHASE_DATES');
    if (broker === 'justTRADE') {
      // ISIN cache is keyed "account|name"; stale entries would re-key a re-added account's rows.
      const isins:any = (await storage.getItem('local:JUSTTRADE_ISINS')) || {};
      for (const key of Object.keys(isins)) if (key.startsWith(`${accountId}|`)) delete isins[key];
      await storage.setItem('local:JUSTTRADE_ISINS', isins);
    }
    accountsVersion.value++;
    return true;
  } catch (err) {
    // A partial clear is recoverable via Settings; throwing would leave the dialog stuck.
    console.error('accountClearData error:', err);
    return false;
  }
}


/* ------------------------------------------------------------------------- *
 *  One-time migration
 * ------------------------------------------------------------------------- */

// Seeds account_id from the id already stored for that broker. Never from the
// account that happens to be open now: a user whose data is from account A but
// who opens B first would otherwise have A's rows re-attributed to B.
async function accountLegacyIds() {
  const ids:any = {};
  for (const broker of Object.keys(LEGACY_ID_KEYS)) {
    const id = await storage.getItem(LEGACY_ID_KEYS[broker]);
    if (id) ids[broker] = String(id);
  }
  return ids;
}

export async function accountMigrate() {
  try {
    const schema = await storage.getItem(SCHEMA_KEY);
    if (schema === SCHEMA_VERSION) return false;
    console.log("accountMigrate", schema);

    const legacyIds = await accountLegacyIds();
    const seen:any = {};

    for (const key of ROW_STORES) {
      const rows = await storage.getItem(key);
      const touched = accountWalkRows(rows, (row:any) => {
        if (!row.broker) return false;
        if (row.account_id === undefined || row.account_id === null) {
          // Consors and SmartBroker+ have no stored customer id; their depot number is
          // the only attribution available until the next live scrape supplies one.
          row.account_id = legacyIds[row.broker] || row.deposite_number || '';
        }
        seen[`${row.broker}::${row.account_id}`] = { broker: row.broker, account_id: row.account_id };
        return true;
      });
      if (touched) await storage.setItem(key, rows);
    }

    // A broker with a stored id but no rows yet still belongs in the picker.
    for (const broker of Object.keys(legacyIds)) {
      seen[`${broker}::${legacyIds[broker]}`] = { broker, account_id: legacyIds[broker] };
    }

    for (const entry of Object.values(seen) as any[]) {
      await accountRegister(entry.broker, entry.account_id);
    }

    await storage.setItem(SCHEMA_KEY, SCHEMA_VERSION);
    console.log("accountMigrate done", await accountList());
    return true;
  } catch (err) {
    // Migration is best-effort: a throw here must not stop scraping or the popup from loading.
    console.error('accountMigrate error:', err);
    return false;
  }
}
