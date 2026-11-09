<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { inject } from 'vue'
import { ListboxFilter } from 'reka-ui'
import { Search } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { commandFilterKey } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
  placeholder?: string
}>()

const filter = inject(commandFilterKey)!
</script>

<template>
  <div class="flex items-center border-b px-3">
    <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
    <ListboxFilter v-model="filter.search.value" auto-focus :placeholder="placeholder" :aria-label="placeholder"
      :class="cn('flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50', props.class)" />
  </div>
</template>
