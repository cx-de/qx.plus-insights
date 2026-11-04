// Payoff chart for the WKN hover card (StockInfoCard.vue), ported from the certox derivative tooltip mockup.
// Section index:
//   1. Row → chart data (buildDerivativeData)
//   2. SVG renderer (renderDerivativeChart)

const SVG_NS = 'http://www.w3.org/2000/svg';
// Customer is paid 7 days after Bewertungstag — same lag as PAYOUT_LAG_DAYS in price-data-utils.ts.
const SETTLE_LAG_DAYS = 7;
const DAY_MS = 86_400_000;

// =====================================================================
// 1. Row → chart data
// =====================================================================

const toNum = (v: any) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const toIsoDay = (d: any) => {
  if (!d) return null;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDay(d);
};

// Unknown settlement stays empty rather than defaulting to cash.
const settlementKind = (v: any) => {
  const s = (v || '').toString().trim().toLowerCase();
  if (!s) return '';
  if (s.includes('phys') || s.includes('lieferung')) return 'physical';
  if (s.includes('cash') || s.includes('bar')) return 'cash';
  return (v || '').toString().trim();
};

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / DAY_MS);

// Extension product type → mockup payoff model; anything missing here opens in Table view.
const PRODUCT_TYPES: any = {
  discountCertificate: { productType: 'disco' },
  cappedBonusCertificate: { productType: 'bonus-capped' },
  call: { productType: 'call', leverage: true },
  put: { productType: 'put', leverage: true },
  discountCall: { productType: 'discount-call', leverage: true },
  discountPut: { productType: 'discount-put', leverage: true },
  openEndTurboLong: { productType: 'endless-long', leverage: true, endless: true },
  openEndTurboShort: { productType: 'endless-short', leverage: true, endless: true },
};

// appPayoff (from calculateFutureTotalValue) overrides the mockup formulas so chart = list columns.
const computeMetrics = (D: any, U: any, restDays: number, settleDays: number, appPayoff: any = null) => {
  const pType = D.productType;
  const ratio = D.ratio, fx = U.fxRate, lastU = U.price, ask = D.ask, bid = D.bid;
  const koLong = ['endless-long', 'mini-long', 'turbo-long'].includes(pType);
  const koShort = ['endless-short', 'mini-short', 'turbo-short'].includes(pType);
  const longSide = pType === 'call' || pType === 'discount-call' || koLong;
  const shortSide = pType === 'put' || pType === 'discount-put' || koShort;
  let inner: any = null, addon: any = null, addonLabel: any = null, residual: any = null, sidewaysPayoff: any = null;

  if (D.inline) {
    const inside = lastU > D.koLower && lastU < D.koUpper;
    sidewaysPayoff = inside ? D.payout : 0;
  } else if (D.leverage && longSide) {
    let intrinsic = Math.max(lastU - D.strike, 0);
    if (pType === 'discount-call') intrinsic = Math.min(intrinsic, D.cap - D.strike);
    inner = intrinsic * ratio / fx;
  } else if (D.leverage && shortSide) {
    let intrinsic = Math.max(D.strike - lastU, 0);
    if (pType === 'discount-put') intrinsic = Math.min(intrinsic, D.strike - D.cap);
    inner = intrinsic * ratio / fx;
  } else if (D.quoteInPercent) {
    sidewaysPayoff = lastU >= D.cap ? 100 : lastU / D.cap * 100;
  } else {
    let v = lastU;
    if (D.bonusLevel != null && !D.barrierHit && (D.barrier == null || lastU > D.barrier)) v = Math.max(v, D.bonusLevel);
    if (D.cap != null) v = Math.min(v, D.cap);
    sidewaysPayoff = v * ratio / fx;
  }
  if (appPayoff != null) {
    if (inner != null) inner = appPayoff;
    else sidewaysPayoff = appPayoff;
  }
  if (inner != null) {
    sidewaysPayoff = inner;
    addon = ask - inner;
    addonLabel = D.endless ? 'add_on' : 'time_value';
    if (D.knockout != null && D.strike != null && D.knockout !== D.strike) residual = Math.abs(D.knockout - D.strike) * ratio / fx;
  }

  const totalDays = restDays + settleDays;
  const swAbs = (p: number) => (p > 0 ? (sidewaysPayoff / p - 1) * 100 : null);
  // Compounded like sideways_return_pa in price-data-utils.ts, so Bid mode matches the list column.
  const swPa = (p: number) => (p > 0 && sidewaysPayoff >= 0 && !D.endless && totalDays > 0 ? (Math.pow(sidewaysPayoff / p, 365 / totalDays) - 1) * 100 : null);
  const spreadAbs = ask - bid;
  return {
    inner, addon, addonLabel, residual, sidewaysPayoff,
    spreadAbs,
    spreadRel: ask > 0 ? spreadAbs / ask * 100 : 0,
    distCap: D.cap != null && !D.leverage ? (D.cap / lastU - 1) * 100 : null,
    discount: !D.leverage && !D.quoteInPercent ? (lastU - ask * fx / ratio) / lastU * 100 : null,
    distBarrier: D.barrier != null ? (D.barrier / lastU - 1) * 100 : null,
    distKoUpper: D.inline ? (D.koUpper / lastU - 1) * 100 : null,
    distKoLower: D.inline ? (D.koLower / lastU - 1) * 100 : null,
    swAbsAsk: swAbs(ask), swPaAsk: swPa(ask),
    swAbsBid: swAbs(bid), swPaBid: swPa(bid),
  };
};

export function buildDerivativeData(info: any) {
  if (!info) return null;
  const model = PRODUCT_TYPES[info.type];
  const bid = toNum(info.bid), ask = toNum(info.ask);
  const underlyingPrice = getComparableUnderlyingPrice(info);
  if (!model || !bid || !ask || !(underlyingPrice > 0)) return null;

  const productCurrency = (info.currency || 'EUR').trim().toUpperCase();
  // Non-EUR, non-quanto products pay cap/strike in product currency, so EUR quotes need the FX hop.
  const fxRate = productCurrency !== 'EUR' && !info.quanto ? (toNum(info.currency_rate) || 1) : 1;
  const strike = toNum(info.strike), cap = toNum(info.cap), knockout = toNum(info.knockout);
  // Empty underlying currency means index points (see getComparableUnderlyingPrice) — no currency to print.
  const levelUnit = (info.underlying_currency || '').trim() ? productCurrency : '';
  const today = toIsoDay(new Date()) as string;
  const valuationDate = model.endless ? null : toIsoDay(info.valuation_date);
  // Fixed-term product without a future Bewertungstag can't be projected; drawing it open-end would mislabel strike as financing level.
  if (!model.endless && (!valuationDate || valuationDate < today)) return null;
  const endless = !!model.endless;

  const D: any = {
    ...model,
    endless,
    isin: info.isin || '',
    wkn: info.wkn || '',
    issuer: info.issuer || '',
    ratio: toNum(info.ratio) || 1,
    quanto: info.quanto,
    settlement: settlementKind(info.settlement),
    currency: 'EUR',
    capCurrency: levelUnit,
    strikeCurrency: levelUnit,
    cap: null, strike: null, barrier: null, bonusLevel: null, knockout: null,
    bid, ask,
    valuationDate: endless ? null : valuationDate,
    settlementDate: endless ? null : addDays(valuationDate as string, SETTLE_LAG_DAYS),
    implVol: toNum(info.implied_volatility) || null,
  };

  switch (info.type) {
    case 'discountCertificate':
      // calculateFutureTotalValue redeems at min(underlying, cap); strike is not used for discount certificates.
      D.cap = cap;
      break;
    case 'cappedBonusCertificate':
      // Same field reuse as calculateLatestMainListData: strike is the barrier, cap doubles as bonus level.
      D.cap = cap;
      D.bonusLevel = cap;
      D.barrier = strike;
      D.barrierHit = !!info.barrier_hit;
      break;
    case 'call':
    case 'put':
      D.strike = strike;
      break;
    case 'discountCall':
    case 'discountPut':
      D.strike = strike;
      D.cap = cap;
      break;
    case 'openEndTurboLong':
    case 'openEndTurboShort':
      D.strike = strike;
      D.knockout = knockout || strike;
      break;
  }
  const levelsMissing =
    (D.productType === 'disco' && !D.cap) ||
    (D.productType === 'bonus-capped' && (!D.cap || !D.barrier)) ||
    (D.leverage && !D.strike) ||
    ((D.productType === 'discount-call' || D.productType === 'discount-put') && !D.cap);
  if (levelsMissing) return null;

  const U = {
    name: info.underlying_name || '',
    isin: info.underlying_isin || '',
    price: underlyingPrice,
    currency: levelUnit,
    fxRate,
  };
  const restDays = D.endless ? 0 : Math.max(1, daysBetween(today, D.valuationDate));
  const settleDays = D.endless ? 0 : SETTLE_LAG_DAYS;
  // Per-unit redemption from the list's own payoff math (stocks_owned 1), already converted back to EUR.
  const appPayoff = calculateFutureTotalValue({ ...info, stocks_owned: 1 });
  D.metrics = computeMetrics(D, U, restDays, settleDays, appPayoff);

  return {
    derivative: D,
    underlying: U,
    today,
    restDays,
    settleDays,
    // Feed has no price history yet; renderer draws a snapshot until these arrays are filled.
    history: { start: null, underlying: null, bid: null, ask: null },
  };
}

// =====================================================================
// 2. SVG renderer
// =====================================================================

// Returns the content width so the card can shrink to fit, like the mockup.
export function renderDerivativeChart(svg: any, tip: any, DATA: any, C: any, L: any) {
  svg.replaceChildren();
  // Inherit the app font so the chart matches the rest of the card.
  const FONT = C.font || 'ui-sans-serif,system-ui,sans-serif';
  const D = DATA.derivative, U = DATA.underlying;

  // Internal drawing space; final visible width comes from the right-most box.
  const W = 960, H = 401, padL = 56, padR = 517, padT = 12, padB = 129;
  let contentRight = W - padR;
  let viewW = W;
  svg.setAttribute('height', H);
  svg.style.height = `${H}px`;
  svg.style.display = 'block';

  const f2 = (v: number) => numberToGerman(v, false, 2);
  const fVal = (v: number) => (Math.abs(v) >= 1000 ? numberToGerman(v, true) : f2(v));
  const fqty = (v: number) => {
    if (v < 1000) return String(v);
    const k = v / 1000;
    return `${Number.isInteger(k) ? String(k) : k.toFixed(1).replace('.', ',')}k`;
  };
  const fDate = (iso: string) => formatDate(`${iso}T00:00:00`);
  const fWeekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(L.locale, { weekday: 'short' });

  const cap = D.cap, lastU = U.price, lastBid = D.bid, lastAsk = D.ask;
  const barrier = D.barrier, bonusLevel = D.bonusLevel;
  const pType = D.productType || 'disco';
  const hasCap = cap != null, hasBarrier = barrier != null, hasBonus = bonusLevel != null;
  const capLabel = D.capLabel || L.cap;
  const ratio = D.ratio;
  const fxRate = U.fxRate != null ? U.fxRate : 1;
  const inPct = !!D.quoteInPercent;
  const leverage = !!D.leverage;
  const strike = D.strike;
  const inline = !!D.inline;
  const isEndless = !!D.endless;
  const koLong = pType === 'endless-long' || pType === 'mini-long' || pType === 'turbo-long';
  const koShort = pType === 'endless-short' || pType === 'mini-short' || pType === 'turbo-short';
  const isDiscCall = pType === 'discount-call';
  const isDiscPut = pType === 'discount-put';

  // Certificate price ↔ underlying level; leverage products are affine (strike shifts), FX converts EUR quotes.
  let toBase: any, fromBase: any;
  if (leverage && inline) {
    toBase = () => lastU;
    fromBase = () => lastAsk;
  } else if (leverage && (pType === 'call' || koLong || isDiscCall)) {
    toBase = (p: number) => p * fxRate / ratio + strike;
    fromBase = (S: number) => (isDiscCall ? Math.min(Math.max(S - strike, 0), cap - strike) : Math.max(S - strike, 0)) * ratio / fxRate;
  } else if (leverage && (pType === 'put' || koShort || isDiscPut)) {
    toBase = (p: number) => strike - p * fxRate / ratio;
    fromBase = (S: number) => (isDiscPut ? Math.min(Math.max(strike - S, 0), strike - cap) : Math.max(strike - S, 0)) * ratio / fxRate;
  } else if (inPct) {
    toBase = (p: number) => p / 100 * cap;
    fromBase = (S: number) => S / cap * 100;
  } else {
    toBase = (p: number) => p * fxRate / ratio;
    fromBase = (S: number) => S * ratio / fxRate;
  }

  const restDays = DATA.restDays || 0;
  const settleDays = DATA.settleDays || 0;

  // Real history only — the mockup's random-walk demo data would show fake prices.
  const hist = DATA.history || {};
  let under: any[] = hist.underlying, bid: any[] = hist.bid, ask: any[] = hist.ask;
  const hasHistory = !!(hist.start && under?.length > 1 && bid?.length === under.length && ask?.length === under.length);
  if (!hasHistory) {
    under = [lastU];
    bid = [lastBid];
    ask = [lastAsk];
  }
  const n = under.length;

  // Real OHLC is used as-is; a plain series is bucketed into ~30 candles.
  const NCAND = 30;
  let candles: any[] = [];
  if (hasHistory) {
    if (typeof under[0] === 'object') {
      candles = under.map((c: any, k: number) => ({ o: c.o, h: c.h, l: c.l, c: c.c, i0: k, i1: k }));
      under = under.map((c: any) => c.c);
    } else {
      const grp = Math.max(1, Math.round(n / NCAND));
      for (let s = 0; s < n; s += grp) {
        const e = Math.min(n, s + grp);
        const seg = under.slice(s, e);
        candles.push({ o: seg[0], c: seg[seg.length - 1], h: Math.max(...seg), l: Math.min(...seg), i0: s, i1: e - 1 });
      }
    }
  }

  // ---- Scales: one log master scale in underlying units; certificate prices are projected onto it ----
  const askEqArr = ask.map(toBase), bidEqArr = bid.map(toBase);
  const extra = [cap, barrier, bonusLevel, strike, D.knockout, D.koLower, D.koUpper].filter((v) => v != null);
  const allB = [...under, ...bidEqArr, ...askEqArr, ...extra].filter((v) => Number.isFinite(v) && v > 0);
  const rawMin = Math.min(...allB), rawMax = Math.max(...allB);
  const padV = (rawMax - rawMin) * 0.06 || rawMax * 0.02;
  let min = Math.max(rawMin * 1e-6, rawMin - padV), max = rawMax + padV;
  // Widen to whole units when the range holds < 3 integer ticks, so axis labels have no decimals.
  {
    const unit = max >= 1000 ? 1000 : 1;
    const cnt = Math.floor(max / unit) - Math.ceil(min / unit) + 1;
    if (cnt < 3) {
      const lo2 = Math.floor(min / unit) * unit, hi2 = Math.ceil(max / unit) * unit;
      if (lo2 > 0) { min = lo2; max = hi2; }
    }
  }

  // Calendar-true time axis; snapshot mode gives "today" a fixed lead-in instead of a history span.
  const SNAP_LEAD = 48;
  const histDays = hasHistory ? Math.max(1, daysBetween(hist.start, DATA.today)) : 0;
  const xSettle = W - padR;
  let xNow: number, xEnd: number, xDay: any;
  if (hasHistory) {
    const totalCalDays = histDays + restDays + settleDays;
    xDay = (d: number) => padL + (W - padL - padR) * d / totalCalDays;
    xNow = xDay(histDays);
    xEnd = xDay(histDays + restDays);
  } else if (isEndless) {
    xNow = xEnd = xSettle;
    xDay = () => xSettle;
  } else {
    xNow = padL + SNAP_LEAD;
    xDay = (d: number) => xNow + (xSettle - xNow) * d / (restDays + settleDays);
    xEnd = xDay(restDays);
  }
  const x = (i: number) => (hasHistory ? xDay(histDays * i / (n - 1)) : xNow);

  const lmin = Math.log(min), lmax = Math.log(max);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (Math.log(v) - lmin) / (lmax - lmin));
  // Short leverage and inline get their own upright price axis instead of an inverted underlying axis.
  let yC: any, putScale: any = null;
  if (leverage && (pType === 'put' || koShort || isDiscPut || inline)) {
    const allP = [...ask, ...bid, lastAsk, lastBid];
    // The sideways target must be on-scale or the convergence curve leaves the chart.
    if (!isEndless && D.metrics.sidewaysPayoff != null) allP.push(D.metrics.sidewaysPayoff);
    const pRaw = Math.min(...allP), pHi = Math.max(...allP);
    const pv = (pHi - pRaw) * 0.12 || pHi * 0.12;
    const pLo = Math.max(0, pRaw - pv), pTop = pHi + pv;
    putScale = { lo: pLo, hi: pTop };
    yC = (p: number) => padT + (H - padT - padB) * (1 - (p - pLo) / (pTop - pLo));
  } else {
    yC = (p: number) => y(toBase(p));
  }

  const el = (t: string, a: any): any => {
    const e = document.createElementNS(SVG_NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    svg.appendChild(e);
    return e;
  };
  const line = (arr: number[], color: string, wdt: number, dash: any, yfn?: any) => {
    const yy = yfn || y;
    let d = `M ${x(0)} ${yy(arr[0])}`;
    arr.forEach((v, i) => { d += ` L ${x(i)} ${yy(v)}`; });
    const a: any = { d, fill: 'none', stroke: color, 'stroke-width': wdt, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    if (dash) a['stroke-dasharray'] = dash;
    el('path', a);
  };
  const dot = (cx: number, cy: number, color: string) => el('circle', { cx, cy, r: 2.6, fill: color, stroke: C.white, 'stroke-width': 1.25 });

  // ---- Box model: equal padding, width from widest text (mono 14px ≈ 8.4px per char) ----
  const PAD = 8, LINE = 14;
  // Measure real glyph widths: the app font is proportional, a per-char estimate clips or bloats boxes.
  const measureCtx: any = document.createElement('canvas').getContext('2d');
  const txtW = (t: string) => {
    if (!measureCtx) return Math.round((t || '').length * 8.4);
    measureCtx.font = `700 14px ${FONT}`;
    return Math.ceil(measureCtx.measureText(t || '').width);
  };
  const colW = (lines: string[]) => Math.max(...lines.map(txtW)) + 2 * PAD;
  const boxHt = (lines: number) => lines * LINE - 3 + 2 * PAD;
  const lineY = (top: number, i: number) => top + PAD + LINE - 4 + i * LINE;
  const boxText = (cx: number, top: number, color: string, value: string, label: string) => {
    el('text', { x: cx, y: lineY(top, 0), fill: color, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': FONT }).textContent = value;
    el('text', { x: cx, y: lineY(top, 1), fill: color, 'font-size': 14, 'font-weight': 500, opacity: 0.85, 'text-anchor': 'middle', 'font-family': FONT }).textContent = label;
  };

  // ---- Zones & grid ----
  if (!isEndless) {
    el('rect', { x: xNow, y: padT - 6, width: xSettle - xNow, height: H - padB - (padT - 6), fill: C.zone });
  }
  // 1/2/5·10ⁿ steps, rounded up to whole units when that still leaves ≥ 3 ticks.
  const niceTicks = (lo: number, hi: number, target: number) => {
    const span = hi - lo, raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const unit = Math.abs(hi) >= 1000 ? 1000 : 1;
    if (step < unit) {
      const stepU = Math.ceil(step / unit) * unit;
      const cnt = Math.floor(hi / stepU) - Math.ceil(lo / stepU) + 1;
      if (cnt >= 3) step = stepU;
    }
    const first = Math.ceil(lo / step) * step, ticks: number[] = [];
    for (let v = first; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  };
  // Decimals are fixed once per axis, otherwise mixed label widths make the axis jump.
  const decOf = (v: number) => { const s = (+v.toFixed(6)).toString(); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const fAxisFor = (ticks: number[]) => {
    const big = ticks.some((v) => Math.abs(v) >= 1000);
    const vals = big ? ticks.map((v) => v / 1000) : ticks;
    // Up to 3 decimals: cheap warrants span only a few cents, 2 would print duplicate labels.
    const dec = Math.min(3, Math.max(0, ...vals.map(decOf)));
    return (v: number) => (big ? v / 1000 : v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (big ? 'k' : '');
  };
  // Second (certificate) axis only when scales differ: ratio, FX, percent quote or own put scale.
  const twoAxes = ratio !== 1 || fxRate !== 1 || inPct || !!putScale;
  const bTicks = niceTicks(min, max, 6);
  const fB = fAxisFor(bTicks);
  bTicks.forEach((v) => {
    el('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: C.line, 'stroke-width': 1.25 });
    el('text', { x: padL - 7, y: y(v) + 3, fill: twoAxes ? C.under : C.grey, 'font-size': 14, 'text-anchor': 'end', 'font-family': FONT }).textContent = fB(v);
  });
  if (twoAxes) {
    let cTicks: number[];
    if (putScale) {
      cTicks = niceTicks(putScale.lo, putScale.hi, 6);
    } else {
      const c1 = fromBase(min), c2 = fromBase(max);
      cTicks = niceTicks(Math.min(c1, c2), Math.max(c1, c2), 6);
    }
    const axRX = W - padR + 2;
    const fC = fAxisFor(cTicks);
    cTicks.forEach((p) => {
      const yy = yC(p);
      if (!Number.isFinite(yy)) return;
      el('line', { x1: W - padR, x2: W - padR + 4, y1: yy, y2: yy, stroke: C.ask, 'stroke-width': 1.25 });
      el('text', { x: axRX + 6, y: yy + 3, fill: C.ask, 'font-size': 14, 'text-anchor': 'start', 'font-family': FONT }).textContent = inPct ? `${f2(p)} %` : fC(p);
    });
  }

  // ---- History: spread band, underlying candles, ask/bid lines ----
  if (hasHistory) {
    let dBand = `M ${x(0)} ${yC(ask[0])}`;
    ask.forEach((v, i) => { dBand += ` L ${x(i)} ${yC(v)}`; });
    for (let i = n - 1; i >= 0; i--) dBand += ` L ${x(i)} ${yC(bid[i])}`;
    el('path', { d: `${dBand} Z`, fill: C.band });
    const cw = candles.length > 1 ? Math.max(2, (x(candles[1].i0) - x(candles[0].i0)) * 0.62) : 6;
    candles.forEach((k) => {
      const cx = (x(k.i0) + x(k.i1)) / 2, up = k.c >= k.o;
      // Underlying keeps its own colour (hollow up / filled down) so it never reads as bid/ask green/red.
      el('line', { x1: cx, x2: cx, y1: y(k.h), y2: y(k.l), stroke: C.under, 'stroke-width': 1 });
      const yo = y(k.o), yc = y(k.c), top = Math.min(yo, yc), h = Math.max(1, Math.abs(yo - yc));
      el('rect', { x: cx - cw / 2, y: top, width: cw, height: h, fill: up ? C.white : C.under, stroke: C.under, 'stroke-width': 1 });
    });
    line(ask, C.ask, 1.3, null, yC);
    line(bid, C.bid, 1.3, null, yC);
  }

  // ---- Product levels: cap / bonus / barrier (investment products) ----
  const bonusEqCap0 = hasCap && hasBonus && cap === bonusLevel;
  if (!leverage) {
    if (hasCap) {
      el('line', { x1: padL, x2: W - padR, y1: y(cap), y2: y(cap), stroke: bonusEqCap0 ? C.bonus : C.cap, 'stroke-width': 1.25, 'stroke-dasharray': '6 4' });
    }
    if (hasBonus && !bonusEqCap0) {
      el('line', { x1: padL, x2: W - padR, y1: y(bonusLevel), y2: y(bonusLevel), stroke: C.bonus, 'stroke-width': 1.25, 'stroke-dasharray': '6 4' });
    }
    if (hasBarrier) {
      el('rect', { x: padL, y: y(barrier), width: (W - padR) - padL, height: (H - padB) - y(barrier), fill: C.barrierZone });
      el('line', { x1: padL, x2: W - padR, y1: y(barrier), y2: y(barrier), stroke: C.barrier, 'stroke-width': 1.25 });
    }
  }
  const hasStrike = strike != null;
  if (hasStrike) {
    el('line', { x1: padL, x2: W - padR, y1: y(strike), y2: y(strike), stroke: C.cap, 'stroke-width': 1.25, 'stroke-dasharray': '6 4' });
  }
  if ((isDiscCall || isDiscPut) && cap != null) {
    el('line', { x1: padL, x2: W - padR, y1: y(cap), y2: y(cap), stroke: C.cap, 'stroke-width': 1.25, 'stroke-dasharray': '6 4' });
  }
  // Knock-out is solid: touching it ends the product.
  if (D.knockout != null && D.knockout !== strike) {
    el('line', { x1: padL, x2: W - padR, y1: y(D.knockout), y2: y(D.knockout), stroke: C.barrier, 'stroke-width': 1.25 });
  }
  if (inline) {
    el('rect', { x: padL, y: y(D.koUpper), width: (W - padR) - padL, height: y(D.koLower) - y(D.koUpper), fill: C.inlineZone });
    el('line', { x1: padL, x2: W - padR, y1: y(D.koUpper), y2: y(D.koUpper), stroke: C.barrier, 'stroke-width': 1.25 });
    el('line', { x1: padL, x2: W - padR, y1: y(D.koLower), y2: y(D.koLower), stroke: C.barrier, 'stroke-width': 1.25 });
  }

  // ---- Vertical markers, split around the date labels on the x-axis ----
  const vBottom = (H - padB) + 56;
  const axisTop = (H - padB) + 18 - 10 - 6, axisBot = (H - padB) + 34 + 3 + 6;
  const vMarker = (vx: number, color: string, dashed: boolean) => {
    const a: any = { stroke: color, 'stroke-width': 1.25 };
    if (dashed) a['stroke-dasharray'] = '3 3';
    el('line', { x1: vx, x2: vx, y1: padT - 6, y2: axisTop, ...a });
    el('line', { x1: vx, x2: vx, y1: axisBot, y2: vBottom, ...a });
  };
  if (hasHistory) vMarker(x(0), C.grey, true);
  vMarker(xNow, C.grey, true);
  if (!isEndless) {
    vMarker(xEnd, C.cap, false);
    vMarker(xSettle, C.cap, true);
  }

  // ---- Today's prices projected to valuation ----
  const projX2 = isEndless ? (W - padR) : xEnd;
  if (projX2 > xNow) {
    [[lastU, C.under, y], [lastAsk, C.ask, yC], [lastBid, C.bid, yC]].forEach(([v, c, yfn]: any) => {
      el('line', { x1: xNow, x2: projX2, y1: yfn(v), y2: yfn(v), stroke: c, 'stroke-width': 1.25, 'stroke-dasharray': '1.5 3.5' });
    });
  }

  // ---- Remaining term, sideways return and convergence curve (fixed-term products only) ----
  const swPayoff = D.metrics.sidewaysPayoff;
  if (!isEndless && swPayoff != null) {
    const ry = vBottom;
    el('line', { x1: xNow, x2: xSettle, y1: ry, y2: ry, stroke: C.grey, 'stroke-width': 1.25 });
    dot(xNow, ry, C.grey);
    dot(xSettle, ry, C.grey);

    const swModes: any = {
      ask: { price: lastAsk, color: C.ask, label: L.ask },
      bid: { price: lastBid, color: C.bid, label: L.bid },
    };
    // Kept on the svg so a price-tick re-render doesn't snap the user's Bid choice back to Ask.
    let swMode = svg.dataset.swMode === 'bid' ? 'bid' : 'ask';
    const swAbsOf = (p: number) => (swPayoff / p - 1) * 100;
    const totalDays = restDays + settleDays;
    // Compounded, same as metrics.swPa and the list's sideways_return_pa.
    const swPaOf = (p: number) => (Math.pow(swPayoff / p, 365 / totalDays) - 1) * 100;
    const sw1 = (m: string) => `${f2(swAbsOf(swModes[m].price))} % ${L.in} ${totalDays} ${L.days} / ${f2(swPaOf(swModes[m].price))} % p.a.`;
    const sw2 = (m: string) => `${L.sideways} ${swModes[m].label}`;
    const boxW = colW([sw1('ask'), sw1('bid'), `⇄ ${sw2('ask')}`, `⇄ ${sw2('bid')}`]);
    const boxH = boxHt(2), boxTop = ry + 16;
    // Days box and settlement box share one row: days left, settlement right.
    const setKind = D.settlement === 'physical' ? L.physical : D.settlement === 'cash' ? L.cash : D.settlement;
    const setL1 = `${fDate(D.settlementDate)} (+${settleDays}d) ${setKind || ''}`.trim();
    const setL2 = L.settlement;
    const sbW = colW([setL1, setL2]);
    const rowGap = 14;
    const pairW = boxW + rowGap + sbW;
    const pairX = Math.max(16, Math.min((xNow + xSettle) / 2 - pairW / 2, W - 16 - pairW));
    const px = pairX;
    const amx = (xNow + xSettle) / 2;
    el('rect', { x: px, y: boxTop, width: boxW, height: boxH, rx: 4, fill: C.boxFill, stroke: C.grey, 'stroke-width': 1.25 });
    el('line', { x1: amx, y1: ry, x2: px + boxW / 2, y2: boxTop, stroke: C.grey, 'stroke-width': 1.25 });
    dot(amx, ry, C.grey);
    dot(px + boxW / 2, boxTop, C.grey);
    const swT1 = el('text', { x: px + boxW / 2, y: lineY(boxTop, 0), 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': FONT, style: 'cursor:pointer' });
    const swT2 = el('text', { x: px + boxW / 2, y: lineY(boxTop, 1), 'font-size': 14, 'font-weight': 500, opacity: 0.85, 'text-anchor': 'middle', 'font-family': FONT, style: 'cursor:pointer' });
    const sw2W = txtW(sw2('ask'));
    const swToggleIcon = el('text', { x: px + boxW / 2 - sw2W / 2 - 8, y: lineY(boxTop, 1), fill: C.grey, 'font-size': 14, 'text-anchor': 'end', 'font-family': FONT, style: 'cursor:pointer;outline:none' });
    swToggleIcon.textContent = '⇄';
    swToggleIcon.setAttribute('role', 'button');
    swToggleIcon.setAttribute('tabindex', '0');
    swToggleIcon.setAttribute('aria-label', L.toggleSideways);

    const swLink = el('line', { 'stroke-width': 1.25, 'stroke-dasharray': '3 3' });
    const swLinkDot = el('circle', { r: 2.6, stroke: C.white, 'stroke-width': 1.25 });
    const swPath = el('path', { fill: 'none', 'stroke-width': 1.25, 'stroke-dasharray': '5 4', 'stroke-linecap': 'round' });
    const swDot = el('circle', { cx: xEnd, cy: yC(swPayoff), r: 2.6, stroke: C.white, 'stroke-width': 1.25 });

    const renderSw = () => {
      const m = swModes[swMode];
      const tv0 = swPayoff - m.price;
      // sqrt decay: time value melts fastest near maturity.
      const swf = (t: number) => swPayoff - tv0 * Math.sqrt(1 - t);
      let d = '';
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, X = xNow + (xEnd - xNow) * t, Y = yC(swf(t));
        d += `${k ? ' L' : 'M'} ${X} ${Y}`;
      }
      swPath.setAttribute('d', d);
      swPath.setAttribute('stroke', m.color);
      swDot.setAttribute('fill', m.color);
      const tLink = Math.min(1, (amx - xNow) / (xEnd - xNow)), yCurve = yC(swf(tLink));
      swLink.setAttribute('x1', amx); swLink.setAttribute('y1', yCurve);
      swLink.setAttribute('x2', amx); swLink.setAttribute('y2', ry);
      swLink.setAttribute('stroke', m.color);
      swLinkDot.setAttribute('cx', amx); swLinkDot.setAttribute('cy', yCurve);
      swLinkDot.setAttribute('fill', m.color);
      swT1.setAttribute('fill', m.color); swT1.textContent = sw1(swMode);
      swT2.setAttribute('fill', m.color); swT2.textContent = sw2(swMode);
      swToggleIcon.setAttribute('fill', m.color);
    };
    renderSw();
    const toggleSw = () => { swMode = swMode === 'ask' ? 'bid' : 'ask'; svg.dataset.swMode = swMode; renderSw(); };
    swT1.addEventListener('click', toggleSw);
    swT2.addEventListener('click', toggleSw);
    swToggleIcon.addEventListener('click', toggleSw);
    swToggleIcon.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSw(); }
    });

    const sbH = boxHt(2), sbX = px + boxW + rowGap;
    const sbTop = boxTop + (boxH - sbH) / 2;
    const sX = sbX + sbW / 2;
    el('line', { x1: xSettle, y1: vBottom, x2: sX, y2: sbTop, stroke: C.cap, 'stroke-width': 1.25, 'stroke-dasharray': '3 3' });
    dot(xSettle, vBottom, C.cap);
    el('rect', { x: sbX, y: sbTop, width: sbW, height: sbH, rx: 4, fill: C.boxFill, stroke: C.cap, 'stroke-width': 1.25 });
    contentRight = Math.max(contentRight, sbX + sbW);
    dot(sX, sbTop, C.cap);
    boxText(sbX + sbW / 2, sbTop, C.cap, setL1, setL2);
  }

  // ---- Today markers + price badges ----
  const marker = (v: number, color: string, yfn?: any) => el('circle', { cx: xNow, cy: (yfn || y)(v), r: 3, fill: color, stroke: C.white, 'stroke-width': 1.25 });
  marker(lastU, C.under, y); marker(lastAsk, C.ask, yC); marker(lastBid, C.bid, yC);

  const f2c = (v: number, cur: string) => `${fVal(v)} ${cur || ''}`.trim();
  const bonusEqCap = hasCap && hasBonus && cap === bonusLevel;
  const dcHi = (isDiscCall || isDiscPut) ? Math.max(strike, cap) : null;
  const dcLo = (isDiscCall || isDiscPut) ? Math.min(strike, cap) : null;
  const sizeTag = (label: string, size: any) => (size ? `${label} (# ${fqty(size)})` : label);
  const labels: any[] = [
    (!leverage && bonusEqCap) && { key: 'cap', v: cap, txt: f2c(cap, D.capCurrency), sub: L.bonusEqCap, fg: C.bonus, bg: C.bgBonus, bd: C.bonus, yf: y },
    (!leverage && hasCap && !bonusEqCap) && { key: 'cap', v: cap, txt: f2c(cap, D.capCurrency), sub: capLabel, fg: C.cap, bg: C.bgCap, bd: C.cap, yf: y },
    (!leverage && hasBonus && !bonusEqCap) && { key: 'bonus', v: bonusLevel, txt: f2c(bonusLevel, D.capCurrency), sub: L.bonus, fg: C.bonus, bg: C.bgBonus, bd: C.bonus, yf: y },
    (isDiscCall || isDiscPut) && { key: 'dccap', v: dcHi, txt: f2c(dcHi as number, D.capCurrency), sub: L.cap, fg: C.cap, bg: C.bgCap, bd: C.cap, yf: y },
    (isDiscCall || isDiscPut) && { key: 'dcfloor', v: dcLo, txt: f2c(dcLo as number, D.capCurrency), sub: L.floor, fg: C.cap, bg: C.bgCap, bd: C.cap, yf: y },
    inline && { key: 'koupper', v: D.koUpper, txt: f2c(D.koUpper, D.koCurrency), sub: L.koUpper, fg: C.barrier, bg: C.bgBarrier, bd: C.barrier, yf: y },
    inline && { key: 'kolower', v: D.koLower, txt: f2c(D.koLower, D.koCurrency), sub: L.koLower, fg: C.barrier, bg: C.bgBarrier, bd: C.barrier, yf: y },
    { key: 'under', v: lastU, txt: f2c(lastU, U.currency), sub: U.name || L.underlying, fg: C.under, bg: C.bgUnder, bd: C.under, yf: y },
    { key: 'ask', v: lastAsk, txt: f2c(lastAsk, D.currency), sub: sizeTag(L.ask, D.askSize), fg: C.ask, bg: C.bgAsk, bd: C.ask, yf: yC },
    { key: 'bid', v: lastBid, txt: f2c(lastBid, D.currency), sub: sizeTag(L.bid, D.bidSize), fg: C.bid, bg: C.bgBid, bd: C.bid, yf: yC },
    (hasStrike && !isDiscCall && !isDiscPut) && { key: 'strike', v: strike, txt: f2c(strike, D.strikeCurrency || U.currency), sub: isEndless ? L.strikeFin : L.strike, fg: C.cap, bg: C.bgCap, bd: C.cap, yf: y },
    (D.knockout != null && D.knockout !== strike) && { key: 'knockout', v: D.knockout, txt: f2c(D.knockout, D.strikeCurrency || U.currency), sub: L.knockOut, fg: C.barrier, bg: C.bgBarrier, bd: C.barrier, yf: y },
    hasBarrier && { key: 'barrier', v: barrier, txt: f2c(barrier, D.capCurrency), sub: D.barrierHit ? L.barrierHit : L.barrier, fg: C.barrier, bg: C.bgBarrier, bd: C.barrier, yf: y },
  ].filter(Boolean).map((l: any) => ({ ...l, ly: l.yf(l.v) })).sort((a: any, b: any) => a.ly - b.ly);
  const tw = colW(labels.flatMap((l: any) => [l.txt, l.sub]));
  const tagH = boxHt(2);
  // Badges sit on their price level and are only pushed apart (14px gap) on collision.
  const slotGap = tagH + 14;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].ly - labels[i - 1].ly < slotGap) labels[i].ly = labels[i - 1].ly + slotGap;
  }
  const TAGX = W - padR + 52;
  labels.forEach((l: any) => {
    const top = l.ly - tagH / 2;
    el('rect', { x: TAGX, y: top, width: tw, height: tagH, rx: 4, fill: l.bg, stroke: l.bd, 'stroke-width': 1.25 });
    el('line', { x1: xEnd, y1: l.yf(l.v), x2: TAGX, y2: l.ly, stroke: l.bd, 'stroke-width': 1.25 });
    dot(xEnd, l.yf(l.v), l.bd);
    dot(TAGX, l.ly, l.bd);
    boxText(TAGX + tw / 2, top, l.fg, l.txt, l.sub);
  });
  contentRight = Math.max(contentRight, TAGX + tw);

  // ---- Bracket boxes: each metric spans two badges, its box sits in its own column ----
  const bxrX = TAGX + tw + 12;
  const MX = D.metrics;
  const spreadTxt = `${f2(MX.spreadAbs)} ${D.currency} / ${f2(MX.spreadRel)} %`;
  const BOXX0 = bxrX + 22;
  // Resolve badges by role, not value — equal values (e.g. bid = underlying) would bind the wrong badge.
  const findByKey = (k: string) => { const l = labels.find((lb: any) => lb.key === k); return l ? l.ly : null; };
  const brackets: any[] = [];
  if (leverage && inline) {
    brackets.push({ ak: 'koupper', bk: 'under', color: C.barrier, brd: C.brdBarrier, title: L.distKoUpper, value: `${f2(MX.distKoUpper)} %` });
    brackets.push({ ak: 'under', bk: 'kolower', color: C.barrier, brd: C.brdBarrier, title: L.distKoLower, value: `${f2(MX.distKoLower)} %` });
    brackets.push({ ak: 'ask', bk: 'bid', color: C.grey, brd: C.brdGrey, title: L.spread, value: spreadTxt });
  } else if (leverage && MX.inner != null) {
    // Discount warrants measure inner value against floor/cap instead of strike.
    const innerAnchor = isDiscCall ? 'dcfloor' : isDiscPut ? 'dccap' : 'strike';
    brackets.push({ ak: 'ask', bk: 'under', color: C.under, brd: C.brdUnder, title: L[MX.addonLabel], value: `${f2(MX.addon)} ${D.currency}` });
    brackets.push({ ak: 'under', bk: innerAnchor, color: C.bid, brd: C.brdBid, title: L.innerValue, value: `${f2(MX.inner)} ${D.currency}` });
    brackets.push({ ak: 'ask', bk: 'bid', color: C.grey, brd: C.brdGrey, title: L.spread, value: spreadTxt });
    if (MX.residual != null) {
      brackets.push({ ak: 'strike', bk: 'knockout', color: C.barrier, brd: C.brdBarrier, title: L.residualValue, value: `${f2(MX.residual)} ${D.currency}` });
    }
  } else {
    if (hasCap) brackets.push({ ak: 'cap', bk: 'under', color: C.cap, brd: C.brdCap, title: L.distCap, value: `${f2(MX.distCap)} %` });
    if (MX.discount != null) brackets.push({ ak: 'under', bk: 'ask', color: C.under, brd: C.brdUnder, title: L.discount, value: `${f2(MX.discount)} %` });
    brackets.push({ ak: 'ask', bk: 'bid', color: C.grey, brd: C.brdGrey, title: L.spread, value: spreadTxt });
    if (hasBarrier) brackets.push({ ak: 'under', bk: 'barrier', color: C.barrier, brd: C.brdBarrier, title: L.distBarrier, value: `${f2(MX.distBarrier)} %` });
  }
  brackets.forEach((br) => { br.y1 = findByKey(br.ak); br.y2 = findByKey(br.bk); });
  const brValid = brackets.filter((br) => br.y1 != null && br.y2 != null);
  brValid.forEach((b) => { b.lo = Math.min(b.y1, b.y2); b.hi = Math.max(b.y1, b.y2); b.span = b.hi - b.lo; });
  // Narrow brackets sit inside; any wider bracket overlapping one moves one level out.
  const bySpan = [...brValid].sort((a, b) => a.span - b.span);
  const STEP = 14;
  bySpan.forEach((b, i) => {
    let depth = 0;
    for (let j = 0; j < i; j++) {
      const o = bySpan[j];
      if (b.lo < o.hi && b.hi > o.lo) depth = Math.max(depth, o.depth + 1);
    }
    b.depth = depth;
  });
  const brLines = brValid.flatMap((br) => [br.title, br.value]);
  const brBoxW = colW(brLines.length ? brLines : [L.spread, '0']), brBoxH = boxHt(2);
  const maxDepth = Math.max(0, ...brValid.map((b) => b.depth));
  const BOXX = BOXX0 + maxDepth * STEP;
  brValid.forEach((b) => { b.my = (b.y1 + b.y2) / 2; });
  brValid.sort((a, b) => a.my - b.my);
  const boxGap = brBoxH + 8;
  for (let i = 1; i < brValid.length; i++) {
    if (brValid[i].my - brValid[i - 1].my < boxGap) brValid[i].my = brValid[i - 1].my + boxGap;
  }
  brValid.forEach((b) => {
    const armX = TAGX + tw;
    const spine = bxrX + b.depth * STEP;
    el('path', { d: `M ${armX} ${b.y1} H ${spine} V ${b.y2} H ${armX}`, fill: 'none', stroke: b.color, 'stroke-width': 1.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    dot(armX, b.y1, b.color); dot(armX, b.y2, b.color);
    const top = b.my - brBoxH / 2;
    el('rect', { x: BOXX, y: top, width: brBoxW, height: brBoxH, rx: 4, fill: C.boxFill, stroke: b.brd, 'stroke-width': 1.25 });
    contentRight = Math.max(contentRight, BOXX + brBoxW);
    const brMid = (b.y1 + b.y2) / 2;
    el('line', { x1: spine, y1: brMid, x2: BOXX, y2: b.my, stroke: b.color, 'stroke-width': 1.25 });
    dot(spine, brMid, b.color);
    dot(BOXX, b.my, b.color);
    boxText(BOXX + brBoxW / 2, top, b.color, b.value, b.title);
  });

  // ---- Time axis ----
  const axisY = H - padB + 18;
  const subY = axisY + 16;
  const axisLabel = (ax: number, color: string, top: string, sub: string, anchor = 'middle') => {
    el('text', { x: ax, y: axisY, fill: color, 'font-size': 14, 'text-anchor': anchor, 'font-family': FONT }).textContent = top;
    el('text', { x: ax, y: subY, fill: color, 'font-size': 14, 'text-anchor': anchor, 'font-family': FONT }).textContent = sub;
  };
  if (hasHistory) axisLabel(x(0), C.grey, fDate(hist.start), L.issuance);
  // Open-end snapshot puts today on the right edge, so right-align its label to stay clear of the badges.
  axisLabel(xNow, C.grey, fDate(DATA.today), L.today, isEndless && !hasHistory ? 'end' : 'middle');
  if (!isEndless) axisLabel(xEnd, C.cap, `${fDate(D.valuationDate)} (${fWeekday(D.valuationDate)})`, L.valuation);

  // ---- Hover crosshair over history ----
  if (hasHistory && tip) {
    const t0 = new Date(`${hist.start}T00:00:00`).getTime();
    const t1 = new Date(`${DATA.today}T00:00:00`).getTime();
    const dateAt = (i: number) => toIsoDay(new Date(t0 + (t1 - t0) * (i / (n - 1)))) as string;
    const gHover = el('g', { opacity: 0, 'pointer-events': 'none' });
    const gv = (t: string, a: any): any => { const e = document.createElementNS(SVG_NS, t); for (const k in a) e.setAttribute(k, a[k]); gHover.appendChild(e); return e; };
    const hGuide = gv('line', { stroke: C.grey, 'stroke-width': 1.25, 'stroke-dasharray': '3 3' });
    const hDots = [C.under, C.ask, C.bid].map((c) => gv('circle', { r: 3.5, fill: c, stroke: C.white, 'stroke-width': 1.25 }));
    const plotTop = padT - 6, plotBot = H - padB;
    const hit = el('rect', { x: x(0), y: plotTop, width: xNow - x(0), height: plotBot - plotTop, fill: 'transparent', style: 'cursor:crosshair' });
    const row = (c: string, lbl: string, val: number, cur: string) => {
      const r = document.createElement('div');
      r.className = 'dc-hrow';
      const sw = document.createElement('span'); sw.className = 'dc-hsw'; sw.style.background = c;
      const lb = document.createElement('span'); lb.className = 'dc-hlbl'; lb.textContent = lbl;
      const vl = document.createElement('span'); vl.className = 'dc-hval'; vl.textContent = `${f2(val)} ${cur}`;
      r.append(sw, lb, vl);
      return r;
    };
    const showAt = (i: number) => {
      const hx = x(i);
      hGuide.setAttribute('x1', hx); hGuide.setAttribute('x2', hx);
      hGuide.setAttribute('y1', plotTop); hGuide.setAttribute('y2', plotBot);
      hDots[0].setAttribute('cx', hx); hDots[0].setAttribute('cy', y(under[i]));
      hDots[1].setAttribute('cx', hx); hDots[1].setAttribute('cy', yC(ask[i]));
      hDots[2].setAttribute('cx', hx); hDots[2].setAttribute('cy', yC(bid[i]));
      gHover.setAttribute('opacity', 1);
      const head = document.createElement('div'); head.className = 'dc-htd'; head.textContent = fDate(dateAt(i));
      tip.replaceChildren(head, row(C.under, U.name, under[i], U.currency), row(C.ask, L.ask, ask[i], D.currency), row(C.bid, L.bid, bid[i], D.currency));
      const topY = Math.min(y(under[i]), yC(ask[i]), yC(bid[i]));
      tip.style.left = `${hx}px`;
      tip.style.top = `${topY - 10}px`;
      tip.style.opacity = 1;
    };
    const hide = () => { gHover.setAttribute('opacity', 0); tip.style.opacity = 0; };
    const idxFromEvent = (e: any) => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) * (viewW / r.width);
      const i = Math.round((sx - x(0)) / (xNow - x(0)) * (n - 1));
      return Math.max(0, Math.min(n - 1, i));
    };
    hit.addEventListener('mousemove', (e: any) => showAt(idxFromEvent(e)));
    hit.addEventListener('mouseleave', hide);
  }

  svg.setAttribute('aria-label', `${D.wkn}: ${U.name} ${f2(lastU)}, ${L.ask} ${f2(lastAsk)}, ${L.bid} ${f2(lastBid)}${isEndless ? '' : `, ${L.valuation} ${fDate(D.valuationDate)}`}`);

  const cardW = Math.round(contentRight + 16);
  viewW = cardW;
  svg.setAttribute('viewBox', `0 0 ${cardW} ${H}`);
  svg.setAttribute('width', cardW);
  svg.style.width = `${cardW}px`;
  return cardW;
}
