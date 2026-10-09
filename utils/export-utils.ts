import * as XLSX from 'xlsx';

// "2026-10-09_14_05": sortable and safe in every OS file name.
export function fileTimestamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '_');
}

// Writes rows (plain objects, keys become the header row) to an .xlsx download.
export function downloadXlsx(rows: any[], sheetName: string, fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

// Saves ready-made CSV text as a download.
export function downloadCsv(csvText: string, fileName: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Freed after a moment: revoking right after click() can cancel the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
