<template>
  <HoverCard v-if="peer_members" :openDelay="100" :closeDelay="closeDelayTime">
    <HoverCardTrigger as-child>
      <span class="cursor-pointer" @mouseenter="getPeersPriceData">
        <span class="underline">{{ peer_members.length>0 ? peer_members.filter(item => item !== wkn).join(',') : '' }}</span>
        <span v-if="activeSwitch" :title="switchHint"
          class="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-100 whitespace-nowrap">
          → {{ activeSwitch.wkn }} +{{ numberToGerman(switchTotal, false, 2) }} €
        </span>
      </span>
    </HoverCardTrigger>
    
    <HoverCardContent class="w-max max-w-[90vw] h-[250px] overflow-y-auto p-4
      border shadow-lg rounded-md 
      bg-white/90 dark:bg-gray-900/90 text-sm 
      text-gray-900 dark:text-gray-100">
      
      <div class="space-between flex items-center">
        <div class="ml-auto mr-4">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button @click="getPeerProductData" variant="outline" class="ml-auto">
                <CirclePlus class="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                v-for="column in table.getAllColumns().filter((column) => column.getCanHide())"
                :key="column.id"
                class="capitalize"
                :model-value="column.getIsVisible()"
                @click="columnToggle"
                @update:model-value="(value) => {
                  column.toggleVisibility(!!value)
                }">
                {{ column.id }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <Table class="mt-2">
      <TableHeader>
        <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <TableHead v-for="header in headerGroup.headers" :key="header.id" 
            class="h-auto px-0 bg-gray-600 text-white">
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
              :class="{'font-bold bg-gray-400!': wkn === row.original.wkn,
                'font-bold bg-green-200! dark:bg-green-900!': activeSwitch?.wkn === row.original.wkn}"
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
import { apiBaseUrl, apiKey, apiAuthFailed, isApiRateLimited, fetchFeed, isMarketClosed, numberToGerman, formatTimestamp, chunkArray, deepCloneReactiveData, todayIso } from '~/utils/helper';

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
  getPaginationRowModel,
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

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { sortableHeader } from '~/utils/table-utils';
import { getPeerPrices } from '~/utils/price-data-utils';
import { CirclePlus } from 'lucide-vue-next';

import { computed, h, ref } from 'vue'
import { useNow } from '@vueuse/core'
import { valueUpdater } from '~/lib/utils'
import { Button } from '@/components/ui/button'
import {useI18n} from "vue-i18n";

const { t } = useI18n();
const props = defineProps<{
  wkn: string,
  peer_members: string[],
  peer_switch?: { wkn: string, bid: number, ask: number, gainPerPiece: number, at?: string } | null,
  stocks_owned?: number | string,
}>()

// Outside service hours the stored suggestion is the last session's prices, not a live offer.
// useNow ticks the computed, so the badge goes away at 22:00 without a list refresh.
const now = useNow({ interval: 60_000 });
const activeSwitch = computed(() => (now.value, props.peer_switch && !isMarketClosed() ? props.peer_switch : null));
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
  // Only a missing or rejected key stops this — isMarketClosed() would also blank it every weekend.
  if (!apiKey.value || apiAuthFailed.value) { isLoading.value = false; return; }
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

const getSortingHeader = (column:any, label:any) => sortableHeader(column, t(label), 'hover:bg-gray-300 hover:text-black');

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
      const formatted = (value == null || value === '') ? '-' : numberToGerman(value, false, 4);
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

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<Record<string, boolean>>({
  wkn: true,
  ask: true,
  bid: true,
  ratio: false, // default hidden
})

const columnToggle = () =>{
  console.log("columnToggle columnVisibility",columnVisibility);
}

const rowSelection = ref({})
const expanded = ref<ExpandedState>({})

const table = useVueTable({
  get data() {
    return products.value
  },
  columns,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
  onColumnVisibilityChange: updaterOrValue => valueUpdater(updaterOrValue, columnVisibility),
  onRowSelectionChange: updaterOrValue => valueUpdater(updaterOrValue, rowSelection),
  onExpandedChange: updaterOrValue => valueUpdater(updaterOrValue, expanded),
  state: {
    get sorting() { return sorting.value },
    get columnFilters() { return columnFilters.value },
    get columnVisibility() { return columnVisibility.value },
    get rowSelection() { return rowSelection.value },
    get expanded() { return expanded.value },
  },
})

const closeDelayTime = ref(200);
const peerProducts = ref<any[]>([]);
const getPeerProductData = async () => {
  closeDelayTime.value = 10000;
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
      const url = `${apiBaseUrl}products?apikey=${encodeURIComponent(apiKey.value)}&wkn=${encodeURIComponent(wknParam)}`;
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
    
    const clonedData = deepCloneReactiveData(peerProducts.value);
    console.log("getPeerProductData clonedData",clonedData);
    await storage.setItem('local:PEER_PRODUCTS',clonedData);
    
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
