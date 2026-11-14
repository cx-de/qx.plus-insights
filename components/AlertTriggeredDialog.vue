<template>
  <!-- Every alert the background fired since the last Close; alerts fired while the tab was closed wait here. -->
  <Dialog :open="events.length > 0 && !blocked" @update:open="(open) => { if (!open) dismiss() }">
    <DialogContent class="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
      <!-- One alert: the product leads, and the value that crossed the threshold is the largest thing on screen. -->
      <template v-if="shown.length === 1 && single">
        <DialogHeader class="text-left">
          <DialogTitle class="text-lg leading-snug">{{ subject(single) }}</DialogTitle>
          <DialogDescription>
            {{ single.alertName
              ? $t('alert_dialog.single_text', { name: single.alertName, time: eventTime(single.at) })
              : $t('alert_dialog.single_text_unnamed', { time: eventTime(single.at) }) }}
          </DialogDescription>
        </DialogHeader>
        <div class="rounded-md border bg-muted/40 px-4 py-3">
          <p class="text-sm text-muted-foreground">{{ $t(single.field) }}</p>
          <div class="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p class="flex items-center gap-1.5 text-2xl font-semibold tabular-nums" :class="directionClass(single.condition)">
              {{ alertValueText(single.currentValue, single.field, single.instrumentType) }}
              <component :is="directionIcon(single.condition)" v-if="directionIcon(single.condition)" class="h-5 w-5" aria-hidden="true" />
            </p>
            <p class="text-sm text-muted-foreground tabular-nums">
              {{ $t('alert_dialog.threshold') }} {{ conditionSymbol(single.condition) }} {{ alertValueText(single.alertValue, single.field, single.instrumentType) }}
            </p>
          </div>
        </div>
      </template>

      <!-- Several alerts: one scannable row each, newest first, values aligned on the right. -->
      <template v-else>
        <DialogHeader class="text-left">
          <DialogTitle class="text-lg">{{ $t('alerts_triggered_count', { count: shown.length }) }}</DialogTitle>
          <DialogDescription>{{ $t('alert_dialog.multi_text', { time: eventTime(oldestAt) }) }}</DialogDescription>
        </DialogHeader>
        <ul class="divide-y rounded-md border">
          <li v-for="event in newestFirst" :key="`${event.id}-${event.at}`" class="flex items-start justify-between gap-4 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ subject(event) }}</p>
              <p class="text-sm text-muted-foreground tabular-nums">
                {{ $t(event.field) }} {{ conditionSymbol(event.condition) }} {{ alertValueText(event.alertValue, event.field, event.instrumentType) }}
              </p>
              <p v-if="event.alertName" class="truncate text-xs text-muted-foreground">{{ event.alertName }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums" :class="directionClass(event.condition)">
                <component :is="directionIcon(event.condition)" v-if="directionIcon(event.condition)" class="h-4 w-4" aria-hidden="true" />
                {{ alertValueText(event.currentValue, event.field, event.instrumentType) }}
              </p>
              <p class="text-xs text-muted-foreground">{{ eventClock(event.at) }}</p>
            </div>
          </li>
        </ul>
      </template>

      <DialogFooter class="gap-2">
        <Button v-if="route.path !== '/list'" variant="outline" @click="showInList()">{{ $t('alert_dialog.show_in_list') }}</Button>
        <Button @click="dismiss()">{{ $t('close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { storage } from '#imports';
import { TrendingDown, TrendingUp } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { alertValueText, conditionSymbol } from '~/utils/alert-utils';
import alertAudioUrl from '~/assets/alert.mp3';

defineProps<{ blocked?: boolean }>();

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const events = ref<any[]>([]);

// Last non-empty batch: the close animation re-renders after Close empties events, and must not go blank.
const shown = ref<any[]>([]);
watch(events, (list) => { if (list.length) shown.value = list; });
const single = computed(() => shown.value[0]);
const newestFirst = computed(() => [...shown.value].sort((a, b) => b.at - a.at));
const oldestAt = computed(() => Math.min(...shown.value.map((e) => e.at)));

const dateLocale = () => (locale.value === 'en' ? 'en-GB' : 'de-DE');
const eventTime = (at:number) => new Date(at).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' });
const eventClock = (at:number) => new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });

// Total alerts carry no name, so they need their own subject line.
const subject = (event:any) => (event.contextKey ? event.stockName : t('alert_dialog.portfolio_total'));

// The condition says which way the value crossed; == and != have no direction.
const rising = (condition:string) => condition === '>' || condition === '>=';
const falling = (condition:string) => condition === '<' || condition === '<=';
const directionIcon = (condition:string) => (rising(condition) ? TrendingUp : falling(condition) ? TrendingDown : null);
const directionClass = (condition:string) => (rising(condition) ? 'text-success' : falling(condition) ? 'text-destructive' : '');

const setEvents = (value:any) => {
  events.value = Array.isArray(value) ? value : [];
};

// Writing [] closes the dialog in every other dashboard tab too.
const dismiss = async () => {
  events.value = [];
  await storage.setItem('local:ALERT_EVENTS', []);
};

const showInList = async () => {
  await dismiss();
  await router.push('/list');
};

// Sound only for alerts arriving while the tab is open, never for the backlog shown on open.
const unwatch = storage.watch<any[]>('local:ALERT_EVENTS', (value, oldValue) => {
  const grew = (Array.isArray(value) ? value.length : 0) > (Array.isArray(oldValue) ? oldValue.length : 0);
  setEvents(value);
  if (grew) new Audio(alertAudioUrl).play().catch(() => { /* autoplay blocked: the dialog still shows */ });
});

onMounted(async () => {
  setEvents(await storage.getItem('local:ALERT_EVENTS'));
});

onUnmounted(unwatch);
</script>
