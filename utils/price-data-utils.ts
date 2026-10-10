import { storage } from '#imports';
import { BlackScholes } from '@uqee/black-scholes';

import {
  apiBaseUrl,
  apiKey,
  apiAuthFailed,
  isApiRateLimited,
  chunkArray,
  fetchFeed,
  isMarketClosed,
  saveDailyTotal,
  getComparableUnderlyingPrice
} from './helper';

// Global state for price data management
export const globalPriceState = {
  chunkSize: 20,
  controllers: [] as AbortController[],
};

const PAYOUT_LAG_DAYS = 7;
// Annualizing a few days of gain gives absurd rates (+5% in 2 days is +743.000% p.a.).
const MIN_HOLD_DAYS_FOR_PA = 30;

let cachedPriceUpdateDuration = null;
const getPriceUpdateDuration = async () => {
  if (cachedPriceUpdateDuration !== null) {
    return cachedPriceUpdateDuration;
  }
  
  let priceUpdateDuration = 30;
  try {
    const settings = await storage.getItem('local:settings');
    if (settings && settings.price_duration) {
      priceUpdateDuration = settings.price_duration;
    }
  } catch (e) {
    console.error("Error fetching settings:", e);
  }
  cachedPriceUpdateDuration = priceUpdateDuration;
  return priceUpdateDuration;
};


export const reloadPriceData = async () => {
  if (isMarketClosed()) return;
  let mainListData = await storage.getItem('local:MAIN_LIST') || [];
  const currentData = mainListData;
  try {
    await getPriceData();
    await getUnderlyingPriceData();
    await getCurrencyRate();
    
    const priceFields = [
      'bid', 'ask',
      'sideways_return', 'sideways_return_pa',
      'yield_pa_since_purchase',
      'profit_loss_price', 'profit_loss_percentage',
      'profit_loss_target_per_day', 
      'total_value', 'future_total_value',
      'profit_loss_target', 'profit_loss_target_pa',
      'underlying_price',
    ];
    
    // Per position, not per wkn: one wkn in two accounts flashed only the first row.
    const oldByPosition = new Map<string, any>((currentData as any[]).map(i => [accountPositionKey(i), i]));
    (mainListData as any[]).forEach(item => {
      const oldItem = oldByPosition.get(accountPositionKey(item));
      if (!oldItem) return;
      priceFields.forEach(key => {
        const oldValue = oldItem[key] ?? 0;
        const newValue = item[key] ?? oldValue;
        if (newValue !== oldValue) {
          // Second key is the combined row's: price is per product, so a child's move is its move.
          const combinedKey = accountPositionKey({ ...item, account_id: '', deposite_number: '' });
          document.querySelectorAll<HTMLElement>(`[data-position="${accountPositionKey(item)}"][data-field="${key}"], [data-position="${combinedKey}"][data-field="${key}"]`)
            .forEach((rowEl) => {
              rowEl.classList.remove('up', 'down');
              void rowEl.offsetWidth; // Force reflow to restart animation
              rowEl.classList.add(newValue > oldValue ? 'up' : 'down');
              setTimeout(() => rowEl.classList.remove('up', 'down'), 2000);
            });
        }
      });
    });

    await calculateLatestMainListData(true);
    saveDailyTotal();
  } catch (e) {
    console.error('reloadPriceData failed:', e);
  }
};

export const getPriceData = async (forceUpdate = true) => {
  if (isMarketClosed()) return;
  
  const controller = new AbortController();
  globalPriceState.controllers.push(controller);

  let mainListData = await storage.getItem('local:MAIN_LIST') || [];

  let priceUpdateDuration = await getPriceUpdateDuration();
  const currentDatetime = new Date().toISOString();
  const updateMinutes = priceUpdateDuration;
  const now = Date.now();
  
  const needsUpdate = (item: any) => {
    if (forceUpdate || !item.priceUpdatedAt) return true;
    const lastUpdatedTime = new Date(item.priceUpdatedAt).getTime();
    const nextUpdateTime = lastUpdatedTime + updateMinutes * 60_000;
    return now >= nextUpdateTime;
  };

  let allApiData: any[] = [];
  let failed = false;
  const stockItems = mainListData.filter(item => item.type === 'stock' && item.isin && needsUpdate(item));
  const otherItems = mainListData.filter(item => item.type !== 'stock' && item.wkn && needsUpdate(item));

  // Deduped: the same holding in two accounts is two rows but one product to price.
  const isinChunks = chunkArray([...new Set(stockItems.map(item => item.isin))], globalPriceState.chunkSize);
  const wknChunks = chunkArray([...new Set(otherItems.map(item => item.wkn))], globalPriceState.chunkSize);

  try {
    for (const chunk of isinChunks) {
      const isinParam = chunk.join(',');
      const url = `${apiBaseUrl}price?apikey=${apiKey.value}&uisin=${isinParam}`;
      const apiData = await fetchFeed(url, controller.signal);
      // A dead key kills every remaining chunk, so stop rather than firing the whole queue.
      if (!apiData) { failed = true; if (apiAuthFailed.value || isApiRateLimited()) break; continue; }

      if (apiData.status === 1 && apiData?.data?.length > 0) {
        allApiData = allApiData.concat(apiData.data);
        const currentDate = new Date().toISOString();
        await storage.setItem('local:list_updated_at', currentDate);
      }
    }
    
    let stockApiMap = Object.fromEntries(allApiData.map(product => [product.isin, product]));
    for (const chunk of wknChunks) {
      // The isin loop may have latched the key as dead — don't restart the storm here.
      if (apiAuthFailed.value || isApiRateLimited()) break;
      const wknParam = chunk.join(',');
      const url = `${apiBaseUrl}price?apikey=${apiKey.value}&wkn=${wknParam}`;
      const apiData = await fetchFeed(url, controller.signal);
      if (!apiData) { failed = true; if (apiAuthFailed.value || isApiRateLimited()) break; continue; }
      
      if (apiData.status === 1 && apiData?.data?.length > 0) {
        allApiData = allApiData.concat(apiData.data);
      }
    }

    let wknApiMap = Object.fromEntries(allApiData.map(product => [product.wkn, product]));

    // A failed fetch must never persist as a fresh timestamp, or needsUpdate() later skips a real refresh.
    const freshStamp = failed ? {} : { priceUpdatedAt: currentDatetime };

    // Merge price data into main list
    mainListData = mainListData.map(item => {
      const extraData = item.type === 'stock' ? stockApiMap[item.isin] : wknApiMap[item.wkn];
      
      if (extraData && typeof extraData === "object") {
        const { currency, bid, ask, timestamp, ...restExtraData } = extraData;
        return {
          ...item,
          ...restExtraData,
          bid: bid != null ? parseFloat(bid) : (item.bid != null ? item.bid : 0),
          ask: ask != null ? parseFloat(ask) : 0,
          timestamp: timestamp ?? item.timestamp ?? Date.now(),
          priceUpdatedAt: currentDatetime,
        };
      }else{
        if(item.page_bid){
          return { ...item,
            bid: item.page_bid != null ? parseFloat(item.page_bid) : (item.bid != null ? item.bid : 0),
            ...freshStamp
          };
        }else{
          return { ...item, ...freshStamp };
        }
      }
    });


    await storage.setItem('local:MAIN_LIST',mainListData);

  } catch (err) {
    console.error('getPriceData Failed to fetch price data:', err);
  } finally {
    const idx = globalPriceState.controllers.indexOf(controller);
    if (idx !== -1) globalPriceState.controllers.splice(idx, 1);
  }
};

export const getUnderlyingPriceData = async (forceUpdate = true) => {
  if (isMarketClosed()) return;
  
  const controller = new AbortController();
  globalPriceState.controllers.push(controller);
  let mainListData = await storage.getItem('local:MAIN_LIST') || [];

  let priceUpdateDuration = await getPriceUpdateDuration();
  const currentDatetime = new Date().toISOString();
  const updateMinutes = priceUpdateDuration;
  const now = Date.now();
  const needsUpdate = (item: any) => {
    if (forceUpdate || !item.underlyingPriceUpdatedAt) return true;
    const lastUpdatedTime = new Date(item.underlyingPriceUpdatedAt).getTime();
    const nextUpdateTime = lastUpdatedTime + updateMinutes * 60_000;
    return now >= nextUpdateTime;
  };

  const uisinList = [...new Set(mainListData.filter((item) => item.underlying_isin && needsUpdate(item))
    .map(item => item.underlying_isin)
    .filter(Boolean))];
  
  const uisinChunks = chunkArray(uisinList, globalPriceState.chunkSize);
  let allApiData: any[] = [];
  let failed = false;

  try {
    for (const chunk of uisinChunks) {
      const uisinParam = chunk.join(',');
      const url = `${apiBaseUrl}price?apikey=${apiKey.value}&uisin=${uisinParam}`;
      const apiData = await fetchFeed(url, controller.signal);
      if (!apiData) { failed = true; if (apiAuthFailed.value || isApiRateLimited()) break; continue; }
      
      if (apiData.status === 1 && apiData?.data?.length > 0) {
        allApiData = allApiData.concat(apiData.data);
      }
    }
    
    const apiMap = Object.fromEntries(allApiData.map(product => [product.isin, product]));
    const freshStamp = failed ? {} : { underlyingPriceUpdatedAt: currentDatetime };

    mainListData = mainListData.map(item => {
      const extraData = apiMap[item.underlying_isin];
      if (extraData && Object.keys(extraData).length > 0) {
        let { bid, ask, timestamp, currency } = extraData;

        if (bid && ask) {
          bid = parseFloat(bid);
          ask = parseFloat(ask);
          return {
            ...item,
            underlying_price: (bid + ask) / 2,
            underlying_currency: currency || item.underlying_currency || '',
            underlyingPriceUpdatedAt: currentDatetime,
            underlying_timestamp: timestamp
          };
        }else{
           return {...item, ...freshStamp };
        }
      }
      return item;
    });
    const clonedData = deepCloneReactiveData(mainListData);
    await storage.setItem('local:MAIN_LIST',clonedData);
  } catch (err) {
    console.error('getUnderlyingPriceData Failed to fetch underlying price data:', err);
  } finally {
    const idx = globalPriceState.controllers.indexOf(controller);
    if (idx !== -1) globalPriceState.controllers.splice(idx, 1);
  }
};

export const getCurrencyRate = async (forceUpdate = true) => {
  if (isMarketClosed()) return;
  
  const controller = new AbortController();
  globalPriceState.controllers.push(controller);
  let mainListData = await storage.getItem('local:MAIN_LIST') || [];

  let priceUpdateDuration = await getPriceUpdateDuration();
  const currentDatetime = new Date().toISOString();
  const updateMinutes = priceUpdateDuration;
  const now = Date.now();
  const needsUpdate = (item: any) => {
    if (forceUpdate || !item.currencyRateUpdatedAt) return true;
    const lastUpdatedTime = new Date(item.currencyRateUpdatedAt).getTime();
    const nextUpdateTime = lastUpdatedTime + updateMinutes * 60_000;
    return now >= nextUpdateTime;
  };

  const currencyList = [...new Set(mainListData
    .filter(item => item.currency && needsUpdate(item))
    .map(item => item.currency)
    .filter(Boolean))];

  const currencyChunks = chunkArray(currencyList, globalPriceState.chunkSize);
  let allApiData: any[] = [];
  let failed = false;

  try {
    for (const chunk of currencyChunks) {
      const currencyParam = chunk.join(',');
      const url = `${apiBaseUrl}price?apikey=${apiKey.value}&currencies=${currencyParam}`;
      const apiData = await fetchFeed(url, controller.signal);
      if (!apiData) { failed = true; if (apiAuthFailed.value || isApiRateLimited()) break; continue; }

      if (apiData.status === 1 && apiData?.data?.length > 0) {
        allApiData = allApiData.concat(apiData.data);
      }
    }
    
    const currencyMap = Object.fromEntries(allApiData.map(currency => [currency.currencyID, currency]));
    const freshStamp = failed ? {} : { currencyRateUpdatedAt: currentDatetime };
    mainListData = mainListData.map(item => {
      const currencyData = currencyMap[item.currency];
      
      if (currencyData && Object.keys(currencyData).length > 0) {
        let bid = parseFloat(currencyData.bid);
        if (isNaN(bid)) bid = 1;
        return {
          ...item,
          currency_rate: bid,
          currencyRateUpdatedAt: currentDatetime
        };
      }else {
        let currencyRate = item.currency_rate || 1;
        return {
          ...item,
          currency_rate: currencyRate,
          ...freshStamp
        };
      }
    });

    const clonedData = deepCloneReactiveData(mainListData);
    await storage.setItem('local:MAIN_LIST',clonedData);
  } catch (err) {
    console.error('getCurrencyRate Failed to fetch currency rates:', err);
  } finally {
    const idx = globalPriceState.controllers.indexOf(controller);
    if (idx !== -1) globalPriceState.controllers.splice(idx, 1);
  }
};


function getQuantoLabel(currency, quanto) {
  if (currency === 'EUR') {
    return 'yes';
  } else if (currency !== 'EUR' && quanto === true) {
    return 'yes';
  } else {
    return 'no';
  }
}

export const calculateLatestMainListData = async (isPriceReload = false) => {
  const currentData = (await storage.getItem('local:MAIN_LIST') as any[]) || [];
  
  const flatexData = (await storage.getItem('local:KONTO_FLATEX') as any[]) || [];
  const consorsBank = (await storage.getItem('local:consorsBank') as any[]) || [];
  const smartBrokerData = (await storage.getItem('local:SMART_BROKER_PLUS') as any[]) || [];
  const wikifolioData = (await storage.getItem('local:WIKIFOLIO') as any[]) || [];
  const justtradeData = (await storage.getItem('local:JUSTTRADE') as any[]) || [];
  const newStockData = [...flatexData, ...consorsBank, ...smartBrokerData, ...wikifolioData, ...justtradeData];
  if (!newStockData || newStockData.length === 0) {
    return false;
  }
  
  let mergedData: any[] = [];
  if (currentData.length === 0) {
    mergedData.push(...newStockData);
  } else {
    mergedData = [];
    // Derived, not hardcoded: a hand-kept broker list drifted from the payload names and dropped Cash rows.
    const cashAccounts = new Set(
      [...currentData, ...newStockData]
        .filter((item: any) => item.stock_name === "Cash")
        .map((item: any) => accountKeyOf(item))
    );

    cashAccounts.forEach(accountKey => {
      const newCash = newStockData.find(item => item.stock_name === "Cash" 
        && accountKeyOf(item) === accountKey);

      if (newCash) {
        mergedData.push(newCash);
      } else {
        const oldCash = currentData.find(
          item => item.stock_name === "Cash" && accountKeyOf(item) === accountKey
        );
        if (oldCash) mergedData.push(oldCash);
      }
    });

    newStockData.forEach(newItem => {
     

      if (newItem.stock_name !== "Cash") {
        //wkn for all and isin for wikifolio
        const existingItem = currentData.find(
          item => item.broker === newItem.broker
          && item.account_id === newItem.account_id
          && accountSameDepot(item, newItem)
          && (item.wkn === newItem.wkn || item.isin === newItem.wkn)
        );
        
        if (existingItem) {
          const allowedFields = [
            'stocks_owned', 'total_entry_value',
            'profit_loss_price','profit_loss_percentage',
            'page_timestamp',
            'currency_rate',
            'purchase_date', 'purchase_dates'
          ];
          
          const filteredNewItem = Object.fromEntries(
            Object.entries(newItem).filter(([key]) => allowedFields.includes(key))
          );

          
          const merged = {...existingItem, ...filteredNewItem};
          mergedData.push(merged);
        } else {
          mergedData.push(newItem);
        }
      }
    });

  }


  let mainListData = mergedData;
  //add calculation to direct fields
   mainListData = mainListData.map(item => {
    let strike = parseFloat(item.strike) || 0;
    let itemCap = parseFloat(item.cap) || 0;
    
    
    let bid = parseFloat(item.bid) || 0;
    let stocks_owned = item.stocks_owned;
    // underlying quote converted to the product currency, comparable with cap/strike
    let comparableUnderlying = getComparableUnderlyingPrice(item);
    let ratio = parseFloat(item.ratio) || 1;
    let barrier_knockout = parseFloat(item.knockout) || 0;

    let bonusLevel = 0;
    let cap_strike = parseFloat(item.strike ? item.strike : item.cap) || 0;
    switch (item.type) {
      case 'discountPut':
        // Put pays out below strike; sharing the call branch gave cap - strike, a negative cap_strike.
        if (comparableUnderlying <= itemCap) {
          cap_strike = strike - itemCap;
        } else if (comparableUnderlying < strike) {
          cap_strike = strike - comparableUnderlying;
        } else {
          cap_strike = 0;
        }
        break;
      case 'discountCall':
        if (comparableUnderlying > itemCap) {
          cap_strike = itemCap - strike;
        } else if (comparableUnderlying >= strike) {
          cap_strike = comparableUnderlying - strike;
        } else {
          cap_strike = 0;
        }
        break;
      case 'cappedBonusCertificate':
        barrier_knockout = strike;
        cap_strike = itemCap;
        bonusLevel = itemCap;
        break;
    }


    //calculation
    let total_value = item.stock_name === 'Cash' ? item.total_entry_value: (bid * stocks_owned) || 0;
    
    //Future total value
    
    let FX_rate = item.currency_rate || 1;
    let future_total_value = calculateFutureTotalValue(item);
    
    
    let profit_loss_price = total_value - item.total_entry_value;
    let profit_loss_percentage = ((total_value / item.total_entry_value) - 1) * 100;

    let profit_loss_target = future_total_value - total_value;
    let profit_loss_target_pa = (profit_loss_target / total_value) * 100;


    switch (item.type) {
      case 'indexcertificate':
        profit_loss_target = 0;
        profit_loss_target = 0;
        break;
    }


    // cap/strike is in the product currency; convert it to EUR unless the product
    // is EUR or quanto (quanto pays the cap amount 1:1 in EUR)
    let capInPortfolioCurrency = (item.currency && item.currency !== 'EUR' && !item.quanto) ? cap_strike / FX_rate : cap_strike;
    let sideways_return =  cap_strike && bid && ratio ? ((capInPortfolioCurrency / bid * ratio) - 1) * 100 : 0;
    switch (item.type) {
      case 'openEndTurboShort':
      case 'openEndTurboLong':
        sideways_return = 0;
        break;
    }
    
    let distance_to_the_cap =  cap_strike && comparableUnderlying>0  ?  ((cap_strike - comparableUnderlying) / comparableUnderlying) * 100 : 0;
    switch (item.type) {
      case 'cappedBonusCertificate':
        distance_to_the_cap = ((strike - comparableUnderlying) / comparableUnderlying) * 100;
        break;
      case 'reverseCappedBonusCertificate':
        distance_to_the_cap = ((barrier_knockout - comparableUnderlying) / comparableUnderlying) * 100;
        break;
    }

    // Kept apart from distance_to_the_cap (merges cap/barrier, defaults to 0) so alarms skip products without the level.
    let dc_dist_cap: any = undefined;
    let dc_dist_barrier: any = undefined;
    if (comparableUnderlying > 0) {
      switch (item.type) {
        case 'discountCertificate':
          if (itemCap) dc_dist_cap = (itemCap / comparableUnderlying - 1) * 100;
          break;
        case 'cappedBonusCertificate':
          if (itemCap) dc_dist_cap = (itemCap / comparableUnderlying - 1) * 100;
          if (strike) dc_dist_barrier = (strike / comparableUnderlying - 1) * 100;
          break;
        case 'reverseCappedBonusCertificate':
          if (itemCap) dc_dist_cap = (itemCap / comparableUnderlying - 1) * 100;
          if (barrier_knockout) dc_dist_barrier = (barrier_knockout / comparableUnderlying - 1) * 100;
          break;
      }
    }

    let  daysUntilValuation = 0;
    let daysUntilPayout = 0;
    if (item.valuation_date) {
      const msInOneDay = 86_400_000;
      daysUntilValuation = Math.floor(
        (new Date(item.valuation_date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / msInOneDay
      );
      // The customer is paid out 7 days after Bewertungstag, so yields run to payout; Black-Scholes keeps the real expiry.
      daysUntilPayout = daysUntilValuation + PAYOUT_LAG_DAYS;
    }

    //sideways Return PA
    let sideways_return_pa = 0;
    if(item.valuation_date && future_total_value>0){
      let startAmount = total_value;
      let endAmount = future_total_value;
      if (startAmount <= 0 || daysUntilPayout <= 0) {
        sideways_return_pa = 0
      }else{
        let annualizedReturn = Math.pow(endAmount / startAmount, 365 / daysUntilPayout) - 1;
        sideways_return_pa = (annualizedReturn * 100);
      }
      
    }

    
    let profit_loss_target_per_day = 0;
    //profit_loss_target_per_day
    if(profit_loss_target && daysUntilPayout>0){
      profit_loss_target_per_day = profit_loss_target / daysUntilPayout;
    }

    //Holding time and yield p.a. since purchase
    let days_since_purchase:any = undefined;
    let yield_pa_since_purchase:any = undefined;
    if (item.purchase_date && item.stock_name !== 'Cash') {
      days_since_purchase = Math.floor(
        (new Date().setHours(0, 0, 0, 0) - new Date(item.purchase_date).setHours(0, 0, 0, 0)) / 86_400_000
      );
      if (days_since_purchase >= MIN_HOLD_DAYS_FOR_PA && item.total_entry_value > 0 && total_value > 0) {
        yield_pa_since_purchase = (Math.pow(total_value / item.total_entry_value, 365 / days_since_purchase) - 1) * 100;
      }
    }
    
    
    let capDisco = 0;
    switch (item.type) {
      case 'discountPut':
      case 'discountCall':
      case 'reverseCappedBonusCertificate':
        capDisco = itemCap;
        break;
      default:
        capDisco = 0;
    }

    //Implied Volatility
    const bs = new BlackScholes();
    let impliedVolatility = 0;

    switch (item.type) {
      case 'call':
      case 'put':
        const bsPrice = bid/ratio;
        const bsRate = 0.03;
        const bsStrike = strike;
        const bsTime = daysUntilValuation / 365;
        const bsUnderlying = item.underlying_price;

        const sigma = bs.sigma({
          price: bsPrice,
          rate: bsRate,
          strike: bsStrike,
          time: bsTime,
          type: item.type,
          underlying: bsUnderlying,
        });
        impliedVolatility = sigma ? sigma * 100 : 0;
        break;
      default:
        impliedVolatility = 0;
    }


    const newFields = {
      total_value: total_value,
      profit_loss_price: profit_loss_price,
      profit_loss_percentage: profit_loss_percentage,
      future_total_value: future_total_value,
      distance_to_the_cap: distance_to_the_cap,
      sideways_return: sideways_return,
      sideways_return_pa: sideways_return_pa,
      cap_strike: cap_strike,
      cap_disco_os: capDisco,
      quanto2: getQuantoLabel(item.currency,item.quanto),
      profit_loss_target: profit_loss_target,
      profit_loss_target_pa: profit_loss_target_pa,
      barrier_knockout: barrier_knockout,
      profit_loss_target_per_day: profit_loss_target_per_day,
      implied_volatility: impliedVolatility ? impliedVolatility : item.implied_volatility,
      bonus_level: bonusLevel,
      // Set even when undefined so a stale value never survives the spread; undefined also sorts last like purchase_date.
      days_since_purchase: days_since_purchase,
      yield_pa_since_purchase: yield_pa_since_purchase,
      dc_dist_cap: dc_dist_cap,
      dc_dist_barrier: dc_dist_barrier,
    };
    return newFields ? { ...item, ...newFields } : item;
  });

  //new field based on total
  mainListData = mainListData.map(item => {
    const total = mainListData.reduce((acc, val) => acc + Number(val.total_value), 0);
    let position_percentage = ((item.total_value / total) * 100).toFixed(2);
    const newFields = {
      position_percentage: position_percentage,
    };
    return newFields ? { ...item, ...newFields } : item;
  });

  const clonedData = deepCloneReactiveData(mainListData);
  await storage.setItem('local:MAIN_LIST',clonedData);
  return true;
};

