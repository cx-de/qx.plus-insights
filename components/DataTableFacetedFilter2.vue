<script setup lang="ts">
// @ts-nocheck
import type { Column } from '@tanstack/vue-table'
import type { Component } from 'vue'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { 
  Check as CheckIcon,
  PlusCircle as PlusCircledIcon,
  Filter,
} from 'lucide-vue-next';

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
      <Button variant="icon" size="sm" class="h-8 border-dashed">
        <!-- <PlusCircledIcon class="mr-2 h-4 w-4" /> -->
        <Filter class="mr-2 h-4 w-4" />
        <!-- {{ title }} -->
        <template v-if="selectedValues.size > 0">
          <span class="mx-2 h-4 w-px bg-muted inline-block align-middle" />
          <span class="rounded-sm px-1 text-xs font-normal bg-secondary text-secondary-foreground lg:hidden">
            {{ selectedValues.size }}
          </span>
          <div class="hidden space-x-1 lg:flex">
            <span
              v-if="selectedValues.size > 2"
              class="rounded-sm px-1 text-xs font-normal bg-secondary text-secondary-foreground"
            >
              {{ selectedValues.size }} {{ $t('selected') }}
            </span>

            <template v-else>
              <span v-for="option in options.filter((option) => selectedValues.has(option.value))"
                :key="option.value"
                class="rounded-sm px-1 text-xs font-normal bg-secondary text-secondary-foreground">
                {{ option.label }}
              </span>
            </template>
          </div>
        </template>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[220px] p-2" align="start">
      <div class="flex flex-col gap-1">
        <button v-for="option in options"
          :key="option.value" type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          @click="toggleValue(option.value)">
          <div :class="cn(
              'mr-1 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
              selectedValues.has(option.value)
                ? 'bg-primary text-primary-foreground'
                : 'opacity-50 [&_svg]:invisible',
            )">
            <CheckIcon class="h-3.5 w-3.5" />
          </div>
          <span class="truncate">{{ option.label }}</span>
          <span v-if="facets?.get(option.value)" class="ml-auto flex h-4 min-w-4 items-center justify-center font-mono text-xs">
            {{ facets.get(option.value) }}
          </span>
        </button>

        <div v-if="selectedValues.size > 0" class="my-1 h-px bg-muted" />
          <button v-if="selectedValues.size > 0" type="button"
          class="w-full justify-center rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          @click="clearFilters">
          {{  $t('clear_filters') }}
          </button>
        </div>
    </PopoverContent>
  </Popover>
</template>