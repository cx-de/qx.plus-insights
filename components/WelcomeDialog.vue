<template>
  <!-- Welcome dialog: first steps for people with no portfolio yet; broker steps tick off live from the bank tab. -->
  <Dialog :open="open && !blocked" @update:open="onOpenChange">
    <DialogContent class="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto gap-0 rounded-xl p-6 sm:max-w-lg sm:p-7">

      <!-- Choose how to start -->
      <template v-if="view === 'choose'">
        <!-- Shows the promise before asking anything: several depots, one total. Decorative only. -->
        <div class="preview -mx-6 -mt-6 mb-6 sm:-mx-7 sm:-mt-7" aria-hidden="true">
          <img src="/icon/128.png" alt="" class="h-9 w-9 rounded-lg" />
          <svg class="mt-4 block h-16 w-full" viewBox="0 0 320 64" preserveAspectRatio="none">
            <path class="preview-area" d="M0 50 L40 44 L80 47 L120 34 L160 38 L200 24 L240 28 L280 14 L320 10 L320 64 L0 64 Z" />
            <path class="preview-line" d="M0 50 L40 44 L80 47 L120 34 L160 38 L200 24 L240 28 L280 14 L320 10" />
          </svg>
          <div class="mt-3 flex h-2 gap-1 overflow-hidden rounded-full">
            <span v-for="part in previewParts" :key="part.name" class="preview-part" :style="{ flexGrow: part.share, opacity: part.opacity }" />
          </div>
          <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li v-for="part in previewParts" :key="part.name" class="flex items-center gap-1.5">
              <span class="preview-key" :style="{ opacity: part.opacity }" />{{ part.name }}
            </li>
          </ul>
        </div>

        <DialogHeader class="text-left">
          <DialogTitle class="text-2xl font-semibold leading-tight tracking-tight">{{ $t('tour.welcome_title') }}</DialogTitle>
          <DialogDescription class="text-[15px] leading-relaxed">{{ $t('tour.welcome_text') }}</DialogDescription>
        </DialogHeader>

        <div class="mt-6 flex flex-col gap-3">
          <!-- The real account is the goal, so it is the one filled action; the sample stays a quiet alternative. -->
          <button type="button" class="choice choice-primary" @click="view = 'pick'">
            <span class="choice-icon"><Landmark class="h-5 w-5" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1">
              <span class="choice-title">{{ $t('tour.connect_any_title') }}</span>
              <span class="choice-text">{{ $t('tour.connect_text') }}</span>
            </span>
            <ArrowRight class="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
          <button type="button" class="choice" @click="view = 'sample'">
            <span class="choice-icon"><Sparkles class="h-5 w-5" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1">
              <span class="choice-title">{{ $t('tour.sample.choice_title') }}</span>
              <span class="choice-text">{{ $t('tour.sample.choice_text') }}</span>
            </span>
            <ArrowRight class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <button type="button" class="link mt-6 justify-self-start" @click="dismiss()">{{ $t('tour.dont_show') }}</button>
      </template>

      <!-- Pick the broker to start with; the others can follow later from Help. -->
      <template v-else-if="view === 'pick'">
        <button type="button" class="link mb-4 inline-flex items-center gap-1 justify-self-start" @click="view = 'choose'">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ $t('tour.back') }}
        </button>
        <DialogHeader class="text-left">
          <DialogTitle class="text-xl leading-tight tracking-tight">{{ $t('tour.pick_title') }}</DialogTitle>
          <DialogDescription class="leading-relaxed">{{ $t('tour.pick_text') }}</DialogDescription>
        </DialogHeader>

        <div class="mt-6 flex flex-col gap-2">
          <button v-for="(broker, key) in TOUR_BROKERS" :key="key" type="button" class="choice" @click="view = String(key)">
            <span class="choice-icon"><Landmark class="h-5 w-5" aria-hidden="true" /></span>
            <span class="choice-title min-w-0 flex-1">{{ broker.name }}</span>
            <ArrowRight class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      </template>

      <!-- Sample data -->
      <template v-else-if="view === 'sample'">
        <button type="button" class="link mb-4 inline-flex items-center gap-1 justify-self-start" @click="view = 'choose'">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ $t('tour.back') }}
        </button>
        <DialogHeader class="text-left">
          <DialogTitle class="text-xl leading-tight tracking-tight">{{ $t('tour.sample.title') }}</DialogTitle>
          <DialogDescription class="leading-relaxed">
            {{ hasData ? $t('tour.sample.has_data') : $t('tour.sample.text') }}
          </DialogDescription>
        </DialogHeader>

        <p v-if="sampleError" class="mt-4 text-sm text-destructive" role="alert">{{ $t('tour.sample.failed') }}</p>

        <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button v-if="!hasData" :disabled="loadingSample" @click="loadSample()">
            {{ loadingSample ? $t('tour.sample.loading') : $t('tour.sample.load') }}
          </Button>
          <a :href="sampleUrl" download="qx-plus-sample-data.json" class="link inline-flex items-center gap-1.5">
            <Download class="h-4 w-4" aria-hidden="true" />{{ $t('tour.sample.download') }}
          </a>
        </div>
      </template>

      <!-- Connect a broker -->
      <!-- Connected: proof of what arrived, so the user can check it against the bank before trusting it -->
      <template v-else-if="broker && finished">
        <DialogHeader class="text-left">
          <div class="flex items-center gap-3.5">
            <span ref="doneBadge" class="done-badge" :style="{ background: SYNC_COLOR_DONE }" aria-hidden="true"><Check class="h-6 w-6" stroke-width="3" /></span>
            <div class="min-w-0">
              <DialogTitle class="text-2xl font-semibold leading-tight tracking-tight">{{ $t('tour.connected_title') }}</DialogTitle>
              <!-- The account as the user knows it from the bank: broker name and the last digits, nothing more. -->
              <p class="mt-0.5 text-sm text-muted-foreground">
                {{ $t('tour.connected_account', { broker: broker.name }) }}<span v-if="summary.account" class="ml-1.5 tabular-nums">{{ summary.account }}</span>
              </p>
            </div>
          </div>
          <DialogDescription class="mt-4 text-[15px] leading-relaxed">{{ $t('tour.connected_text', { broker: broker.name }) }}</DialogDescription>
        </DialogHeader>

        <!-- The sum first, as the one big number; the rows below are what the user checks against the bank. -->
        <div class="receipt mt-5">
          <div class="receipt-total">
            <span>{{ $t('tour.stat_total') }}</span>
            <strong>{{ numberToGerman(summary.invested + (summary.cash || 0), false, 2) }} €</strong>
          </div>
          <dl>
            <div class="receipt-row">
              <dt>
                {{ $t('tour.stat_positions') }}
                <span v-if="!summary.positions" class="receipt-hint">{{ $t('tour.no_positions_hint') }}</span>
              </dt>
              <dd>{{ summary.positions ? numberToGerman(summary.positions, true) : $t('tour.no_positions') }}</dd>
            </div>
            <div v-if="summary.positions" class="receipt-row">
              <dt>{{ $t('tour.stat_invested') }}</dt>
              <dd>{{ numberToGerman(summary.invested, false, 2) }} €</dd>
            </div>
            <div class="receipt-row">
              <dt>{{ $t('tour.stat_cash') }}</dt>
              <dd>{{ summary.cash === null ? '–' : `${numberToGerman(summary.cash, false, 2)} €` }}</dd>
            </div>
            <!-- Only flatex syncs purchase dates; elsewhere "0 of 0" would read as something missing. -->
            <div v-if="view === 'flatex' && summary.positions" class="receipt-row">
              <dt>{{ $t('tour.stat_dates') }}</dt>
              <dd>{{ $t('tour.dates_of', { found: summary.withDates, total: summary.positions }) }}</dd>
            </div>
          </dl>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button @click="finish()">{{ $t('tour.show_portfolio') }}</Button>
          <button type="button" class="link" @click="connectAnother()">{{ $t('tour.connect_another') }}</button>
        </div>
      </template>

      <template v-else-if="broker">
        <button v-if="!started" type="button" class="link mb-4 inline-flex items-center gap-1 justify-self-start" @click="view = 'pick'">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ $t('tour.back') }}
        </button>
        <DialogHeader class="text-left">
          <DialogTitle class="text-xl leading-tight tracking-tight">{{ $t('tour.connect_title', { broker: broker.name }) }}</DialogTitle>
          <DialogDescription class="leading-relaxed">
            {{ $t(started ? 'tour.in_progress' : 'tour.before_start', { broker: broker.name }) }}
          </DialogDescription>
        </DialogHeader>

        <ol class="mt-6">
          <li v-for="(step, index) in broker.steps" :key="step" class="path-step"
            :class="{ 'is-done': index < currentIndex, 'is-current': index === currentIndex }"
            :aria-current="index === currentIndex ? 'step' : undefined">
            <span class="path-marker" aria-hidden="true">
              <Check v-if="index < currentIndex" class="h-3.5 w-3.5" stroke-width="3" />
              <template v-else>{{ Number(index) + 1 }}</template>
            </span>
            <div class="pb-5">
              <div class="font-medium leading-6 text-foreground">
                {{ $t(`tour.${tourStepTitleKey(view, String(step))}`, { broker: broker.name }) }}
                <span v-if="index < currentIndex" class="sr-only">({{ $t('tour.step_done') }})</span>
              </div>
              <div class="text-sm leading-relaxed text-muted-foreground">{{ $t(`tour.${tourStepTextKey(view, String(step))}`, { broker: broker.name }) }}</div>
            </div>
          </li>
        </ol>

        <div class="mt-1 flex flex-wrap items-center justify-between gap-3">
          <Button @click="startBroker()">
            {{ started ? $t('tour.open_again', { broker: broker.name }) : $t('tour.start', { broker: broker.name }) }}
          </Button>
          <button v-if="started" type="button" class="link" @click="dismiss()">{{ $t('tour.stop_guide') }}</button>
        </div>
      </template>

    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Check, Download, Landmark, Sparkles } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { importAll, resetAll } from '@/lib/storage-utils';
import { TOUR_BROKERS, TOUR_DATA_KEYS, tourHasBrokerData, tourStepTextKey, tourStepTitleKey, tourSummary } from '~/utils/tour-utils';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { ACCOUNT_BROKERS } from '~/utils/account-utils';
import { numberToGerman } from '~/utils/helper';
import { SYNC_COLOR_DONE, SYNC_COLOR_IDLE } from '~/utils/constants';
import sampleUrl from '@/examples/sample_backup.json?url';

// Held back while the account-switch prompt needs an answer first.
const props = defineProps<{ blocked?: boolean }>();
const open = defineModel<boolean>('open', { default: false });
const { locale } = useI18n();
const route = useRoute();

// Equal shares: the preview shows "all brokers, one total", not anyone's numbers. Shades of one colour keep it in the app theme.
const previewParts = ACCOUNT_BROKERS.map((name, index) => ({
  name,
  share: 1,
  opacity: 1 - index * (0.75 / Math.max(1, ACCOUNT_BROKERS.length - 1)),
}));

const view = ref('choose');
const tour = ref<any>(null);
const hasData = ref(false);
const loadingSample = ref(false);
const sampleError = ref(false);
const doneBadge = ref<HTMLElement | null>(null);
// Closing by hand means "not now": live updates must not pop it open again in this session.
let closedByUser = false;

const broker = computed(() => TOUR_BROKERS[view.value] || null);
const started = computed(() => tour.value?.broker === view.value && broker.value?.steps.includes(tour.value?.step));
const finished = computed(() => started.value && tour.value.step === 'finish');
// 'finish' is the last step, so reaching it ticks every step.
const currentIndex = computed(() => {
  if (!started.value) return -1;
  return finished.value ? broker.value.steps.length : broker.value.steps.indexOf(tour.value.step);
});

const storedRows = ref<any>({});
const brokerKeys = Object.values(TOUR_BROKERS).flatMap((b:any) => [b.rowsKey, b.idKey]);
const watchedKeys = ['TOUR', 'TOUR_DISMISSED', 'SAMPLE_DATA', ...TOUR_DATA_KEYS, ...brokerKeys];

const summary = computed(() => {
  if (!broker.value) return tourSummary([], '', null);
  return tourSummary(storedRows.value[broker.value.rowsKey], broker.value.name, storedRows.value[broker.value.idKey]);
});

// One burst on the first time a guide reaches the end, never again on reopen.
// Own key, not on TOUR: a restarted guide writes a fresh TOUR and would celebrate again.
watch(() => finished.value && open.value && !props.blocked, (show) => { if (show) void celebrateWhenVisible(); });

// The guide usually finishes while the user is on the bank tab; a burst in this hidden tab would be over before anyone looks.
async function celebrateWhenVisible() {
  if (document.visibilityState !== 'visible') {
    document.addEventListener('visibilitychange', () => { void celebrateWhenVisible(); }, { once: true });
    return;
  }
  if (!finished.value || !open.value || (await chrome.storage.local.get('TOUR_CELEBRATED')).TOUR_CELEBRATED) return;
  await chrome.storage.local.set({ TOUR_CELEBRATED: true });
  burstConfetti();
}

// shortcut: hand-rolled canvas burst, no package; swap in canvas-confetti if more effects are ever wanted.
function burstConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '100' });
  document.body.append(canvas);
  const ratio = devicePixelRatio || 1;
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);

  const primary = `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()})`;
  const colors = [SYNC_COLOR_IDLE, SYNC_COLOR_DONE, primary, '#5b8def'];
  // Two side cannons frame the dialog instead of covering its numbers; a small pop from the check ties it to the success.
  const badge = doneBadge.value?.getBoundingClientRect();
  const origins = [
    { x: 0, y: innerHeight, angle: -62, spread: 28, min: 900, max: 1500, count: 80 },
    { x: innerWidth, y: innerHeight, angle: -118, spread: 28, min: 900, max: 1500, count: 80 },
    ...(badge ? [{ x: badge.left + badge.width / 2, y: badge.top + badge.height / 2, angle: -90, spread: 180, min: 200, max: 520, count: 36 }] : []),
  ];
  const pieces = origins.flatMap(o => Array.from({ length: o.count }, () => {
    const angle = (o.angle + (Math.random() - 0.5) * o.spread * 2) * Math.PI / 180;
    const speed = o.min + Math.random() * (o.max - o.min);
    return {
      x: o.x, y: o.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6, spin: Math.random() * Math.PI, turn: (Math.random() - 0.5) * 12,
      flip: Math.random() * Math.PI, flipSpeed: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)]!,
    };
  }));
  const DURATION = 3200;
  const FADE = 900;
  // Clock starts on the first painted frame, not at the call, so a throttled tab cannot eat the animation.
  let startedAt = 0;
  let last = 0;

  // Seconds-based, so a 144 Hz screen does not play it twice as fast as a 60 Hz one.
  function frame(now:number) {
    if (!startedAt) startedAt = last = now;
    const elapsed = now - startedAt;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.globalAlpha = Math.min(1, Math.max(0, (DURATION - elapsed) / FADE));
    const drag = Math.pow(0.35, dt);
    for (const p of pieces) {
      p.vx *= drag;
      p.vy = p.vy * drag + 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.turn * dt;
      p.flip += p.flipSpeed * dt;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.spin);
      // Squashing one axis reads as a paper strip turning over in the air.
      context.scale(1, Math.cos(p.flip));
      context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      context.restore();
    }
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

async function refresh() {
  const stored = await chrome.storage.local.get(watchedKeys);
  storedRows.value = stored;
  tour.value = stored.TOUR || null;
  hasData.value = tourHasBrokerData(stored);

  const step = tour.value?.step;
  // An explicit restart from Help overrides an earlier close.
  if (step === 'choose') closedByUser = false;
  if (closedByUser) return;

  const inProgress = TOUR_BROKERS[tour.value?.broker]?.steps.includes(step);
  // Unasked opens only on Home: popping up over Settings right after "Clear data" reads as an error.
  const automatic = route.path === '/' && (inProgress || (!hasData.value && !stored.TOUR_DISMISSED && !stored.SAMPLE_DATA));
  const shouldOpen = step === 'choose' || automatic;
  if (shouldOpen && !open.value) view.value = tour.value?.broker || 'choose';
  open.value = shouldOpen;
}

async function onOpenChange(value:boolean) {
  if (value) return;
  closedByUser = true;
  open.value = false;
  // A restart request is used up once seen; an unfinished broker guide stays so it can resume.
  if (tour.value?.step === 'choose') await chrome.storage.local.remove('TOUR');
}

async function dismiss() {
  console.log('WelcomeDialog dismiss');
  closedByUser = true;
  open.value = false;
  await chrome.storage.local.set({ TOUR_DISMISSED: true });
  await chrome.storage.local.remove('TOUR');
}

async function loadSample() {
  console.log('WelcomeDialog loadSample');
  loadingSample.value = true;
  sampleError.value = false;
  try {
    const blob = await (await fetch(sampleUrl)).blob();
    // The file carries SAMPLE_DATA itself, so importing it from Settings marks it as sample too.
    await importAll(new File([blob], 'sample_backup.json', { type: 'application/json' }));
    location.reload();
  } catch (err) {
    /* importAll restores the previous storage on failure, so only the message is needed */
    console.error('loadSample error:', err);
    sampleError.value = true;
    loadingSample.value = false;
  }
}

async function startBroker() {
  const key = view.value;
  console.log('WelcomeDialog startBroker', key);
  const { SAMPLE_DATA } = await chrome.storage.local.get('SAMPLE_DATA');
  // The sample has a fake account for this broker; left in, the real login would raise the "new account" prompt.
  if (SAMPLE_DATA) await resetAll();
  // lang rides along: the bank page cannot read the dashboard's language setting.
  if (!started.value) await chrome.storage.local.set({ TOUR: { broker: key, step: TOUR_BROKERS[key].steps[0], lang: locale.value } });
  window.open(TOUR_BROKERS[key].url, '_blank', 'noopener');
  if (SAMPLE_DATA) location.reload();
}

async function finish() {
  open.value = false;
  await chrome.storage.local.set({ TOUR: { ...tour.value, step: 'done' } });
}

// Same restart Help uses: a fresh 'choose' keeps the dialog open, here straight on the broker list.
async function connectAnother() {
  console.log('WelcomeDialog connectAnother');
  view.value = 'pick';
  await chrome.storage.local.set({ TOUR: { broker: null, step: 'choose' } });
}

watch(() => route.path, () => { void refresh(); });

function onStorageChange(changes:any, area:string) {
  if (area === 'local' && watchedKeys.some(key => changes[key])) void refresh();
}

onMounted(async () => {
  await refresh();
  chrome.storage.onChanged.addListener(onStorageChange);
});
onUnmounted(() => chrome.storage.onChanged.removeListener(onStorageChange));
</script>

<style scoped>
.preview {
  padding: 20px 24px 16px;
  background: hsl(var(--muted));
  border-bottom: 1px solid hsl(var(--border));
}
@media (min-width: 640px) { .preview { padding: 24px 28px 18px; } }
.preview-line {
  fill: none;
  stroke: hsl(var(--primary));
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.preview-area { fill: hsl(var(--primary) / 0.08); }
.preview-part { flex-basis: 0; background: hsl(var(--primary)); }
.preview-key { width: 8px; height: 8px; border-radius: 2px; background: hsl(var(--primary)); }

.choice {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  transition: background-color 150ms, opacity 150ms;
}
.choice:hover { background: hsl(var(--accent)); }
.choice-title { display: block; font-size: 15px; font-weight: 600; line-height: 1.4; }
.choice-text { display: block; margin-top: 2px; font-size: 14px; line-height: 1.45; color: hsl(var(--muted-foreground)); }
.choice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: hsl(var(--muted));
}
.choice-primary {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.choice-primary:hover { background: hsl(var(--primary)); opacity: 0.92; }
.choice-primary .choice-text { color: hsl(var(--primary-foreground) / 0.75); }
.choice-primary .choice-icon { background: hsl(var(--primary-foreground) / 0.12); }
.choice:focus-visible, .link:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

.link {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  text-decoration: underline;
  text-underline-offset: 3px;
  border-radius: 4px;
}
.link:hover { color: hsl(var(--foreground)); }

/* Background is SYNC_COLOR_DONE inline: the bank page's "Synced" green, so both ends of the guide agree. */
.done-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  color: #fff;
}

.receipt {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
}
/* The sum is the payoff of the whole guide, so it is the one big number in the dialog. */
.receipt-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: hsl(var(--muted) / 0.6);
  border-bottom: 1px solid hsl(var(--border));
}
.receipt-total span { font-size: 15px; font-weight: 600; color: hsl(var(--foreground)); }
.receipt-total strong {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.015em;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
}
.receipt dl { padding: 2px 16px; }
.receipt-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 0;
  font-size: 14px;
}
.receipt-row + .receipt-row { border-top: 1px solid hsl(var(--border)); }
.receipt-row dt { color: hsl(var(--muted-foreground)); }
.receipt-row dd {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
  text-align: right;
  overflow-wrap: anywhere;
}
.receipt-hint { display: block; margin-top: 1px; font-size: 13px; color: hsl(var(--muted-foreground) / 0.85); }

.path-step {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  column-gap: 14px;
}
/* The rail between markers fills as steps are done, so progress reads at a glance. */
.path-step:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 28px;
  bottom: 4px;
  width: 2px;
  background: hsl(var(--border));
}
.path-step.is-done:not(:last-child)::before { background: hsl(var(--primary)); }
.path-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  border: 2px solid hsl(var(--border));
  background: hsl(var(--background));
}
.is-done .path-marker {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.is-current .path-marker {
  border-color: hsl(var(--primary));
  color: hsl(var(--foreground));
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1);
}

@media (prefers-reduced-motion: no-preference) {
  .path-marker { transition: background-color 300ms, border-color 300ms, box-shadow 300ms; }
}
</style>
