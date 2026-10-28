<template>
  <div>
    <!-- Sidebar bottom (mobile: header right); a floating tab on the right covered table values -->
    <button type="button" data-support-ignore :title="$t('support')"
      class="fixed right-3 top-1.5 z-40 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:bottom-4 sm:left-2.5 sm:right-auto sm:top-auto"
      :disabled="capturing" @click="openSupport()">
      <span v-if="countdown" class="h-5 w-5 text-center leading-5 tabular-nums">{{ countdown }}</span>
      <Loader2 v-else-if="capturing" class="h-5 w-5 animate-spin" />
      <LifeBuoy v-else class="h-5 w-5" />
      <span class="sr-only">{{ $t('support') }}</span>
    </button>

    <Dialog v-model:open="isOpen">
      <!-- Screenshot beside the form on wide screens so Send never drops below the fold; without one, a plain narrow form. -->
      <DialogContent :class="['flex max-h-[92vh] flex-col gap-0 p-0', showShot ? 'max-w-6xl' : 'max-w-lg']" data-support-ignore
        @open-auto-focus.prevent="messageRef?.focus()">
        <DialogHeader class="shrink-0 border-b px-6 py-4">
          <DialogTitle class="flex items-center gap-2"><LifeBuoy class="h-5 w-5" />{{ $t('support') }}</DialogTitle>
          <DialogDescription>{{ $t('support_description') }}</DialogDescription>
        </DialogHeader>

        <div v-if="reference" class="flex flex-col items-center gap-3 px-6 pb-8 pt-6 text-center">
          <CircleCheck class="h-10 w-10 text-green-600" />
          <p class="text-sm">{{ $t('support_sent') }}</p>
          <p class="font-mono text-lg font-semibold">{{ reference }}</p>
          <Button variant="outline" @click="isOpen = false">{{ $t('support_close') }}</Button>
        </div>

        <form v-else class="grid min-h-0 flex-1 overflow-y-auto" :class="showShot && 'md:grid-cols-[minmax(0,1fr)_20rem] md:overflow-hidden'" @submit.prevent="submit">
          <section v-if="showShot" class="flex min-h-0 flex-col gap-3 bg-muted/40 p-4 md:overflow-y-auto md:p-6">
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-xs" role="toolbar" :aria-label="$t('support_annotate_hint')">
                <button v-for="item in tools" :key="item.key" type="button" :class="[iconButton, tool === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground']"
                  :title="$t(item.label)" :aria-label="$t(item.label)" :aria-pressed="tool === item.key"
                  @click="tool = item.key"><component :is="item.icon" class="h-4 w-4" /></button>
                <span class="mx-1 h-5 w-px bg-border" />
                <button v-for="c in colors" :key="c" type="button" :class="[iconButton, 'hover:bg-accent']" :aria-label="c"
                  :aria-pressed="tool !== 'redact' && color === c" @click="pickColor(c)">
                  <span class="h-4 w-4 rounded-full ring-offset-2 ring-offset-background"
                    :class="tool !== 'redact' && color === c && 'ring-2 ring-foreground'" :style="{ backgroundColor: c }" />
                </button>
                <span class="mx-1 h-5 w-px bg-border" />
                <button type="button" :class="[iconButton, 'text-muted-foreground hover:bg-accent hover:text-foreground']"
                  :title="$t('support_undo')" :aria-label="$t('support_undo')"
                  :disabled="!strokes.length" @click="undoStroke"><Undo2 class="h-4 w-4" /></button>
                <button type="button" :class="[iconButton, 'text-muted-foreground hover:bg-accent hover:text-foreground']"
                  :title="$t('support_clear')" :aria-label="$t('support_clear')"
                  :disabled="!strokes.length" @click="clearStrokes"><Eraser class="h-4 w-4" /></button>
              </div>
              <Button type="button" size="sm" variant="ghost" class="ml-auto h-8" :title="$t('support_retake_hint')"
                @click="openSupport(RETAKE_DELAY)"><Camera class="mr-1.5 h-4 w-4" />{{ $t('support_retake') }}</Button>
            </div>
            <div class="relative">
              <canvas ref="canvasRef" class="w-full touch-none rounded-md border bg-background shadow-sm"
                :class="tool === 'text' ? 'cursor-text' : 'cursor-crosshair'"
                @pointerdown="startStroke" @pointermove="moveStroke" @pointerup="endStroke" @pointerleave="endStroke" @pointercancel="endStroke" />
              <input v-if="pendingText" ref="textInputRef" v-model="pendingText.value" maxlength="80"
                class="absolute min-w-32 rounded border border-input bg-background px-1.5 py-0.5 text-sm shadow-sm"
                :style="{ left: `${pendingText.left}px`, top: `${pendingText.top}px`, color: pendingText.color }"
                @keydown.enter.prevent="commitText" @keydown.esc.stop.prevent="pendingText = null" @blur="commitText" />
            </div>
            <p class="text-xs text-muted-foreground">{{ $t('support_annotate_hint') }}</p>
          </section>

          <section class="flex min-h-0 flex-col" :class="showShot && 'border-t md:border-l md:border-t-0'">
            <div class="grid flex-1 content-start gap-4 p-4 md:overflow-y-auto md:p-6">
              <div class="grid gap-1.5">
                <label class="text-sm font-medium" for="support-message">{{ $t('support_message') }}</label>
                <textarea id="support-message" ref="messageRef" v-model="message" rows="7" maxlength="5000"
                  :placeholder="$t('support_message_placeholder')"
                  class="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                <p v-if="errors.message" class="text-xs text-destructive">{{ errors.message }}</p>
                <p v-else-if="charsNeeded" class="text-xs text-muted-foreground">{{ $t('support_chars_needed', { n: charsNeeded }) }}</p>
                <p v-if="errors.screenshot" class="text-xs text-destructive">{{ errors.screenshot }}</p>
              </div>

              <template v-if="!hasValidKey">
                <div class="grid gap-1.5">
                  <label class="text-sm font-medium" for="support-name">{{ $t('support_name') }}</label>
                  <Input id="support-name" v-model="name" maxlength="100" autocomplete="name" :placeholder="$t('support_name_placeholder')" />
                  <p v-if="errors.name" class="text-xs text-destructive">{{ errors.name }}</p>
                </div>
                <div class="grid gap-1.5">
                  <label class="text-sm font-medium" for="support-email">{{ $t('support_email') }}</label>
                  <Input id="support-email" v-model="email" type="email" maxlength="255" autocomplete="email" :placeholder="$t('support_email_placeholder')" />
                  <p v-if="errors.email" class="text-xs text-destructive">{{ errors.email }}</p>
                </div>
              </template>

              <!-- What leaves the device sits next to Send, not under the canvas. -->
              <div v-if="screenshot" class="grid gap-2.5 rounded-md border p-3 text-sm">
                <label class="flex cursor-pointer items-center justify-between gap-3">
                  {{ $t('support_include_screenshot') }}
                  <Switch v-model="includeScreenshot" />
                </label>
                <template v-if="includeScreenshot">
                  <label class="flex cursor-pointer items-center justify-between gap-3">
                    {{ $t('support_hide_numbers') }}
                    <Switch v-model="hideNumbers" />
                  </label>
                  <p class="text-xs leading-relaxed text-muted-foreground">{{ $t('support_privacy_hint') }}</p>
                </template>
                <p v-else class="text-xs text-muted-foreground">{{ $t('support_screenshot_off') }}</p>
              </div>
              <p v-else class="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{{ $t('support_no_screenshot') }}</p>
            </div>

            <div class="grid shrink-0 gap-2 border-t p-4 md:px-6">
              <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>
              <Button type="submit" class="w-full" :disabled="sending || !!charsNeeded">
                <Loader2 v-if="sending" class="mr-2 h-4 w-4 animate-spin" />
                <Send v-else class="mr-2 h-4 w-4" />
                {{ sending ? $t('support_sending') : $t('support_send') }}
              </Button>
            </div>
          </section>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { domToCanvas } from 'modern-screenshot';
import { Camera, CircleCheck, Eraser, EyeOff, Highlighter, LifeBuoy, Loader2, MoveUpRight, Pencil, Send, Square, Type, Undo2 } from 'lucide-vue-next';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { apiAuthFailed, apiKey, getApiKey, sendSupportMessage, sleep } from '~/utils/helper';

const { t, locale } = useI18n();

const colors = ['#ef4444', '#facc15', '#3b82f6'];
const tools = [
  { key: 'pen', icon: Pencil, label: 'support_tool_pen' },
  { key: 'highlight', icon: Highlighter, label: 'support_tool_highlight' },
  { key: 'rect', icon: Square, label: 'support_tool_rect' },
  { key: 'arrow', icon: MoveUpRight, label: 'support_tool_arrow' },
  { key: 'text', icon: Type, label: 'support_tool_text' },
  { key: 'redact', icon: EyeOff, label: 'support_tool_redact' },
];
// Tools drawn by dragging from a start corner, stored as x/y/w/h instead of a point list.
const DRAG_TOOLS = ['rect', 'arrow', 'redact'];
// Keeps uploads well under the backend's 3 MB / 4000 px limits.
const MAX_WIDTH = 1600;
const MASK_COLOR = '#374151';
// Seconds before a retake, so the user can open the tooltip or dropdown they want to show.
const RETAKE_DELAY = 3;
// Digit runs incl. German/English separators, so "1.234,56" is one mask, not three.
const NUMBER_RE = /\d(?:[\d.,'\s]*\d)?/g;
const iconButton = 'flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';

const isOpen = ref(false);
const capturing = ref(false);
const countdown = ref(0);
const sending = ref(false);
const screenshot = ref<HTMLCanvasElement | null>(null);
const numberMasks = ref<any[]>([]);
const hideNumbers = ref(true);
const includeScreenshot = ref(true);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const tool = ref('pen');
const color = ref(colors[0]);
const pendingText = ref<any>(null);
const textInputRef = ref<HTMLInputElement | null>(null);
const messageRef = ref<HTMLTextAreaElement | null>(null);
const strokes = ref<any[]>([]);
const name = ref('');
const email = ref('');
const message = ref('');
const errors = ref<any>({});
const formError = ref('');
const reference = ref('');
let drawing: any = null;
// Must match sendSupportMessage: a dead key is not sent, so the user needs name/email to be reachable.
const hasValidKey = computed(() => !!apiKey.value && !apiAuthFailed.value);
const showShot = computed(() => !!screenshot.value && includeScreenshot.value);
// Matches the backend's 10-character minimum, so a disabled Send says why.
const charsNeeded = computed(() => Math.max(0, 10 - message.value.trim().length));


const openSupport = async (delay = 0) => {
  console.log('openSupport', delay);
  if (capturing.value) return;
  capturing.value = true;
  isOpen.value = false;
  for (let n = delay; n > 0; n--) {
    countdown.value = n;
    await sleep(1000);
  }
  countdown.value = 0;
  // Two frames so the spinner paints before the capture blocks the main thread.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    await getApiKey();
  } catch (error) {
    /* the form still works without a key; the user just fills name/email */
    console.error('openSupport error:', error);
  }
  try {
    const capture: any = await captureViewport();
    screenshot.value = capture?.canvas || null;
    numberMasks.value = capture?.masks || [];
    strokes.value = [];
    pendingText.value = null;
    includeScreenshot.value = !!screenshot.value;
    errors.value = {};
    formError.value = '';
    reference.value = '';
    isOpen.value = true;
  } finally {
    capturing.value = false;
  }
};

const isIgnored = (el: Element | null) => !!el?.closest('[data-support-ignore]');

// Measured on the live page in viewport coordinates, which match the viewport-sized render below.
const measureNumbers = (scale: number) => {
  const rects: any[] = [];
  const add = (r: DOMRect) => {
    if (!r.width || !r.height || r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return;
    rects.push({ x: (r.left - 2) * scale, y: (r.top - 1) * scale, w: (r.width + 4) * scale, h: (r.height + 2) * scale });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!/\d/.test(node.data) || isIgnored(node.parentElement)) continue;
    for (const match of Array.from(node.data.matchAll(NUMBER_RE))) {
      range.setStart(node, match.index!);
      range.setEnd(node, match.index! + match[0].length);
      Array.from(range.getClientRects()).forEach(add);
    }
  }
  document.querySelectorAll('input, textarea').forEach((el: any) => {
    if (/\d/.test(el.value || '') && !isIgnored(el)) add(el.getBoundingClientRect());
  });
  return rects;
};

const captureViewport = async () => {
  try {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, MAX_WIDTH / width);
    const masks = measureNumbers(scale);
    const background = getComputedStyle(document.body).backgroundColor || '#ffffff';
    // Render only the viewport by shifting the page up; a full-page render of long lists hit canvas size limits.
    const shot = await domToCanvas(document.body, {
      width,
      height,
      scale,
      backgroundColor: background,
      // The dashboard ships no web fonts, so scanning every stylesheet for @font-face only costs time.
      font: false,
      style: { marginTop: `${-window.scrollY}px`, marginLeft: `${-window.scrollX}px` },
      // The Support button and any open dialog are not part of what the user is reporting.
      filter: (node: any) => {
        if (!(node instanceof Element)) return true;
        if (node.hasAttribute('data-support-ignore')) return false;
        // Rows below the fold were rendered only to be cropped away; above the fold must stay, or the scroll offset misaligns.
        // shortcut: a fixed child inside a parent below the fold is dropped too; add a position check if one shows up.
        const r = node.getBoundingClientRect();
        return !(r.height && r.top > height);
      },
    });
    // drawImage throws on a 0×0 canvas, which broke redraw() while the dialog opened.
    if (!shot.width || !shot.height) return null;
    // The shifted body no longer covers the bottom strip, which would turn black in the JPEG.
    const canvas = document.createElement('canvas');
    canvas.width = shot.width;
    canvas.height = shot.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(shot, 0, 0);
    return { canvas, masks };
  } catch (error) {
    /* a page the renderer can't handle still lets the user send a text-only message */
    console.error('captureViewport error:', error);
    return null;
  }
};

const redraw = () => {
  const canvas = canvasRef.value;
  if (!canvas || !screenshot.value) return;
  canvas.width = screenshot.value.width;
  canvas.height = screenshot.value.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(screenshot.value, 0, 0);
  // Masks are opaque fills baked into this canvas, which is what gets uploaded, so hidden values never leave the browser.
  ctx.fillStyle = MASK_COLOR;
  if (hideNumbers.value) numberMasks.value.forEach((m: any) => ctx.fillRect(m.x, m.y, m.w, m.h));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lineWidth = Math.max(3, canvas.width / 300);
  const fontSize = Math.max(16, canvas.width / 60);
  for (const stroke of strokes.value) {
    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    if (stroke.type === 'redact') {
      ctx.fillStyle = MASK_COLOR;
      ctx.fillRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === 'rect') {
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === 'arrow') {
      const angle = Math.atan2(stroke.h, stroke.w);
      const tipX = stroke.x + stroke.w;
      const tipY = stroke.y + stroke.h;
      const head = lineWidth * 4;
      ctx.beginPath();
      ctx.moveTo(stroke.x, stroke.y);
      ctx.lineTo(tipX, tipY);
      ctx.moveTo(tipX - head * Math.cos(angle - 0.5), tipY - head * Math.sin(angle - 0.5));
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX - head * Math.cos(angle + 0.5), tipY - head * Math.sin(angle + 0.5));
      ctx.stroke();
    } else if (stroke.type === 'text') {
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      // White halo keeps the label readable on both light and dark screenshots.
      ctx.lineWidth = fontSize / 5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(stroke.text, stroke.x, stroke.y);
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    } else {
      if (stroke.type === 'highlight') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = lineWidth * 5;
      }
      ctx.beginPath();
      stroke.points.forEach((p: any, i: number) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  }
};

const pickColor = (c: string) => {
  color.value = c;
  // A colour does nothing for the redact tool, so picking one means the user wants to mark.
  if (tool.value === 'redact') tool.value = 'pen';
};

const commitText = () => {
  const pending = pendingText.value;
  if (!pending) return;
  pendingText.value = null;
  if (pending.value.trim()) strokes.value.push({ type: 'text', color: pending.color, x: pending.x, y: pending.y, text: pending.value.trim() });
  redraw();
};

// DialogContent mounts lazily, so the canvas only exists after the dialog opened.
watch(canvasRef, (canvas) => { if (canvas) redraw(); });
watch(isOpen, async (open) => { if (open) { await nextTick(); redraw(); } });
watch(hideNumbers, redraw);

const pointFrom = (e: PointerEvent) => {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
};

const startStroke = (e: PointerEvent) => {
  if (!includeScreenshot.value) return;
  const p = pointFrom(e);
  if (tool.value === 'text') {
    // preventDefault keeps focus off the canvas, so the new input below keeps it.
    e.preventDefault();
    commitText();
    const rect = (e.target as Element).getBoundingClientRect();
    // Clamp so the 8rem input never pokes past the screenshot and adds a horizontal scrollbar.
    const left = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 128));
    const top = Math.max(0, Math.min(e.clientY - rect.top, rect.height - 28));
    pendingText.value = { x: p.x, y: p.y, left, top, color: color.value, value: '' };
    nextTick(() => textInputRef.value?.focus());
    return;
  }
  (e.target as Element).setPointerCapture?.(e.pointerId);
  drawing = DRAG_TOOLS.includes(tool.value)
    ? { type: tool.value, color: color.value, x: p.x, y: p.y, w: 0, h: 0 }
    : { type: tool.value, color: color.value, points: [p] };
  strokes.value.push(drawing);
};

const moveStroke = (e: PointerEvent) => {
  if (!drawing) return;
  const p = pointFrom(e);
  if (DRAG_TOOLS.includes(drawing.type)) {
    drawing.w = p.x - drawing.x;
    drawing.h = p.y - drawing.y;
  } else {
    drawing.points.push(p);
  }
  redraw();
};

const endStroke = () => {
  // A plain click with a drag tool would leave an invisible shape that still eats an undo step.
  if (DRAG_TOOLS.includes(drawing?.type) && Math.abs(drawing.w) < 4 && Math.abs(drawing.h) < 4) { strokes.value.pop(); redraw(); }
  drawing = null;
};

const undoStroke = () => { strokes.value.pop(); redraw(); };

const clearStrokes = () => { strokes.value = []; redraw(); };

const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));

const submit = async () => {
  console.log('submitSupport');
  sending.value = true;
  errors.value = {};
  formError.value = '';

  let result: any;
  try {
    const form = new FormData();
    form.append('message', message.value.trim());
    form.append('page_url', window.location.hash || '#/');
    form.append('client_version', browser.runtime.getManifest().version);
    form.append('locale', locale.value === 'en' ? 'en' : 'de');
    if (!hasValidKey.value) {
      form.append('name', name.value.trim());
      form.append('email', email.value.trim());
    }
    if (includeScreenshot.value && canvasRef.value) {
      const blob = await toBlob(canvasRef.value);
      if (blob) form.append('screenshot', blob, 'screenshot.jpg');
    }
    result = await sendSupportMessage(form);
  } catch (error) {
    /* e.g. toBlob on a tainted canvas: report it as a generic failure so the user can retry */
    console.error('submitSupport error:', error);
    result = { ok: false, status: 0, message: '', errors: {} };
  } finally {
    sending.value = false;
  }

  if (result.ok) {
    reference.value = result.reference;
    message.value = '';
    return;
  }
  // Laravel returns arrays per field; the first message is enough for an inline hint.
  errors.value = Object.fromEntries(Object.entries(result.errors).map(([k, v]: any) => [k, Array.isArray(v) ? v[0] : v]));
  // Errors on hidden fields (page_url, client_version, locale) have no inline slot, so fall back to the form error.
  const shown = ['name', 'email', 'message', 'screenshot'].some((k) => errors.value[k]);
  if (result.status === 429) formError.value = t('support_too_many');
  else if (!shown) formError.value = result.message || t('support_error');
};
</script>
