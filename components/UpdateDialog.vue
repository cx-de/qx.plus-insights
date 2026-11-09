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
          <span v-if="info?.ready" class="mt-2 block font-medium">{{ $t('update_dialog.ready_text') }}</span>
          <span v-else-if="updating" class="mt-2 block">{{ $t('update_dialog.downloading') }}</span>
          <span v-else-if="pending" class="mt-2 block font-medium">{{ $t('update_dialog.pending') }}</span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="notes" class="max-h-60 overflow-y-auto rounded-md border p-3 text-sm">
        <p class="mb-1 font-medium">{{ $t('update_dialog.whats_new') }}</p>
        <p class="whitespace-pre-line text-muted-foreground">{{ notes }}</p>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel v-if="!info?.force" @click="later()">{{ $t('update_dialog.later') }}</AlertDialogCancel>
        <Button :disabled="updating" @click="updateNow()">
          <Loader2 v-if="updating" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {{ info?.ready ? $t('update_dialog.restart_now') : $t('update_dialog.update_now') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-vue-next';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { versionHoldUpdate, versionNextUpdate, versionSnooze, versionUpdateNow } from '~/utils/version-utils';

// Held back while another dialog (the account switch) needs an answer first.
const props = defineProps<{ blocked?: boolean }>();
// Lets App hold the setup guide dialog back: a forced update must never wait behind onboarding.
const shown = defineModel<boolean>('shown', { default: false });

const { locale } = useI18n();
const info = ref<any>(null);
watch(() => !!info.value && !props.blocked, (value) => { shown.value = value; }, { immediate: true });
const updating = ref(false);
const pending = ref(false);

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
  pending.value = false;
  try {
    pending.value = await versionUpdateNow() === 'pending';
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

// The background asks open dashboards before installing a downloaded update; answering keeps it from
// reloading under the user. versionNextUpdate then reports it as ready (snooze still applies unless forced).
const onMessage = (message:any) => {
  if (message?.type !== 'qx:update-ready') return;
  // Mid "Update now" the reload is already on its way; resetting would flash the dialog closed.
  if (!info.value?.ready && !updating.value) info.value = null;
  check();
  hold();
  return Promise.resolve(true);
}

// Holds a deferred update while this dashboard is open; closing it lets the background install.
let releaseHold:any = null;
const hold = () => {
  releaseHold?.();
  releaseHold = versionHoldUpdate();
}

const onVisible = () => {
  if (document.visibilityState === 'visible') check();
}

onMounted(() => {
  check();
  hold();
  recheckTimer = setInterval(check, RECHECK_MS);
  document.addEventListener('visibilitychange', onVisible);
  // Offline checks are skipped, so recheck as soon as the connection is back.
  window.addEventListener('online', check);
  browser.runtime.onMessage.addListener(onMessage);
});

onUnmounted(() => {
  clearInterval(recheckTimer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', check);
  browser.runtime.onMessage.removeListener(onMessage);
  releaseHold?.();
});
</script>
