import * as XLSX from 'xlsx';
import ApiError from '../../utils/ApiError.js';
import { getAI } from '../../services/ai/index.js';

/**
 * File-import parsing shared by every module's "Import" button.
 * Spreadsheets (.xlsx/.xls/.csv) parse locally; PDFs are text-extracted and
 * structured by the configured AI provider against the caller's target fields.
 * Parsing NEVER writes anything — the client previews the rows and saves them
 * through each module's normal create endpoint (validation + realtime intact).
 */

const SPREADSHEET_RX = /\.(xlsx|xls|csv)$/i;
const PDF_RX = /\.pdf$/i;
const MAX_ROWS = 500;

export async function parseImportFile(file, { entity = 'records', fields = [] } = {}) {
  if (SPREADSHEET_RX.test(file.originalname)) return parseSpreadsheet(file.buffer);
  if (PDF_RX.test(file.originalname)) return parsePdf(file.buffer, { entity, fields });
  throw ApiError.badRequest('Unsupported file type — upload .xlsx, .xls, .csv or .pdf');
}

/* ------------------------------ Spreadsheets ------------------------------ */

function parseSpreadsheet(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw ApiError.badRequest('Could not read this file as a spreadsheet');
  }

  const sheetName = wb.SheetNames[0];
  const ws = sheetName && wb.Sheets[sheetName];
  if (!ws) throw ApiError.badRequest('The spreadsheet has no sheets');

  // header:1 → array-of-arrays; raw:false formats numbers/dates as display
  // strings (dates forced to ISO via dateNF) so the client previews exactly
  // what will be submitted.
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  const nonEmpty = grid.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (nonEmpty.length < 2) {
    throw ApiError.badRequest('No data rows found — expected a header row plus at least one data row');
  }

  const columns = nonEmpty[0].map((h, i) => String(h || '').trim() || `Column ${i + 1}`);
  const rows = nonEmpty
    .slice(1, 1 + MAX_ROWS)
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, String(r[i] ?? '').trim()])));

  const truncated = nonEmpty.length - 1 > MAX_ROWS;
  return {
    columns,
    rows,
    meta: {
      source: 'spreadsheet',
      sheet: sheetName,
      ...(truncated ? { note: `Only the first ${MAX_ROWS} rows were read` } : {}),
    },
  };
}

/* ---------------------------------- PDFs ---------------------------------- */

async function parsePdf(buffer, { entity, fields }) {
  // pdf-parse v2 API: PDFParse class + getText().
  const { PDFParse } = await import('pdf-parse');

  let text = '';
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    ({ text } = await parser.getText());
  } catch {
    throw ApiError.badRequest('Could not read this PDF');
  }
  if (!text || !text.trim()) {
    throw ApiError.badRequest('No selectable text in this PDF (scanned image?) — try an Excel/CSV export instead');
  }

  const ai = getAI();
  if (ai.name === 'mock') {
    throw ApiError.badRequest('PDF import needs the AI provider configured — upload an Excel/CSV file instead');
  }

  const fieldLines = (fields || [])
    .map((f) => `- "${f.key}"${f.label && f.label !== f.key ? ` — ${f.label}` : ''}${f.hint ? ` (${f.hint})` : ''}`)
    .join('\n');

  const system =
    'You convert raw text extracted from a PDF into structured tabular JSON. ' +
    'Reply with ONLY a JSON array of flat objects — no prose, no markdown fences.';
  const prompt = [
    `The text below was extracted from a PDF that contains ${entity} data.`,
    fieldLines
      ? `Map each record to these target keys where possible (omit a key when the document has no value for it):\n${fieldLines}\nAny clearly-labelled extra values may be included under their own descriptive keys.`
      : 'Use short descriptive keys for each column you find.',
    'All values must be plain strings (dates as YYYY-MM-DD, numbers without currency symbols or thousands separators).',
    `Return at most ${MAX_ROWS} records. If the text contains no tabular records, return [].`,
    '--- PDF TEXT START ---',
    text.slice(0, 60_000),
    '--- PDF TEXT END ---',
  ].join('\n\n');

  let res;
  try {
    res = await ai.ask(prompt, { system, maxTokens: 8000, temperature: 0 });
  } catch {
    throw ApiError.badRequest(
      `The AI provider (${ai.name}) rejected the request — check its API key in the server .env, or upload an Excel/CSV export instead`
    );
  }
  const rows = extractJsonRows(res.text)
    .slice(0, MAX_ROWS)
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k), v == null ? '' : String(v)])));

  if (!rows.length) {
    throw ApiError.badRequest('Could not find a data table in this PDF — try an Excel/CSV export instead');
  }

  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { columns, rows, meta: { source: 'pdf-ai', provider: res.provider, model: res.model } };
}

/** Pull the first JSON array out of an AI reply (tolerates fences/preamble). Exported for tests. */
export function extractJsonRows(text = '') {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : [];
  } catch {
    return [];
  }
}
