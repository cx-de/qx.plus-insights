<template>
  <HoverCard v-if="peer_members" :openDelay="100" :closeDelay="200">
    <HoverCardTrigger as-child>
      <span class="cursor-pointer" @mouseenter="loadPeers">
        <span class="underline underline-offset-4 decoration-muted-foreground/50 hover:decoration-foreground">{{ peer_members.length>0 ? peer_members.filter(item => item !== wkn).join(',') : '' }}</span>
        <Badge v-if="activeSwitch" variant="success" :title="switchHint" class="ml-1 font-medium tabular-nums">
          → {{ activeSwitch.wkn }} +{{ numberToGerman(switchTotal, false, 2) }} €
        </Badge>
      </span>
    </HoverCardTrigger>
    
    <!-- max-h, not a fixed 250px: the old box cut the list after five rows. -->
    <HoverCardContent class="w-max max-w-[90vw] max-h-[70vh] overflow-y-auto p-4 text-sm">
      <Table>
      <TableHeader>
        <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <TableHead v-for="header in headerGroup.headers" :key="header.id" 
            class="h-auto px-0 bg-muted text-foreground">
            <FlexRender v-if="!header.isPlaceholder"
              :render="header.column.columnDef.header" 
              :props="header.getContext()" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="table.getRowModel().rows?.length">
          <template v-for="row in table.getRowModel().rows" :key="row.id">
            <TableRow :data-state="row.getIsSelected() && 'selected'"
              :class="{'font-bold bg-accent!': wkn === row.original.wkn,
                'font-bold bg-success/15!': activeSwitch?.wkn === row.original.wkn}"
              :title="activeSwitch?.wkn === row.original.wkn ? switchHint : undefined">
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
        </template>
        <TableRow v-else>
          <TableCell :colspan="columns.length" class="h-24 text-center">
            {{ $t('no_data_available') }}
          </TableCell>
        </TableRow>
      </TableBody>
      </Table>
      
    </HoverCardContent>
  </HoverCard>
</template>

<script setup lang="ts">

import { storage } from '#imports';
import { apiBaseUrl, apiKey, apiAuthFailed, isApiRateLimited, fetchFeed, isFeedBlocked, daysUntilMarketOpen, numberToGerman, formatRatio, formatTimestamp, chunkArray, deepCloneReactiveData, todayIso } from '~/utils/helper';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

import type { ColumnFiltersState, ExpandedState, SortingState } from '@tanstack/vue-table';

import {
  FlexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { sortableHeader } from '~/utils/table-utils';
import { getPeerPrices } from '~/utils/price-data-utils';

import { computed, h, ref } from 'vue'
import { useNow } from '@vueuse/core'
import { valueUpdater } from '~/lib/utils'
import { Badge } from '@/components/ui/badge'
import {useI18n} from "vue-i18n";

const { t } = useI18n();
const props = defineProps<{
  wkn: string,
  peer_members: string[],
  peer_switch?: { wkn: string, bid: number, ask: number, gainPerPiece: number, at?: string } | null,
  stocks_owned?: number | string,
}>()

// Off-hours the suggestion rests on close prices nobody can trade at; useNow hides it at 22:00 without a refresh.
const now = useNow({ interval: 60_000 });
const activeSwitch = computed(() => (props.peer_switch && !isFeedBlocked() && daysUntilMarketOpen(now.value) < 0 ? props.peer_switch : null));
// From the current quantity: a sync can change it between price intervals.
const switchTotal = computed(() => (activeSwitch.value?.gainPerPiece || 0) * (Number(props.stocks_owned) || 0));

const switchHint = computed(() => {
  const s = activeSwitch.value;
  if (!s) return '';
  return t('peer_switch_hint', {
    own: props.wkn,
    bid: numberToGerman(s.bid, false, 2),
    peer: s.wkn,
    ask: numberToGerman(s.ask, false, 2),
    gain: numberToGerman(s.gainPerPiece, false, 2),
    total: numberToGerman(switchTotal.value, false, 2),
    time: s.at ? new Date(s.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '-',
  });
});

const isLoading = ref(true);
const products = ref<any[]>([]);
const getPeersPriceData = async () => {
  if (isFeedBlocked()) { isLoading.value = false; return; }
  try {
      const data = await getPeerPrices(props.peer_members);
      if(data){
        const apiMap: Record<string, any> = Object.fromEntries(
          data.map((item: any) => [item.wkn, item])
        );
        products.value = props.peer_members.map((wkn: string) => ({
          wkn,
          ...(apiMap[wkn] ?? {})
        }));
      }
    } catch (err) {
      console.error('getPriceData Failed to fetch product data:', err);
    } finally {
      isLoading.value = false;
    }
};

// Sequential: the /price pass rebuilds the rows, so running it after /products dropped the ratio.
const loadPeers = async () => {
  // Each open starts at Brief ASC again: a header click from the last hover must not stick.
  sorting.value = [...DEFAULT_SORT];
  await getPeersPriceData();
  await getPeerProductData();
};

// Numeric, so "174" and "173,47" compare as prices; a peer without a quote sorts last.
const priceOrLast = (value:any) => { const n = Number.parseFloat(value); return Number.isFinite(n) && n > 0 ? n : Infinity; };
const priceSort = (a:any, b:any, id:string) => {
  const x = priceOrLast(a.getValue(id));
  const y = priceOrLast(b.getValue(id));
  return x === y ? 0 : x < y ? -1 : 1;
};

const getSortingHeader = (column:any, label:any) => sortableHeader(column, t(label), 'hover:bg-accent hover:text-accent-foreground');

const columns = [
  {
    accessorKey: 'wkn',
    header: ({ column }:any) => getSortingHeader(column, 'wkn'),
    cell: (info:any) => info.getValue(),
  },
  {
    accessorKey: 'bid',
    header: ({ column }:any) => getSortingHeader(column, 'bid'),
    cell: ({ row }:any) => {
      let formatted = "-";
      if(row.getValue('bid')){
        const amount = Number.parseFloat(row.getValue('bid'));
        formatted = new Intl.NumberFormat('de-DE').format(amount);
      }
      return h('div', { class: 'text-right font-medium' }, formatted)
    },
  },
  {
    accessorKey: 'ask',
    sortingFn: priceSort,
    sortUndefined: 'last' as const,
    header: ({ column }:any) => getSortingHeader(column, 'ask'),
    cell: ({ row }:any) => {
      let formatted = "-";
      if(row.getValue('ask')){
        const amount = Number.parseFloat(row.getValue('ask'));
        formatted = new Intl.NumberFormat('de-DE').format(amount);
      }
      return h('div', { class: 'text-right font-medium' }, formatted)
    },
  },
  {
    accessorKey: 'ratio',
    header: ({ column }:any) => getSortingHeader(column, 'ratio'),
    cell: ({ row }:any) => {
      const value = row.getValue('ratio');
      const formatted = (value == null || value === '') ? '-' : formatRatio(value);
      return h('div', { class: 'text-right font-medium' }, formatted)
    }
  },
  {
    accessorKey: 'timestamp',
    header: ({ column }:any) => getSortingHeader(column, 'timestamp'),
    cell: ({ row }:any) => {
      const formatted = formatTimestamp(row.getValue('timestamp')) || '-';
      return h('div', { class: 'text-right font-medium' }, formatted)
    },
  },
];

// Cheapest switch first; the header still re-sorts.
const DEFAULT_SORT: SortingState = [{ id: 'ask', desc: false }];
const sorting = ref<SortingState>([...DEFAULT_SORT])
const columnFilters = ref<ColumnFiltersState>([])

const rowSelection = ref({})
const expanded = ref<ExpandedState>({})

const table = useVueTable({
  get data() {
    return products.value
  },
  columns,
  // No pagination row model: its default page of 10 cut longer peer lists.
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
  onRowSelectionChange: updaterOrValue => valueUpdater(updaterOrValue, rowSelection),
  onExpandedChange: updaterOrValue => valueUpdater(updaterOrValue, expanded),
  state: {
    get sorting() { return sorting.value },
    get columnFilters() { return columnFilters.value },
    get rowSelection() { return rowSelection.value },
    get expanded() { return expanded.value },
  },
})

const peerProducts = ref<any[]>([]);
const getPeerProductData = async () => {
  peerProducts.value = await storage.getItem('local:PEER_PRODUCTS') || [];
  
  const today = todayIso();
  console.log("getPeerProductData peerProducts",peerProducts.value);
  
    // Normalize peer members to array
  const allPeerMembers = Array.isArray(props.peer_members)
    ? props.peer_members
    : (props.peer_members as any).split(',').map((w:any) => w.trim()).filter(Boolean);

  // Ensure peerProducts is an array
  const peer_products = Array.isArray(peerProducts.value) ? peerProducts.value : [];

  // Filter WKNs: fetch if not present or outdated
  const wknList = allPeerMembers.filter((wkn:any) => {
    const match = peer_products.find(p => p.wkn === wkn);
    return !match || match.lastUpdated !== today;
  });

  console.log("getPeerProductData wknList",wknList);
  const chunkSize = 10;
  const wknChunks = chunkArray(wknList, chunkSize);
  let allApiData:any[] = [];

  if (!apiKey.value || apiAuthFailed.value) return;

  try {
    for (const chunk of wknChunks) {
      const wknParam = chunk.join(',');
      const url = `${apiBaseUrl}products?wkn=${encodeURIComponent(wknParam)}`;
      const apiData = await fetchFeed(url);
      if (!apiData) { if (apiAuthFailed.value || isApiRateLimited()) break; continue; }

      if(apiData.status == 1 && apiData?.data?.length>0){
        allApiData = allApiData.concat(apiData.data);
      }
    }
    
    const apiMap: Record<string, any> = Object.fromEntries(
      allApiData.map(product => [product.wkn, { ...product, lastUpdated: today }])
    );
    
    console.log("getPeerProductData apiMap", apiMap);
    console.log("getPeerProductData apiMap Object", Object.values(apiMap));
    console.log("getPeerProductData peerProducts length", peerProducts.value.length);
    
    if(peerProducts.value.length === 0){
      peerProducts.value = Object.values(apiMap);
    }else{

      //merge
      peerProducts.value= [
        ...peerProducts.value,
        ...Object.values(apiMap).filter(apiItem => 
          !peerProducts.value.some(peerItem => peerItem.wkn === apiItem.wkn)
        )
      ];
      
      peerProducts.value = peerProducts.value.map(item => {
        const extraData = apiMap[item.wkn];
        if (extraData && Object.keys(extraData).length > 0) {
          return { ...item, ...extraData, lastUpdated: today };
        } else {
          return item;
        }
      });

    }

    console.log("getPeerProductData peerProducts update", peerProducts.value);
    
    // Every hover runs this now, so only write when the feed actually answered.
    if (allApiData.length) {
      const clonedData = deepCloneReactiveData(peerProducts.value);
      console.log("getPeerProductData clonedData",clonedData);
      await storage.setItem('local:PEER_PRODUCTS',clonedData);
    }
    
    //merge table products — iterate over the full peer list, not just rows already in products.value,
    //so peers missing from /price still appear (enriched from /products where possible).
    products.value = allPeerMembers.map((wkn:any) => {
      const existing = products.value.find(p => p.wkn === wkn) ?? { wkn };
      const productData = peerProducts.value.find(peerItem => peerItem.wkn === wkn);
      return productData ? { ...existing, ...productData } : existing;
    });

  } catch (err) {
    console.error('getPeerProductData failed to fetch product data:', err);
  }
};

onMounted(() => { 
});
</script>
