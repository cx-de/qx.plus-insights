<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, inject, onUnmounted, watchEffect } from 'vue'
import { ListboxItem } from 'reka-ui'
import { cn } from '@/lib/utils'
import { commandFilterKey } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
  value: string
  // Text the search matches against; defaults to the value.
  keywords?: string
  disabled?: boolean
}>()

const emits = defineEmits<{
  (e: 'select', event: Event): void
}>()

const filter = inject(commandFilterKey)!
const id = Symbol('commandItem')
const text = computed(() => (props.keywords ?? props.value).toLowerCase())
watchEffect(() => { filter.items.set(id, text.value) })
onUnmounted(() => { filter.items.delete(id) })

// v-if, not v-show: the listbox's arrow keys would still land on hidden items.
const visible = computed(() => {
  const needle = filter.search.value.trim().toLowerCase()
  return !needle || text.value.includes(needle)
})
</script>

<template>
  <ListboxItem v-if="visible" :value="value" :disabled="disabled" @select="emits('select', $event)"
    :class="cn('relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0', props.class)">
    <slot />
  </ListboxItem>
</template>
