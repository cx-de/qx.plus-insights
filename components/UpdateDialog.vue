<template>
  <!-- Update dialog: announces a newer extension version; a forced one can't be dismissed. -->
  <AlertDialog :open="!!info && !blocked">
    <AlertDialogContent @escape-key-down="onEscape">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('update_dialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('update_dialog.text', { latest: info?.latest_version, current: info?.current_version }) }}
          <span v-if="info?.force" class="mt-2 block font-medium text-destructive">
            {{ $t('update_dialog.force_text') }}
          </span>
          <span v-if="updating" class="mt-2 block">{{ $t('update_dialog.downloading') }}</span>
          <span v-else-if="unavailable" class="mt-2 block font-medium text-destructive">
            {{ $t('update_dialog.not_yet_available') }}
          </span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="notes" class="max-h-60 overflow-y-auto rounded-md border p-3 text-sm">
        <p class="mb-1 font-medium">{{ $t('update_dialog.whats_new') }}</p>
        <p class="whitespace-pre-line text-muted-foreground">{{ notes }}</p>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel v-if="!info?.force" @click="later()">{{ $t('update_dialog.later') }}</AlertDialogCancel>
        <Button :disabled="updating" @click="updateNow()">{{ $t('update_dialog.update_now') }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { versionNextUpdate, versionSnooze, versionUpdateNow } from '~/utils/version-utils';

// Held back while another dialog (the account switch) needs an answer first.
defineProps<{ blocked?: boolean }>();

const { locale } = useI18n();
const info = ref<any>(null);
const updating = ref(false);
const unavailable = ref(false);

const notes = computed(() => {
  const all = info.value?.notes || {};
  return (locale.value === 'en' ? all.en || all.de : all.de || all.en) || '';
});

const later = async () => {
  const version = info.value?.latest_version;
  info.value = null;
  await versionSnooze(version);
}

const onEscape = (event:any) => {
  if (info.value?.force) {
    event.preventDefault();
    return;
  }
  later();
}

const updateNow = async () => {
  updating.value = true;
  unavailable.value = false;
  try {
    unavailable.value = await versionUpdateNow(info.value?.store_url) === 'unavailable';
  } finally {
    updating.value = false;
  }
}

// The dashboard tab stays open for hours, so a check only on mount would miss releases; the 6h cache keeps this cheap.
const RECHECK_MS = 30 * 60 * 1000;
let recheckTimer:any = null;

const check = async () => {
  if (info.value) return;
  info.value = await versionNextUpdate();
}

const onVisible = () => {
  if (document.visibilityState === 'visible') check();
}

onMounted(() => {
  check();
  recheckTimer = setInterval(check, RECHECK_MS);
  document.addEventListener('visibilitychange', onVisible);
});

onUnmounted(() => {
  clearInterval(recheckTimer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>
