import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  LinearProgress,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { importApi } from '../../api/import.api.js';
import { getErrorMessage } from '../../lib/axios.js';

const SKIP = '__skip__';
const PREVIEW_ROWS = 15;

/** Fuzzy auto-match a target field to a parsed source column. */
function guessColumn(field, columns) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const fk = norm(field.key);
  const fl = norm(field.label || field.key);
  let best = columns.find((c) => {
    const n = norm(c);
    return n === fk || n === fl;
  });
  if (!best) {
    best = columns.find((c) => {
      const n = norm(c);
      return (
        (fk && (n.includes(fk) || fk.includes(n))) ||
        (fl && (n.includes(fl) || fl.includes(n)))
      );
    });
  }
  return best || SKIP;
}

/**
 * Generic "Import from Excel / PDF" dialog used by every module form.
 *
 * Flow: pick file → server parses it (/import/parse) → map columns → preview
 * rows → Import saves each row through the module's OWN create endpoint
 * (`createFn`), so validation, audit and realtime events all fire normally.
 *
 * Props:
 * - open, onClose
 * - title       e.g. 'Import transactions'
 * - entity      short noun for the AI PDF prompt, e.g. 'finance transactions'
 * - fields      [{ key, label, required?, hint? }] target payload fields
 * - buildPayload(mapped, extras) → payload for createFn; throw Error to mark
 *                the row invalid. `extras` is [{name, value}] built from any
 *                unmapped columns when `unmappedAsExtras` is set.
 * - createFn(payload) → Promise — the module's existing create API call
 * - onDone(importedCount) — called after a successful run (invalidate queries)
 * - unmappedAsExtras  collect unmapped columns into `extras` (default false)
 */
export default function ImportDialog({
  open,
  onClose,
  title = 'Import from file',
  entity = 'records',
  fields = [],
  buildPayload,
  createFn,
  onDone,
  unmappedAsExtras = false,
}) {
  const fileRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // {columns, rows, meta}
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState({}); // fieldKey -> column | SKIP
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // {done, total}
  const [result, setResult] = useState(null); // {ok, failures: [{row, message}]}

  useEffect(() => {
    if (!open) return;
    setParsing(false);
    setParsed(null);
    setFileName('');
    setMapping({});
    setError('');
    setProgress(null);
    setResult(null);
  }, [open]);

  const pickFile = () => fileRef.current?.click();

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    setParsing(true);
    setFileName(file.name);
    try {
      const data = await importApi.parse(file, { entity, fields });
      setParsed(data);
      const auto = {};
      for (const f of fields) auto[f.key] = guessColumn(f, data.columns);
      setMapping(auto);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not read the file'));
      setParsed(null);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Columns that no target field is mapped to → become custom-field extras.
  const unmappedColumns = useMemo(() => {
    if (!parsed) return [];
    const used = new Set(Object.values(mapping).filter((c) => c !== SKIP));
    return parsed.columns.filter((c) => !used.has(c));
  }, [parsed, mapping]);

  /** Materialise one parsed row through the current mapping. */
  const materialize = (row) => {
    const mapped = {};
    for (const f of fields) {
      const col = mapping[f.key];
      mapped[f.key] = col && col !== SKIP ? String(row[col] ?? '').trim() : '';
    }
    const extras = unmappedAsExtras
      ? unmappedColumns
          .map((c) => ({ name: c, value: String(row[c] ?? '').trim() }))
          .filter((x) => x.value)
      : [];
    return { mapped, extras };
  };

  const runImport = async () => {
    if (!parsed?.rows?.length) return;
    setError('');
    const failures = [];
    let ok = 0;
    setProgress({ done: 0, total: parsed.rows.length });
    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        const { mapped, extras } = materialize(parsed.rows[i]);
        const payload = buildPayload(mapped, extras);
        // eslint-disable-next-line no-await-in-loop
        await createFn(payload);
        ok++;
      } catch (e) {
        failures.push({ row: i + 2, message: e?.response ? getErrorMessage(e, 'Rejected') : (e?.message || 'Invalid row') });
      }
      setProgress({ done: i + 1, total: parsed.rows.length });
    }
    setProgress(null);
    setResult({ ok, failures });
    if (ok > 0) onDone?.(ok);
  };

  const importing = Boolean(progress);
  const previewRows = (parsed?.rows || []).slice(0, PREVIEW_ROWS);

  return (
    <Dialog open={open} onClose={importing ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* ---- Step 1: pick a file ---- */}
        {!parsed && !result && (
          <Box
            onClick={parsing ? undefined : pickFile}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!parsing) handleFile(e.dataTransfer.files?.[0]);
            }}
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              p: 5,
              textAlign: 'center',
              cursor: parsing ? 'default' : 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <UploadFileIcon color="primary" sx={{ fontSize: 42, mb: 1 }} />
            <Typography sx={{ fontWeight: 600 }}>
              {parsing ? `Reading ${fileName}…` : 'Click to choose a file, or drag & drop'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Excel (.xlsx / .xls), CSV or PDF — first sheet, header row expected.
              PDFs are read with AI and may take a few seconds.
            </Typography>
            {parsing && <LinearProgress sx={{ mt: 2, maxWidth: 320, mx: 'auto' }} />}
          </Box>
        )}

        {/* ---- Step 2: map + preview ---- */}
        {parsed && !result && (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={fileName} onDelete={importing ? undefined : () => setParsed(null)} />
              <Chip label={`${parsed.rows.length} rows`} variant="outlined" />
              {parsed.meta?.source === 'pdf-ai' && (
                <Chip label="read with AI — double-check values" color="warning" variant="outlined" size="small" />
              )}
              {parsed.meta?.note && (
                <Typography variant="caption" color="text.secondary">{parsed.meta.note}</Typography>
              )}
            </Box>

            <Divider />
            <Typography variant="subtitle2">Match file columns to form fields</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
              {fields.map((f) => (
                <TextField
                  key={f.key}
                  select
                  size="small"
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  value={mapping[f.key] ?? SKIP}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  helperText={f.hint}
                  disabled={importing}
                >
                  <MenuItem value={SKIP}>
                    <em>— not in file —</em>
                  </MenuItem>
                  {parsed.columns.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>
              ))}
            </Box>
            {unmappedAsExtras && unmappedColumns.length > 0 && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                Unmatched columns become custom fields on each row: {unmappedColumns.join(', ')}
              </Alert>
            )}

            <Divider />
            <Typography variant="subtitle2">
              Preview {parsed.rows.length > PREVIEW_ROWS ? `(first ${PREVIEW_ROWS} of ${parsed.rows.length})` : ''}
            </Typography>
            <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {fields.map((f) => (
                      <TableCell key={f.key} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{f.label}</TableCell>
                    ))}
                    {unmappedAsExtras && unmappedColumns.length > 0 && (
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Custom fields</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row, i) => {
                    const { mapped, extras } = materialize(row);
                    return (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableRow key={i} hover>
                        {fields.map((f) => (
                          <TableCell key={f.key} sx={{ maxWidth: 180 }}>
                            <Typography variant="body2" noWrap>{mapped[f.key] || '—'}</Typography>
                          </TableCell>
                        ))}
                        {unmappedAsExtras && unmappedColumns.length > 0 && (
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                              {extras.map((x) => `${x.name}: ${x.value}`).join(' · ') || '—'}
                            </Typography>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {importing && (
              <Box>
                <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} />
                <Typography variant="caption" color="text.secondary">
                  Saving {progress.done}/{progress.total}…
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        {/* ---- Step 3: result summary ---- */}
        {result && (
          <Stack spacing={2}>
            <Alert severity={result.failures.length ? 'warning' : 'success'}>
              Imported {result.ok} of {result.ok + result.failures.length} rows.
            </Alert>
            {result.failures.length > 0 && (
              <Box sx={{ maxHeight: 240, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                {result.failures.map((f) => (
                  <Typography key={f.row} variant="body2" color="error.main">
                    Row {f.row}: {f.message}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <>
            <Button onClick={() => { setResult(null); setParsed(null); }}>Import another file</Button>
            <Button variant="contained" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={importing}>Cancel</Button>
            {parsed && (
              <Button variant="contained" onClick={runImport} disabled={importing || !parsed.rows.length}>
                {importing ? 'Importing…' : `Import ${parsed.rows.length} rows`}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
