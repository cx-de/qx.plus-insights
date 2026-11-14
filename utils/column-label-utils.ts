import { storage } from '#imports';

// Extension storage, not localStorage: every open dashboard tab reads and watches the same copy.
const LABELS_KEY = 'local:COLUMN_LABELS';
const LABEL_MAX = 40;
const LABELS_MAX = 100;
// Column ids are snake_case; anything else (e.g. __proto__ from a hand-edited backup) is junk.
const ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,63}$/;

const labelClean = (value:any) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim() : '');

export function columnLabelsNormalize(raw:any) {
  const labels:Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return labels;
  for (const id of Object.keys(raw)) {
    if (Object.keys(labels).length >= LABELS_MAX) break;
    const label = labelClean(raw[id]);
    if (ID_PATTERN.test(id) && label) labels[id] = label;
  }
  return labels;
}

export function columnLabelOf(labels:any, id:string, fallback:string) {
  return labels && Object.prototype.hasOwnProperty.call(labels, id) ? labels[id] : fallback;
}

// Raw id for unrenamed columns keeps old exports byte-identical; the suffix stops XLSX keys colliding and dropping a column.
export function columnExportNames(ids:string[], labels:any) {
  const wanted = ids.map(id => columnLabelOf(labels, id, id));
  // Map, not {}: a label like "constructor" would read Object.prototype's value.
  const counts = new Map<string, number>();
  for (const name of wanted) counts.set(name, (counts.get(name) || 0) + 1);
  return wanted.map((name, i) => ((counts.get(name) as number) > 1 && name !== ids[i] ? `${name} (${ids[i]})` : name));
}

export async function columnLabelsGet() {
  return columnLabelsNormalize(await storage.getItem(LABELS_KEY));
}

// Empty or default-equal text clears the override, so the column follows the language again.
export async function columnLabelSave(id:string, label:any, defaultLabel = '') {
  console.log('columnLabelSave', id);
  const labels = await columnLabelsGet();
  const clean = labelClean(label);
  if (!clean || clean === defaultLabel) delete labels[id];
  else labels[id] = clean;
  await storage.setItem(LABELS_KEY, columnLabelsNormalize(labels));
}

export function columnLabelsWatch(onChange:(labels:Record<string, string>) => void) {
  return storage.watch(LABELS_KEY, (value) => onChange(columnLabelsNormalize(value)));
}
