import { useEffect, useState } from 'react';
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
import PageHeader from '../../components/ui/PageHeader.jsx';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  assetsApi,
  recordsApi,
  maintenanceApi,
  ASSET_STATUSES,
  MAINTENANCE_TYPES,
  MAINTENANCE_STATUSES,
} from '../../api/maintenance.api.js';

// --- Small helpers ----------------------------------------------------------
function humanize(v) {
  return String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  operational: 'success', completed: 'success',
  scheduled: 'info', in_progress: 'warning', under_maintenance: 'warning',
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
    if (f.type === 'asset' || f.type === 'refId') form[f.name] = raw ? (typeof raw === 'object' ? raw._id : raw) : '';
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
function FieldInput({ field, value, setField, assets, disabled }) {
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
        <TextField {...common} select required={field.required} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)}>
          {(assets || []).map((a) => (
            <MenuItem key={a._id} value={a._id}>{a.name}{a.code ? ` — ${a.code}` : ''}</MenuItem>
          ))}
        </TextField>
      );
    default:
      return <TextField {...common} required={field.required} value={value ?? ''} helperText={field.help} onChange={(e) => setField(field.name, e.target.value)} />;
  }
}

// --- Create / edit dialog ---------------------------------------------------
function EntityDialog({ open, onClose, onSave, saving, error, title, fields, record, assets }) {
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
const ASSET_FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'code', label: 'Code (asset tag)', type: 'text', help: 'Unique tag / QR value' },
  { name: 'category', label: 'Category', type: 'text', default: 'general' },
  { name: 'location', label: 'Location', type: 'text' },
  { name: 'status', label: 'Status', type: 'select', options: ASSET_STATUSES, default: 'operational' },
  { name: 'product', label: 'Product (ID)', type: 'refId', help: 'Product ObjectId (optional)' },
  { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
  { name: 'purchaseCost', label: 'Purchase cost', type: 'number', min: 0 },
  { name: 'warrantyUntil', label: 'Warranty until', type: 'date' },
  { name: 'amc.provider', label: 'AMC provider', type: 'text' },
  { name: 'amc.validUntil', label: 'AMC valid until', type: 'date' },
  { name: 'amc.notes', label: 'AMC notes', type: 'textarea', full: true },
];

function AssetsPanel({ perms }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['maintenance-assets', search, status],
    queryFn: () =>
      assetsApi.list({ limit: 100, ...(search ? { search } : {}), ...(status ? { status } : {}) }),
  });

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

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (row) => {
    if (window.confirm(`Delete asset "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete')) });
    }
  };

  const showActions = perms.update || perms.delete;

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
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New asset
          </Button>
        )}
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={headSx}>
                <TableCell>Asset</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Warranty until</TableCell>
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell><AssetNameCell name={row.name} code={row.code} /></TableCell>
                  <TableCell>{row.category || '—'}</TableCell>
                  <TableCell>{row.location || '—'}</TableCell>
                  <TableCell><StatusChip value={row.status} /></TableCell>
                  <TableCell>{formatDate(row.warrantyUntil)}</TableCell>
                  {showActions && (
                    <RowActions perms={perms} onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5 + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No assets yet.
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
        title="Asset"
        fields={ASSET_FIELDS}
        record={editing}
      />
    </Box>
  );
}

// --- Maintenance records tab ----------------------------------------------------
const RECORD_FIELDS = [
  { name: 'asset', label: 'Asset', type: 'asset', required: true, createOnly: true },
  { name: 'type', label: 'Type', type: 'select', options: MAINTENANCE_TYPES, required: true, default: 'preventive' },
  { name: 'status', label: 'Status', type: 'select', options: MAINTENANCE_STATUSES, default: 'scheduled' },
  { name: 'scheduledFor', label: 'Scheduled for', type: 'date', required: true },
  { name: 'technician', label: 'Technician', type: 'text' },
  { name: 'cost', label: 'Cost', type: 'number', min: 0 },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

function RecordsPanel({ perms, assets }) {
  const qc = useQueryClient();
  const [asset, setAsset] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
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
                <TableCell>Asset</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Scheduled for</TableCell>
                <TableCell>Cost</TableCell>
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell><AssetNameCell name={row.asset?.name} code={row.asset?.code} /></TableCell>
                  <TableCell>
                    {row.type ? <Chip size="small" label={humanize(row.type)} color={typeColor(row.type)} variant="outlined" /> : '—'}
                  </TableCell>
                  <TableCell><StatusChip value={row.status} /></TableCell>
                  <TableCell>{formatDate(row.scheduledFor)}</TableCell>
                  <TableCell>{row.cost != null ? row.cost : '—'}</TableCell>
                  {showActions && (
                    <RowActions perms={perms} onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                  )}
                </TableRow>
              ))}
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          <UpcomingList
            title="Upcoming maintenance"
            items={data.records || []}
            emptyText="Nothing scheduled in this window."
            renderPrimary={(r) => `${r.asset?.name || '—'}${r.asset?.code ? ` (${r.asset.code})` : ''}`}
            renderSecondary={(r) => (
              <>
                {humanize(r.type)}
                {' · '}
                {formatDate(r.scheduledFor)}
              </>
            )}
            renderRight={(r) => <StatusChip value={r.status} />}
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
const TABS = ['Assets', 'Maintenance', 'Upcoming'];

export default function MaintenancePage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState(0);

  const perms = {
    create: hasPermission('maintenance', 'create'),
    update: hasPermission('maintenance', 'update'),
    delete: hasPermission('maintenance', 'delete'),
  };

  // Asset option pool for the record dialog + filters.
  const assetsRefQuery = useQuery({
    queryKey: ['maintenance-assets-ref'],
    queryFn: async () => (await assetsApi.list({ limit: 100 })).data || [],
    retry: false,
  });
  const assets = assetsRefQuery.data || [];

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
        subtitle="Track assets, schedule maintenance and stay ahead of warranties & AMCs."
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
      {tab === 2 && <UpcomingPanel />}
    </Box>
  );
}
