<template>
  <!-- Sample banner: keeps made-up numbers from being mistaken for a real portfolio. -->
  <div v-if="isSample" role="status"
    class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card bg-[radial-gradient(120%_80%_at_100%_0%,rgb(59_130_246/0.06),transparent_55%)] px-4 py-2.5 text-sm shadow-xs">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <!-- Same tinted icon chip as the Home chart cards, so the notice reads as part of the app -->
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Info class="h-4 w-4" aria-hidden="true" />
      </span>
      <span class="font-medium text-foreground">{{ $t('tour.sample.banner') }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" class="bg-background" @click="remove()">{{ $t('tour.sample.remove') }}</Button>
      <Button size="sm" @click="connect()">{{ $t('tour.sample.connect') }}</Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { Info } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { resetAll } from '@/lib/storage-utils';

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
  await chrome.storage.local.set({ TOUR: { broker: 'flatex', step: 'choose' } });
  location.reload();
}

onMounted(async () => {
  isSample.value = !!(await chrome.storage.local.get('SAMPLE_DATA')).SAMPLE_DATA;
});
</script>
