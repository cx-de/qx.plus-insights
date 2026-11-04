<template>
  <!-- Sample banner: keeps made-up numbers from being mistaken for a real portfolio. -->
  <div v-if="isSample" role="status"
    class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-2.5 text-sm">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <span class="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">{{ $t('tour.sample.badge') }}</span>
      <span class="font-medium text-foreground">{{ $t('tour.sample.banner') }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" @click="remove()">{{ $t('tour.sample.remove') }}</Button>
      <!-- Subscription is a second step, so connecting stays the one primary action -->
      <Button v-if="apiKeyLoaded && !apiKey" size="sm" variant="outline" class="bg-background" as="a" :href="PRICING_URL" target="_blank" rel="noopener noreferrer">{{ $t('start_subscription') }}</Button>
      <Button size="sm" @click="connect()">{{ $t('tour.sample.connect') }}</Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { resetAll } from '@/lib/storage-utils';
import { apiKey, apiKeyLoaded } from '~/utils/helper';
import { PRICING_URL } from '~/utils/constants';

const isSample = ref(false);

// Reload either way: every page holds the sample rows in memory.
async function remove() {
  console.log('SampleDataBanner remove');
  await resetAll();
  location.reload();
}

async function connect() {
  console.log('SampleDataBanner connect');
  await resetAll();
  await chrome.storage.local.set({ TOUR: { broker: null, step: 'choose' } });
  location.reload();
}

// Watched, not read once: a second dashboard tab gets the sample rows live and must flag them too.
function onStorageChange(changes:any, area:string) {
  if (area !== 'local' || !changes.SAMPLE_DATA) return;
  isSample.value = !!changes.SAMPLE_DATA.newValue;
  // Deferred to the next focus: an instant reload would cut off the import or reset that is clearing the flag in this tab.
  if (changes.SAMPLE_DATA.oldValue && !changes.SAMPLE_DATA.newValue) {
    addEventListener('focus', reloadWhenSeen);
    document.addEventListener('visibilitychange', reloadWhenSeen);
  }
}

// Removed in another tab: this one still holds the sample rows in memory.
function reloadWhenSeen() {
  if (document.visibilityState === 'visible') location.reload();
}

onMounted(async () => {
  chrome.storage.onChanged.addListener(onStorageChange);
  isSample.value = !!(await chrome.storage.local.get('SAMPLE_DATA')).SAMPLE_DATA;
});
onUnmounted(() => chrome.storage.onChanged.removeListener(onStorageChange));
</script>
