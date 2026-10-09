<template>
  <!-- Daily meter mirrors the portal's billing usage block (quexportal pages/billing.vue) so both read the same -->
  <!-- text-red-*, not text-destructive: the dark --destructive is too dim to read on the dark card -->
  <!-- shadow-none: it sits inside the page card, a second shadow made it float above the form -->
  <Card class="shadow-none">
    <CardHeader class="pb-3">
      <CardTitle class="truncate text-base">{{ $t('settings_page.usage_title') }}</CardTitle>
    </CardHeader>

    <!-- No min height: it left half the card empty; the skeleton matches the data rows instead, so the swap doesn't jump -->
    <CardContent class="pt-0 flex flex-col">
      <!-- Portal EmptyState anatomy minus its dashed frame: inside a card that frame was a third box -->
      <div
        v-if="emptyState"
        class="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center"
        :role="emptyState.alert ? 'alert' : undefined"
      >
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
          :class="emptyState.alert ? 'bg-destructive/10 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'"
        >
          <component :is="emptyState.icon" class="h-5 w-5" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold">{{ emptyState.title }}</p>
        <p class="mt-1 max-w-xs text-xs text-muted-foreground">{{ emptyState.description }}</p>
        <Button v-if="emptyState.billing" as="a" :href="`${portalUrl}/billing`" target="_blank" rel="noopener noreferrer" variant="outline" size="sm" class="mt-4">
          {{ $t('settings_page.usage_manage_subscription') }}
          <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      <!-- Skeleton traces the data layout row for row, so the swap is in place -->
      <div v-else-if="loading && !usage" class="flex flex-col" aria-busy="true">
        <div class="mb-2 flex items-end justify-between gap-3">
          <Skeleton class="h-4 w-20" />
          <Skeleton class="h-7 w-14" />
        </div>
        <Skeleton class="h-2.5 w-full" />
        <div class="mt-2 flex justify-between gap-3">
          <Skeleton class="h-3 w-28" />
          <Skeleton class="h-3 w-24" />
        </div>
        <div class="mt-4 space-y-2 border-t pt-4">
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-full" />
        </div>
      </div>

      <!-- Daily only: it is the one quota the backend enforces; plans.monthly_api_limit is stale and blocks nothing -->
      <div v-else-if="usage" class="flex flex-col">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium">{{ $t('settings_page.usage_today_label') }}</span>
          <!-- Calls outside service hours are rejected, so say whether they work right now -->
          <span v-if="serviceStatus" class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            <span class="h-1.5 w-1.5 rounded-full" :class="serviceStatus.open ? 'bg-emerald-500' : 'bg-muted-foreground'" aria-hidden="true"></span>
            {{ serviceStatus.label }}
          </span>
        </div>
        <!-- Headline is what's left: the number a user acts on, same as the portal billing card -->
        <p class="mb-2 mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-semibold leading-none tabular-nums" :class="toneText(dailyPercent)">{{ fmt(dailyRemaining) }}</span>
          <span class="text-xs text-muted-foreground">{{ $t('settings_page.usage_left_today') }}</span>
        </p>
        <div
          class="relative h-2.5 w-full rounded-full bg-muted"
          role="meter"
          aria-valuemin="0"
          :aria-valuemax="usage.today.limit"
          :aria-valuenow="usage.today.used"
          :aria-label="$t('settings_page.usage_today')"
        >
          <!-- min-w keeps a small share visible as a bar, not a dot -->
          <div
            class="relative h-full rounded-full transition-all motion-reduce:transition-none"
            :class="[toneBar(dailyPercent), usage.today.used > 0 ? 'min-w-2.5' : '']"
            :style="{ width: `${dailyPercent}%` }"
          ></div>
        </div>
        <div class="mt-2 flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
          <span class="whitespace-nowrap">{{ $t('settings_page.usage_used_of_percent', { used: fmt(usage.today.used), limit: fmt(usage.today.limit), percent: dailyPercent }) }}</span>
          <span class="text-right">{{ todayResetsIn }}</span>
        </div>

        <div
          v-if="dailyRemaining <= 0"
          class="mt-3 rounded-lg border px-3 py-2 border-destructive/30 bg-destructive/10 text-red-600 dark:text-red-400"
          role="alert"
        >
          <p class="text-sm font-medium">{{ $t('settings_page.usage_limit_reached_title') }}</p>
          <p class="text-xs">{{ $t('settings_page.usage_limit_reached_desc') }}</p>
        </div>
        <div
          v-else-if="dailyPercent >= 80"
          class="mt-3 rounded-lg border px-3 py-2 border-warning/30 bg-warning/10 text-warning"
          role="status"
        >
          <p class="text-sm font-medium">{{ $t('settings_page.usage_near_limit') }}</p>
          <p class="text-xs">{{ $t('settings_page.usage_near_limit_desc', { remaining: fmt(dailyRemaining) }) }}</p>
        </div>

        <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t pt-4 text-xs">
          <dt class="text-muted-foreground">{{ $t('settings_page.usage_rate_limit_label') }}</dt>
          <dd class="text-right tabular-nums">{{ rateLimitText }}</dd>
          <dt class="text-muted-foreground">{{ $t('settings_page.usage_daily_limit_label') }}</dt>
          <dd class="text-right tabular-nums">{{ $t('settings_page.usage_daily_limit_value', { limit: fmt(usage.today.limit) }) }}</dd>
          <template v-if="serviceWindow">
            <dt class="text-muted-foreground">{{ $t('settings_page.usage_service_hours_label') }}</dt>
            <dd class="text-right tabular-nums">{{ serviceWindow }}</dd>
          </template>
          <!-- Bundled requests confuse users who count HTTP calls; the quota counts instruments -->
          <dt class="text-muted-foreground">{{ $t('settings_page.usage_counting_label') }}</dt>
          <dd class="text-right">{{ $t('settings_page.usage_counting_value') }}</dd>
        </dl>
      </div>

      <div v-if="apiKey && (usage || loading)" class="mt-4 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <span v-if="updatedAt">{{ $t('settings_page.usage_updated', { time: updatedAt }) }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground"
          :disabled="loading"
          :aria-label="$t('settings_page.usage_refresh')"
          :title="$t('settings_page.usage_refresh')"
          @click="load"
        >
          <RefreshCw class="h-3.5 w-3.5 motion-reduce:animate-none" :class="{ 'animate-spin': loading }" />
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RefreshCw, KeyRound, WifiOff, Clock, CreditCard, Lock, ExternalLink } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchApiUsage, numberToGerman, portalUrl } from '~/utils/helper';

const props = defineProps<{ apiKey: string }>();
const emit = defineEmits<{ (e: 'usage', value: any): void }>();
const { t, locale } = useI18n();

const usage = ref<any>(null);
const failure = ref<any>(null);
const loading = ref(false);
const updatedAt = ref('');

const fmt = (n: any) => numberToGerman(n, true);

// Copy is resolved here, not in load(), so switching language re-renders an already shown state.
const EMPTY_STATES: any = {
  no_key: { icon: KeyRound, key: 'usage_no_key' },
  offline: { icon: WifiOff, key: 'usage_offline' },
  unavailable: { icon: Clock, key: 'usage_unavailable' },
  invalid_key: { icon: KeyRound, key: 'usage_invalid_key', alert: true },
  inactive: { icon: CreditCard, key: 'usage_inactive', alert: true, billing: true },
  feed_disabled: { icon: Lock, key: 'usage_feed_disabled', billing: true },
};

const emptyState = computed(() => {
  const kind = !props.apiKey ? 'no_key' : failure.value;
  const state = kind && EMPTY_STATES[kind];
  if (!state) return null;
  return {
    ...state,
    title: t(`settings_page.${state.key}_title`),
    description: t(`settings_page.${state.key}_desc`),
  };
});

const load = async () => {
  //console.log("ApiUsagePanel load");
  if (!props.apiKey) return;
  loading.value = true;
  const result: any = await fetchApiUsage(props.apiKey);
  loading.value = false;

  if (result && !result.error) {
    usage.value = result;
    failure.value = null;
    updatedAt.value = new Date().toLocaleTimeString(locale.value === 'de' ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    emit('usage', result);
    return;
  }

  usage.value = null;
  emit('usage', null);
  if (result === null) failure.value = 'offline';
  else if (result.error === 401) failure.value = 'invalid_key';
  else if (result.error === 402) failure.value = 'inactive';
  else if (result.error === 403) failure.value = 'feed_disabled';
  // 404/5xx/429 say nothing about the key, and prices keep flowing through their own endpoints.
  else failure.value = 'unavailable';
};

// Same maths as the portal's useSubscription, so both show the same percent for the same counters.
const dailyPercent = computed(() => {
  const d = usage.value?.today;
  if (!d || !d.limit) return 0;
  // Floor, not round: 99.6% must not read as a red 100% while calls still go through
  return Math.min(100, Math.floor((d.used / d.limit) * 100));
});

// Same 80% threshold as the near-limit alert, so the colour and the warning appear together.
const toneBar = (percent: number) =>
  percent >= 100 ? 'bg-destructive' : percent >= 80 ? 'bg-warning' : 'bg-primary';

const toneText = (percent: number) =>
  percent >= 100 ? 'text-red-600 dark:text-red-400' : percent >= 80 ? 'text-warning' : '';

const dailyRemaining = computed(() => {
  const d = usage.value?.today;
  if (!d || !d.limit) return 0;
  return Math.max(0, d.limit - (d.used || 0));
});

const windowMinutes = computed(() => Math.max(1, Math.round((usage.value?.window?.seconds || 60) / 60)));

// Ticks once a minute so "Resets in" counts down without refetching usage.
const now = ref(Date.now());
let clock: any = null;
onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 60_000); });
onUnmounted(() => clearInterval(clock));

const todayResetsIn = computed(() => {
  const at = usage.value?.today?.resets_at;
  if (!at) return t('settings_page.usage_resets_midnight');
  const mins = Math.max(0, Math.round((new Date(at).getTime() - now.value) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return t('settings_page.usage_resets_in', { time: h ? `${h} h ${m} min` : `${m} min` });
});

const rateLimitText = computed(() => {
  const calls = fmt(usage.value?.window?.limit || 0);
  return windowMinutes.value === 1
    ? t('settings_page.usage_rate_limit_per_minute', { calls })
    : t('settings_page.usage_rate_limit_value', { calls, minutes: windowMinutes.value });
});

const serviceWindow = computed(() => {
  const w = usage.value?.service_window;
  if (!w) return '';
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const city = String(w.timezone || '').split('/').pop()?.replace(/_/g, ' ');
  return t('settings_page.usage_service_hours_value', { start: hh(w.start_hour), end: hh(w.end_hour), city });
});

// Judged in the feed's own time zone, so CET/CEST and the viewer's zone can't skew it
const serviceStatus = computed(() => {
  const w = usage.value?.service_window;
  if (!w?.timezone) return null;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: w.timezone }).format(now.value));
  const open = hour >= w.start_hour && hour < w.end_hour;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return {
    open,
    label: open ? t('settings_page.usage_live_until', { time: hh(w.end_hour) }) : t('settings_page.usage_closed_until', { time: hh(w.start_hour) }),
  };
});

// Settings passes the saved key, so this fires on mount, after a passing test, and after a save — not per keystroke.
watch(() => props.apiKey, (key) => {
  usage.value = null;
  failure.value = null;
  emit('usage', null);
  if (key) load();
}, { immediate: true });
</script>
