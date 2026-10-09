import { h } from 'vue';
import { ArrowUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow } from 'lucide-vue-next';
import { Button } from '~/components/ui/button';

// Picks the arrow for a TanStack column's current sort direction.
function sortIcon(column: any) {
  const sorted = column.getIsSorted();
  if (sorted === 'asc') return ArrowUpNarrowWide;
  if (sorted === 'desc') return ArrowDownWideNarrow;
  return ArrowUpDown;
}

// Column header button that toggles sorting; pass a translated label and the table's hover classes.
export function sortableHeader(column: any, label: string, hoverClass = '') {
  return h(Button, {
    variant: 'ghost',
    class: hoverClass,
    onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
  }, () => [label, h(sortIcon(column), { class: 'ml-2 h-4 w-4' })]);
}
