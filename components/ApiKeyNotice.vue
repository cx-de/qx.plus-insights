<template>
  <div v-if="apiKeyLoaded && (!apiKey || apiAuthFailed)" class="mb-4 px-4 py-3 rounded relative border transition-all
    bg-red-100 border-red-400 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-300"
    role="alert" id="apiMissingMessage">
    <span class="block sm:inline">
      {{ apiAuthFailed ? $t('api_key_was_rejected_prices_are_no_longer_updating') : $t('api_key_is_missing_you_must_add_it_in') }}
    </span>
    <router-link to="/settings" class="font-semibold underline">
      {{ $t('settings') }}
    </router-link>.
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
import { apiKey, apiAuthFailed, apiKeyLoaded, apiRateLimit, apiRateLimitSecondsLeft } from '~/utils/helper'

const secondsLeft = ref(0);
let ticker: ReturnType<typeof setInterval> | null = null;

// Date.now() is not reactive, so the countdown needs its own clock.
const tick = () => { secondsLeft.value = apiRateLimitSecondsLeft(); };

watch(apiRateLimit, tick, { immediate: true });

onMounted(() => {
  ticker = setInterval(tick, 1000);
});

onUnmounted(() => {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
});
</script>
