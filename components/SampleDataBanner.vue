<template>
  <!-- Sample banner: keeps made-up numbers from being mistaken for a real portfolio. -->
  <div v-if="isSample" role="status"
    class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <Info class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="text-foreground">{{ $t('tour.sample.banner') }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" @click="connect()">{{ $t('tour.sample.connect') }}</Button>
      <Button size="sm" variant="ghost" @click="remove()">{{ $t('tour.sample.remove') }}</Button>
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
