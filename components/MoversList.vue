<template>
  <div v-if="isEmpty" class="movers-empty">
    <ul class="movers-empty__ghost" aria-hidden="true">
      <li v-for="n in 6" :key="n">
        <span class="movers-empty__bar movers-empty__bar--name"></span>
        <span class="movers-empty__bar movers-empty__bar--isin"></span>
        <span class="movers-empty__bar movers-empty__bar--value"></span>
        <span class="movers-empty__bar movers-empty__bar--change"></span>
        <span class="movers-empty__bar movers-empty__bar--percent"></span>
      </li>
    </ul>
    <div class="movers-empty__panel">
      <h3 class="text-sm font-semibold text-foreground">{{ $t('no_movers_yet') }}</h3>
      <p class="mt-1 max-w-xs text-xs text-muted-foreground">{{ $t('movers_will_appear_after_snapshots') }}</p>
      <Button @click="emit('reload')" :disabled="loading" size="sm" variant="outline" class="mt-3">
        <RefreshCcw class="motion-reduce:animate-none" :class="{ 'animate-spin opacity-50': loading }" />
        {{ loading ? $t('loading') : $t('reload') }}
      </Button>
    </div>
  </div>

  <!-- One grid for header and rows: columns line up without fixed pixel widths; ISIN drops out below sm -->
  <!-- scroll wrapper: on a narrow card the auto number columns cannot shrink further -->
  <div v-else class="overflow-x-auto">
  <div class="movers-table text-sm">
    <div class="movers-row px-1.5 pb-1 text-xs text-muted-foreground whitespace-nowrap">
      <span class="min-w-0">{{ $t('stock_name') }}</span>
      <span class="max-sm:hidden">{{ $t('isin') }}</span>
      <span class="text-right">{{ $t('current_value') }}</span>
      <span class="text-right">{{ $t('change') }}</span>
      <span class="text-right">{{ $t('change') }} %</span>
    </div>
    <ul class="m-0 p-0 list-none">
      <!-- Index key: separate-accounts mode can list one ISIN twice, and both total rows lack one -->
      <li v-for="(item, index) in items" :key="index"
        class="movers-row items-center border-b last:border-none p-1.5 tabular-nums whitespace-nowrap"
        :class="item.isTotal ? 'bg-muted rounded-md mt-2 font-semibold' : ''">
        <span class="min-w-0 truncate font-medium" :class="item.isTotal ? 'text-muted-foreground' : 'text-foreground'"
          :title="item.name">
          {{ item.name }}
        </span>
        <span class="max-sm:hidden truncate">
          <a v-if="isinLink && item.isin" :href="linkFor(item.isin)" target="_blank" rel="noopener noreferrer"
            class="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            {{ item.isin }}
          </a>
          <span v-else class="text-muted-foreground">{{ item.isin }}</span>
        </span>
        <span class="text-right">{{ numberToGerman(item.currentValue) }}</span>
        <span class="text-right font-semibold" :class="toneClass">{{ sign }}{{ numberToGerman(item.change) }}</span>
        <span class="text-right font-semibold" :class="toneClass">{{ sign }}{{ numberToGerman(item.changePercent, false, 2) }}</span>
      </li>
    </ul>
  </div>
  </div>
</template>

<script lang="ts" setup>
import { Button } from '@/components/ui/button'
import { RefreshCcw } from 'lucide-vue-next';
import { computed } from 'vue';
import { numberToGerman } from '~/utils/helper'

const props = defineProps<{
  items: any[],
  isEmpty: boolean,
  tone: 'gain' | 'loss',
  loading: boolean,
  isinLink: any,
  linkFor: (isin: string) => string,
}>();

const emit = defineEmits(['reload']);

const toneClass = computed(() => props.tone === 'gain' ? 'text-success' : 'text-destructive');
const sign = computed(() => props.tone === 'gain' ? '+' : '');
</script>

<style scoped>
/* Header and rows share the outer grid's tracks through subgrid, so auto widths still line up row to row */
.movers-table {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  column-gap: 1rem;
}
/* 40rem, not 640px: must flip with max-sm:hidden on the ISIN cells at any root font size */
@media (min-width: 40rem) {
  .movers-table { grid-template-columns: minmax(0, 1fr) repeat(4, auto); }
}
.movers-table > ul,
.movers-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
}

/* ghosted rows keep the panel's shape visible instead of leaving a white void */
.movers-empty {
  position: relative;
  height: 100%;
  min-height: 190px; /* ≈ the populated list's height, so the card holds still when rows arrive */
  overflow: hidden;
}

.movers-empty__ghost {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0.05));
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0.05));
}

.movers-empty__ghost li {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px 6px;
  border-bottom: 1px solid hsl(var(--muted));
}

.movers-empty__bar {
  height: 7px;
  border-radius: 999px;
  background: hsl(var(--muted));
}
.movers-empty__bar--name   { flex: 1 1 auto; }
.movers-empty__bar--isin   { width: 100px; flex: 0 0 auto; }
.movers-empty__bar--value  { width: 100px; flex: 0 0 auto; }
.movers-empty__bar--change { width: 100px; flex: 0 0 auto; }
.movers-empty__bar--percent { width: 90px; flex: 0 0 auto; }

.movers-empty__panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 16px;
  background: radial-gradient(58% 52% at 50% 50%,
    hsl(var(--card) / 0.97) 42%,
    hsl(var(--card) / 0) 78%);
}
</style>
