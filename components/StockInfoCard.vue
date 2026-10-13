<template>
  <HoverCard>
    <HoverCardTrigger as-child>
      <span class="cursor-pointer underline">
        {{ wkn }}
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="right"
          class="dc-card w-auto max-w-[calc(100vw-32px)] p-0 overflow-hidden rounded-lg border shadow-lg text-sm">
      <div ref="cardEl" class="dc-root" :style="{ width: rootWidth }">

        <div class="dc-head">
          <span v-if="info.type" class="dc-badge">{{ $t(info.type) }}</span>
          <div class="dc-line">
            <template v-if="info.isin">
              <span>{{ info.isin }}</span>
              <button type="button" class="dc-copy" :aria-label="`Copy ISIN ${info.isin}`" @click.stop="copyValue('isin', info.isin)">
                <Check v-if="copiedField === 'isin'" class="w-3.5 h-3.5 text-green-600" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </template>
            <span v-if="info.wkn" class="dc-seg">
              <span>{{ info.wkn }}</span>
              <button type="button" class="dc-copy" :aria-label="`Copy WKN ${info.wkn}`" @click.stop="copyValue('wkn', info.wkn)">
                <Check v-if="copiedField === 'wkn'" class="w-3.5 h-3.5 text-green-600" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </span>
            <span v-if="info.issuer" class="dc-seg"><span class="dc-lbl">{{ $t('issuer') }}</span> <span>{{ info.issuer }}</span></span>
          </div>
          <div v-if="info.underlying_isin || info.underlying_name" class="dc-line dc-sub">
            <span>{{ $t('dc_underlying') }}</span>
            <b class="dc-under">{{ info.underlying_name }}</b>
            <template v-if="info.underlying_isin">
              <span class="dc-pipe">|</span>
              <b class="dc-under">{{ info.underlying_isin }}</b>
              <button type="button" class="dc-copy" :aria-label="`Copy underlying ISIN ${info.underlying_isin}`" @click.stop="copyValue('underlying_isin', info.underlying_isin)">
                <Check v-if="copiedField === 'underlying_isin'" class="w-3.5 h-3.5 text-green-600" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </template>
            <span class="dc-seg">
              <span class="dc-lbl">{{ $t('dc_ratio') }}</span> <b>{{ info.ratio ? numberToGerman(info.ratio, !(info.ratio % 1), 4) : '–' }}</b>
              <span class="dc-pipe">|</span>
              <span class="dc-lbl">Quanto</span> <b>{{ info.quanto2 ? $t(info.quanto2) : '–' }}</b>
              <span class="dc-pipe">|</span>
              <span class="dc-lbl">FX</span> <b>{{ fxLabel }}</b>
            </span>
          </div>
        </div>

        <!-- Both views share one grid cell, so the card takes the taller one's height and toggling never shifts layout -->
        <div class="dc-body">
        <div v-if="chartData" class="dc-chart" :class="{ 'dc-off': view !== 'chart' }">
          <svg ref="svgEl" role="img" xmlns="http://www.w3.org/2000/svg"></svg>
          <div ref="tipEl" class="dc-hovertip"></div>
        </div>

        <div class="dc-table" :class="{ 'dc-off': view !== 'table' && !!chartData }">
          <table class="w-full">
            <tbody>
              <tr>
                <td v-for="(group, groupIndex) in [leftColumns, rightColumns]" :key="'group-' + groupIndex" class="align-top w-1/2">
                  <table class="w-full">
                    <tbody>
                      <template v-for="(column, index) in group" :key="groupIndex + '-' + index">
                        <tr>
                          <td class="dc-k">{{ $t(column) }}</td>
                          <td class="dc-v">
                            <template v-if="column === 'underlying_price'">
                              {{ info[column] ? numberToGerman(getComparableUnderlyingPrice(info)) : '' }}
                            </template>
                            <template v-else-if="column === 'wkn' || column === 'isin'">
                              <span class="inline-flex items-center gap-1">
                                {{ info[column] }}
                                <button v-if="info[column]" type="button" @click.stop="copyValue(column, info[column])"
                                  class="dc-copy">
                                  <Check v-if="copiedField === column" class="w-3.5 h-3.5 text-green-600" />
                                  <Copy v-else class="w-3.5 h-3.5" />
                                </button>
                              </span>
                            </template>
                            <template v-else-if="priceColumns.includes(column)">
                              {{ info[column] ? numberToGerman(info[column]) : '' }}
                            </template>
                            <template v-else-if="column === 'type' ">
                              {{ info[column] ? $t(info[column]) : '' }}
                            </template>
                            <template v-else-if="column === 'stocks_owned' || column === 'days_since_purchase'">
                              {{ numberToGerman(info[column],true) }}
                            </template>
                            <template v-else-if="column === 'currency_rate' ">
                              {{ numberToGerman(info[column],false,4) }}
                            </template>
                            <template v-else-if="column === 'ratio' ">
                              {{ numberToGerman(info[column],false,4) }}
                            </template>
                            <template v-else-if="column === 'timestamp' ">
                              {{ formatTimestamp(info[column]) }}
                            </template>
                            <template v-else-if="column === 'valuation_date' || column === 'purchase_date'">
                              {{ formatDate(info[column]) }}
                            </template>
                            <template v-else-if="column === 'account'">
                              {{ info.broker ? accountLabel(info.broker, info.account_id) : '' }}
                            </template>
                            <template v-else-if="column === 'peer_members'">
                              {{ info[column]?.length>0 ? info[column].filter((item: any) => item !== info['wkn']).join(',') : '' }}
                            </template>
                            <template v-else>
                              {{ info[column] ? $t(info[column]) : '' }}
                            </template>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>

        <div class="dc-foot">
          <span class="dc-line">
            <span class="dc-dot"></span>
            <span>{{ $t('dc_derivative') }} {{ formatTimestamp(info.timestamp) || '–' }}</span>
            <template v-if="info.underlying_isin">
              <span class="dc-pipe">|</span>
              <span>{{ $t('dc_underlying') }} {{ formatTimestamp(info.underlying_timestamp) || '–' }}</span>
            </template>
            <template v-if="info.lastUpdated">
              <span class="dc-pipe">|</span>
              <span>{{ $t('dc_masterdata') }} {{ formatDate(info.lastUpdated) }}</span>
            </template>
          </span>
          <span v-if="chartData" class="dc-toggle" role="group" :aria-label="$t('dc_view_mode')">
            <button type="button" :class="{ active: view === 'chart' }" :aria-pressed="view === 'chart'" @click.stop="setView('chart')">{{ $t('dc_chart') }}</button>
            <button type="button" :class="{ active: view === 'table' }" :aria-pressed="view === 'table'" @click.stop="setView('table')">{{ $t('dc_table') }}</button>
          </span>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
</template>

<script setup lang="ts">
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

import { numberToGerman, formatTimestamp, getComparableUnderlyingPrice } from '~/utils/helper';
import { buildDerivativeData, renderDerivativeChart } from '~/utils/derivative-chart-utils';
import { Copy, Check } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n();

const copiedField = ref('');
let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
const copyValue = async (field: string, value: any) => {
  try {
    await navigator.clipboard.writeText(String(value ?? ''));
    copiedField.value = field;
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { copiedField.value = ''; }, 1500);
  } catch (e) {
    console.error('copyValue failed', e);
  }
};

const props = defineProps<{
  wkn: string,
  info: any,
  columns: any,
}>()


const hideColumns = ref([
    'select',
    'actions',
]);

const visibleColumns = computed(() => props.columns.filter((col: any) => !hideColumns.value.includes(col)));
const leftColumns = computed(() => visibleColumns.value.slice(0, Math.ceil(visibleColumns.value.length / 2)));
const rightColumns = computed(() => visibleColumns.value.slice(Math.ceil(visibleColumns.value.length / 2)));

const priceColumns = ref([
    'buy_price',
    'total_entry_value',
    'profit_loss_price',
    'profit_loss_percentage',
    'profit_loss_target_per_day',
    'bid',
    'ask',
    'cap_disco_os',
    'profit_loss_target',
    'profit_loss_target_pa',
    'total_value',
    'future_total_value',
    'distance_to_the_cap',
    'position_percentage',
    'position_target_percentage',
    'underlying_price',
    'sideways_return',
    'sideways_return_pa',
    'yield_pa_since_purchase',
    'cap_strike',
    'implied_volatility',
]);

const VIEW_KEY = 'stock_info_card_view';
const readStoredView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'chart';
  } catch (e) {
    /* storage blocked: default to chart */
    return 'chart';
  }
};
const view = ref(readStoredView());

const cardEl = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const tipEl = ref<HTMLElement | null>(null);
const chartWidth = ref(0);

const chartData = computed(() => buildDerivativeData(props.info));

const rootWidth = computed(() => (chartData.value && chartWidth.value ? `${chartWidth.value}px` : '950px'));

const fxLabel = computed(() => {
  const info: any = props.info;
  const currency = (info.currency || '').trim().toUpperCase();
  if (!currency) return '–';
  if (currency === 'EUR') return `EUR/EUR ${numberToGerman(1, false, 4)}`;
  // No rate stored yet: show nothing rather than a made-up 1,0000.
  const rate = parseFloat(info.currency_rate);
  return rate ? `EUR/${currency} ${numberToGerman(rate, false, 4)}` : `EUR/${currency} –`;
});

const setView = (mode: string) => {
  view.value = mode;
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch (e) {
    /* storage blocked: choice just isn't remembered */
  }
};

// SVG can't use Tailwind dark: classes, so colours come from the card's CSS variables.
const readColors = () => {
  const cs = getComputedStyle(cardEl.value as HTMLElement);
  const v = (name: string) => cs.getPropertyValue(`--dc-${name}`).trim();
  return {
    under: v('under'), ask: v('ask'), bid: v('bid'), cap: v('cap'), grey: v('muted'), line: v('line'),
    white: v('card'), font: cs.fontFamily, barrier: v('barrier'), bonus: v('bonus'),
    bgUnder: v('bg-under'), bgAsk: v('bg-ask'), bgBid: v('bg-bid'), bgCap: v('bg-cap'), bgBonus: v('bg-bonus'), bgBarrier: v('bg-barrier'),
    brdUnder: v('brd-under'), brdBid: v('brd-bid'), brdCap: v('brd-cap'), brdBarrier: v('brd-barrier'), brdGrey: v('brd-grey'),
    boxFill: v('box-fill'), zone: v('zone'), band: v('band'), barrierZone: v('barrier-zone'), inlineZone: v('inline-zone'),
  };
};

const chartLabels = computed(() => ({
  locale: locale.value === 'de' ? 'de-DE' : 'en-US',
  cap: t('dc_cap'), strike: t('dc_strike'), strikeFin: t('dc_strike_fin'), floor: t('dc_floor'),
  bonus: t('dc_bonus'), bonusEqCap: t('dc_bonus_eq_cap'), barrier: t('dc_barrier'), barrierHit: t('dc_barrier_hit'), knockOut: t('dc_knock_out'),
  koUpper: t('dc_ko_upper'), koLower: t('dc_ko_lower'), underlying: t('dc_underlying'),
  ask: t('dc_ask'), bid: t('dc_bid'), spread: t('dc_spread'), discount: t('dc_discount'),
  distCap: t('dc_dist_cap'), distBarrier: t('dc_dist_barrier'), distKoUpper: t('dc_dist_ko_upper'), distKoLower: t('dc_dist_ko_lower'),
  innerValue: t('dc_inner_value'), time_value: t('dc_time_value'), add_on: t('dc_add_on'), residualValue: t('dc_residual_value'),
  sideways: t('dc_sideways'), in: t('dc_in'), days: t('dc_days'), toggleSideways: t('dc_toggle_sideways'),
  settlement: t('dc_settlement'), cash: t('dc_cash'), physical: t('dc_physical'),
  today: t('dc_today'), valuation: t('dc_valuation'), issuance: t('dc_issuance'),
}));

const renderChart = () => {
  if (!chartData.value || !svgEl.value || !cardEl.value) return;
  try {
    // Rendered even in Table view: the hidden chart still sizes the shared grid cell.
    chartWidth.value = renderDerivativeChart(svgEl.value, tipEl.value, chartData.value, readColors(), chartLabels.value);
  } catch (e) {
    console.error('StockInfoCard renderChart error:', e);
  }
};

// Gated on cardEl (only mounted while open) so closed cards — 3 per row — never compute chart data.
watch(() => (cardEl.value ? [svgEl.value, chartData.value, chartLabels.value] : null), () => nextTick(renderChart), { flush: 'post' });
</script>

<style scoped>
.dc-root {
  --dc-card: hsl(var(--popover));
  --dc-line: hsl(var(--border));
  --dc-muted: hsl(var(--muted-foreground));
  --dc-txt: hsl(var(--popover-foreground));
  --dc-cap: #b45309;
  --dc-under: #0e7490;
  --dc-ask: #c92a2a;
  --dc-bid: #15803d;
  --dc-barrier: #9333ea;
  --dc-bonus: #2563eb;
  --dc-bg-under: #e0f2fa;
  --dc-bg-ask: #fbe5e6;
  --dc-bg-bid: #edf9f2;
  --dc-bg-cap: #fdf3e8;
  --dc-bg-bonus: #e6effd;
  --dc-bg-barrier: #f3e8fd;
  --dc-brd-under: rgba(14, 116, 144, .4);
  --dc-brd-bid: rgba(21, 128, 61, .4);
  --dc-brd-cap: rgba(180, 83, 9, .4);
  --dc-brd-barrier: rgba(147, 51, 234, .4);
  --dc-brd-grey: rgba(95, 107, 127, .4);
  --dc-box-fill: hsl(var(--popover) / .94);
  --dc-zone: hsl(var(--muted-foreground) / .05);
  --dc-band: hsl(var(--muted-foreground) / .08);
  --dc-barrier-zone: rgba(147, 51, 234, .05);
  --dc-inline-zone: rgba(21, 128, 61, .06);
  --dc-row-alt: hsl(var(--muted));
  font-variant-numeric: tabular-nums;
  color: var(--dc-txt);
  background: var(--dc-card);
  max-width: 100%;
}
.dark .dc-root {
  --dc-cap: #f59e0b;
  --dc-under: #22b8d6;
  --dc-ask: #f87171;
  --dc-bid: #4ade80;
  --dc-barrier: #c084fc;
  --dc-bonus: #60a5fa;
  --dc-bg-under: #0c2f3a;
  --dc-bg-ask: #3b1416;
  --dc-bg-bid: #0f2e1c;
  --dc-bg-cap: #3a2510;
  --dc-bg-bonus: #142645;
  --dc-bg-barrier: #2c1745;
  --dc-brd-under: rgba(34, 184, 214, .45);
  --dc-brd-bid: rgba(74, 222, 128, .45);
  --dc-brd-cap: rgba(245, 158, 11, .45);
  --dc-brd-barrier: rgba(192, 132, 252, .45);
  --dc-brd-grey: rgba(148, 163, 184, .45);
  --dc-barrier-zone: rgba(192, 132, 252, .08);
  --dc-inline-zone: rgba(74, 222, 128, .08);
}
.dc-head { position: relative; padding: 16px 16px 12px; font-size: 14px; }
.dc-badge {
  position: absolute; top: 16px; right: 16px; padding: 3px 8px; border-radius: 4px; line-height: 1;
  font-size: 12px; font-weight: 600; color: hsl(var(--secondary-foreground));
  border: 1px solid var(--dc-line); background: hsl(var(--secondary));
}
.dc-line { display: flex; align-items: center; gap: 6px; white-space: nowrap; line-height: 24px; font-weight: 600; }
.dc-line + .dc-line { margin-top: 4px; }
.dc-sub { font-weight: 400; color: var(--dc-muted); }
.dc-sub b { color: var(--dc-txt); font-weight: 600; }
.dc-sub b.dc-under { color: var(--dc-under); }
.dc-seg { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; padding-left: 12px; border-left: 1.25px solid var(--dc-line); }
.dc-lbl { font-weight: 400; color: var(--dc-muted); }
.dc-pipe { margin: 0 2px; color: var(--dc-line); font-weight: 400; }
.dc-copy {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px;
  color: var(--dc-muted); background: none; border: none; cursor: pointer;
}
.dc-copy:hover { color: var(--dc-txt); background: var(--dc-band); }
.dc-copy:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
.dc-body { display: grid; }
.dc-body > * { grid-area: 1 / 1; min-width: 0; }
/* visibility, not display:none: the hidden view must keep its size in the grid */
.dc-off { visibility: hidden; pointer-events: none; }
.dc-chart { position: relative; align-self: center; }
.dc-chart svg { margin: 0 auto; max-width: 100%; }
.dc-hovertip {
  position: absolute; z-index: 5; pointer-events: none; opacity: 0; transform: translate(-50%, -100%); transition: opacity .08s;
  background: var(--dc-card); border: 1.25px solid var(--dc-line); border-radius: 4px; padding: 6px 8px; font-size: 12px;
  white-space: nowrap; box-shadow: 0 2px 8px rgba(15, 23, 42, .12);
}
.dc-hovertip :deep(.dc-htd) { color: var(--dc-muted); margin-bottom: 4px; font-weight: 600; }
.dc-hovertip :deep(.dc-hrow) { display: flex; align-items: center; gap: 6px; line-height: 16px; }
.dc-hovertip :deep(.dc-hsw) { flex: none; width: 8px; height: 8px; border-radius: 2px; }
.dc-hovertip :deep(.dc-hlbl) { color: var(--dc-muted); }
.dc-hovertip :deep(.dc-hval) { margin-left: auto; font-weight: 600; }
.dc-table { max-height: calc(100vh - 160px); overflow-y: auto; padding: 4px 16px; font-size: 13px; }
.dc-table > table > tbody > tr > td + td { padding-left: 24px; }
.dc-table tr tr:nth-child(even) { background: var(--dc-row-alt); }
.dc-k { padding: 3px 12px 3px 4px; color: var(--dc-muted); white-space: nowrap; vertical-align: top; }
.dc-v { padding: 3px 4px; font-weight: 600; text-align: right; }
.dc-foot {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-top: 12px;
  border-top: 1.25px solid var(--dc-line); font-size: 12px; color: var(--dc-muted);
}
.dc-foot .dc-line { font-weight: 400; line-height: 16px; }
.dc-dot {
  flex: none; width: 6px; height: 6px; border-radius: 50%; margin-right: 2px; background: var(--dc-bid);
  box-shadow: 0 0 6px var(--dc-brd-bid); animation: dc-pulse 2s infinite;
}
@keyframes dc-pulse { 50% { opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .dc-dot { animation: none; } }
.dc-toggle { margin-left: auto; display: inline-flex; flex: none; border: 1px solid var(--dc-line); border-radius: calc(var(--radius) - 2px); overflow: hidden; }
.dc-toggle button { font-size: 12px; line-height: 16px; padding: 3px 10px; color: var(--dc-muted); background: transparent; border: none; cursor: pointer; }
.dc-toggle button.active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.dc-toggle button:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }
</style>
