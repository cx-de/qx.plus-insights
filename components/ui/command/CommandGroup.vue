<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ListboxGroup, ListboxGroupLabel } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  heading?: string
}>()
</script>

<template>
  <ListboxGroup :class="cn('overflow-hidden p-1 text-foreground', props.class)">
    <ListboxGroupLabel v-if="heading" class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
      {{ heading }}
    </ListboxGroupLabel>
    <slot />
  </ListboxGroup>
</template>
