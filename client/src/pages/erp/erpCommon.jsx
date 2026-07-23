import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';

// --- Small helpers ----------------------------------------------------------
export function humanize(v) {
  return String(v ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** '2026-07-22T09:00:00Z' -> 'just now' / '5m ago' / '3h ago' / '2d ago'. */
export function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Split a pasted/scanned list of barcodes on commas, whitespace or newlines. */
export function splitCodes(text) {
  return String(text || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** List envelopes are { data: rows, meta? } — normalize defensively. */
export function rowsOf(envelope) {
  if (Array.isArray(envelope?.data)) return envelope.data;
  if (Array.isArray(envelope?.data?.items)) return envelope.data.items;
  if (Array.isArray(envelope)) return envelope;
  return [];
}

export function totalOf(envelope, rows) {
  return envelope?.meta?.total ?? rows.length;
}

const STATUS_COLORS = {
  in_stock: 'success', consumed: 'default', dispatched: 'info',
  pending: 'warning', passed: 'success', failed: 'error',
  open: 'info', partial: 'warning', completed: 'success',
  available: 'success', assigned: 'info',
  active: 'success', inactive: 'default',
};
export const chipColor = (v) => STATUS_COLORS[v] || 'default';

export function StatusChip({ value }) {
  if (!value) return '—';
  return <Chip size="small" label={humanize(value)} color={chipColor(value)} />;
}

/** Barcode / code cell styling. */
export function Mono({ children }) {
  return (
    <Box
      component="code"
      sx={{
        px: 0.75, py: 0.25, borderRadius: 1, bgcolor: 'action.hover',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

/** Page-local bottom-center Snackbar, one per tab. */
export function useSnack() {
  const [snack, setSnack] = useState(null); // { severity, message }
  const snackEl = (
    <Snackbar
      open={Boolean(snack)}
      autoHideDuration={6000}
      onClose={() => setSnack(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)} sx={{ width: '100%' }}>
        {snack?.message || ''}
      </Alert>
    </Snackbar>
  );
  return { setSnack, snackEl };
}

// --- Form value conversion --------------------------------------------------
export function toFormState(fields, record) {
  const form = {};
  for (const f of fields) {
    const raw = record ? (f.from ? f.from(record) : record[f.name]) : f.default;
    if (f.type === 'date') form[f.name] = raw ? String(raw).slice(0, 10) : '';
    else if (f.type === 'number') form[f.name] = raw === 0 || raw ? String(raw) : '';
    else form[f.name] = raw ?? '';
  }
  return form;
}

export function buildPayload(fields, form) {
  const payload = {};
  for (const f of fields) {
    let v = form[f.name];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      v = n;
    } else if (f.type === 'codes') {
      v = splitCodes(v);
      if (!v.length) continue;
    }
    payload[f.name] = v;
  }
  return payload;
}

// --- Generic field renderer -------------------------------------------------
export function FieldInput({ field, value, setField }) {
  const common = { fullWidth: true, size: 'small', label: field.label, required: field.required };

  switch (field.type) {
    case 'textarea':
      return (
        <TextField {...common} multiline minRows={field.minRows || 3} helperText={field.help}
          value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />
      );
    case 'codes':
      return (
        <TextField {...common} multiline minRows={field.minRows || 3}
          helperText={field.help || 'Comma / newline separated'}
          value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />
      );
    case 'number':
      return (
        <TextField {...common} type="number" inputProps={{ min: field.min, max: field.max }}
          helperText={field.help} value={value ?? ''}
          onChange={(e) => setField(field.name, e.target.value)} />
      );
    case 'date':
      return (
        <TextField {...common} type="date" InputLabelProps={{ shrink: true }}
          value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />
      );
    case 'password':
      return (
        <TextField {...common} type="password" autoComplete="new-password" helperText={field.help}
          value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />
      );
    case 'select': {
      // Options may be plain strings or { value, label } pairs.
      const opts = (field.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: humanize(o) }));
      return (
        <TextField {...common} select helperText={field.help} value={value ?? ''}
          onChange={(e) => setField(field.name, e.target.value)}>
          {!field.required && <MenuItem value=""><em>— None —</em></MenuItem>}
          {opts.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
      );
    }
    default:
      return (
        <TextField {...common} helperText={field.help} value={value ?? ''}
          onChange={(e) => setField(field.name, e.target.value)} />
      );
  }
}

// --- Create / edit dialog ---------------------------------------------------
/**
 * Config-driven dialog. `fields` MUST be a stable reference (module const or
 * useMemo) — the hydrate effect keys on it.
 */
export function RecordDialog({ open, onClose, onSave, saving, error, title, intro, fields, record }) {
  const [form, setForm] = useState({});
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(toFormState(fields, record));
      setLocalError('');
    }
  }, [open, record, fields]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleSave = () => {
    for (const f of fields) {
      if (f.required && !String(form[f.name] ?? '').trim()) {
        setLocalError(`${f.label} is required`);
        return;
      }
    }
    onSave(buildPayload(fields, form));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {(error || localError) && <Alert severity="error" sx={{ mb: 2 }}>{error || localError}</Alert>}
        {intro && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{intro}</Typography>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          {fields.map((f) => (
            <Box key={f.name} sx={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
              <FieldInput field={f} value={form[f.name]} setField={setField} />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// --- Table ------------------------------------------------------------------
/**
 * Columns: [{ key, label, align?, render?(row), chip?, mono?, primary? }].
 * `actions(row)` renders the right-aligned action buttons.
 */
export function ErpTable({ columns, rows, loading, error, emptyText = 'Nothing here yet.', actions }) {
  if (loading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { whiteSpace: 'nowrap' } }}>
            {columns.map((col) => (
              <TableCell key={col.key} align={col.align}>{col.label}</TableCell>
            ))}
            {actions && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row._id || row.externalId} hover>
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align}>
                  {col.render
                    ? col.render(row)
                    : col.chip
                      ? <StatusChip value={row[col.key]} />
                      : col.mono
                        ? (row[col.key] ? <Mono>{row[col.key]}</Mono> : '—')
                        : col.primary
                          ? <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{row[col.key] || '—'}</Typography>
                          : (row[col.key] ?? '—')}
                </TableCell>
              ))}
              {actions && (
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {actions(row)}
                  </Box>
                </TableCell>
              )}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + (actions ? 1 : 0)}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                  {emptyText}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}
