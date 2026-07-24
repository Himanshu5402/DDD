import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Avatar,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Tooltip,
  TextField,
  InputAdornment,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { usersApi } from '../../api/users.api.js';
import {
  assetsApi,
  recordsApi,
  expiriesApi,
  maintenanceApi,
  ASSET_STATUSES,
  MAINTENANCE_TYPES,
  MAINTENANCE_STATUSES,
  EXPIRY_CATEGORIES,
  EXPIRY_RECURRENCES,
  EXPIRY_STATUSES,
} from '../../api/maintenance.api.js';

// --- Small helpers ----------------------------------------------------------
function humanize(v) {
  return String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Imported file cell → enum slug: "Under Maintenance" → "under_maintenance". */
const toImportSlug = (v) => String(v).toLowerCase().trim().replace(/[\s-]+/g, '_');

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) {
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
}

function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const STATUS_COLORS = {
  operational: 'success', completed: 'success', paid: 'success',
  scheduled: 'info', in_progress: 'warning', under_maintenance: 'warning', active: 'info',
  breakdown: 'error',
  retired: 'default', cancelled: 'default',
};
const TYPE_COLORS = {
  preventive: 'info', breakdown: 'error', inspection: 'default',
  calibration: 'secondary', amc_service: 'primary',
};
const statusColor = (v) => STATUS_COLORS[v] || 'default';
const typeColor = (v) => TYPE_COLORS[v] || 'default';

function StatusChip({ value }) {
  return value ? <Chip size="small" label={humanize(value)} color={statusColor(value)} /> : '—';
}

/** Whole calendar days from today until a due date (negative once overdue). */
function daysLeftOf(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** Countdown chip coloured by urgency: overdue/today → red, ≤7d → amber. */
function DaysLeftChip({ dueDate }) {
  const d = daysLeftOf(dueDate);
  if (d === null) return '—';
  let color = 'info';
  let label = `${d} days left`;
  if (d < 0) { color = 'error'; label = `${Math.abs(d)}d overdue`; }
  else if (d === 0) { color = 'error'; label = 'Today'; }
  else if (d === 1) { color = 'warning'; label = '1 day left'; }
  else if (d <= 7) { color = 'warning'; }
  return <Chip size="small" color={color} label={label} />;
}

function money(n) {
  return n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
}

function AssetNameCell({ name, code }) {
  return (
    <Box>
      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{name || '—'}</Typography>
      {code && (
        <Typography variant="caption" color="text.secondary">
          {code}
        </Typography>
      )}
    </Box>
  );
}

// --- Form value conversion --------------------------------------------------
function toFormState(fields, record) {
  const form = {};
  for (const f of fields) {
    const raw = record ? getPath(record, f.name) : f.default;
    if (f.type === 'asset' || f.type === 'refId' || f.type === 'user') form[f.name] = raw ? (typeof raw === 'object' ? raw._id : raw) : '';
    else if (f.type === 'date') form[f.name] = raw ? String(raw).slice(0, 10) : '';
    else if (f.type === 'number') form[f.name] = raw === 0 || raw ? String(raw) : '';
    else form[f.name] = raw ?? '';
  }
  return form;
}

function buildPayload(fields, form, { editing } = {}) {
  const payload = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    let v = form[f.name];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      v = n;
    }
    setPath(payload, f.name, v);
  }
  return payload;
}

// --- Generic field renderer -------------------------------------------------
function FieldInput({ field, value, setField, assets, users, disabled }) {
  const common = { fullWidth: true, size: 'small', label: field.label, disabled };

  switch (field.type) {
    case 'textarea':
      return <TextField {...common} multiline minRows={3} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'number':
      return <TextField {...common} type="number" value={value ?? ''} inputProps={{ min: field.min, max: field.max }} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} required={field.required} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'select':
      return (
        <TextField {...common} select required={field.required} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)}>
          {field.options.map((o) => (
            <MenuItem key={o} value={o}>{humanize(o)}</MenuItem>
          ))}
        </TextField>
      );
    case 'asset':
      return (
        <TextField {...common} select required={field.required} value={value ?? ''} helperText={field.help} onChange={(e) => setField(field.name, e.target.value)}>
          {!field.required && <MenuItem value=""><em>— None —</em></MenuItem>}
          {(assets || []).map((a) => (
            <MenuItem key={a._id} value={a._id}>{a.name}{a.code ? ` — ${a.code}` : ''}</MenuItem>
          ))}
        </TextField>
      );
    case 'user':
      return (
        <TextField {...common} select value={value ?? ''} helperText={field.help} onChange={(e) => setField(field.name, e.target.value)}>
          <MenuItem value=""><em>— None —</em></MenuItem>
          {(users || []).map((u) => (
            <MenuItem key={u._id} value={u._id}>{u.name}{u.email ? ` — ${u.email}` : ''}</MenuItem>
          ))}
        </TextField>
      );
    default:
      return <TextField {...common} required={field.required} value={value ?? ''} helperText={field.help} onChange={(e) => setField(field.name, e.target.value)} />;
  }
}

// --- Create / edit dialog ---------------------------------------------------
function EntityDialog({ open, onClose, onSave, saving, error, title, fields, record, assets, users }) {
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
    onSave(buildPayload(fields, form, { editing: Boolean(record) }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{record ? `Edit ${title}` : `New ${title}`}</DialogTitle>
      <DialogContent dividers>
        {(error || localError) && <Alert severity="error" sx={{ mb: 2 }}>{error || localError}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          {fields.map((f) => (
            <Box key={f.name} sx={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
              <FieldInput
                field={f}
                value={form[f.name]}
                setField={setField}
                assets={assets}
                users={users}
                disabled={Boolean(record) && f.createOnly}
              />
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

// --- Shared list scaffolding --------------------------------------------------
function ListStates({ query }) {
  return (
    <>
      {query.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {query.error && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
    </>
  );
}

function RowActions({ perms, onEdit, onDelete }) {
  return (
    <TableCell align="right">
      {perms.update && (
        <Tooltip title="Edit">
          <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
      {perms.delete && (
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </TableCell>
  );
}

const headSx = { '& th': { whiteSpace: 'nowrap' } };

// --- Assets tab ---------------------------------------------------------------
const ASSET_CATEGORIES = ['cpu', 'monitor', 'mouse', 'keyboard', 'headset', 'ups', 'laptop', 'printer', 'other'];

// Emoji + colour per component type / status for the asset cards.
const CAT_EMOJI = { cpu: '🖥️', desktop: '🖥️', monitor: '🖥️', mouse: '🖱️', keyboard: '⌨️', headset: '🎧', ups: '🔋', laptop: '💻', printer: '🖨️' };
const catEmoji = (c) => CAT_EMOJI[c] || '📦';
const ASSET_STATUS_DOT = { operational: '#22c55e', under_maintenance: '#f59e0b', breakdown: '#ef4444', retired: '#9ca3af' };
const initialsOf = (name = '') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

const ASSET_FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'code', label: 'Asset ID / code', type: 'text', help: 'Unique tag, e.g. CPU-06' },
  { name: 'category', label: 'Component type', type: 'select', options: ASSET_CATEGORIES, default: 'cpu' },
  { name: 'setupNumber', label: 'Setup no.', type: 'text', help: 'Group one PC’s parts, e.g. 06' },
  { name: 'department', label: 'Department', type: 'text' },
  { name: 'room', label: 'Room no.', type: 'text' },
  { name: 'status', label: 'Status', type: 'select', options: ASSET_STATUSES, default: 'operational' },
  { name: 'assignedTo', label: 'Assigned to', type: 'user' },
  { name: 'purchaseCost', label: 'Purchase cost', type: 'number', min: 0 },
  { name: 'warrantyUntil', label: 'Warranty until', type: 'date' },
  { name: 'amc.provider', label: 'AMC provider', type: 'text' },
  { name: 'amc.validUntil', label: 'AMC valid until', type: 'date' },
];

const ASSET_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'code', label: 'Asset ID / code', hint: 'Unique tag, e.g. CPU-06' },
  { key: 'category', label: 'Component type', hint: 'cpu / monitor / mouse…' },
  { key: 'setupNumber', label: 'Setup no.', hint: 'Groups one PC’s parts, e.g. 06' },
  { key: 'department', label: 'Department' },
  { key: 'room', label: 'Room no.' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status', hint: 'operational / under_maintenance / breakdown / retired' },
  { key: 'purchaseDate', label: 'Purchase date', hint: 'YYYY-MM-DD' },
  { key: 'purchaseCost', label: 'Purchase cost', hint: 'number ≥ 0' },
  { key: 'warrantyUntil', label: 'Warranty until', hint: 'YYYY-MM-DD' },
];

function buildAssetImportPayload(m) {
  if (!m.name) throw new Error('Name is required');
  const payload = { name: m.name };
  if (m.code) payload.code = m.code;
  if (m.category) payload.category = toImportSlug(m.category);
  if (m.setupNumber) payload.setupNumber = m.setupNumber;
  if (m.department) payload.department = m.department;
  if (m.room) payload.room = m.room;
  if (m.location) payload.location = m.location;
  if (m.status) {
    const status = toImportSlug(m.status);
    if (ASSET_STATUSES.includes(status)) payload.status = status;
  }
  if (m.purchaseDate) payload.purchaseDate = m.purchaseDate;
  if (m.purchaseCost) {
    const cost = Number(String(m.purchaseCost).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Purchase cost must be a number ≥ 0');
    payload.purchaseCost = cost;
  }
  if (m.warrantyUntil) payload.warrantyUntil = m.warrantyUntil;
  return payload;
}

/** One workstation setup (or lone asset) as a card: components, status, assignee. */
function SetupCard({ group, users, perms, onAssign, onEdit, onDelete }) {
  const first = group.items[0];
  const assignee = first.assignedTo; // populated & shared across a setup
  const dept = group.items.find((i) => i.department)?.department;
  const room = group.items.find((i) => i.room)?.room;

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid', borderColor: assignee ? 'primary.light' : 'divider', borderRadius: 3,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'box-shadow .15s', '&:hover': { boxShadow: 3 },
      }}
    >
      <Box sx={{ px: 2, py: 1.5, background: 'linear-gradient(135deg,#EEF2FF,#F5F3FF)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
            {group.setupNumber ? `Setup #${group.setupNumber}` : first.name}
          </Typography>
          <Chip size="small" label={`${group.items.length} item${group.items.length === 1 ? '' : 's'}`} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {[dept, room ? `Room ${room}` : null].filter(Boolean).join(' · ') || 'No department set'}
        </Typography>
      </Box>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {group.items.map((it) => (
          <Box key={it._id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ fontSize: 20, width: 24, textAlign: 'center', flexShrink: 0 }}>{catEmoji(it.category)}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{it.name}</Typography>
            </Box>
            {it.code && (
              <Chip size="small" variant="outlined" label={it.code} sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, height: 20 }} />
            )}
            <Tooltip title={humanize(it.status)}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, bgcolor: ASSET_STATUS_DOT[it.status] || '#9ca3af' }} />
            </Tooltip>
            {perms.update && (
              <IconButton size="small" onClick={() => onEdit(it)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
            )}
            {perms.delete && (
              <IconButton size="small" color="error" onClick={() => onDelete(it)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
            )}
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: assignee ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
        <Avatar sx={{ width: 30, height: 30, fontSize: 12, bgcolor: assignee ? '#EEF2FF' : 'action.hover', color: assignee ? '#4338CA' : 'text.disabled' }}>
          {assignee ? initialsOf(assignee.name) : '—'}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {perms.update ? (
            <TextField
              select
              size="small"
              fullWidth
              variant="standard"
              value={assignee?._id || ''}
              onChange={(e) => onAssign(first._id, e.target.value || null)}
              SelectProps={{ displayEmpty: true }}
              InputProps={{ disableUnderline: true }}
            >
              <MenuItem value=""><em>Unassigned — assign to…</em></MenuItem>
              {users.map((u) => (
                <MenuItem key={u._id} value={u._id}>{u.name}{u.designation ? ` · ${u.designation}` : ''}</MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography variant="body2" noWrap>{assignee?.name || 'Unassigned'}</Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function AssetsPanel({ perms }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['maintenance-assets', search, status],
    queryFn: () =>
      assetsApi.list({ limit: 100, ...(search ? { search } : {}), ...(status ? { status } : {}) }),
  });

  // Employee options for the assign dropdown (all active users; auth-only).
  const usersQuery = useQuery({
    queryKey: ['maintenance-user-options'],
    queryFn: () => usersApi.orgChart(),
    staleTime: 60000,
    retry: false,
  });
  const users = usersQuery.data || [];

  // Asset changes ripple into the ref pool + upcoming lists too.
  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('maintenance') });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? assetsApi.update(editing._id, payload) : assetsApi.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidate(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => assetsApi.remove(id),
    onSuccess: invalidate,
  });

  // Assigning any component cascades to its whole setup (server-side).
  const assignMutation = useMutation({
    mutationFn: ({ id, assignedTo }) => assetsApi.assign(id, assignedTo),
    onSuccess: invalidate,
    onError: (err) => window.alert(getErrorMessage(err, 'Failed to assign')),
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  // Group components into workstation setups (shared setupNumber); lone assets stand alone.
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of rows) {
      const key = a.setupNumber ? `setup:${a.setupNumber}` : `solo:${a._id}`;
      if (!map.has(key)) map.set(key, { key, setupNumber: a.setupNumber || '', items: [] });
      map.get(key).items.push(a);
    }
    return [...map.values()].sort((x, y) => (x.setupNumber || 'zzz').localeCompare(y.setupNumber || 'zzz'));
  }, [rows]);

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (row) => {
    if (window.confirm(`Delete asset "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete')) });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search name / code / location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {ASSET_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>
          ))}
        </TextField>
        {total != null && <Chip label={`${total} total`} size="small" />}
        <Box sx={{ flex: 1 }} />
        {perms.create && (
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        )}
        {perms.create && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New asset
          </Button>
        )}
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && (
        rows.length === 0 ? (
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, py: 6 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              No assets yet — add a CPU, monitor, mouse… and give components of one PC the same setup no.
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
            {groups.map((g) => (
              <SetupCard
                key={g.key}
                group={g}
                users={users}
                perms={perms}
                onAssign={(id, assignedTo) => assignMutation.mutate({ id, assignedTo })}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </Box>
        )
      )}

      <EntityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        title="Asset"
        fields={ASSET_FIELDS}
        record={editing}
        users={users}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import assets from Excel / PDF"
        entity="office IT assets (computers, monitors, peripherals)"
        fields={ASSET_IMPORT_FIELDS}
        buildPayload={buildAssetImportPayload}
        createFn={(p) => assetsApi.create(p)}
        onDone={invalidate}
      />
    </Box>
  );
}

// --- Maintenance records tab ----------------------------------------------------
const RECORD_FIELDS = [
  { name: 'title', label: 'Title / Task', type: 'text', required: true, full: true, help: 'What needs maintenance? e.g. Water tank repair, Wire repair, System / CPU repair' },
  { name: 'asset', label: 'Asset (optional)', type: 'asset', createOnly: true },
  { name: 'type', label: 'Type', type: 'select', options: MAINTENANCE_TYPES, required: true, default: 'preventive' },
  { name: 'status', label: 'Status', type: 'select', options: MAINTENANCE_STATUSES, default: 'scheduled' },
  { name: 'scheduledFor', label: 'Scheduled for', type: 'date', required: true },
  { name: 'reminderDaysBefore', label: 'Remind (days before)', type: 'number', min: 0, max: 90, default: 2, help: 'Alert admins this many days before the date' },
  { name: 'technician', label: 'Technician', type: 'text' },
  { name: 'cost', label: 'Cost', type: 'number', min: 0 },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const RECORD_IMPORT_FIELDS = [
  { key: 'title', label: 'Title / Task', required: true, hint: 'e.g. Water tank repair' },
  { key: 'type', label: 'Type', hint: 'preventive / breakdown / inspection / calibration / amc_service' },
  { key: 'status', label: 'Status', hint: 'scheduled / in_progress / completed / cancelled' },
  { key: 'scheduledFor', label: 'Scheduled for', required: true, hint: 'YYYY-MM-DD' },
  { key: 'technician', label: 'Technician' },
  { key: 'cost', label: 'Cost', hint: 'number ≥ 0' },
  { key: 'reminderDaysBefore', label: 'Remind (days before)', hint: '0–90' },
  { key: 'notes', label: 'Notes' },
];

function buildRecordImportPayload(m) {
  if (!m.title) throw new Error('Title is required');
  if (!m.scheduledFor) throw new Error('Scheduled for date is required');
  const type = m.type ? toImportSlug(m.type) : 'preventive';
  if (!MAINTENANCE_TYPES.includes(type)) throw new Error(`Type must be one of: ${MAINTENANCE_TYPES.join(', ')}`);
  const payload = { title: m.title, type, scheduledFor: m.scheduledFor };
  if (m.status) {
    const status = toImportSlug(m.status);
    if (MAINTENANCE_STATUSES.includes(status)) payload.status = status;
  }
  if (m.technician) payload.technician = m.technician;
  if (m.cost) {
    const cost = Number(String(m.cost).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Cost must be a number ≥ 0');
    payload.cost = cost;
  }
  if (m.reminderDaysBefore) {
    const days = Number(String(m.reminderDaysBefore).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(days)) throw new Error('Remind days must be a number');
    payload.reminderDaysBefore = Math.round(days);
  }
  if (m.notes) payload.notes = m.notes;
  return payload;
}

function RecordsPanel({ perms, assets }) {
  const qc = useQueryClient();
  const [asset, setAsset] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['maintenance-records', asset, type, status],
    queryFn: () =>
      recordsApi.list({
        limit: 100,
        ...(asset ? { asset } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      }),
  });

  // Record mutations can flip asset status (breakdown / under maintenance / operational),
  // so refresh every maintenance query.
  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('maintenance') });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? recordsApi.update(editing._id, payload) : recordsApi.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidate(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => recordsApi.remove(id),
    onSuccess: invalidate,
  });

  const remindMutation = useMutation({
    mutationFn: () => recordsApi.runReminders(),
    onSuccess: (res) => {
      invalidate();
      window.alert(`Reminder check complete — ${res.notified} notification(s) sent for ${res.checked} scheduled job(s).`);
    },
    onError: (err) => window.alert(getErrorMessage(err, 'Failed to run reminders')),
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (row) => {
    if (window.confirm('Delete this maintenance record? This cannot be undone.')) {
      deleteMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete')) });
    }
  };

  const showActions = perms.update || perms.delete;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" select label="Asset" value={asset} onChange={(e) => setAsset(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value=""><em>All assets</em></MenuItem>
          {assets.map((a) => (
            <MenuItem key={a._id} value={a._id}>{a.name}{a.code ? ` — ${a.code}` : ''}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value=""><em>All types</em></MenuItem>
          {MAINTENANCE_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{humanize(t)}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {MAINTENANCE_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>
          ))}
        </TextField>
        {total != null && <Chip label={`${total} total`} size="small" />}
        <Box sx={{ flex: 1 }} />
        {perms.update && (
          <Tooltip title="Check all scheduled maintenance now and notify admins about anything due soon">
            <span>
              <Button
                variant="outlined"
                startIcon={<NotificationsActiveIcon />}
                onClick={() => remindMutation.mutate()}
                disabled={remindMutation.isPending}
              >
                {remindMutation.isPending ? 'Checking…' : 'Run reminders'}
              </Button>
            </span>
          </Tooltip>
        )}
        {perms.create && (
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        )}
        {perms.create && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New record
          </Button>
        )}
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={headSx}>
                <TableCell>Task / Asset</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Scheduled for</TableCell>
                <TableCell>Cost</TableCell>
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const primary = row.title || row.asset?.name || '—';
                const secondary = row.title && row.asset?.name
                  ? `${row.asset.name}${row.asset.code ? ` · ${row.asset.code}` : ''}`
                  : (row.asset?.code || '');
                const active = ['scheduled', 'in_progress'].includes(row.status);
                return (
                  <TableRow key={row._id} hover>
                    <TableCell><AssetNameCell name={primary} code={secondary} /></TableCell>
                    <TableCell>
                      {row.type ? <Chip size="small" label={humanize(row.type)} color={typeColor(row.type)} variant="outlined" /> : '—'}
                    </TableCell>
                    <TableCell><StatusChip value={row.status} /></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {formatDate(row.scheduledFor)}
                        {active && <DaysLeftChip dueDate={row.scheduledFor} />}
                      </Box>
                    </TableCell>
                    <TableCell>{row.cost != null ? row.cost : '—'}</TableCell>
                    {showActions && (
                      <RowActions perms={perms} onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                    )}
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5 + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No maintenance records yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <EntityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        title="Maintenance Record"
        fields={RECORD_FIELDS}
        record={editing}
        assets={assets}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import maintenance records from Excel / PDF"
        entity="maintenance / repair job records"
        fields={RECORD_IMPORT_FIELDS}
        buildPayload={buildRecordImportPayload}
        createFn={(p) => recordsApi.create(p)}
        onDone={invalidate}
      />
    </Box>
  );
}

// --- Bills & renewals tab -------------------------------------------------------
const EXPIRY_FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true, full: true, help: 'e.g. Office WiFi, Electricity bill, CEO mobile recharge' },
  { name: 'category', label: 'Category', type: 'select', options: EXPIRY_CATEGORIES, default: 'other' },
  { name: 'provider', label: 'Provider / biller', type: 'text', help: 'e.g. Airtel, BSES, Jio' },
  { name: 'accountRef', label: 'Account / consumer no.', type: 'text' },
  { name: 'amount', label: 'Amount (₹)', type: 'number', min: 0 },
  { name: 'dueDate', label: 'Due / expiry date', type: 'date', required: true },
  { name: 'recurrence', label: 'Recurrence', type: 'select', options: EXPIRY_RECURRENCES, default: 'monthly' },
  { name: 'reminderDaysBefore', label: 'Remind days before', type: 'number', min: 0, max: 90, default: 3, help: '1-day & due-day alerts always fire' },
  { name: 'status', label: 'Status', type: 'select', options: EXPIRY_STATUSES, default: 'active' },
  { name: 'owner', label: 'Owner (optional)', type: 'user', help: 'Also notified with admins' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const EXPIRY_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true, hint: 'e.g. Office WiFi, Electricity bill' },
  { key: 'category', label: 'Category', hint: 'utility / internet / mobile / software…' },
  { key: 'provider', label: 'Provider / biller', hint: 'e.g. Airtel, BSES, Jio' },
  { key: 'accountRef', label: 'Account / consumer no.' },
  { key: 'amount', label: 'Amount', hint: 'number ≥ 0' },
  { key: 'dueDate', label: 'Due / expiry date', required: true, hint: 'YYYY-MM-DD' },
  { key: 'recurrence', label: 'Recurrence', hint: 'none / weekly / monthly / quarterly / half_yearly / yearly' },
  { key: 'status', label: 'Status', hint: 'active / paid / cancelled' },
  { key: 'reminderDaysBefore', label: 'Remind days before', hint: '0–90' },
  { key: 'notes', label: 'Notes' },
];

function buildExpiryImportPayload(m) {
  if (!m.name) throw new Error('Name is required');
  if (!m.dueDate) throw new Error('Due date is required');
  const payload = { name: m.name, dueDate: m.dueDate };
  if (m.category) {
    const category = toImportSlug(m.category);
    if (EXPIRY_CATEGORIES.includes(category)) payload.category = category;
  }
  if (m.provider) payload.provider = m.provider;
  if (m.accountRef) payload.accountRef = m.accountRef;
  if (m.amount) {
    const amount = Number(String(m.amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a number ≥ 0');
    payload.amount = amount;
  }
  if (m.recurrence) {
    const recurrence = toImportSlug(m.recurrence);
    if (EXPIRY_RECURRENCES.includes(recurrence)) payload.recurrence = recurrence;
  }
  if (m.status) {
    const status = toImportSlug(m.status);
    if (EXPIRY_STATUSES.includes(status)) payload.status = status;
  }
  if (m.reminderDaysBefore) {
    const days = Number(String(m.reminderDaysBefore).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(days)) throw new Error('Remind days must be a number');
    payload.reminderDaysBefore = Math.round(days);
  }
  if (m.notes) payload.notes = m.notes;
  return payload;
}

function BillsPanel({ perms, users }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [category, setCategory] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['maintenance-expiries', search, status, category],
    queryFn: () =>
      expiriesApi.list({
        limit: 100,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('maintenance') });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? expiriesApi.update(editing._id, payload) : expiriesApi.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidate(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({ mutationFn: (id) => expiriesApi.remove(id), onSuccess: invalidate });
  const renewMutation = useMutation({ mutationFn: (id) => expiriesApi.renew(id), onSuccess: invalidate });
  const remindMutation = useMutation({
    mutationFn: () => expiriesApi.runReminders(),
    onSuccess: (res) => {
      invalidate();
      window.alert(`Reminder check complete — ${res.notified} notification(s) sent for ${res.checked} tracked item(s).`);
    },
    onError: (err) => window.alert(getErrorMessage(err, 'Failed to run reminders')),
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (row) => {
    if (window.confirm(`Delete "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete')) });
    }
  };
  const handleRenew = (row) => {
    const msg = row.recurrence === 'none'
      ? `Mark "${row.name}" as paid / settled?`
      : `Renew "${row.name}"? Its due date rolls forward one ${humanize(row.recurrence)} period and reminders reset.`;
    if (window.confirm(msg)) {
      renewMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to renew')) });
    }
  };

  const showActions = perms.update || perms.delete;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search name / provider / account…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {EXPIRY_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value=""><em>All categories</em></MenuItem>
          {EXPIRY_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>{humanize(c)}</MenuItem>
          ))}
        </TextField>
        {total != null && <Chip label={`${total} total`} size="small" />}
        <Box sx={{ flex: 1 }} />
        {perms.update && (
          <Tooltip title="Check all bills now and notify admins about anything due soon">
            <span>
              <Button
                variant="outlined"
                startIcon={<NotificationsActiveIcon />}
                onClick={() => remindMutation.mutate()}
                disabled={remindMutation.isPending}
              >
                {remindMutation.isPending ? 'Checking…' : 'Run reminders'}
              </Button>
            </span>
          </Tooltip>
        )}
        {perms.create && (
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        )}
        {perms.create && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New bill
          </Button>
        )}
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={headSx}>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Due date</TableCell>
                <TableCell>Days left</TableCell>
                <TableCell>Recurrence</TableCell>
                <TableCell>Status</TableCell>
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell><AssetNameCell name={row.name} code={row.provider} /></TableCell>
                  <TableCell>{humanize(row.category)}</TableCell>
                  <TableCell>{money(row.amount)}</TableCell>
                  <TableCell>{formatDate(row.dueDate)}</TableCell>
                  <TableCell>{row.status === 'active' ? <DaysLeftChip dueDate={row.dueDate} /> : '—'}</TableCell>
                  <TableCell>{humanize(row.recurrence)}</TableCell>
                  <TableCell><StatusChip value={row.status} /></TableCell>
                  {showActions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {perms.update && row.status === 'active' && (
                        <Tooltip title={row.recurrence === 'none' ? 'Mark paid' : 'Renew (roll due date forward)'}>
                          <IconButton size="small" color="success" onClick={() => handleRenew(row)}>
                            <AutorenewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {perms.update && (
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(row)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                      {perms.delete && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDelete(row)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7 + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No bills or renewals yet. Add light bills, WiFi/mobile recharges, domains, licences…
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <EntityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        title="Bill / Renewal"
        fields={EXPIRY_FIELDS}
        record={editing}
        users={users}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import bills & renewals from Excel / PDF"
        entity="recurring bills, recharges and renewals"
        fields={EXPIRY_IMPORT_FIELDS}
        buildPayload={buildExpiryImportPayload}
        createFn={(p) => expiriesApi.create(p)}
        onDone={invalidate}
      />
    </Box>
  );
}

// --- Upcoming tab ----------------------------------------------------------------
function UpcomingList({ title, items, renderPrimary, renderSecondary, renderRight, emptyText }) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{title}</Typography>
        <Chip size="small" label={items.length} />
      </Box>
      {items.length === 0 && (
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      )}
      {items.map((item) => (
        <Box
          key={item._id}
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
            py: 1, borderTop: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 13 }} noWrap>{renderPrimary(item)}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {renderSecondary(item)}
            </Typography>
          </Box>
          <Box sx={{ flexShrink: 0 }}>{renderRight(item)}</Box>
        </Box>
      ))}
    </Paper>
  );
}

function UpcomingPanel() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ['maintenance-upcoming', days],
    queryFn: () => maintenanceApi.upcoming(days),
  });

  const data = query.data;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" select label="Window" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ minWidth: 160 }}>
          {[7, 30, 90].map((d) => (
            <MenuItem key={d} value={d}>Next {d} days</MenuItem>
          ))}
        </TextField>
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <UpcomingList
            title="Bills & renewals due"
            items={data.expiringBills || []}
            emptyText="No bills or renewals due in this window."
            renderPrimary={(b) => `${b.name}${b.provider ? ` · ${b.provider}` : ''}`}
            renderSecondary={(b) => (
              <>
                {humanize(b.category || '')}
                {b.amount ? ` · ${money(b.amount)}` : ''}
                {' · '}
                {formatDate(b.dueDate)}
              </>
            )}
            renderRight={(b) => <DaysLeftChip dueDate={b.dueDate} />}
          />
          <UpcomingList
            title="Upcoming maintenance"
            items={data.records || []}
            emptyText="Nothing scheduled in this window."
            renderPrimary={(r) => r.title || `${r.asset?.name || '—'}${r.asset?.code ? ` (${r.asset.code})` : ''}`}
            renderSecondary={(r) => (
              <>
                {humanize(r.type)}
                {' · '}
                {formatDate(r.scheduledFor)}
                {r.title && r.asset?.name ? ` · ${r.asset.name}` : ''}
              </>
            )}
            renderRight={(r) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DaysLeftChip dueDate={r.scheduledFor} />
                <StatusChip value={r.status} />
              </Box>
            )}
          />
          <UpcomingList
            title="Warranties expiring"
            items={data.expiringWarranties || []}
            emptyText="No warranties expiring in this window."
            renderPrimary={(a) => `${a.name}${a.code ? ` (${a.code})` : ''}`}
            renderSecondary={(a) => a.location || humanize(a.category || '')}
            renderRight={(a) => <Chip size="small" color="warning" label={formatDate(a.warrantyUntil)} />}
          />
          <UpcomingList
            title="AMCs expiring"
            items={data.expiringAmc || []}
            emptyText="No AMCs expiring in this window."
            renderPrimary={(a) => `${a.name}${a.code ? ` (${a.code})` : ''}`}
            renderSecondary={(a) => a.amc?.provider || '—'}
            renderRight={(a) => <Chip size="small" color="warning" label={formatDate(a.amc?.validUntil)} />}
          />
        </Box>
      )}
    </Box>
  );
}

// --- Page -------------------------------------------------------------------
const TABS = ['Assets', 'Maintenance', 'Bills & Renewals', 'Upcoming'];

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);

  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };

  // Asset option pool for the record dialog + filters.
  const assetsRefQuery = useQuery({
    queryKey: ['maintenance-assets-ref'],
    queryFn: async () => (await assetsApi.list({ limit: 100 })).data || [],
    retry: false,
  });
  const assets = assetsRefQuery.data || [];

  // User pool for the bill "owner" dropdown (active directory, auth-only).
  const usersRefQuery = useQuery({
    queryKey: ['maintenance-users-ref'],
    queryFn: usersApi.orgChart,
    retry: false,
  });
  const users = usersRefQuery.data || [];

  // Live updates: refetch any maintenance list when a record changes anywhere.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () =>
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('maintenance') });
    socket.on('maintenance:changed', handler);
    return () => socket.off('maintenance:changed', handler);
  }, [qc]);

  return (
    <Box>
      <PageHeader
        title="Maintenance & Assets"
        subtitle="Track assets, schedule maintenance, and stay ahead of warranties, AMCs & recurring bills."
      />

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {TABS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Paper>

      {tab === 0 && <AssetsPanel perms={perms} />}
      {tab === 1 && <RecordsPanel perms={perms} assets={assets} />}
      {tab === 2 && <BillsPanel perms={perms} users={users} />}
      {tab === 3 && <UpcomingPanel />}
    </Box>
  );
}
