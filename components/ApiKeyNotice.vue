<template>
  <!-- Red only for a rejected key: a missing key is the normal first-run state, not an error -->
  <div v-if="apiKeyLoaded && apiKey && apiAuthFailed" class="mb-4 px-4 py-3 rounded relative border transition-all
    bg-red-100 border-red-400 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-300"
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
    class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-xs">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
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
      bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200"
      aria-live="off" id="apiRateLimitMessage">
      {{ $t('api_rate_limited', {
        used: apiRateLimit?.used,
        limit: apiRateLimit?.limit,
        window: apiRateLimit?.window,
        seconds: secondsLeft,
      }) }}
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { Info } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { apiKey, apiAuthFailed, apiKeyLoaded, apiRateLimit, apiRateLimitSecondsLeft } from '~/utils/helper'
import { PRICING_URL } from '~/utils/constants';

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
