import { storage } from '#imports';
import {useI18n} from "vue-i18n";
import { API_BASE_URL, PORTAL_URL } from './constants';

export const apiBaseUrl = API_BASE_URL;
export const portalUrl = PORTAL_URL;
export const apiKey = ref('');
export const apiAuthFailed = ref(false);
export const apiKeyLoaded = ref(false);
export const apiRateLimit = ref<any>(null);

export const isApiRateLimited = () => !!apiRateLimit.value && Date.now() < apiRateLimit.value.until;

export const getApiKey = async (force = false) => {
  if (apiKey.value === '' || force) {
    const key = await storage.getItem('local:api_key')
    apiKey.value = key ?? ''
  }
  // Re-read every call: another context may have latched the key dead since we last looked.
  apiAuthFailed.value = (await storage.getItem('local:api_auth_failed')) === true
  // A latch that never re-checks turned one night-time 401 into a dead dashboard every morning.
  if (apiAuthFailed.value && apiKey.value && await authCooldownPassed()) await confirmApiAuthFailed();
  // Shared across windows: a limit hit in the popup must also hold back the dashboard.
  const rateLimit:any = await storage.getItem('local:api_rate_limit');
  apiRateLimit.value = rateLimit && Date.now() < rateLimit.until ? rateLimit : null;
  apiKeyLoaded.value = true
}

export const setApiAuthFailed = async (failed:any) => {
  apiAuthFailed.value = failed;
  await storage.setItem('local:api_auth_failed', failed);
  if (failed) {
    // Each confirmed rejection stretches the next re-check, so a truly dead key stops costing requests.
    const count:any = await storage.getItem('local:api_auth_fail_count') || 0;
    await storage.setItem('local:api_auth_fail_count', count + 1);
    await storage.setItem('local:api_auth_failed_at', Date.now());
  } else {
    await storage.setItem('local:api_auth_fail_count', 0);
  }
}

const AUTH_COOLDOWN_MINUTES = [5, 15, 30, 60];

const authCooldownPassed = async () => {
  // Latches from before the timestamp existed read as 0, so they get re-checked straight away.
  const failedAt:any = await storage.getItem('local:api_auth_failed_at') || 0;
  const count:any = await storage.getItem('local:api_auth_fail_count') || 1;
  const minutes = AUTH_COOLDOWN_MINUTES[Math.min(count, AUTH_COOLDOWN_MINUTES.length) - 1];
  return Date.now() - failedAt >= minutes * 60_000;
}

// true = rejected, false = accepted, null = no verdict; unlike sendTestApi, offline must not count as either.
const probeKeyRejected = async () => {
  try {
    // Page mounts await getApiKey, so a hung probe would freeze the dashboard.
    // /validate is DB-only: /price 403s outside service hours, which latched good keys dead overnight.
    const res = await fetch(`${apiBaseUrl}validate`, { headers: { 'X-Api-Key': apiKey.value }, signal: AbortSignal.timeout(10_000) });
    return res.status === 401 || res.status === 403;
  } catch (err) {
    /* offline or timed out says nothing about the key, so the caller keeps its state */
    console.error('probeKeyRejected error:', err);
    return null;
  }
}

let authProbe:any = null;

// Shared promise: every chunk of one refresh can 401 together, and they need one probe, not twenty.
const confirmApiAuthFailed = async () => {
  if (!authProbe) {
    authProbe = (async () => {
      const rejected = await probeKeyRejected();
      if (rejected === null) {
        // No verdict: keep the current state, but restart the wait so the next check isn't instant.
        if (apiAuthFailed.value) await storage.setItem('local:api_auth_failed_at', Date.now());
        console.log("confirmApiAuthFailed", "no verdict");
        return apiAuthFailed.value;
      }
      await setApiAuthFailed(rejected);
      console.log("confirmApiAuthFailed", rejected);
      return rejected;
    })().finally(() => { authProbe = null; });
  }
  return authProbe;
}

// The key rides in the query string, so a raw feed URL must never reach the console.
const redactApiKey = (url:any) => String(url).replace(/apikey=[^&]*/, 'apikey=***');

// Returns null on failure so callers can tell a failed fetch from a genuinely empty one.
export const fetchFeed = async (url:any, signal?:any) => {
  // Every later chunk would be refused too, and each refusal still counts against the quota.
  if (isApiRateLimited()) return null;

  const res = await fetch(url, signal ? { signal } : undefined);

  if (res.status === 429) {
    const body = await res.json().catch(() => /* limit still applies without a readable body */ ({}));
    await setApiRateLimit(body);
    return null;
  }

  if (res.status === 401 || res.status === 403) {
    // The body tells a JSON "invalid key" apart from a WAF/CDN block page.
    const body = await res.text().catch(() => /* body is diagnostics only */ '');
    console.error('fetchFeed auth error:', res.status, redactApiKey(url), redactApiKey(body.slice(0, 200)));
    // One 401/403 can be a server blip; a second request decides before prices stop.
    const rejected = await confirmApiAuthFailed();
    if (!rejected) console.error('fetchFeed transient auth error:', res.status);
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => /* non-JSON error page, nothing to inspect */ null);
    if (body?.error === 'rate_limited') {
      await setApiRateLimit(body);
      return null;
    }
    console.error('fetchFeed non-OK:', res.status, redactApiKey(url));
    return null;
  }

  const data = await res.json();
  // Checked on 200 too: the limit reply's status code is not guaranteed to be 429.
  if (data?.error === 'rate_limited') {
    await setApiRateLimit(data);
    return null;
  }
  return data;
}

const setApiRateLimit = async (body:any) => {
  console.error('fetchFeed rate limited:', body?.message);
  apiRateLimit.value = {
    until: Date.now() + (Number(body?.retry_after) > 0 ? Number(body.retry_after) : 60) * 1000,
    limit: body?.limit ?? '',
    used: body?.used ?? '',
    window: body?.window_seconds ?? 60,
    message: body?.message ?? '',
  };
  await storage.setItem('local:api_rate_limit', apiRateLimit.value);
}

// Whole seconds left, for banners and toasts.
export const apiRateLimitSecondsLeft = () =>
  apiRateLimit.value ? Math.max(0, Math.ceil((apiRateLimit.value.until - Date.now()) / 1000)) : 0;

// Scrapers have emitted "Cash", "cash" and "Cash " over time, so a strict === would
// misclassify rows. Takes the row, not the name, to keep call sites honest.
export const isCashRow = (item)=> {
  const name = item?.stock_name;
  return typeof name === 'string' && name.trim().toLowerCase() === 'cash';
}

// Anything interpolated into innerHTML/v-html must go through this, or a crafted name becomes markup.
export const escapeHtml = (value:any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Pause an async function, e.g. to let a broker page finish rendering.
export const sleep = (ms:number) => new Promise((resolve) => setTimeout(resolve, ms));

// UTC date as YYYY-MM-DD, the key format of every daily snapshot in storage.
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const germanToNumer = (germanAmount)=> {
  // Remove the thousands separator (.)
  const cleanedAmount = germanAmount.replace(/\./g, '');
  // Replace the decimal separator (,) with a period (.)
  const floatAmount = cleanedAmount.replace(',', '.');
  // Convert to float
  return parseFloat(floatAmount);
}

// Parses a date-only German string (DD.MM.YYYY or DD.MM.YY) into a local-midnight
// ISO-ish string, e.g. "03.05.2021" -> "2021-05-03T00:00:00".
// Deliberately separate from parseStockTimestamp() in kontoFlatex-utils.ts, which
// handles intraday quote timestamps (HH:MM / "Gestern / HH:MM" / DD.MM.YY / HH:MM).
// Returns null when the input isn't a valid date.
export const parseGermanDateOnly = (input: any): string | null => {
  if (input === null || input === undefined) return null;

  // Webcore table cells routinely contain &nbsp; — normalise before matching.
  const cleaned = String(input).replace(/ /g, ' ').trim();
  if (!cleaned || cleaned === '-') return null;

  const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  // Same two-digit-year convention as parseStockTimestamp()
  const year = match[3].length === 2 ? (rawYear < 50 ? 2000 + rawYear : 1900 + rawYear) : rawYear;

  const date = new Date(year, month - 1, day);
  // Round-trip check rejects impossible dates like 30.02.2021
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  const pad = n => String(n).padStart(2, '0');
  // No trailing "Z": local midnight, so formatDate() can't shift it to the previous day.
  return `${year}-${pad(month)}-${pad(day)}T00:00:00`;
}

export const numberToGerman = (floatValue, isInt = false, decimalPoints?) => {
  if (floatValue === null || floatValue === undefined || isNaN(floatValue)) {
    return '';
  }

  // Parse the input value to a float
  floatValue = parseFloat(floatValue);

  // Only apply the <5 auto-bump when the caller did not pass an explicit
  // decimalPoints — percent call sites pass 2 explicitly to opt out.
  if (decimalPoints === undefined) {
    decimalPoints = 2;
    if (Math.abs(floatValue) < 5) {
      decimalPoints = 4;
    }
  }

  const floatString = isInt ? floatValue.toFixed(0) : floatValue.toFixed(decimalPoints);
  
  
  const [integerPart, decimalPart] = floatString.split('.');
  // Format the integer part with periods as thousands separators
  const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return isInt ? formattedIntegerPart : `${formattedIntegerPart},${decimalPart}`;
}


export const sendTelegramMessage = async (token, channelId, message) => {
  if(!token || !channelId){
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: channelId,
    text: message,
    parse_mode: 'HTML', // optional: use 'Markdown' or 'HTML' formatting
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(`Telegram Error: ${result.description}`);
    }
    return result;
  } catch (error) {
    return null;
  }
};

export const sendTestApi = async (token) => {
  try {
    // /validate checks the key in the DB only: no quota spent, no service-window 403 at night.
    const response = await fetch(`${apiBaseUrl}validate`, {
      headers: { 'X-Api-Key': token },
      signal: AbortSignal.timeout(10_000),
    });

    // A 401 body still parses as JSON — trusting the payload alone reported dead keys as valid.
    if (!response.ok) {
      console.error('sendTestApi rejected:', response.status);
      return false;
    }

    const result = await response.json().catch(() => null);
    return result?.success === true;
  } catch (error) {
    return false;
  }
};

// Not via fetchFeed: a 401 here is shown in Settings, it must not latch apiAuthFailed and stop price polling.
export const fetchApiUsage = async (token:any) => {
  try {
    const response = await fetch(`${apiBaseUrl}usage`, {
      headers: { 'X-Api-Key': token },
      signal: AbortSignal.timeout(10_000),
    });
    const result:any = await response.json().catch(() => null);

    if (!response.ok || result?.success !== true) {
      return { error: response.status, message: result?.message || '' };
    }
    return result.data;
  } catch (error) {
    /* offline or timed out: null lets the panel offer a retry instead of blaming the key */
    console.error('fetchApiUsage error:', error);
    return null;
  }
};

// Relative to the feed base so local/staging builds hit their own backend; the key is optional and only links the account.
export const sendSupportMessage = async (form:any) => {
  try {
    const headers:any = { Accept: 'application/json' };
    // A latched-dead key would get the message rejected; send anonymously instead.
    if (apiKey.value && !apiAuthFailed.value) headers['X-Api-Key'] = apiKey.value;
    const response = await fetch(new URL('../support/extension', apiBaseUrl).toString(), {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const result:any = await response.json().catch(() => null);

    if (response.ok && result?.status === '1') {
      return { ok: true, reference: result.responseValue?.reference || '', errors: {} };
    }
    return { ok: false, status: response.status, message: result?.message || '', errors: result?.errors || {} };
  } catch (error) {
    /* offline or timed out: the dialog keeps the message so the user can retry */
    console.error('sendSupportMessage error:', error);
    return { ok: false, status: 0, message: '', errors: {} };
  }
};

export const deepCloneReactiveData = (data) => {
  return JSON.parse(JSON.stringify(toRaw(data)));
}


export const getLatestData = async () => {
  // Only the prompted broker is held back; the other three must keep merging.
  const frozenBrokers = await accountFrozenBrokers();

  const currentData = (await storage.getItem('local:MAIN_LIST') as any[]) || [];
  
  const flatexData = await storage.getItem('local:KONTO_FLATEX') || [];
  const consorsBank = await storage.getItem('local:consorsBank') || [];
  const smartBrokerData = await storage.getItem('local:SMART_BROKER_PLUS') || [];
  const wikifolioData = await storage.getItem('local:WIKIFOLIO') || [];
  const justtradeData = await storage.getItem('local:JUSTTRADE') || [];
  
  const newStockData = [...flatexData, ...consorsBank, ...smartBrokerData, ...wikifolioData, ...justtradeData]
    .filter(item => !frozenBrokers.includes(item.broker));
  if (!newStockData) {
    return false;
  }

  let mergedData = [];

  // Case 1: First sync or current data empty
  if (currentData.length === 0) {
    mergedData = [...newStockData];
  } else {
    
    const allowedFields = [
      'stocks_owned',
      'buy_price',
      'total_entry_value',
      'profit_loss_price',
      'profit_loss_percentage',
      'page_bid',
      'page_timestamp', 'timestamp',
      'purchase_date', 'purchase_dates'
    ];

    const newDataMap = new Map(
      newStockData.filter(item => item.stock_name !== "Cash")
      .map(item => [accountPositionKey(item), item])
    );

    // An account missing from this scrape tells us nothing about its holdings.
    const scrapedAccounts = new Set(newStockData.map(item => accountKeyOf(item)));

    
    // Derived, not hardcoded: a hand-kept broker list drifted from the payload names and dropped Cash rows.
    const cashAccounts = new Set(
      [...currentData, ...newStockData]
        .filter(item => item.stock_name === "Cash")
        .map(item => accountKeyOf(item))
    );
   
    cashAccounts.forEach(accountKey => {
      const newCash = newStockData.find(
        item => item.stock_name === "Cash" && accountKeyOf(item) === accountKey
      );

      if (newCash) {
        const currentCash = currentData.find(
          item => item.stock_name === "Cash" && accountKeyOf(item) === accountKey
        );

        if (currentCash) {
          const mergedCash = {
            ...currentCash,
            ...Object.fromEntries(
              allowedFields
                .filter(k => k in newCash)
                .map(k => [k, newCash[k]])
            )
          };

          mergedData.push(mergedCash);
        } else {
          mergedData.push(newCash);
        }
      } else {
        // preserve old cash if broker existed previously
        const oldCash = currentData.find(
          item => item.stock_name === "Cash" && accountKeyOf(item) === accountKey
        );
        if (oldCash) mergedData.push(oldCash);
      }
    });

    
    // Handle updated and removed stocks
    for (const currentItem of currentData) {
      if (currentItem.stock_name === "Cash") continue;

      // Not scraped this cycle - a frozen, logged-out or simply absent account.
      // Without this its rows all look sold and the whole account disappears.
      if (!scrapedAccounts.has(accountKeyOf(currentItem))) {
        mergedData.push(currentItem);
        continue;
      }

      const key = accountPositionKey(currentItem);
      const newItem = newDataMap.get(key);
      if (newItem) {
        const filteredFields = Object.fromEntries(
          Object.entries(newItem).filter(([key]) => allowedFields.includes(key))
        );
        mergedData.push({ ...currentItem, ...filteredFields });
        newDataMap.delete(key); // processed
      }
    }

    // Handle newly bought stocks
    for (const [, newItem] of newDataMap) {
      mergedData.push(newItem);
    }

    // Preserve old cash if new cash doesn't exist
  }


  const clonedData = deepCloneReactiveData(mergedData);
  await storage.setItem('local:MAIN_LIST', clonedData);
};


export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  
  const { t } = useI18n();
  const date = new Date(timestamp);
  const now = new Date();

  // Strip time for comparison
  const isSameDay = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } else if (isYesterday) {
    return `${t('yesterday')} ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } else {
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
};

export const formatDate = (date: Date | string | number | null | undefined): string => {
  
  if (!date) return '';

  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return '';

  return parsed.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatMonthYear = (date: Date | string | number | null | undefined): string => {
  if (!date) return '';

  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return '';

  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${month}/${year}`; // e.g. "06/2026"
};

export function formatDateToYMD(date){
  if (!date) return '';
  const year = date.year;
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const chunkArray = (arr, size) => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
  );
};

// Underlying quotes come from the feed in their venue currency (usually EUR),
// while product terms (cap/strike/knockout) are in the product currency.
// Convert the quote so it is directly comparable with cap/strike.
// `price` lets callers pass an already-adjusted price (e.g. scenario-scaled).
export const getComparableUnderlyingPrice = (item: any, price?: number): number => {
  const p = price !== undefined ? price : (parseFloat(item.underlying_price) || 0);
  const fx = parseFloat(item.currency_rate) || 1;
  const quoteCurrency = (item.underlying_currency || "").trim().toUpperCase();
  const productCurrency = (item.currency || "").trim().toUpperCase();
  if (!p || !quoteCurrency || quoteCurrency === productCurrency) return p; // empty = index/points → unchanged
  if (quoteCurrency === "EUR") return p * fx; // FX feed rate is EUR → product currency
  return p;
};

export const calculateFutureTotalValue = (item, expectationMultiplier = 0) => {
  let strike = parseFloat(item.strike) || 0;
  let itemCap = parseFloat(item.cap) || 0;
  let bid = parseFloat(item.bid) || 0;
  let stocks_owned = parseFloat(item.stocks_owned) || 0;
  let underlying_price = parseFloat(item.underlying_price) || 0;
  let ratio = parseFloat(item.ratio) || 1;
  let barrier_knockout = parseFloat(item.knockout) || 0;
  let cap_strike = parseFloat(item.strike ? item.strike : item.cap) || 0;
  let FX_rate = parseFloat(item.currency_rate) || 1;


  if (expectationMultiplier != 0) {
    underlying_price *= expectationMultiplier;
  }

  const item_currency = (item.currency || "").trim().toUpperCase();
  const isQuanto = !!item.quanto;
  const isCashPosition = item.stock_name === "Cash";
  const isProductEUR = item_currency === "EUR";


  let comparableUnderlying = getComparableUnderlyingPrice(item, underlying_price);

  if (comparableUnderlying !== underlying_price) {
  } else {
  }
 
  const convertBackToPortfolioCurrency = (value) => {
    if (!Number.isFinite(value)) return 0;
    return isProductEUR || isQuanto ? value : value / FX_rate;
  };
 
  const clamp0 = (value) => (value > 0 ? value : 0);
 
  let total_value = isCashPosition
    ? parseFloat(item.total_entry_value) || 0
    : (bid * stocks_owned) || 0;
 
  let max_value = (2 * strike - itemCap) * ratio;
  let future_total_value = total_value;
 
  switch (item.type) {
    case "discountPut":
      cap_strike =
        comparableUnderlying <= itemCap
          ? strike - itemCap
          : comparableUnderlying < strike
            ? strike - comparableUnderlying
            : 0;
      break;

    case "discountCall":
      cap_strike =
        comparableUnderlying >= itemCap
          ? itemCap - strike
          : comparableUnderlying > strike
            ? comparableUnderlying - strike
            : 0;
      break;

    case "cappedBonusCertificate":
      barrier_knockout = strike;
      cap_strike = itemCap;
      break;
  }

  if (isCashPosition) {
    return parseFloat(item.total_entry_value) || 0;
  }
 

  switch (item.type) {
    case "discountPut": {
      let payoff =
        comparableUnderlying < strike ? strike - comparableUnderlying : 0;
      let max_payoff = strike - itemCap;
      if (payoff > max_payoff) payoff = max_payoff;
      future_total_value = payoff * ratio * stocks_owned;
      break;
    }

    case "discountCall": {
      let payoff =
        comparableUnderlying > strike ? comparableUnderlying - strike : 0;
      let max_payoff = itemCap - strike;
      if (payoff > max_payoff) payoff = max_payoff;
      future_total_value = payoff * ratio * stocks_owned;
      break;
    }

    case "discountCertificate": {
      let redemption =
        comparableUnderlying > itemCap ? itemCap : comparableUnderlying;
      future_total_value = redemption * ratio * stocks_owned;
      break;
    }

    case "put": {
      let payoff = strike - comparableUnderlying;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      break;
    }

    case "call": {
      let payoff = comparableUnderlying - strike;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      break;
    }

    case "openEndTurboShort": {
      let payoff = strike - comparableUnderlying;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      break;
    }

    case "openEndTurboLong": {
      let payoff = comparableUnderlying - strike;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      break;
    }

    case "reverseCappedBonusCertificate":
      future_total_value =
        comparableUnderlying < barrier_knockout
          ? max_value * stocks_owned
          : total_value;
      break;

    case "cappedBonusCertificate": {
      // Barrier not hit -> flat bonus level (cap_strike). Barrier hit (or scenario pushes the
      // underlying at/below the barrier) -> min(underlying, bonus level). barrier_knockout = strike.
      const barrierBroken = item.barrier_hit || comparableUnderlying <= barrier_knockout;
      future_total_value =
        (barrierBroken ? Math.min(comparableUnderlying, cap_strike) : cap_strike) *
        ratio *
        stocks_owned;
      break;
    }

    case "indexcertificate":
      future_total_value = comparableUnderlying * ratio * stocks_owned;
      break;

    default:
      future_total_value =
        cap_strike * ratio * stocks_owned || total_value;
      break;
  }

  future_total_value = convertBackToPortfolioCurrency(future_total_value);
  future_total_value = clamp0(future_total_value);


  return Number.isFinite(future_total_value) ? future_total_value : 0;
};

export const clearAllStockData = async () => {
  await storage.setItem('local:MAIN_LIST', []);
  await storage.setItem('local:LIST_DATA', []);
  
  //flatex
  await storage.setItem('local:KONTO_FLATEX', []);
  await storage.removeItem('local:flatexUserSync');
  // Cached identity probe: without this a reset silently re-adopts the old account.
  await storage.removeItem('local:flatexProbedToken');
  await storage.removeItem('local:flatexProbedTokenHash');
  await storage.removeItem('local:flatexProbedAccount');
  await storage.removeItem('local:CUR_FLATEXID');
  await storage.removeItem('local:hasNewAccount');
  await storage.removeItem('local:NEW_FLATEXID');
  await storage.removeItem('local:FLATEX_PURCHASE_DATES');
  await storage.removeItem('local:WIKIFOLIO_PURCHASE_DATES');

  //ConsorsBank
  await storage.setItem('local:consorsBank', []);

  //smart broker
  await storage.setItem('local:SMART_BROKER_PLUS', []);
  
  //wikifolio
  await storage.setItem('local:WIKIFOLIO', []);
  await storage.removeItem('local:CUR_WIKIFOLIO');
  await storage.removeItem('local:NEW_WIKIFOLIO');

  //justTRADE
  await storage.setItem('local:JUSTTRADE', []);
  await storage.removeItem('local:CUR_JUSTTRADEID');
  await storage.removeItem('local:JUSTTRADE_ISINS');

  //accounts
  await storage.removeItem('local:ACCOUNTS');
  await storage.removeItem('local:ACCOUNTS_SCHEMA');
  await storage.removeItem('local:NEW_ACCOUNTS');
  await storage.removeItem('local:ACCOUNT_SNOOZE');
  // Consors kept this in the broker page's localStorage, so a reset never reached it.
  await storage.removeItem('local:CUR_CONSORSBANKID');
  // SmartBroker+ had no identity key at all before multi-account.
  await storage.removeItem('local:CUR_SMARTBROKERID');
  
}

function isWeekend(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

export function isMarketClosed() {
  if(!apiKey.value){
    return true;
  }

  // A rejected key would otherwise re-fire every doomed request on each refresh cycle.
  if(apiAuthFailed.value){
    return true;
  }

  const today = new Date();
  if (isWeekend(today)){
    return true;
  }

 
  return false;
}


export async function saveDailyTotal() {
  const mainListData = await storage.getItem('local:MAIN_LIST') || [];
  // Per-account split so the Forecast history can follow the account filter; total stays for old readers.
  const accounts:any = {};
  let totalValue = mainListData.reduce((sum, row) => {
    let value = parseFloat(row['total_value']);
    if (isNaN(value)) return sum;
    const key = accountKeyOf(row);
    accounts[key] = (accounts[key] || 0) + value;
    return sum + value;
  }, 0);
  const today = todayIso();
  const dailyTotals = await storage.getItem('local:DAILY_TOTAL') || [];
  const index = dailyTotals.findIndex((entry: { date: string }) => entry.date === today);

  if(totalValue>0){
    if (index !== -1) {
      dailyTotals[index].total = totalValue;
      dailyTotals[index].accounts = accounts;
    } else {
      dailyTotals.push({ date: today, total: totalValue, accounts });
    }
    await storage.setItem('local:DAILY_TOTAL', dailyTotals);
  }
}

