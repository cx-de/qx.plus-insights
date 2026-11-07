<template>
  <!-- Plain shadcn Card like the other Home cards; only the icon carries the accent -->
  <div class="chart-card rounded-lg border bg-card text-card-foreground shadow-xs p-4" :style="`--card-accent: ${accent};`">
    <div class="flex min-w-0 items-center gap-2">
      <span class="chart-card__icon"><component :is="icon" class="h-3.5 w-3.5" aria-hidden="true" /></span>
      <h3 class="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{{ title }}</h3>
    </div>
    <div class="chart-card__body">
      <template v-if="loading">
        <Skeleton class="chart-card__skeleton" />
      </template>
      <template v-else-if="hasData">
        <div class="chart-card__canvas" role="img" :aria-label="title">
          <Doughnut ref="doughnutRef" :data="data" :options="options" />
        </div>
      </template>
      <div v-else class="chart-card__empty">
        <span class="chart-card__empty-ring"></span>
        <span class="chart-card__empty-label">{{ $t('no_data_available') }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { Doughnut } from 'vue-chartjs'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  title: string,
  icon: any,
  accent: string,
  data: any,
  options: any,
  loading: boolean,
  hasData: boolean,
}>();

const doughnutRef = ref<any>(null);
// Home calls <ref>.value.chart.update(), same shape as the Doughnut ref it replaced
defineExpose({
  get chart() { return doughnutRef.value?.chart; },
});
</script>

<style scoped>
.chart-card {
  --card-accent: 113 113 122; /* zinc-500 fallback */
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chart-card__icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: calc(var(--radius) - 2px);
  background: rgb(var(--card-accent) / 0.12);
  color: rgb(var(--card-accent));
  flex: 0 0 auto;
}
:global(.dark) .chart-card__icon {
  background: rgb(var(--card-accent) / 0.2);
}

.chart-card__body {
  position: relative;
  margin-top: 12px;
  height: 150px; /* fixed across skeleton/empty/chart — a state change must never move the row below */
  overflow: hidden;
  border-radius: calc(var(--radius) - 2px);
}

.chart-card__canvas {
  position: absolute;
  inset: 0;
}
.chart-card__canvas :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.chart-card__skeleton {
  width: 100%;
  height: 100%;
}

.chart-card__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.chart-card__empty-label {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  text-align: center;
  padding: 0 8px;
}

/* dashed ring echoes the donut it stands in for, so an empty card still reads as a chart slot */
.chart-card__empty-ring {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 2px dashed hsl(var(--border));
}
</style>
