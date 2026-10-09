import { storage } from '#imports';
import {useI18n} from "vue-i18n";

//export const apiBaseUrl = 'https://feed.qx.plus/';
// Build-time values from .env (WXT_ prefix); see .env.example for local overrides.
export const apiBaseUrl = import.meta.env.WXT_API_BASE_URL;
export const portalUrl = import.meta.env.WXT_PORTAL_URL;
export const apiKey = ref('');
export const apiAuthFailed = ref(false);
export const apiKeyLoaded = ref(false);
export const apiRateLimit = ref<any>(null);

export const isApiRateLimited = () => !!apiRateLimit.value && Date.now() < apiRateLimit.value.until;

export const getApiKey = async (force = false) => {
  //console.log('getApiKey');
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
  //console.log('getApiKey apiKey',apiKey.value);
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
  //console.log('setApiAuthFailed', failed);
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
    //console.log('parseGermanDateOnly unrecognized format:', cleaned);
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
    //console.log('parseGermanDateOnly date does not exist:', cleaned);
    return null;
  }

  const pad = n => String(n).padStart(2, '0');
  // No trailing "Z": local midnight, so formatDate() can't shift it to the previous day.
  return `${year}-${pad(month)}-${pad(day)}T00:00:00`;
}

export const numberToGerman = (floatValue, isInt = false, decimalPoints?) => {
  //console.log("numberToGerman floatValue", floatValue);
  //if(!floatValue){ return ''; }
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
  //console.log("numberToGerman decimalPoints", decimalPoints);

  //return floatValue.toLocaleString('de-DE', { minimumFractionDigits: decimalPoints, maximumFractionDigits: decimalPoints });
  const floatString = isInt ? floatValue.toFixed(0) : floatValue.toFixed(decimalPoints);
  
  /*let lang = localStorage.getItem('lang') || 'en';
  if(lang === 'en'){
    return floatValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }*/
  
  const [integerPart, decimalPart] = floatString.split('.');
  // Format the integer part with periods as thousands separators
  const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return isInt ? formattedIntegerPart : `${formattedIntegerPart},${decimalPart}`;
}


export const sendTelegramMessage = async (token, channelId, message) => {
  if(!token || !channelId){
    //console.log("sendTelegramMessage invalid token/channel");
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
    //console.log('Message sent successfully');
    return result;
  } catch (error) {
    //console.log('Failed to send message to Telegram:', error.message);
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
    //console.log('sendTestApi result',result);
    return result?.success === true;
  } catch (error) {
    //console.log('Failed sendTestApi:', error.message);
    return false;
  }
};

// Not via fetchFeed: a 401 here is shown in Settings, it must not latch apiAuthFailed and stop price polling.
export const fetchApiUsage = async (token:any) => {
  //console.log("fetchApiUsage");
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
  //console.log("sendSupportMessage");
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

/*
export const getLatestData2 = async () => {
  const currentData = await storage.getItem('local:MAIN_LIST') || [];
  const newStockData = await storage.getItem('local:KONTO_FLATEX') || [];
  if(!newStockData){
    //console.log("getLatestData no newStockData");
    return false;
  }
  
  let mergedData = [];

  //new sync
  if(currentData.length===0){
    //console.log("getLatestData currentData not set");
    mergedData.push(...newStockData);
  }else{
    //console.log("getLatestData currentData set sync");
    
    mergedData = [];
    const newCash = newStockData.find(item => item.stock_name === "Cash");
    if (newCash) {
      mergedData.push(newCash);
    }
    
    newStockData.forEach(newItem => {
      if (newItem.stock_name !== "Cash") {
        const existingItem = currentData.find(item => item.wkn === newItem.wkn);
        if (existingItem) {
          const allowedFields = [ 
            'stocks_owned', 'total_entry_value','profit_loss_price','profit_loss_percentage',
            'page_timestamp','timestamp' ,
          ];
            const filteredNewItem = Object.fromEntries(
              Object.entries(newItem).filter(([key]) => allowedFields.includes(key))
            );
            mergedData.push({...existingItem, ...filteredNewItem});
        } else {
          //console.log("getLatestData currentData wkn not exist : add");
          mergedData.push(newItem);
        }
      }
    });

    const remainingOldCash = currentData.find(item => item.stock_name === "Cash");
    if (!newCash && remainingOldCash) {
      mergedData.push(remainingOldCash);
    }
  }
  
  //console.log("getLatestData newStockData",newStockData);
  //console.log("getLatestData mergedData",mergedData);
  
  const clonedData = deepCloneReactiveData(mergedData);
  //console.log("getLatestData clonedData",clonedData);
  await storage.setItem('local:MAIN_LIST',clonedData);
}
*/

export const getLatestData = async () => {
  //const hasNewAccount = await storage.getItem('local:hasNewAccount') || '';
  //console.log("getLatestData hasNewAccount")
  //if (hasNewAccount === 'flatex') {
  //  //console.log("getLatestData hasNewAccount")
  //  return false;
  //}

  // Only the prompted broker is held back; the other three must keep merging.
  const frozenBrokers = await accountFrozenBrokers();

  const currentData = (await storage.getItem('local:MAIN_LIST') as any[]) || [];
  //const newStockData = await storage.getItem('local:KONTO_FLATEX') || [];
  
  const flatexData = await storage.getItem('local:KONTO_FLATEX') || [];
  const consorsBank = await storage.getItem('local:consorsBank') || [];
  const smartBrokerData = await storage.getItem('local:SMART_BROKER_PLUS') || [];
  const wikifolioData = await storage.getItem('local:WIKIFOLIO') || [];
  const justtradeData = await storage.getItem('local:JUSTTRADE') || [];
  
  const newStockData = [...flatexData, ...consorsBank, ...smartBrokerData, ...wikifolioData, ...justtradeData]
    .filter(item => !frozenBrokers.includes(item.broker));
  //console.log("getLatestData smartBrokerData",smartBrokerData);
  if (!newStockData) {
    //console.log("getLatestData: no new stock data");
    return false;
  }

  let mergedData = [];

  // Case 1: First sync or current data empty
  if (currentData.length === 0) {
    //console.log("getLatestData: currentData is empty, initializing");
    mergedData = [...newStockData];
  } else {
    
    //console.log("getLatestData: syncing currentData with newStockData");
    const allowedFields = [
      'stocks_owned',
      'buy_price',
      'total_entry_value',
      'profit_loss_price',
      'profit_loss_percentage',
      //'bid',
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

    
    // Derived, not hardcoded: the old list said "Consors"/"SmartBroker" while the
    // payload says "Consors Bank"/"Smart Broker +", so their Cash rows were dropped.
    const cashAccounts = new Set(
      [...currentData, ...newStockData]
        .filter(item => item.stock_name === "Cash")
        .map(item => accountKeyOf(item))
    );
    /*let newCash;
    newCash = newStockData.find(item => item.stock_name === "Cash" && broker==broker);
    if (newCash) {
      //console.log("getLatestData newCash");
      //mergedData.push(newCash);
      let currentCash = currentData.find(item => item.stock_name === "Cash" && broker==broker);
      if(currentCash){
        //console.log("getLatestData newCash currentCash");
        let mergedCash = { ...currentCash,
          ...Object.fromEntries(
            allowedFields.filter(k => k in newCash).map(k => [k, newCash[k]])
          )
        };
        mergedData.push(mergedCash);
      }else{
        //console.log("getLatestData newCash newCash");
        mergedData.push(newCash);
      }
    }*/
   
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
      // else: stock was sold → do not include
    }

    // Handle newly bought stocks
    for (const [, newItem] of newDataMap) {
      //console.log("getLatestData: new stock added", newItem.wkn);
      mergedData.push(newItem);
    }

    // Preserve old cash if new cash doesn't exist
    /*if (!newCash) {
      //console.log("getLatestData oldCash");
      const oldCash = currentData.find(item => item.stock_name === "Cash");
      if (oldCash) mergedData.push(oldCash);
    }*/
  }

  //console.log("getLatestData: newStockData", newStockData);
  //console.log("getLatestData: mergedData", mergedData);

  const clonedData = deepCloneReactiveData(mergedData);
  await storage.setItem('local:MAIN_LIST', clonedData);
  //console.log("getLatestData: updated MAIN_LIST clonedData",clonedData);
};


export const formatTimestamp = (timestamp) => {
  //console.log("formatTimestamp timestamp",timestamp);
  if (!timestamp) return '';
  
  const { t,locale } = useI18n();
  const date = new Date(timestamp);
  const now = new Date();

  // Strip time for comparison
  const isSameDay = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isSameDay) {
    //console.log("formatTimestamp isSameDay timestamp",timestamp);
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
  //console.log("formatDate date",date);
  
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
  //console.log("formatDateToYMD date",date);
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

  //console.log(`[calcFTV] === START wkn=${item.wkn} type=${item.type} ===`);
  //console.log(`[calcFTV] inputs: strike=${strike}, cap=${itemCap}, bid=${bid}, stocks_owned=${stocks_owned}, underlying_price=${underlying_price}, ratio=${ratio}, knockout=${barrier_knockout}, cap_strike=${cap_strike}, FX_rate=${FX_rate}`);
  //console.log(`[calcFTV] expectationMultiplier=${expectationMultiplier}`);

  if (expectationMultiplier != 0) {
    underlying_price *= expectationMultiplier;
    //console.log(`[calcFTV] adjusted underlying_price by multiplier: ${underlying_price}`);
  }

  const item_currency = (item.currency || "").trim().toUpperCase();
  const underlying_currency = (item.underlying_currency || "").trim().toUpperCase();
  const isIndexUnderlying = underlying_currency === "";
  const isQuanto = !!item.quanto;
  const isCashPosition = item.stock_name === "Cash";
  const isProductEUR = item_currency === "EUR";

  //console.log(`[calcFTV] currency: item_currency=${item_currency}, underlying_currency=${underlying_currency}, isIndexUnderlying=${isIndexUnderlying}, isQuanto=${isQuanto}, isCashPosition=${isCashPosition}, isProductEUR=${isProductEUR}`);

  let comparableUnderlying = getComparableUnderlyingPrice(item, underlying_price);

  if (comparableUnderlying !== underlying_price) {
    //console.log(`[calcFTV] FX adjusted comparableUnderlying: ${comparableUnderlying} (${underlying_price} * ${FX_rate})`);
  } else {
    //console.log(`[calcFTV] comparableUnderlying (no FX): ${comparableUnderlying}`);
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
      //console.log(`[calcFTV] discountPut cap_strike=${cap_strike} (comparableUnderlying=${comparableUnderlying}, itemCap=${itemCap}, strike=${strike})`);
      break;

    case "discountCall":
      cap_strike =
        comparableUnderlying >= itemCap
          ? itemCap - strike
          : comparableUnderlying > strike
            ? comparableUnderlying - strike
            : 0;
      //console.log(`[calcFTV] discountCall cap_strike=${cap_strike} (comparableUnderlying=${comparableUnderlying}, itemCap=${itemCap}, strike=${strike})`);
      break;

    case "cappedBonusCertificate":
      barrier_knockout = strike;
      cap_strike = itemCap;
      //console.log(`[calcFTV] cappedBonusCertificate barrier_knockout=${barrier_knockout}, cap_strike=${cap_strike}`);
      break;
  }

  if (isCashPosition) {
    //console.log(`[calcFTV] Cash position, returning total_entry_value=${item.total_entry_value}`);
    return parseFloat(item.total_entry_value) || 0;
  }
 
  //console.log(`[calcFTV] total_value=${total_value}, max_value=${max_value}, comparableUnderlying=${comparableUnderlying}`);

  switch (item.type) {
    case "discountPut": {
      let payoff =
        comparableUnderlying < strike ? strike - comparableUnderlying : 0;
      let max_payoff = strike - itemCap;
      //console.log(`[calcFTV] discountPut: payoff=${payoff}, max_payoff=${max_payoff}`);
      if (payoff > max_payoff) payoff = max_payoff;
      future_total_value = payoff * ratio * stocks_owned;
      //console.log(`[calcFTV] discountPut: clamped payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "discountCall": {
      let payoff =
        comparableUnderlying > strike ? comparableUnderlying - strike : 0;
      let max_payoff = itemCap - strike;
      //console.log(`[calcFTV] discountCall: payoff=${payoff}, max_payoff=${max_payoff}`);
      if (payoff > max_payoff) payoff = max_payoff;
      future_total_value = payoff * ratio * stocks_owned;
      //console.log(`[calcFTV] discountCall: clamped payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "discountCertificate": {
      let redemption =
        comparableUnderlying > itemCap ? itemCap : comparableUnderlying;
      future_total_value = redemption * ratio * stocks_owned;
      //console.log(`[calcFTV] discountCertificate: redemption=${redemption}, future_total_value=${future_total_value}`);
      break;
    }

    case "put": {
      let payoff = strike - comparableUnderlying;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      //console.log(`[calcFTV] put: payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "call": {
      let payoff = comparableUnderlying - strike;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      //console.log(`[calcFTV] call: payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "openEndTurboShort": {
      let payoff = strike - comparableUnderlying;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      //console.log(`[calcFTV] openEndTurboShort: payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "openEndTurboLong": {
      let payoff = comparableUnderlying - strike;
      future_total_value = (payoff > 0 ? payoff : 0) * ratio * stocks_owned;
      //console.log(`[calcFTV] openEndTurboLong: payoff=${payoff}, future_total_value=${future_total_value}`);
      break;
    }

    case "reverseCappedBonusCertificate":
      future_total_value =
        comparableUnderlying < barrier_knockout
          ? max_value * stocks_owned
          : total_value;
      //console.log(`[calcFTV] reverseCappedBonus: comparableUnderlying=${comparableUnderlying} < barrier_knockout=${barrier_knockout}? ${comparableUnderlying < barrier_knockout}, future_total_value=${future_total_value}`);
      break;

    case "cappedBonusCertificate": {
      // Barrier not hit -> flat bonus level (cap_strike). Barrier hit (or scenario pushes the
      // underlying at/below the barrier) -> min(underlying, bonus level). barrier_knockout = strike.
      const barrierBroken = item.barrier_hit || comparableUnderlying <= barrier_knockout;
      future_total_value =
        (barrierBroken ? Math.min(comparableUnderlying, cap_strike) : cap_strike) *
        ratio *
        stocks_owned;
      //console.log(`[calcFTV] cappedBonus: barrierBroken=${barrierBroken}, future_total_value=${future_total_value}`);
      break;
    }

    case "indexcertificate":
      future_total_value = comparableUnderlying * ratio * stocks_owned;
      //console.log(`[calcFTV] indexcertificate: future_total_value=${future_total_value}`);
      break;

    default:
      future_total_value =
        cap_strike * ratio * stocks_owned || total_value;
      //console.log(`[calcFTV] default: cap_strike*ratio*stocks_owned=${cap_strike * ratio * stocks_owned}, total_value=${total_value}, future_total_value=${future_total_value}`);
      break;
  }

  const beforeConvert = future_total_value;
  future_total_value = convertBackToPortfolioCurrency(future_total_value);
  future_total_value = clamp0(future_total_value);

  //console.log(`[calcFTV] final: beforeConvert=${beforeConvert}, afterConvert=${future_total_value}`);
  //console.log(`[calcFTV] === END wkn=${item.wkn} result=${future_total_value} ===`);

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
  await storage.removeItem('local:flatexProbedAccount');
  await storage.removeItem('local:CUR_FLATEXID');
  await storage.removeItem('local:hasNewAccount');
  await storage.removeItem('local:NEW_FLATEXID');
  await storage.removeItem('local:FLATEX_PURCHASE_DATES');

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
  
  //console.log("clearAllStockData done");
}

function isWeekend(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

function isMarketHoliday(date = new Date()) {
  const yyyy = date.getFullYear();
  const mmdd = date.toISOString().slice(5, 10); // "MM-DD"
  
  const marketHolidays = [
    "01-01", // New Year's Day
    "04-18", // Good Friday (2025)
    "04-21", // Easter Monday (2025)
    "05-01", // Labour Day
    "05-29", // Ascension Day (2025)
    "06-09", // Whit Monday (2025)
    "06-19", // Corpus Christi (2025)
    "10-03", // German Unity Day
    "12-25", // Christmas Day
    "12-26"  // Boxing Day
  ];

  return marketHolidays.includes(mmdd);
}

export function isMarketClosed() {
  if(!apiKey.value){
    //console.log("isMarketClosed apiKey missing");
    return true;
  }

  // A rejected key would otherwise re-fire every doomed request on each refresh cycle.
  if(apiAuthFailed.value){
    //console.log("isMarketClosed apiAuthFailed");
    return true;
  }

  const today = new Date();
  if (isWeekend(today)){
    //console.log("isMarketClosed isWeekend");
    return true;
  }

  /*if (isMarketHoliday(today)){
    //console.log("isMarketClosed isMarketHoliday");
    return true;
  }*/
 
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
  const today = new Date().toISOString().split('T')[0];
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


