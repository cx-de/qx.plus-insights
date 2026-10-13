<template>
  <div class="chart-card" :style="`--card-accent: ${accent};`">
    <span class="chart-card__strip"></span>
    <div class="chart-card__head">
      <span class="chart-card__icon"><component :is="icon" class="h-3.5 w-3.5" aria-hidden="true" /></span>
      <h3 class="chart-card__title">{{ title }}</h3>
    </div>
    <div class="chart-card__body">
      <template v-if="loading">
        <Skeleton class="chart-card__skeleton" />
      </template>
      <template v-else-if="hasData">
        <div class="chart-card__halo"></div>
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
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 14px 14px 12px;
  border-radius: 12px;
  background:
    radial-gradient(120% 80% at 100% 0%, rgb(var(--card-accent) / 0.045), transparent 55%),
    linear-gradient(180deg, rgb(var(--card-accent) / 0.018), transparent 50%),
    hsl(var(--card));
  border: 1px solid hsl(var(--border));
  box-shadow:
    0 1px 1.5px rgba(15, 23, 42, 0.04),
    0 8px 20px -10px rgba(15, 23, 42, 0.08);
  transition: transform .35s cubic-bezier(.2,.7,.2,1),
              box-shadow .35s cubic-bezier(.2,.7,.2,1),
              border-color .35s ease;
  overflow: hidden;
  isolation: isolate;
}
.chart-card:hover {
  transform: translateY(-2px);
  border-color: rgb(var(--card-accent) / 0.45);
  box-shadow:
    0 1px 1.5px rgba(15, 23, 42, 0.05),
    0 14px 32px -12px rgba(15, 23, 42, 0.18),
    0 0 0 1px rgb(var(--card-accent) / 0.10);
}
.chart-card:hover .chart-card__strip { opacity: 1; transform: scaleX(1); }
.chart-card:hover .chart-card__icon  { transform: translateY(-1px); }

@media (prefers-reduced-motion: reduce) {
  .chart-card, .chart-card__strip, .chart-card__icon { transition: none; }
  .chart-card:hover, .chart-card:hover .chart-card__icon { transform: none; }
}

/* Accent strip across the top — softer than a 3px border */
.chart-card__strip {
  position: absolute;
  inset: 0 12% auto 12%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(var(--card-accent) / 0.95) 28%,
    rgb(var(--card-accent) / 0.95) 72%,
    transparent
  );
  opacity: 0.85;
  transform: scaleX(0.92);
  transform-origin: center;
  transition: opacity .35s ease, transform .35s cubic-bezier(.2,.7,.2,1);
  pointer-events: none;
  z-index: 1;
}

.chart-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
  min-width: 0;
}

.chart-card__icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgb(var(--card-accent) / 0.10);
  color: rgb(var(--card-accent));
  box-shadow:
    inset 0 0 0 1px rgb(var(--card-accent) / 0.18),
    inset 0 1px 0 rgb(255 255 255 / 0.5);
  transition: transform .35s cubic-bezier(.2,.7,.2,1);
  flex: 0 0 auto;
}

.chart-card__title {
  margin: 0;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--foreground) / 0.8);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.chart-card__body {
  position: relative;
  margin-top: 10px;
  height: 150px; /* fixed across skeleton/empty/chart — a state change must never move the row below */
  isolation: isolate;
  overflow: hidden;
  border-radius: 6px;
}

/* Soft accent halo behind the donut so the card feels three-dimensional */
.chart-card__halo {
  position: absolute;
  inset: 6%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%,
      rgb(var(--card-accent) / 0.08) 0%,
      rgb(var(--card-accent) / 0.02) 45%,
      transparent 70%);
  filter: blur(0.5px);
  pointer-events: none;
  z-index: 0;
}

.chart-card__canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.chart-card__canvas :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.chart-card__skeleton {
  width: 100%;
  height: 100%;
  border-radius: 14px;
}

.chart-card__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  z-index: 1;
}

.chart-card__empty-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: center;
  padding: 0 8px;
}

/* dashed ring echoes the donut it stands in for, so an empty card still reads as a chart slot */
.chart-card__empty-ring {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 2px dashed rgb(var(--card-accent) / 0.30);
  background: radial-gradient(circle at 50% 50%, rgb(var(--card-accent) / 0.05), transparent 70%);
}

/* ───────────────── Dark theme ───────────────── */
:global(.dark) .chart-card {
  background:
    radial-gradient(120% 80% at 100% 0%, rgb(var(--card-accent) / 0.10), transparent 55%),
    linear-gradient(180deg, rgb(var(--card-accent) / 0.04), transparent 50%),
    hsl(var(--card));
  box-shadow:
    0 1px 1.5px rgba(0, 0, 0, 0.30),
    0 10px 24px -10px rgba(0, 0, 0, 0.45);
}
:global(.dark) .chart-card:hover {
  border-color: rgb(var(--card-accent) / 0.55);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 16px 36px -14px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgb(var(--card-accent) / 0.18);
}
:global(.dark) .chart-card__icon {
  background: rgb(var(--card-accent) / 0.18);
  box-shadow:
    inset 0 0 0 1px rgb(var(--card-accent) / 0.30),
    inset 0 1px 0 rgb(255 255 255 / 0.05);
}
:global(.dark) .chart-card__empty-ring {
  border-color: rgb(var(--card-accent) / 0.38);
}
:global(.dark) .chart-card__halo {
  background:
    radial-gradient(circle at 50% 50%,
      rgb(var(--card-accent) / 0.14) 0%,
      rgb(var(--card-accent) / 0.04) 45%,
      transparent 70%);
}
</style>
