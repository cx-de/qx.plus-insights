import { BlackScholes } from '@uqee/black-scholes';

const MS_PER_DAY = 86400000;

const maturityDate = (maturity: any) => new Date(`${maturity}T00:00:00`);

// Shaped like a scraped put row so the scenario code values virtual and real puts with one model.
export function virtualPutRow(put: any, label = '') {
  const premium = put.price * put.quantity;
  return {
    type: 'put',
    stock_name: label,
    strike: put.strike,
    ratio: put.ratio,
    stocks_owned: put.quantity,
    implied_volatility: put.implied_volatility,
    underlying_price: put.underlying_price,
    valuation_date: put.maturity,
    // Equal currencies: getComparableUnderlyingPrice would otherwise FX-convert the underlying.
    currency: 'EUR',
    underlying_currency: 'EUR',
    total_value: premium,
    future_total_value: premium,
  };
}

// Solved from the entered price, so the put is worth exactly its premium today and the hedge line starts on the scenario line.
export function virtualPutSigma(put: any, today: any) {
  const time = (maturityDate(put.maturity).getTime() - today.getTime()) / MS_PER_DAY / 365;
  if (!(time > 0) || !(put.ratio > 0)) return 0;
  const target = put.price / put.ratio;
  try {
    const bs = new BlackScholes();
    const priceAt = (sigma: number) => bs.option({ type: 'put', rate: 0.03, strike: put.strike, underlying: put.underlying_price, sigma, time }).price;
    // Own bisection: the library's stops on an absolute 0.001 price error and returned 0 for typed index-warrant prices.
    let low = 0.0001;
    let high = 5;
    if (!(target > priceAt(low)) || !(target < priceAt(high))) return 0;
    for (let i = 0; i < 100 && high - low > 1e-7; i++) {
      const mid = (low + high) / 2;
      if (priceAt(mid) > target) high = mid; else low = mid;
    }
    return ((low + high) / 2) * 100;
  } catch (err) {
    /* a price outside the model's range has no volatility; the caller asks for one by hand */
    console.error('virtualPutSigma error:', err);
    return 0;
  }
}

export function virtualPutValidate(put: any, today: any) {
  const positive = ['quantity', 'strike', 'price', 'ratio', 'underlying_price'];
  if (positive.some((key) => !(Number(put[key]) > 0))) return 'scenarios.virtual_puts.invalid';
  if (!Number.isInteger(Number(put.quantity))) return 'scenarios.virtual_puts.invalid';
  if (!String(put.underlying_name ?? '').trim()) return 'scenarios.virtual_puts.invalid';
  if (put.iv_manual && !(Number(put.implied_volatility) > 0)) return 'scenarios.virtual_puts.invalid';
  if (!put.maturity || !(maturityDate(put.maturity) > today)) return 'scenarios.virtual_puts.maturity_past';
  return null;
}
