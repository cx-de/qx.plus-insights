<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, provide, ref, shallowReactive } from 'vue'
import { ListboxRoot } from 'reka-ui'
import { cn } from '@/lib/utils'
import { commandFilterKey } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const search = ref('')
const items = shallowReactive(new Map<symbol, string>())
const needle = computed(() => search.value.trim().toLowerCase())
const visibleCount = computed(() => {
  if (!needle.value) return items.size
  let count = 0
  for (const text of items.values()) if (text.includes(needle.value)) count++
  return count
})

provide(commandFilterKey, { search, items, visibleCount })
</script>

<template>
  <ListboxRoot :class="cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground', props.class)">
    <slot />
  </ListboxRoot>
</template>
