<template>
  <!-- Red only for a rejected key: a missing key is the normal first-run state, not an error -->
  <div v-if="apiKeyLoaded && apiKey && apiAuthFailed" class="mb-4 px-4 py-3 rounded-lg relative border text-sm
    border-destructive/40 bg-destructive/10 text-destructive"
    role="alert" id="apiMissingMessage">
    <span class="block sm:inline">
      {{ $t('api_key_was_rejected_prices_are_no_longer_updating') }}
    </span>
    <router-link to="/settings" class="font-semibold underline">
      {{ $t('settings') }}
    </router-link>.
  </div>

  <!-- Sample mode skips this: SampleDataBanner carries the same call to action -->
  <div v-else-if="apiKeyLoaded && !apiKey && !isSample" role="status" id="apiMissingMessage"
    class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-xs">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <Info class="h-4 w-4" aria-hidden="true" />
      </span>
      <span class="font-medium text-foreground">{{ $t('no_key_live_prices_need_subscription') }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <router-link to="/settings" class="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        {{ $t('i_already_have_a_key') }}
      </router-link>
      <Button size="sm" as="a" :href="PRICING_URL" target="_blank" rel="noopener noreferrer">{{ $t('start_subscription') }}</Button>
    </div>
  </div>

  <!-- floating, not in flow: the banner flaps every window and pushed every page down ~60px -->
  <!-- aria-live off: the per-second countdown made screen readers re-read the whole message every tick -->
  <Teleport v-else-if="secondsLeft > 0" to="body">
    <div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-[calc(100vw-2rem)] px-4 py-2 rounded-full border shadow-lg text-sm
      bg-card border-warning/50 text-warning"
      aria-live="off" id="apiRateLimitMessage">
      {{ $t('api_rate_limited', {
        used: apiRateLimit?.used,
        limit: apiRateLimit?.limit,
        window: apiRateLimit?.window,
        seconds: secondsLeft,
      }) }}
    </div>
  </Teleport>

  <!-- Outside its own chain: off-hours the feed still answers, so this sits beside a rate-limit pill -->
  <div v-if="apiKeyLoaded && apiKey && !apiAuthFailed && marketOpensIn >= 0" role="status" id="marketClosedMessage"
    class="mb-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-xs">
    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
      <Clock class="h-4 w-4" aria-hidden="true" />
    </span>
    <span class="text-muted-foreground">
      <span class="font-medium text-foreground">{{ $t('market_closed') }}</span>
      {{ $t('market_closed_last_prices', { when: marketOpensWhen, time: `${String(MARKET_OPEN_HOUR).padStart(2, '0')}:00` }) }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { Info, Clock } from 'lucide-vue-next';
import { useNow } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { apiKey, apiAuthFailed, apiKeyLoaded, apiRateLimit, apiRateLimitSecondsLeft, daysUntilMarketOpen, marketOpenDayName, MARKET_OPEN_HOUR } from '~/utils/helper'
import { PRICING_URL } from '~/utils/constants';

const { t, locale } = useI18n();
// useNow ticks it, so the notice appears at 22:00 and goes at 08:00 without a page change.
const now = useNow({ interval: 60_000 });
const marketOpensIn = computed(() => daysUntilMarketOpen(now.value));
const marketOpensWhen = computed(() => {
  const days = marketOpensIn.value;
  const day = marketOpenDayName(days, locale.value);
  return days < 2 ? day : t('market_opens_on_day', { day });
});

const secondsLeft = ref(0);
const isSample = ref(false);
let ticker: ReturnType<typeof setInterval> | null = null;

// Date.now() is not reactive, so the countdown needs its own clock.
const tick = () => { secondsLeft.value = apiRateLimitSecondsLeft(); };

watch(apiRateLimit, tick, { immediate: true });

// Same live flag as SampleDataBanner, or a second tab would show this notice beside the sample rows.
function onStorageChange(changes:any, area:string) {
  if (area === 'local' && changes.SAMPLE_DATA) isSample.value = !!changes.SAMPLE_DATA.newValue;
}

onMounted(async () => {
  ticker = setInterval(tick, 1000);
  chrome.storage.onChanged.addListener(onStorageChange);
  isSample.value = !!(await chrome.storage.local.get('SAMPLE_DATA')).SAMPLE_DATA;
});

onUnmounted(() => {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
  chrome.storage.onChanged.removeListener(onStorageChange);
});
</script>
