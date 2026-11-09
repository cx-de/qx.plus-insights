import type { InjectionKey, Ref } from 'vue'

export { default as Command } from './Command.vue'
export { default as CommandEmpty } from './CommandEmpty.vue'
export { default as CommandGroup } from './CommandGroup.vue'
export { default as CommandInput } from './CommandInput.vue'
export { default as CommandItem } from './CommandItem.vue'
export { default as CommandList } from './CommandList.vue'
export { default as CommandSeparator } from './CommandSeparator.vue'

// Shared between Command and its items: the search text and which items still match it.
export interface CommandFilterState {
  search: Ref<string>
  items: Map<symbol, string>
  visibleCount: Ref<number>
}
export const commandFilterKey: InjectionKey<CommandFilterState> = Symbol('commandFilter')
