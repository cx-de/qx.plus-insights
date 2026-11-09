<script setup lang="ts">
// @ts-nocheck
import type { Column } from '@tanstack/vue-table'
import type { Component } from 'vue'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

import { 
  Check as CheckIcon, 
  PlusCircle as PlusCircledIcon,
  Filter,
 } from 'lucide-vue-next'


interface DataTableFacetedFilter {
  column?: Column<any, unknown>
  title?: string
  options: {
    label: string
    value: string
  }[]
}

const props = defineProps<DataTableFacetedFilter>()

const facets = computed(() => props.column?.getFacetedUniqueValues())

// Local reactive selection state synced with column filter value
const selectedValues = ref<Set<string>>(new Set())

// Initialize and keep in sync with column
watch(
  () => props.column?.getFilterValue() as string[] | undefined,
  (vals: string[] | undefined) => {
    selectedValues.value = new Set(vals ?? [])
  },
  { immediate: true },
)

function toggleValue(value: string) {
  const isSelected = selectedValues.value.has(value)
  if (isSelected)
    selectedValues.value.delete(value)
  else
    selectedValues.value.add(value)

  const filterValues = Array.from(selectedValues.value)
  props.column?.setFilterValue(filterValues.length ? filterValues : undefined)
}

function clearFilters() {
  selectedValues.value.clear()
  props.column?.setFilterValue(undefined)
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <!-- "icon" is a size, not a variant -->
      <Button variant="ghost" size="icon" class="relative h-8 w-8"
        :class="{ 'text-primary': selectedValues.size > 0 }"
        :aria-label="title ? `${$t('filter')}: ${title}` : $t('filter')" :title="title">
        <Filter />
        <template v-if="selectedValues.size > 0">
          <span class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center 
                  rounded-full bg-primary text-primary-foreground 
                  text-[10px] font-medium leading-none tabular-nums"
          >
            {{ selectedValues.size }}
          </span>
        </template>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[220px] p-0" align="start">
      <!-- multiple + model-value: the listbox's aria-selected must match the checkboxes -->
      <Command multiple :model-value="Array.from(selectedValues)">
        <CommandInput :placeholder="title ? `${$t('search')}: ${title}` : $t('search')" />
        <CommandList>
          <CommandEmpty>{{ $t('no_results') }}</CommandEmpty>
          <CommandGroup>
            <CommandItem v-for="option in options" :key="option.value"
              :value="option.value" :keywords="option.label"
              @select="toggleValue(option.value)">
              <div :class="cn(
                  'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                  selectedValues.has(option.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'opacity-50 [&_svg]:invisible',
                )">
                <CheckIcon class="h-3.5 w-3.5" />
              </div>
              <span class="truncate">{{ option.label }}</span>
              <span v-if="facets?.get(option.value)" class="ml-auto flex h-4 min-w-4 items-center justify-center font-mono text-xs tabular-nums">
                {{ facets.get(option.value) }}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <!-- Outside the list so search never filters it out; inside, a no-match search left a lone divider. -->
        <div v-if="selectedValues.size > 0" class="border-t p-1">
          <button type="button" class="w-full rounded-sm px-2 py-1.5 text-center text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            @click="clearFilters">
            {{ $t('clear_filters') }}
          </button>
        </div>
      </Command>
    </PopoverContent>
  </Popover>
</template>