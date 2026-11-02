/**
 * Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, CR/LF, UTF-8 BOM).
 * Returns the header row and one record per data row, keyed by trimmed header.
 */
export interface CsvTable {
  headers: string[];
  rows: { line: number; values: Record<string, string> }[];
}

export function parseCsv(text: string): CsvTable {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      cells.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      cells.push(field);
      records.push({ line: recordLine, cells });
      cells = [];
      field = "";
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (quoted) throw new Error(`CSV: علامة اقتباس غير مغلقة قرب السطر ${recordLine}`);
  if (field !== "" || cells.length) {
    cells.push(field);
    records.push({ line: recordLine, cells });
  }
  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].cells.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    if (r.cells.length !== headers.length) {
      throw new Error(`CSV: السطر ${r.line} فيه ${r.cells.length} خانة بدل ${headers.length}`);
    }
    const values: Record<string, string> = {};
    headers.forEach((h, i) => (values[h] = r.cells[i].trim()));
    return { line: r.line, values };
  });
  return { headers, rows };
}
