<template>
  <div>

    <!-- Hidden while every child renders nothing (one account, no prices yet): min-h-8 left an empty band -->
    <div class="hidden has-[>*>*]:flex flex-wrap justify-between items-center gap-4 mt-2 min-h-8">

      <div class="flex items-center gap-4">
        <AccountFilter @change="updateBroker()" />
        <CombineSwitch :rows="listData" @change="updateBroker()" />
      </div>

      <div v-if="listUpdatedAt" class="flex items-center gap-3">
        <span class="text-xs tabular-nums"
          :class="apiAuthFailed ? 'text-destructive dark:text-red-400' : 'text-muted-foreground'">
          {{ $t('update_at') }}: {{ formatTimestamp(listUpdatedAt) }}
          <template v-if="apiAuthFailed">({{ $t('stale') }})</template>
        </span>
        <Button @click="reloadProductData()" variant="outline" size="sm"
          class="flex items-center h-8" :disabled="isPriceLoading">
          <RefreshCcw class="h-3.5 w-3.5"
            :class="{ 'animate-spin opacity-50': isPriceLoading }" />
          <span class="ml-2 sm:whitespace-nowrap">
            {{ isPriceLoading ? $t('loading') : $t('reload') }}
          </span>
        </Button>
      </div>
    </div>


    <!-- Hero strip -->
    <div class="mt-3 rounded-lg border bg-card text-card-foreground shadow-xs">
      <div class="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
        <div>
          <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {{ $t('total_amount') }}
          </div>
          <div class="mt-1 flex items-baseline gap-3">
            <span class="text-3xl font-bold tabular-nums text-foreground" id="totalAmount">
              {{ numberToGerman(totalAmount) }} €
            </span>
            <span
              v-if="changeYesterdayKnown"
              :class="changeYesterday > 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                : changeYesterday < 0
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums"
              :title="$t('change_since_yesterday')">
              <ArrowUp v-if="changeYesterday > 0" class="h-3.5 w-3.5" aria-hidden="true" />
              <ArrowDown v-else-if="changeYesterday < 0" class="h-3.5 w-3.5" aria-hidden="true" />
              <Minus v-else class="h-3.5 w-3.5" aria-hidden="true" />
              {{ numberToGerman(changeYesterday) }} € ({{ numberToGerman(changeYesterdayPercentage, false, 2) }}%)
            </span>
          </div>
        </div>

        <div class="flex items-center gap-8">
          <div class="text-right">
            <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ $t('number_of_positions') }}
            </div>
            <div class="mt-1 flex items-center justify-end gap-3">
              <span class="text-lg font-bold tabular-nums text-foreground" id="numberOfPositions">
                {{ totalPosition }}
              </span>
              <!-- Bare arrows and a '*' gave no hint what each count meant -->
              <span class="flex items-center gap-1.5 text-xs tabular-nums">
                <span class="flex items-center text-emerald-600 dark:text-emerald-400"
                  :title="$t('gainers')" :aria-label="`${$t('gainers')}: ${allGainers.length}`">
                  <ArrowUp class="h-3 w-3 mr-0.5" aria-hidden="true" />{{ numberToGerman(allGainers.length, true) }}
                </span>
                <span class="text-muted-foreground" aria-hidden="true">/</span>
                <span class="flex items-center text-rose-600 dark:text-rose-400"
                  :title="$t('losers')" :aria-label="`${$t('losers')}: ${allLosers.length}`">
                  <ArrowDown class="h-3 w-3 mr-0.5" aria-hidden="true" />{{ numberToGerman(allLosers.length, true) }}
                </span>
                <span class="text-muted-foreground" aria-hidden="true">/</span>
                <span class="flex items-center text-muted-foreground"
                  :title="$t('unchanged')" :aria-label="`${$t('unchanged')}: ${remainingList.length}`">
                  <Minus class="h-3 w-3 mr-0.5" aria-hidden="true" />{{ numberToGerman(remainingList.length, true) }}
                </span>
              </span>
            </div>
          </div>

          <div class="text-right">
            <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ $t('number_of_brokers') }}
            </div>
            <div class="mt-1 text-lg font-medium tabular-nums text-muted-foreground" id="numberOfBrokers">
              {{ numberOfBrokers }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 mt-3">
      <ChartCard ref="chartRef" :title="$t('asset_allocation')" :icon="Wallet" accent="16 185 129"
        :data="chartData" :options="chartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(chartData)" />
      <ChartCard ref="typeChartRef" :title="$t('by_type')" :icon="Layers" accent="59 130 246"
        :data="typeChartData" :options="typeChartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(typeChartData)" />
      <ChartCard ref="countryChartRef" :title="$t('by_country')" :icon="Globe" accent="245 158 11"
        :data="countryChartData" :options="countryChartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(countryChartData)" />
      <ChartCard ref="issuerChartRef" :title="$t('by_issuer')" :icon="Building2" accent="139 92 246"
        :data="issuerChartData" :options="issuerChartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(issuerChartData)" />
      <ChartCard ref="currencyChartRef" :title="$t('by_currency')" :icon="Coins" accent="244 63 94"
        :data="currencyChartData" :options="currencyChartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(currencyChartData)" />
      <ChartCard ref="valuationDateChartRef" :title="$t('by_valuation_date')" :icon="CalendarDays" accent="6 182 212"
        :data="valuationDateChartData" :options="valuationDateChartOptions" :loading="isLoadingAssetChart" :has-data="hasChartData(valuationDateChartData)" />
    </div>

    <div class="flex flex-col lg:flex-row gap-4 mt-3 lg:min-h-[400px]">

      <div class="w-full lg:flex-1 lg:min-w-0">
        <Card class="shadow-xs border rounded-lg h-full">
          <CardContent class="p-3 space-y-1 h-full flex flex-col">
            <Tabs default-value="gainers" class="flex h-full flex-col">
              <div class="flex items-center py-2">
              <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{{  $t('top_movers') }}</h2>
              <TabsList class="ml-auto">
                <TabsTrigger value="gainers" class="text-muted-foreground data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:font-semibold">
                {{  $t('gainers') }}
                </TabsTrigger>
                <TabsTrigger value="losers" class="text-muted-foreground data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:font-semibold">
                  {{  $t('losers') }}
                </TabsTrigger>
              </TabsList>
              </div>

              <TabsContent value="gainers" class="flex-1">
                <MoversList :items="gainers" :is-empty="allGainers.length==0" tone="gain" :loading="isPriceLoading"
                  :isin-link="isinLink" :link-for="formattedISINLink" @reload="reloadProductData()" />
              </TabsContent>

              <TabsContent value="losers" class="flex-1">
                <MoversList :items="losers" :is-empty="allLosers.length==0" tone="loss" :loading="isPriceLoading"
                  :isin-link="isinLink" :link-for="formattedISINLink" @reload="reloadProductData()" />
              </TabsContent>

            </Tabs>

          </CardContent>
        </Card>
      </div>

      <div class="w-full lg:w-2/5 lg:min-w-0">
        <Card class="shadow-xs border rounded-lg h-full">
          <CardContent class="p-3 h-full flex flex-col">
            <div class="flex items-center gap-2 py-2">
              <Globe class="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {{ $t('geography') }}
              </h2>
            </div>
            <!-- Canvas stays mounted underneath: ChartJS needs it to exist before the first draw -->
            <div class="relative flex-1 min-h-[200px]">
              <canvas ref="countryChart" role="img" :aria-label="$t('geography')"></canvas>
              <Skeleton v-if="isLoadingAssetChart" class="absolute inset-0 rounded-md" />
              <div v-else-if="!listData.length" class="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                {{ $t('no_data_available') }}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>

    </div>
</template>

<script lang="ts" setup>
import { ref, shallowRef } from 'vue';
import AccountFilter from '~/components/AccountFilter.vue'
import CombineSwitch from '~/components/CombineSwitch.vue'
import ChartCard from '~/components/ChartCard.vue'
import MoversList from '~/components/MoversList.vue'
import { useToast } from '@/components/ui/toast/use-toast'

import { apiAuthFailed, getApiKey, getLatestData, numberToGerman, formatMonthYear, todayIso } from '~/utils/helper';
import { reloadPriceData, abortPriceRequests } from '~/utils/price-data-utils'

import { Skeleton } from '@/components/ui/skeleton'
import {useI18n} from "vue-i18n";
import { Button } from '@/components/ui/button'

import { Card, CardContent } from "@/components/ui/card";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import {
  ArrowUp,
  ArrowDown,
  RefreshCcw,
  Wallet,
  Layers,
  Globe,
  Building2,
  Coins,
  CalendarDays,
  Minus,
 } from 'lucide-vue-next';

import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, registerables } from 'chart.js';

import {
  BubbleMapController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
  SizeScale,
  topojson
} from "chartjs-chart-geo";

ChartJS.register(
  ...registerables,
  BubbleMapController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
  SizeScale
);


const centerTextPlugin = {
  id: 'centerTextOption',
  beforeDraw(chart:any) {
    const { width, height } = chart;
    const ctx = chart.ctx;
    const rawText = chart.options.plugins?.centerTextOption?.text || '';
    if (!rawText) return;

    ctx.save();

    const isDark = typeof document !== 'undefined'
      && document.documentElement.classList.contains('dark');
    const labelColor = isDark ? '#a1a1aa' : '#71717a';   // zinc-400 / zinc-500
    const valueColor = isDark ? '#fafafa' : '#0f172a';   // zinc-50 / slate-900
    const amountColor = isDark ? '#d4d4d8' : '#3f3f46';  // zinc-300 / zinc-700

    const fontStack = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Inter", sans-serif`;

    // Inner circle diameter ~ cutout × min(w,h); safe inscribed text width ≈ 0.72 of diameter
    const innerDiameter = Math.min(width, height) * 0.64;
    const maxWidth = innerDiameter * 0.78;

    // Parse the three logical tiers: label \n percentage \n amount(optional)
    const rawLines = rawText.split('\n');
    let labelLine = (rawLines[0] || '').trim();
    const valueLine = (rawLines[1] || '').trim();
    const amountLine = rawLines.slice(2).join(' ').trim();

    // Adaptive base sizes scaled to chart size, clamped
    const clamp = (n:any, lo:any, hi:any) => Math.max(lo, Math.min(hi, n));
    let labelSize  = clamp(Math.round(innerDiameter * 0.085), 9,  13);
    let valueSize  = clamp(Math.round(innerDiameter * 0.18),  16, 28);
    let amountSize = clamp(Math.round(innerDiameter * 0.085), 9,  13);

    const setFont = (weight:any, size:any) => {
      ctx.font = `${weight} ${size}px ${fontStack}`;
    };

    // Truncate label with ellipsis until it fits at the smallest acceptable size
    const fitLabel = () => {
      setFont(600, labelSize);
      if (ctx.measureText(labelLine).width <= maxWidth) return;
      // First shrink font
      while (labelSize > 9 && ctx.measureText(labelLine).width > maxWidth) {
        labelSize -= 0.5;
        setFont(600, labelSize);
      }
      // Then truncate if still too wide
      if (ctx.measureText(labelLine).width > maxWidth && labelLine.length > 3) {
        let lo = 1, hi = labelLine.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          const candidate = labelLine.slice(0, mid).trimEnd() + '…';
          if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
          else hi = mid - 1;
        }
        labelLine = labelLine.slice(0, lo).trimEnd() + '…';
      }
    };

    const fitAmount = () => {
      setFont(500, amountSize);
      while (amountSize > 9 && ctx.measureText(amountLine).width > maxWidth) {
        amountSize -= 0.5;
        setFont(500, amountSize);
      }
    };

    if (labelLine) fitLabel();
    if (amountLine) fitAmount();

    // Vertical layout
    const gapAfterLabel = labelLine ? Math.round(valueSize * 0.18) : 0;
    const gapAfterValue = amountLine ? Math.round(amountSize * 0.45) : 0;
    const totalHeight =
      (labelLine ? labelSize : 0) + gapAfterLabel +
      (valueLine ? valueSize : 0) + gapAfterValue +
      (amountLine ? amountSize : 0);

    const centerX = width / 2;
    let cursor = (height - totalHeight) / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (labelLine) {
      setFont(600, labelSize);
      ctx.fillStyle = labelColor;
      ctx.fillText(labelLine, centerX, cursor + labelSize / 2);
      cursor += labelSize + gapAfterLabel;
    }
    if (valueLine) {
      setFont(700, valueSize);
      ctx.fillStyle = valueColor;
      ctx.fillText(valueLine, centerX, cursor + valueSize / 2);
      cursor += valueSize + gapAfterValue;
    }
    if (amountLine) {
      setFont(500, amountSize);
      ctx.fillStyle = amountColor;
      ctx.fillText(amountLine, centerX, cursor + amountSize / 2);
    }

    ctx.restore();
  }
}

ChartJS.register(Title, Tooltip, Legend, ArcElement, centerTextPlugin)

const { t } = useI18n();
const { toast } = useToast();
document.title = t('home');
const listData = ref<any[]>([]);
const customColors = [
  '#3B5B84',
  '#A03F78', 
  '#98BD4A', 
  '#CA9B4F', 

  '#294D7B', 
  '#952968', 
  '#86AF30', 
  '#BB8733', 

  '#1D406D', 
  '#841A58', 
  '#749C1F', 
  '#A77321', 

  '#113461', 
  '#760C4A', 
  '#638B0E', 
  '#94610E', 

  '#072954',
  '#66003C',
  '#517800',
  '#804F00'
];

// Defensive normalizer for the "Cash" pseudo-position. Broker scrapers
// have historically emitted variants like "Cash", "cash", or "Cash "
// (trailing space); a strict === "Cash" check would silently misclassify
// those rows. Trim + lower-case before comparing.
function isCash(name: any): boolean {
  if (typeof name !== 'string') return false;
  const clean = name.trim().toLowerCase();
  // Also a per-account slice label from the separate view, so it still sorts last and paints red.
  return clean === 'cash' || clean.startsWith('cash · ');
}

// Suffix the account only on names held in several accounts; everything else stays clean.
function accountSuffixer(rows: any, nameOf: any) {
  const accountsByName = new Map();
  for (const row of rows || []) {
    const name = nameOf(row);
    if (!name) continue;
    if (!accountsByName.has(name)) accountsByName.set(name, new Set());
    accountsByName.get(name).add(accountKeyOf(row));
  }
  return (row: any) => {
    const name = nameOf(row);
    return accountsByName.get(name)?.size > 1
      ? `${name} · ${accountLabel(row.broker, row.account_id)}` : name;
  };
}

// Cash is one row per account; net them before splitting into Cash vs Loan Capital,
// otherwise two depots draw two contradictory slices.
function netCashOf(rows: any): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum: number, item: any) =>
    isCash(item?.stock_name) ? sum + (Number(item?.total_entry_value) || 0) : sum, 0);
}

function computeTopSliceText(cd: any): string {
  const datasets = cd?.datasets;
  if (!datasets || datasets.length === 0) return '';
  const ds = datasets[datasets.length - 1];
  const data = (ds?.data as number[]) || [];
  const labels = (cd?.labels as string[]) || [];
  if (data.length === 0) return '';
  const total = data.reduce((a, b) => a + b, 0);
  if (total === 0) return '';

  let bestIdx = -1;
  let bestVal = -1;
  for (let i = 0; i < data.length; i++) {
    if (isCash(labels[i])) continue;
    if (data[i]! > bestVal) { bestVal = data[i]!; bestIdx = i; }
  }
  if (bestIdx === -1) {
    for (let i = 0; i < data.length; i++) {
      if (data[i]! > bestVal) { bestVal = data[i]!; bestIdx = i; }
    }
  }
  if (bestIdx === -1) return '';
  const pct = (bestVal / total) * 100;

  const rawLabel = labels[bestIdx] || '';
  const looksLikeI18nKey = /^[a-z][a-zA-Z0-9_]*$/.test(rawLabel);
  const displayLabel = looksLikeI18nKey ? t(rawLabel) : rawLabel;
  const truncated = displayLabel.length > 14
    ? displayLabel.slice(0, 13).trim() + '…'
    : displayLabel;

  return `${truncated}\n${numberToGerman(pct, false, 2)}%`;
}

/* asset chart start */
const centerText = ref('')
const chartData = ref<any>({
  labels: [],
  datasets: [
    {
      label: t('positions'),
      data: [],
      backgroundColor: [],
      borderWidth: 0,
    }
  ]
});

const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '64%',
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
    centerTextOption: {
      text: centerText.value,
    }
  },
  onHover(event:any, elements:any, chart:any) {
   const el = elements?.[0];
    if (el) {
      const datasetIndex = el.datasetIndex;
      const dataset = chart.data.datasets?.[datasetIndex];
      
      const total = (dataset?.data as number[]).reduce((acc, val) => acc + val, 0);
      const value = (dataset?.data as number[])[el.index]!;
      const percentage = total ? (value / total) * 100 : 0;
      let label = '';

      if (loanCapital.value==0){
        label = chart.data.labels?.[el.index] ?? '';
      }else{
        if (datasetIndex === 0) {
          label = el.index === 0 ? t('own_capital') : t('loan_capital');
        } else if (datasetIndex === 1) {
          label = chart.data.labels?.[el.index] ?? '';
        }
      }
      
      centerText.value = `${label}\n${numberToGerman(percentage, false, 2)}%\n€ ${numberToGerman(value)}`;
    } else {
      console.log("chartOptions onHover else");
      centerText.value = computeTopSliceText(chartData.value);
    }

    //update chart plugin text
  }
});

const chartRef = ref<any>(null);

const loanCapital = ref(0);
const totalAmount = ref(0);
const changeYesterday = ref(0);
const changeYesterdayPercentage = ref(0);
const changeYesterdayKnown = ref(false);

const updateChartData = async () => {
  console.log("updateChartData =====");

  // Reset chart data structure AND day-change state so stale values from
  // a previous run can't linger when there's no history this time around
  chartData.value = {
    labels: [],
    datasets: []
  };
  changeYesterday.value = 0;
  changeYesterdayPercentage.value = 0;
  changeYesterdayKnown.value = false;

  const positionMap = new Map<string, number>();
  console.log("updateChartData listData", listData.value);

  // Build position data and calculate loan capital
  const netCash = netCashOf(listData.value);
  loanCapital.value = netCash < 0 ? Math.abs(netCash) : 0;
  console.log("updateChartData loanCapital", loanCapital.value, netCash);
  
  // Separate view gives a product held in two accounts one slice per account.
  const separate = !accountViewCombined.value;
  const sliceName = separate
    ? accountSuffixer(listData.value.filter((i: any) => !isCash(i.stock_name)), (i: any) => i.stock_name)
    : (i: any) => i.stock_name;

  for (const item of listData.value) {
    const name = item.stock_name;
    const value = isCash(item.stock_name)
      ? item.total_entry_value
      : (item.bid * item.stocks_owned) || 0;

    if (!name || isNaN(value)) continue;

    // Cash is netted once above; per-account rows must not reach the slice map
    if (isCash(name)) continue;

    const slice = sliceName(item);
    positionMap.set(slice, (positionMap.get(slice) || 0) + value);
  }

  // Per-account Cash only when no balance is negative: a Wertpapierkredit must net against
  // the others, because Loan Capital feeds the outer ring every donut shares.
  const cashRows: any[] = listData.value.filter((i: any) => isCash(i.stock_name));
  const splitCash = separate && cashRows.length > 1
    && cashRows.every((i: any) => (Number(i.total_entry_value) || 0) >= 0);
  if (splitCash) {
    for (const row of cashRows) {
      const balance = Number(row.total_entry_value) || 0;
      if (balance > 0) positionMap.set(`Cash · ${accountLabel(row.broker, row.account_id)}`, balance);
    }
  } else if (netCash > 0) {
    positionMap.set('Cash', netCash);
  }

  // Sort positions: Cash always last, others by value descending
  const sorted = Array.from(positionMap.entries())
    .map(([name, y]) => ({ name, y }))
    .sort((a, b) => {
      if (isCash(a.name)) return 1;
      if (isCash(b.name)) return -1;
      return b.y - a.y;
    });

  // Calculate total position value. Must happen BEFORE the empty-data return below:
  // filtering to an account with no rows used to leave the previous account's total
  // on screen next to "0 positions".
  const total = listData.value.reduce((sum, item) => {
    const value = isCash(item.stock_name) 
      ? item.total_entry_value 
      : (item.bid * item.stocks_owned) || 0;
    return sum + value;
  }, 0);
  
  totalAmount.value = total;
  console.log("updateChartData totalAmount", totalAmount.value);

  if (sorted.length === 0) {
    console.log('updateChartData: No valid chart data after processing');
    return;
  }

  // Calculate changes vs yesterday
  const dailyTotals:any = await storage.getItem('local:DAILY_TOTAL') || [];
  dailyTotals.sort((a:any, b:any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Filtered views sum the selected accounts' slices; days saved before the per-account split are skipped.
  const scopedTotals = accountViewIsAll()
    ? dailyTotals
    : dailyTotals
      .filter((entry: any) => entry.accounts && accountViewSelected.value.some((key: any) => key in entry.accounts))
      .map((entry: any) => ({
        date: entry.date,
        total: accountViewSelected.value.reduce((sum: any, key: any) => sum + (entry.accounts[key] || 0), 0),
      }));
  // Last day before today, not [length - 2]: today may not be saved yet, which would compare against two days ago.
  const todayStr = todayIso();
  const yesterdayEntry = scopedTotals.filter((entry: any) => entry.date < todayStr).pop();

  if (yesterdayEntry) {
    const yesterdayTotal = yesterdayEntry.total;
    changeYesterday.value = totalAmount.value - yesterdayTotal;
    changeYesterdayPercentage.value = yesterdayTotal
      ? (changeYesterday.value / yesterdayTotal) * 100
      : 0;
    changeYesterdayKnown.value = true;
  }
  
  // Get capital values
  const own = totalAmount.value ?? 0;
  const loan = loanCapital.value ?? 0;
  
  console.log("updateChartData loanCapital final", loanCapital.value);

  // Build chart data based on loan presence
  if (loanCapital.value === 0) {
    // Single ring - just positions
    chartData.value.labels = sorted.map(i => i.name);
    chartData.value.datasets = [
      {
        label: t('positions'),
        data: sorted.map(i => i.y),
        backgroundColor: sorted.map((item, idx) => 
          isCash(item.name) ? '#fe4d4d' : customColors[idx % customColors.length]
        ),
        borderWidth: 0
      }
    ];
  } else {
    // Double ring - capital structure (outer) + positions (inner)
    chartData.value.labels = sorted.map(i => i.name);
    chartData.value.datasets = [
      {
        label: 'Capital Structure',
        data: [own, loan],
        backgroundColor: ['#4caf50', '#f44336'],
        borderWidth: 0
      },
      {
        label: t('positions'),
        data: sorted.map(i => i.y),
        backgroundColor: sorted.map((item, idx) =>
          isCash(item.name) ? '#fe4d4d' : customColors[idx % customColors.length]
        ),
        borderWidth: 0
      }
    ];
  }
  
  centerText.value = computeTopSliceText(chartData.value);
};

watch(centerText, (newValue) => {
  console.log("watch centerText",newValue);
  chartOptions.value.plugins.centerTextOption.text = newValue;
  if (chartRef.value?.chart) {
    chartRef.value.chart.update();
  }
});


/* breakdown charts (type, issuer, currency, valuation date) */

// One doughnut splitting portfolio value by a key; with a loan it adds an own-vs-loan outer ring.
function createBreakdownChart({
  name,                       // used in log lines only
  datasetLabel,               // internal Chart.js dataset label
  initialLabel = datasetLabel,
  keyOf,                      // (row) => bucket key, falsy to skip the row
  compare = (a:any, b:any) => b.y - a.y, // order of non-cash slices; default biggest first
  lastLabel = () => null,     // a bucket that always goes last, before Cash (e.g. "No date")
  translateHoverLabel = false, // type keys are i18n keys, the others are shown as-is
  refreshAfterUpdate = false, // the type chart needs an explicit redraw after new data
}: any) {
  const centerText = ref('');
  const chartRef = ref<any>(null);
  const chartData = ref<any>({
    labels: [],
    datasets: [{ label: initialLabel, data: [], backgroundColor: [], borderWidth: 0 }],
  });

  const sliceColors = (sorted:any) => sorted.map((item:any, idx:number) =>
    isCash(item.label) ? '#fe4d4d' : customColors[idx % customColors.length]);

  const update = () => {
    console.log(`update${name}ChartData =====`);
    chartData.value = { labels: [], datasets: [] };

    const netCash = netCashOf(listData.value);
    const buckets = new Map<string, number>();
    for (const item of listData.value as any[]) {
      const value = (item.bid * item.stocks_owned) || 0;
      // Cash is netted once above; per-account rows must not reach the bucket map
      if (isCash(item.stock_name)) continue;
      const key = keyOf(item);
      if (!key || isNaN(value)) continue;
      buckets.set(key, (buckets.get(key) || 0) + value);
    }
    if (netCash > 0) buckets.set('Cash', (buckets.get('Cash') || 0) + netCash);

    const last = lastLabel();
    // Cash always last, then the optional "last" bucket, the rest by `compare`
    const sorted = Array.from(buckets.entries())
      .map(([label, y]) => ({ label, y }))
      .sort((a, b) => {
        if (isCash(a.label)) return 1;
        if (isCash(b.label)) return -1;
        if (last && a.label === last) return 1;
        if (last && b.label === last) return -1;
        return compare(a, b);
      });

    if (sorted.length === 0) {
      console.log(`update${name}ChartData: no data after processing`);
      return;
    }

    const positionsRing = {
      label: datasetLabel,
      data: sorted.map(i => i.y),
      backgroundColor: sliceColors(sorted),
      borderWidth: 0,
    };
    chartData.value.labels = sorted.map(i => i.label);
    chartData.value.datasets = loanCapital.value === 0
      ? [positionsRing]
      : [
          {
            label: 'Capital Structure',
            data: [totalAmount.value ?? 0, loanCapital.value ?? 0],
            backgroundColor: ['#4caf50', '#f44336'],
            borderWidth: 0,
          },
          positionsRing,
        ];

    centerText.value = computeTopSliceText(chartData.value);

    if (refreshAfterUpdate) {
      nextTick(() => chartRef.value?.chart?.update());
    }
  };

  const sliceLabel = (chart:any, index:number) => {
    const label = chart.data.labels?.[index] ?? '';
    return translateHoverLabel ? t(label) : label;
  };

  const chartOptions = ref({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      centerTextOption: { text: centerText.value },
    },
    // Hovering a slice shows its name, share and value in the middle of the ring.
    onHover(event:any, elements:any, chart:any) {
      const el = elements?.[0];
      if (!el) {
        centerText.value = computeTopSliceText(chartData.value);
        return;
      }
      const dataset = chart.data.datasets?.[el.datasetIndex];
      const total = (dataset?.data as number[]).reduce((acc, val) => acc + val, 0);
      const value = (dataset?.data as number[])[el.index]!;
      const percentage = total ? (value / total) * 100 : 0;

      let label = '';
      if (loanCapital.value == 0) {
        label = sliceLabel(chart, el.index);
      } else if (el.datasetIndex === 0) {
        label = el.index === 0 ? t('own_capital') : t('loan_capital');
      } else if (el.datasetIndex === 1) {
        label = sliceLabel(chart, el.index);
      }
      centerText.value = `${label}\n${numberToGerman(percentage, false, 2)}%\n€ ${numberToGerman(value)}`;
    },
  });

  watch(centerText, (newValue) => {
    chartOptions.value.plugins.centerTextOption.text = newValue;
    chartRef.value?.chart?.update();
  });

  return { chartData, chartOptions, centerText, chartRef, update };
}

const {
  chartData: typeChartData, chartOptions: typeChartOptions, chartRef: typeChartRef, update: updateTypeChartData,
} = createBreakdownChart({
  name: 'Type',
  datasetLabel: 'Positions',
  initialLabel: t('positions'),
  keyOf: (item:any) => item.type,
  translateHoverLabel: true,
  refreshAfterUpdate: true,
});


/* country chart start */
const countryCenterText = ref('');
const countryChartData = ref<any>({
  labels: [],
  datasets: [
    {
      label: 'Country Distribution',
      data: [],
      backgroundColor: [],
      borderWidth: 0,
    }
  ]
});

const countryChartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '64%',
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
    centerTextOption: {
      text: countryCenterText.value,
    }
  },
  onHover(event:any, elements:any, chart:any) {
    const el = elements?.[0];
    if (el) {
      const datasetIndex = el.datasetIndex;
      const dataset = chart.data.datasets?.[datasetIndex];
      const total = (dataset?.data as number[]).reduce((acc, val) => acc + val, 0);
      const value = (dataset?.data as number[])[el.index]!;
      const percentage = total ? (value / total) * 100 : 0;

      let label = '';
      if (loanCapital.value==0){
        label = chart.data.labels?.[el.index] ?? '';
      }else{
        if (datasetIndex === 0) {
          label = el.index === 0 ? t('own_capital') : t('loan_capital');
        } else if (datasetIndex === 1) {
          label = chart.data.labels?.[el.index] ?? '';
        }
      }

      countryCenterText.value = `${label}\n${numberToGerman(percentage, false, 2)}%\n€ ${numberToGerman(value)}`;
    } else {
      countryCenterText.value = computeTopSliceText(countryChartData.value);
    }

    //update chart plugin text
  }
});

const countryChartRef = ref<any>(null);
const updateCountryChartData = () => {
  console.log("updateCountryChartData =====");
  
  // Reset chart data structure
  countryChartData.value = {
    labels: [],
    datasets: []
  };

  const netCash = netCashOf(listData.value);
  const countryMap = new Map<string, number>();
  
  // Build country distribution data
  for (const item of listData.value) {
    const isin = item.underlying_isin || item.isin || 'Unknown';
    if (!isin || isin.length < 2) continue;

    let countryCode = isin.substring(0, 2).toUpperCase();
    let value = (item.bid * item.stocks_owned) || 0;
    
    // Cash is netted once above; per-account rows must not reach the bucket map
    if (isCash(item.stock_name)) continue;

    if (!countryCode || isNaN(value)) continue;
    countryMap.set(countryCode, (countryMap.get(countryCode) || 0) + value);
  }

  if (netCash > 0) countryMap.set('Cash', (countryMap.get('Cash') || 0) + netCash);
    
  // Sort countries: Cash always last, others by value descending
  const sorted = Array.from(countryMap.entries())
    .map(([country, y]) => ({ country, y }))
    .sort((a, b) => {
      if (isCash(a.country)) return 1;
      if (isCash(b.country)) return -1;
      return b.y - a.y;
    });

  if (sorted.length === 0) {
    console.log('updateCountryChartData: No valid country chart data after processing');
    return;
  }

  // Get capital values
  const own = totalAmount.value ?? 0;
  const loan = loanCapital.value ?? 0;
  
  console.log("updateCountryChartData loanCapital", loanCapital.value);
  console.log("updateCountryChartData sorted", sorted);

  // Build chart data based on loan presence
  if (loanCapital.value === 0) {
    // Single ring - just country distribution
    console.log("updateCountryChartData loanCapital === 0");
    countryChartData.value.labels = sorted.map(i => i.country);
    countryChartData.value.datasets = [
      {
        label: 'Country Distribution',
        data: sorted.map(i => i.y),
        backgroundColor: sorted.map((item, idx) => 
          isCash(item.country) ? '#fe4d4d' : customColors[idx % customColors.length]
        ),
        borderWidth: 0
      }
    ];
  } else {
    // Double ring - capital structure (outer) + country distribution (inner)
    console.log("updateCountryChartData loanCapital !== 0");
    countryChartData.value.labels = sorted.map(i => i.country);
    countryChartData.value.datasets = [
      {
        label: 'Capital Structure',
        data: [own, loan],
        backgroundColor: ['#4caf50', '#f44336'],
        borderWidth: 0
      },
      {
        label: 'Country Distribution',
        data: sorted.map(i => i.y),
        backgroundColor: sorted.map((item, idx) =>
          isCash(item.country) ? '#fe4d4d' : customColors[idx % customColors.length]
        ),
        borderWidth: 0
      }
    ];
  }
  
  console.log("updateCountryChartData countryChartData final", countryChartData.value);

  // Update center text
  countryCenterText.value = computeTopSliceText(countryChartData.value);
};

watch(countryCenterText, (newValue) => {
  countryChartOptions.value.plugins.centerTextOption.text = newValue;
  if (countryChartRef.value?.chart) {
    countryChartRef.value.chart.update();
  }
});
/* country chart end */


const {
  chartData: issuerChartData, chartOptions: issuerChartOptions, chartRef: issuerChartRef, update: updateIssuerChartData,
} = createBreakdownChart({
  name: 'Issuer',
  datasetLabel: 'Issuer Distribution',
  keyOf: (item:any) => item.issuer || 'Unknown',
});

const {
  chartData: currencyChartData, chartOptions: currencyChartOptions, chartRef: currencyChartRef, update: updateCurrencyChartData,
} = createBreakdownChart({
  name: 'Currency',
  datasetLabel: 'Currency Distribution',
  keyOf: (item:any) => item.currency || 'Unknown',
});

// Valuation dates read "MM/YYYY" and sort chronologically; positions without one go last.
const {
  chartData: valuationDateChartData, chartOptions: valuationDateChartOptions, chartRef: valuationDateChartRef, update: updateValuationDateChartData,
} = createBreakdownChart({
  name: 'ValuationDate',
  datasetLabel: 'Valuation Date Distribution',
  keyOf: (item:any) => formatMonthYear(item.valuation_date) || t('no_date') || 'No date',
  lastLabel: () => t('no_date') || 'No date',
  compare: (a:any, b:any) => {
    const [am, ay] = a.label.split('/').map(Number);
    const [bm, by] = b.label.split('/').map(Number);
    return (ay - by) || (am - bm);
  },
});


const allGainers = ref<any[]>([]);
const allLosers = ref<any[]>([]);
const remainingList = ref<any[]>([]);

const gainers = ref<any[]>([]);
const losers = ref<any[]>([]);

async function getTopGainersAndLosers() {
  const history:any = (await storage.getItem('local:portfolio_history')) || [];
  console.log("getTopGainersAndLosers history", history);

  // MAIN_LIST carries the feed's last_value_yesterday, so one price request is enough for a move.
  const records: any = (await storage.getItem('local:MAIN_LIST')) || [];
  const todayRows = records.filter((item: any) => !isCash(item.stock_name)).map((item: any) => ({
    name: item.stock_name,
    isin: item.isin,
    broker: item.broker,
    account_id: item.account_id,
    deposite_number: item.deposite_number,
    stocks_owned: Number(item.stocks_owned) || 0,
    total_value: Number(item.total_value) || 0,
    bid: Number(item.bid) || 0,
    last_value_yesterday: Number(item.last_value_yesterday) || 0,
  }));
  const hasYesterdayClose = todayRows.some((item: any) => item.last_value_yesterday > 0);

  if (!todayRows.length || (history.length < 2 && !hasYesterdayClose)) {
    // Cleared, not skipped: a filter switch would otherwise keep the previous account's movers.
    allGainers.value = [];
    allLosers.value = [];
    remainingList.value = [];
    gainers.value = [];
    losers.value = [];
    return { gainers: [], losers: [] };
  }

  // Previous saved day: the fallback for rows the feed sent no last_value_yesterday for.
  const yesterdayEntry = history.length >= 2 ? history[history.length - 2] : null;

  // Per-account rows, merged same-broker when combined: the switch decides, not the filter.
  const pickRows = (rows: any) => {
    const kept = accountViewFilter(rows);
    return accountViewCombined.value ? accountCombineRows(kept) : kept;
  };

  const todayData = pickRows(todayRows);
  // Merged yesterday is still exact per account: unit price is the same in every account.
  const yesterdayScoped = !!yesterdayEntry?.accounts;
  const yesterdayData = !yesterdayEntry ? [] : yesterdayScoped ? pickRows(yesterdayEntry.accounts) : yesterdayEntry.data;
  // Separate view names the account on products held in several, or the rows read as duplicates.
  const displayName = !accountViewCombined.value
    ? accountSuffixer(todayData, (i: any) => i.name)
    : (i: any) => i.name;

  // Rows are per account, so the same ISIN appears twice and needs the account in its key.
  // Combined keys on broker|isin both days: a product held in one account yesterday and two
  // today is merged only today, and an account-bearing key would never find its partner.
  const rowKeyOf = (item:any) => accountViewCombined.value ? `${item.broker}|${item.isin}` : accountRowKey(item);
  // A merged yesterday has no broker or account, so today's rows must look it up by ISIN.
  const lookupKeyOf = (item:any) => yesterdayScoped ? rowKeyOf(item) : item.isin;

  const yesterdayMap = new Map<any, any>(
    yesterdayData.map((item: { isin: string; total_value: number; stocks_owned: number }) => [
      lookupKeyOf(item),
      { value: item.total_value, qty: item?.stocks_owned || 0 }
    ])
  );

  const changes = todayData.map(
    (item: any) => {
      const todayQty = item?.stocks_owned || 0;
      if (todayQty === 0) return null;
      let todayPrice = item.total_value / todayQty;

      let yesterdayPrice = 0;
      let overlapQty = todayQty;
      if (item.last_value_yesterday > 0 && item.bid > 0) {
        // bid, not total_value: total_value lags until the next calculation pass after a price request.
        todayPrice = item.bid;
        yesterdayPrice = item.last_value_yesterday;
      } else {
        const yesterdayItem = yesterdayMap.get(lookupKeyOf(item));
        if (!yesterdayItem || yesterdayItem.qty === 0) return null;
        yesterdayPrice = yesterdayItem.value / yesterdayItem.qty;
        // Units bought or sold since the snapshot are not a price move.
        overlapQty = Math.min(todayQty, yesterdayItem.qty);
      }

      const priceChange = todayPrice - yesterdayPrice;
      const change = priceChange * overlapQty;
      const changePercent = yesterdayPrice > 0 ? (priceChange / yesterdayPrice) * 100 : 0;

      return {
        name: displayName(item),
        isin: item.isin,
        broker: item.broker,
        account_id: item.account_id,
        // rowKeyOf appends the depot for Consors, so remainingList needs it to match.
        deposite_number: item.deposite_number,
        currentValue: item.total_value,
        previousValue: yesterdayPrice * overlapQty,
        currentPrice: todayPrice,
        previousPrice: yesterdayPrice,
        change,
        changePercent
      };
    }
  ).filter(Boolean);
  console.log("getTopGainersAndLosers all changes", changes);

  // Under half a cent prints as 0,00, so float noise must not count as a move.
  const positiveChanges = changes
    .filter((item:any) => item.change >= 0.005)
    .sort((a:any, b:any) => b.change - a.change);
  const negativeChanges = changes
    .filter((item:any) => item.change <= -0.005)
    .sort((a:any, b:any) => a.change - b.change);

  
  allGainers.value = positiveChanges;
  allLosers.value = negativeChanges;
  const topGainers = positiveChanges.slice(0, 5);
  const topLosers = negativeChanges.slice(0, 5);
  
  remainingList.value = todayData.filter((item: { isin: string }) => {
    const key = rowKeyOf(item);
    return !positiveChanges.some((g:any) => rowKeyOf(g) === key) && !negativeChanges.some((l:any) => rowKeyOf(l) === key);
  });

  console.log("getTopGainersAndLosers todayData", todayData);
  console.log("getTopGainersAndLosers changes", changes);
  console.log("getTopGainersAndLosers remainingList", remainingList.value);
  console.log("getTopGainersAndLosers positiveChanges", positiveChanges);
  console.log("getTopGainersAndLosers negativeChanges", negativeChanges);

  // Rest Gainers Calculation
  const restGainers = positiveChanges.slice(5);
  const restGainersPrevious = restGainers.reduce((sum:any, item:any) => sum + item.previousValue, 0);
  const restGainersCurrent = restGainers.reduce((sum:any, item:any) => sum + item.currentValue, 0);
  const restGainersChange = restGainersCurrent - restGainersPrevious;
  const restGainersPercent = restGainersPrevious > 0 ? (restGainersChange / restGainersPrevious) * 100 : 0;

  // Total Gainers Calculation
  const totalGainersPrevious = positiveChanges.reduce((sum:any, item:any) => sum + item.previousValue, 0);
  const totalGainersCurrent = positiveChanges.reduce((sum:any, item:any) => sum + item.currentValue, 0);
  const totalGainersChange = totalGainersCurrent - totalGainersPrevious;
  const totalGainersPercent = totalGainersPrevious > 0 ? (totalGainersChange / totalGainersPrevious) * 100 : 0;

  // Rest Losers Calculation
  const restLosers = negativeChanges.slice(5);
  const restLosersPrevious = restLosers.reduce((sum:any, item:any) => sum + item.previousValue, 0);
  const restLosersCurrent = restLosers.reduce((sum:any, item:any) => sum + item.currentValue, 0);
  const restLosersChange = restLosersCurrent - restLosersPrevious;
  const restLosersPercent = restLosersPrevious > 0 ? (restLosersChange / restLosersPrevious) * 100 : 0;

  // Total Losers Calculation
  const totalLosersPrevious = negativeChanges.reduce((sum:any, item:any) => sum + item.previousValue, 0);
  const totalLosersCurrent = negativeChanges.reduce((sum:any, item:any) => sum + item.currentValue, 0);
  const totalLosersChange = totalLosersCurrent - totalLosersPrevious;
  const totalLosersPercent = totalLosersPrevious > 0 ? (totalLosersChange / totalLosersPrevious) * 100 : 0;

  // Final structure for gainers
  gainers.value = [
    ...topGainers,
    {
      name: t("rest"),
      change: restGainersChange,
      changePercent: restGainersPercent,
      previousValue: restGainersPrevious,
      currentValue: restGainersCurrent,
      isTotal:true
    },
    {
      name: t("total"),
      change: totalGainersChange,
      changePercent: totalGainersPercent,
      previousValue: totalGainersPrevious,
      currentValue: totalGainersCurrent,
      isTotal:true
    }
  ];

  // Final structure for losers
  losers.value = [
    ...topLosers,
    {
      name: t("rest"),
      change: restLosersChange,
      changePercent: restLosersPercent,
      previousValue: restLosersPrevious,
      currentValue: restLosersCurrent,
      isTotal:true
    },
    {
      name: t("total"),
      change: totalLosersChange,
      changePercent: totalLosersPercent,
      previousValue: totalLosersPrevious,
      currentValue: totalLosersCurrent,
      isTotal:true
    }
  ];

}


const formattedISINLink = (isin:any) =>{
  return isinLink.value.replace('$ISIN', isin);
}


const allRecords = ref<any[]>([]);

const updateBroker = async() =>{
  console.log("updateBroker accountViewSelected",accountViewSelected.value);

  // Keep existing data visible during reload so the filter row, hero strip,
  // and donut cards don't collapse and cause the page to jump. initialLoad()
  // will replace listData in place when the fresh data arrives.

  await initialLoad();
  updateAllChartsData();
  await loadCountryChart();
}

const totalPosition = ref(0)
const numberOfBrokers = ref(0)
const isLoadingAssetChart = ref(true);
// donut refs always hold one dataset, so an empty card is only detectable via data.length
const hasChartData = (data:any) => !!data?.datasets?.length && data.datasets[0].data.length > 0;
const isinLink = ref('');
const listUpdatedAt = ref<any>('');
let priceInterval:any =null;

const initialLoad = async ()=>{
  let records:any = await storage.getItem('local:MAIN_LIST') || [];
  console.log("initialLoad records",records);
  await getTopGainersAndLosers();
  
  if(records.length){
    listUpdatedAt.value = await storage.getItem('local:list_updated_at');
    allRecords.value = records;
    listData.value = records;

    // The one filter point: every tile, donut and the geography map read listData.
    listData.value = accountViewFilter(listData.value) as any;

    // Count after filter so "Number of Brokers" matches the filter context
    // (1 when a specific broker is selected, total when "All")
    numberOfBrokers.value = new Set(listData.value.map(item => item.broker)).size;
    
    console.log("initialLoad accountViewSelected",accountViewSelected.value);
    console.log("initialLoad listData",listData.value);
    // Distinct ISINs, not rows: one holding in two accounts is two rows but one position.
    totalPosition.value = new Set(
      listData.value.filter(item=> !isCash(item.stock_name)).map(item => item.isin)
    ).size;
    
    await updateChartData();
    updateTypeChartData();
    updateCountryChartData();
    updateIssuerChartData();
    updateCurrencyChartData();
    updateValuationDateChartData();
  }else{
    // Nothing stored at all: zero the tiles rather than leave the last values up.
    allRecords.value = [];
    listData.value = [];
    numberOfBrokers.value = 0;
    totalPosition.value = 0;
    totalAmount.value = 0;
  }
}

const updateAllChartsData = ()=>{
  console.log("updateAllChartsData =====");
  if (chartRef.value?.chart) {
    console.log("updateAllChartsData chartRef update");
    chartRef.value.chart.update();
  }
  
  if (typeChartRef.value?.chart) {
    console.log("updateAllChartsData typeChartRef update");
    typeChartRef.value.chart.update();
  }

  if (countryChartRef.value?.chart) {
    console.log("updateAllChartsData countryChartRef update");
    countryChartRef.value.chart.update();
  }
  
  if (issuerChartRef.value?.chart) {
    console.log("updateAllChartsData issuerChartRef update");
    issuerChartRef.value.chart.update();
  }

  if (currencyChartRef.value?.chart) {
    console.log("updateAllChartsData currencyChartRef update");
    currencyChartRef.value.chart.update();
  }

  if (valuationDateChartRef.value?.chart) {
    console.log("updateAllChartsData valuationDateChartRef update");
    valuationDateChartRef.value.chart.update();
  }
}

watch(accountsVersion, async () => {
  console.log("Home accountsVersion changed");
  await updateBroker();
});

const loadCount = ref(0);
const isPriceLoading = ref(false);
const reloadProductData = async() =>{
  isPriceLoading.value = true;

  try {
    await reloadPriceData();
    await initialLoad();
    updateAllChartsData();
    // The geography map is not a vue-chartjs component, so it needs its own refresh.
    await loadCountryChart();
  } catch (err) {
    // a throw here used to leave isPriceLoading stuck true, disabling Reload for good
    console.error('reloadProductData error:', err);
    toast({ title: t('reload_failed'), description: t('reload_failed_hint'), variant: 'destructive' });
  } finally {
    isPriceLoading.value = false;
  }


  loadCount.value++;
}


import countryCodes from '~/assets/countryCode.json';
import countriesData from '~/assets/countries.json';
const countryChart = ref<any>(null);
const worldChartData = shallowRef<any>(null);

const isDarkTheme = () => document.documentElement.classList.contains('dark');

const loadCountryChart = async () =>{
  const worldData = countriesData;
  const countries = (topojson.feature(worldData as any,worldData.objects.countries as any) as any).features;
  
  const countryMap = new Map<string, number>();
  for (const item of listData.value) {
    const isin = item.underlying_isin || item.isin || 'Unknown';
    if (!isin || isin.length < 2) continue;
    
    let countryCode = isin.substring(0, 2).toUpperCase();
    let value = (item.bid * item.stocks_owned) || 0;
    if (!countryCode || isNaN(value)) continue;

    if (!countryCode || isNaN(value)) continue;
    countryMap.set(countryCode, (countryMap.get(countryCode) || 0) + value);
  }

  let points:any[] = [];
  Array.from(countryMap.entries()).map(([countryCode, countryValue]) => {
    
    let countryData = countryCodes.find(c => c.alpha2 === countryCode);
    if(countryData){
      points.push({ 
        name: countryData.name, 
        value: countryValue, 
        lat: countryData.latitude, 
        lng: countryData.longitude 
      });
    }
  });
  
  const countriesPoints = points.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
    value: p.value,
    radius: p.value / 10,
    name: p.name,
  }));
  
  
  // If the chart already exists, just swap the bubble data and update —
  // avoids the destroy-and-recreate flicker on every reload/filter change.
  if (worldChartData.value) {
    worldChartData.value.data.datasets[1].data = countriesPoints || [];
    worldChartData.value.update();
    return;
  }

  // Left the page during the awaits above: the canvas is gone and a chart on null would leak.
  if (isLeaving || !countryChart.value) return;
  ChartJS.getChart(countryChart.value)?.destroy();
  worldChartData.value = new ChartJS(countryChart.value, {
    type: "bubbleMap",
    data: {
      datasets: [
        {
          // world outlines
          label: "World",
          outline: countries,
          showOutline: true,
          // white outlines vanished on the light card; pick contrast from the active theme
          backgroundColor: isDarkTheme() ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)",
          borderColor: isDarkTheme() ? "rgba(255,255,255,0.4)" : "rgba(15,23,42,0.25)",
          borderWidth: 1,
        },
        {
          // bubble dataset
          label: "Values",
          data: countriesPoints || [],
          backgroundColor: "rgba(0,180,255,0.6)",
          borderColor: "#00b4ff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context:any) {
              return `${context.raw.name}: ${numberToGerman(context.raw.value)}`;
            },
          },
        },
      },
      scales: {
        projection: {
          axis: "x",
          projection: "equirectangular",
        },
        size: {
          axis: "size",
          display: false,
        },
      },
    },
  } as any);

}

onMounted( async() => {
  await getLatestData();
  await getApiKey();

  await initialLoad();
  await loadCountryChart();
  isLoadingAssetChart.value = false;
  console.log("list konto",listData);

  const settings:any = await storage.getItem('local:settings');
  if(settings){
    isinLink.value = settings.isin_link;
  }

  if (isLeaving) return;
  // Outside the settings block, as in List: a fresh install never auto-refreshed, and no key only produced 401s.
  const priceUpdateDuration = Number(settings?.price_duration) > 0 ? Number(settings.price_duration) : 30;
  if(apiKey.value){
    priceInterval = setInterval(async()=>{
      console.log("settings reloadPriceData");
      if(isPriceLoading.value) return false;
      await reloadProductData();
    }, priceUpdateDuration * 60 * 1000);
  }

});

// onMounted awaits storage and the chart before the interval; leaving during that wait must not start it afterwards.
let isLeaving = false;

onBeforeUnmount(() => {
  isLeaving = true;
  abortPriceRequests();
});

onUnmounted(() => {
  clearInterval(priceInterval);
  worldChartData.value?.destroy();
  worldChartData.value = null;
});
</script>

<style scoped>

.price_cell { transition: color 0.5s ease, background-color 0.5s ease; }
.up {  background-color: #00915a; }
.down {  background-color: #e4200e; }

</style>
