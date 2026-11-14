import { browser, storage } from '#imports';
import en from '~/entrypoints/home/locales/en.json';
import de from '~/entrypoints/home/locales/de.json';
import { escapeHtml, germanToNumer, getApiKey, isApiRateLimited, isCashRow, isDerivativeType, isFeedBlocked, numberToGerman, sendTelegramMessage, unitPriceToGerman } from './helper';
import { accountKeyOf, accountPositionKey } from './account-utils';
import { refreshPricesHeadless } from './price-data-utils';
import { languageGet } from './language-utils';

export const TOTAL_COLUMNS = [
  'total_entry_value', 'profit_loss_price',
  'total_value','future_total_value',
  'profit_loss_target',
  'profit_loss_target_per_day',
  'profit_loss_percentage', //keep this last for manual process
];
export const WEIGHTED_COLUMNS = ['distance_to_the_cap', 'sideways_return_pa'];

export const CONDITION_KEYS:any = {
  '>=': 'condition_gte',
  '>': 'condition_gt',
  '<=': 'condition_lte',
  '<': 'condition_lt',
  '==': 'condition_eq',
};

const UNIT_PRICE_FIELDS = ['buy_price', 'bid', 'ask'];

// Stored conditions stay ASCII (evaluateAlerts matches on them); people read the typographic sign.
const CONDITION_SYMBOLS:any = { '>=': '≥', '<=': '≤', '==': '=', '!=': '≠' };
export function conditionSymbol(condition:string) {
  return CONDITION_SYMBOLS[condition] ?? condition;
}

// Alert values on unit-price fields use the same precision as the table cell.
export function alertValueText(value:any, field:string, instrumentType?:string) {
  return UNIT_PRICE_FIELDS.includes(field) ? unitPriceToGerman(value, instrumentType) : numberToGerman(value);
}

function parseGermanNumber(value:any) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  return germanToNumer(value);
}

export function sumTotals(rows:any) {
  const totals:any = {};
  for (const key of TOTAL_COLUMNS) {
    totals[key] = rows.reduce((sum:any, row:any) => {
      let value = parseFloat(row[key]);
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  }

  // Guarded: a filter matching only cash or zero-cost rows would otherwise show NaN or Infinity
  totals.profit_loss_percentage = totals.total_entry_value
    ? ((totals.total_value / totals.total_entry_value) - 1) * 100 : 0;

  // Weighted by total_value, not position_percentage: that one is portfolio-wide and wrong under a filter
  let weightSum = 0, distSum = 0, sidewaysSum = 0;
  for (const row of rows) {
    if (!isDerivativeType(row.type) || row.stock_name === 'Cash') continue;
    const weight = parseFloat(row.total_value);
    if (!(weight > 0)) continue;
    weightSum += weight;
    distSum += (parseFloat(row.distance_to_the_cap) || 0) * weight;
    sidewaysSum += (parseFloat(row.sideways_return_pa) || 0) * weight;
  }
  totals.distance_to_the_cap = weightSum ? distSum / weightSum : 0;
  totals.sideways_return_pa = weightSum ? sidewaysSum / weightSum : 0;

  // Same formula as the per-row badge in PeerProductsCard
  totals.peer_members = rows.reduce((sum:number, row:any) =>
    sum + (row.peer_switch?.gainPerPiece || 0) * (Number(row.stocks_owned) || 0), 0);

  for (const key in totals) {
    totals[key] = parseFloat(totals[key]).toFixed(2);
  }
  return totals;
}

export function computeGroupTotals(items:any, totalAll:any) {
  let total_entry_value = 0;
  let profit_loss_price = 0;
  let total_value = 0;
  let position_target_percentage = 0;
  let future_total_value = 0;
  let profit_loss_target_per_day = 0;

  for (const item of items) {
    // Cash has no units or bid; its balance is both entry and value, so it adds no P/L.
    if (isCashRow(item)) {
      const balance = Number(item.total_entry_value) || 0;
      total_value += balance;
      total_entry_value += balance;
      continue;
    }

    const totalValue = (item.stocks_owned || 0) * (item.bid || 0);
    total_value += totalValue;
    profit_loss_price += totalValue - (item.total_entry_value || 0);
    total_entry_value += parseGermanNumber(item.total_entry_value);
    position_target_percentage += parseGermanNumber(item.position_target_percentage);
    future_total_value += parseGermanNumber(item.future_total_value);
    profit_loss_target_per_day += parseGermanNumber(item.profit_loss_target_per_day);
  }

  const profit_loss_percentage = total_entry_value > 0
    ? ((total_value / total_entry_value) - 1) * 100
    : 0;

  const position_percentage = totalAll > 0
    ? Number(((total_value / totalAll) * 100).toFixed(2))
    : 0;

  return {
    total_entry_value,
    profit_loss_price,
    profit_loss_percentage,
    total_value,
    position_percentage,
    position_target_percentage,
    future_total_value,
    profit_loss_target_per_day,
  };
}

// Alerts written before the multi-account key carry no account, so they keep
// matching on wkn alone rather than going silent.
export function alertMatchesRow(alert:any, item:any) {
  if (!alert?.account_id) return true;
  // A combined row stands for all its accounts, so any child's alert shows on it.
  if (item?.isCombined) {
    return alert.broker === item.broker && (item.combined_accounts || []).includes(alert.account_id);
  }
  return accountKeyOf(item) === accountKeyOf(alert);
}

function isConditionSatisfied(current:number, condition:string, target:number) {
  switch (condition) {
    case '==': return current == target;
    case '!=': return current != target;
    case '>': return current > target;
    case '<': return current < target;
    case '>=': return current >= target;
    case '<=': return current <= target;
    default: return false;
  }
}

// LIST_DATA copies are refreshed only by the List page, so group members are re-read from MAIN_LIST.
function groupTotalsById(rows:any[], listData:any) {
  const byKey = new Map(rows.map(row => [accountPositionKey(row), row]));
  const totalAll = rows.reduce((acc, row) => acc + Number(row.total_value || 0), 0);
  const map:any = {};
  for (const entry of Array.isArray(listData) ? listData : []) {
    if (!entry?.isGroup || !entry?.id || !Array.isArray(entry.items)) continue;
    // A sold member is gone from MAIN_LIST; its stale copy must not keep counting.
    const items = entry.items.map((item:any) => byKey.get(accountPositionKey(item))).filter(Boolean);
    if (items.length) map[entry.id] = computeGroupTotals(items, totalAll);
  }
  return map;
}

// Unfiltered on purpose: alerts must fire on the real portfolio, not on the current account view.
export function evaluateAlerts(alerts:any, mainList:any, listData:any) {
  const rows = Array.isArray(mainList) ? mainList : [];
  // An empty list sums to 0, which would fire every "below" alert on a cleared or half-written store.
  if (!rows.length) return [];
  const matches:any[] = [];
  let total:any = null;
  let groups:any = null;

  for (const alert of Array.isArray(alerts) ? alerts : []) {
    if (!alert || alert.status === 1) continue;

    let item:any;
    if (alert.type === 'stock') {
      item = rows.find((i:any) => i.wkn === alert.type_id && i.stock_name === alert.stock_name && alertMatchesRow(alert, i));
    } else if (alert.type === 'total') {
      total ??= sumTotals(rows);
      item = total;
    } else if (alert.type === 'group') {
      groups ??= groupTotalsById(rows, listData);
      item = groups[alert.type_id];
    }
    if (!item) continue;

    const raw = item[alert.field];
    const currentValue = raw == null ? NaN : Number(raw);
    // alert_value is saved as a toFixed string; comparing strings would order "9" above "10".
    const target = Number(alert.alert_value);
    if (!Number.isFinite(currentValue) || !Number.isFinite(target)) continue;
    if (!isConditionSatisfied(currentValue, alert.condition, target)) continue;

    matches.push({ alert, currentValue, instrumentType: alert.type === 'stock' ? item.type : undefined });
  }
  return matches;
}

// The worker has no localStorage, so the dashboard's i18n instance cannot load here.
function alertTranslator(lang:string) {
  const messages:any = lang === 'en' ? en : de;
  return (key:string, params:any = {}) => String(messages[key] ?? (de as any)[key] ?? key)
    .replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

function telegramText(event:any, t:any) {
  // Newlines, not <br/>: Telegram HTML mode rejects <br> and the whole alert was dropped.
  const contextLine =
    event.contextKey === 'stock_name'
      ? `<strong>${t('stock_name')}</strong>: ${escapeHtml(event.stockName)}\n`
      : event.contextKey === 'group_name'
        ? `<strong>${t('group_name')}</strong>: ${escapeHtml(event.stockName)}\n`
        : `<strong>${t('total')}</strong>\n`;
  return `🚨${t('alert')}\n\n` +
    `<strong>${t('alert_name')}</strong>: ${escapeHtml(event.alertName)}\n` +
    contextLine +
    `<strong>${t(event.field)}</strong> ${escapeHtml(event.condition)} <strong>${alertValueText(event.alertValue, event.field, event.instrumentType)}</strong>\n` +
    `<strong>${t('current')}</strong>: ${alertValueText(event.currentValue, event.field, event.instrumentType)}`;
}

function notificationText(events:any[], t:any) {
  if (events.length > 1) {
    return {
      title: t('alerts_triggered_count', { count: events.length }),
      message: events.map(e => e.alertName || e.stockName || t('total')).join(', '),
    };
  }
  const e = events[0];
  const context = e.contextKey ? `${e.stockName}: ` : `${t('total')}: `;
  return {
    title: `${t('alert_triggered')}: ${e.alertName}`,
    message: `${context}${t(e.field)} ${conditionSymbol(e.condition)} ${alertValueText(e.alertValue, e.field, e.instrumentType)} (${t('current')} ${alertValueText(e.currentValue, e.field, e.instrumentType)})`,
  };
}

const MAX_ALERT_EVENTS = 50;

async function alertCheckPass() {
  // Demo positions must never reach Telegram or the system tray.
  if (await storage.getItem('local:SAMPLE_DATA')) return;

  const mainList:any = await storage.getItem('local:MAIN_LIST') || [];
  const listData:any = await storage.getItem('local:LIST_DATA') || [];
  // Read last, right before the write, so an alert deleted or edited meanwhile is not fired.
  const alerts:any[] = await storage.getItem('local:ALERTS') || [];
  const matches = evaluateAlerts(alerts, mainList, listData);
  console.log('runAlertCheck', matches.length);
  if (!matches.length) return;

  // Completed before any side effect: a worker killed mid-send must not fire these again.
  matches.forEach(m => { m.alert.status = 1; });
  await storage.setItem('local:ALERTS', alerts);

  const at = Date.now();
  const events = matches.map(({ alert, currentValue, instrumentType }) => ({
    id: alert.id ?? crypto.randomUUID(),
    at,
    alertName: alert.alert_name ?? '',
    contextKey: alert.type === 'stock' ? 'stock_name' : alert.type === 'group' ? 'group_name' : null,
    stockName: alert.stock_name ?? '',
    field: alert.field,
    condition: alert.condition,
    alertValue: Number(alert.alert_value),
    currentValue,
    instrumentType,
  }));
  const pending:any = await storage.getItem('local:ALERT_EVENTS') || [];
  await storage.setItem('local:ALERT_EVENTS', [...(Array.isArray(pending) ? pending : []), ...events].slice(-MAX_ALERT_EVENTS));

  const t = alertTranslator(await languageGet());
  const settings:any = await storage.getItem('local:settings') || {};
  if (settings.telegram_bot_token && settings.telegram_channel_id) {
    for (const event of events) {
      // sendTelegramMessage logs and returns null on failure, so one bad send never blocks the rest.
      await sendTelegramMessage(settings.telegram_bot_token, settings.telegram_channel_id, telegramText(event, t));
    }
  }

  try {
    // Optional permission: without it the API is absent, and the dashboard dialog is the only signal.
    if (!browser.notifications) return;
    const { title, message } = notificationText(events, t);
    await browser.notifications.create(`qx-alert-${at}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });
  } catch (err) {
    /* notifications blocked by the OS or browser: the dashboard dialog still lists the events */
    console.error('runAlertCheck notification error:', err);
  }
}

let alertCheckRunning = false;
let alertCheckAgain = false;

// A trigger during a pass reruns it afterwards, so prices stored mid-pass are never skipped.
export async function runAlertCheck() {
  if (alertCheckRunning) {
    alertCheckAgain = true;
    return;
  }
  alertCheckRunning = true;
  try {
    do {
      alertCheckAgain = false;
      await alertCheckPass();
    } while (alertCheckAgain);
  } catch (err) {
    console.error('runAlertCheck error:', err);
  } finally {
    alertCheckRunning = false;
  }
}

// Call before any other await: the browser only shows the prompt inside the click's user gesture.
export function alertRequestNotifications() {
  return browser.permissions.request({ permissions: ['notifications'] })
    .catch(() => /* denied or unsupported: the alert still saves and the dialog still fires */ false);
}

function hasPendingAlerts(alerts:any) {
  return Array.isArray(alerts) && alerts.some((a:any) => a && a.status !== 1);
}

// Identity plus condition, so an edit that re-arms an alert counts as new while a status flip does not.
const pendingSignatures = (alerts:any) => new Set((Array.isArray(alerts) ? alerts : [])
  .filter((a:any) => a && a.status !== 1)
  .map((a:any) => JSON.stringify([a.id, a.type, a.type_id, a.account_id, a.field, a.condition, a.alert_value])));

// True when a create, edit or re-arm left an alert pending that was not pending before.
export function alertsNewlyPending(oldAlerts:any, newAlerts:any) {
  const before = pendingSignatures(oldAlerts);
  return [...pendingSignatures(newAlerts)].some(sig => !before.has(sig));
}

export const ALERT_ALARM = 'qx-price-refresh';

async function priceMinutes() {
  const settings:any = await storage.getItem('local:settings');
  // Whole minutes, at least 1: Chrome 116 and Firefox fire alarms no more often.
  return Math.max(1, Math.round(Number(settings?.price_duration) > 0 ? Number(settings.price_duration) : 30));
}

export async function alertEnsureAlarm() {
  const minutes = await priceMinutes();
  const existing = await browser.alarms.get(ALERT_ALARM);
  if (existing?.periodInMinutes === minutes) return;
  await browser.alarms.create(ALERT_ALARM, { periodInMinutes: minutes });
}

// Spends quota only for pending alerts, and only when no dashboard page refreshed within this interval.
export async function alertPriceTick() {
  if (!hasPendingAlerts(await storage.getItem('local:ALERTS'))) return false;
  if (await storage.getItem('local:SAMPLE_DATA')) return false;
  const minutes = await priceMinutes();
  const last = Number(await storage.getItem('local:PRICES_UPDATED_AT')) || 0;
  // 10% slack, as in isStale: a tick lands seconds before the page's own interval would.
  if (Date.now() - last < minutes * 60_000 * 0.9) return false;
  await getApiKey();
  if (isFeedBlocked() || isApiRateLimited()) return false;
  console.log('alertPriceTick');
  return refreshPricesHeadless({ peers: false });
}
