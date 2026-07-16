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
  Switch,
  FormControlLabel,
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
import api, { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  contactsApi,
  projectsApi,
  renewalsApi,
  campaignsApi,
  ticketsApi,
  CONTACT_TYPES,
  CONTACT_STATUSES,
  PROJECT_STATUSES,
  RENEWAL_STATUSES,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../../api/rrrmas.api.js';

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
  active: 'success', renewed: 'success', resolved: 'success', completed: 'success',
  qualified: 'success', customer: 'success',
  new: 'info', open: 'info', planning: 'info', upcoming: 'info', lead: 'info', in_progress: 'info',
  contacted: 'warning', waiting: 'warning', paused: 'warning', on_hold: 'warning', due: 'warning',
  cancelled: 'default', expired: 'default', lost: 'default', closed: 'default', inactive: 'default', draft: 'default',
  low: 'default', medium: 'info', high: 'warning', urgent: 'error',
};
const chipColor = (v) => STATUS_COLORS[v] || 'default';

// --- Form value conversion --------------------------------------------------
function toFormState(fields, record) {
  const form = {};
  for (const f of fields) {
    const raw = record ? getPath(record, f.name) : f.default;
    if (f.type === 'switch') form[f.name] = Boolean(raw);
    else if (f.type === 'ref') form[f.name] = raw ? (typeof raw === 'object' ? raw._id : raw) : '';
    else if (f.type === 'refs') form[f.name] = Array.isArray(raw) ? raw.map((x) => (typeof x === 'object' ? x._id : x)) : [];
    else if (f.type === 'tags') form[f.name] = Array.isArray(raw) ? raw.join(', ') : raw || '';
    else if (f.type === 'date') form[f.name] = raw ? String(raw).slice(0, 10) : '';
    else if (f.type === 'number') form[f.name] = raw === 0 || raw ? String(raw) : '';
    else form[f.name] = raw ?? '';
  }
  return form;
}

function buildPayload(fields, form) {
  const payload = {};
  for (const f of fields) {
    let v = form[f.name];
    if (f.type === 'switch') {
      setPath(payload, f.name, Boolean(v));
      continue;
    }
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      v = n;
    } else if (f.type === 'tags') {
      v = String(v).split(',').map((s) => s.trim()).filter(Boolean);
      if (!v.length) continue;
    } else if (f.type === 'refs') {
      if (!Array.isArray(v) || !v.length) continue;
    }
    setPath(payload, f.name, v);
  }
  return payload;
}

// --- Generic field renderer -------------------------------------------------
function FieldInput({ field, value, setField, optionsFor }) {
  const common = { fullWidth: true, size: 'small', label: field.label };

  switch (field.type) {
    case 'textarea':
      return <TextField {...common} multiline minRows={3} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'number':
      return <TextField {...common} type="number" value={value ?? ''} inputProps={{ min: field.min, max: field.max }} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)} />;
    case 'switch':
      return <FormControlLabel control={<Switch checked={Boolean(value)} onChange={(e) => setField(field.name, e.target.checked)} />} label={field.label} />;
    case 'tags':
      return <TextField {...common} value={value ?? ''} helperText="Comma separated" onChange={(e) => setField(field.name, e.target.value)} />;
    case 'select':
      return (
        <TextField {...common} select required={field.required} value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)}>
          {field.options.map((o) => (
            <MenuItem key={o} value={o}>{humanize(o)}</MenuItem>
          ))}
        </TextField>
      );
    case 'ref': {
      const opts = optionsFor(field.source) || [];
      return (
        <TextField {...common} select value={value ?? ''} onChange={(e) => setField(field.name, e.target.value)}>
          <MenuItem value=""><em>— None —</em></MenuItem>
          {opts.map((o) => (
            <MenuItem key={o._id} value={o._id}>{o.name}{o.email ? ` (${o.email})` : ''}</MenuItem>
          ))}
        </TextField>
      );
    }
    case 'refs': {
      const opts = optionsFor(field.source) || [];
      const nameById = Object.fromEntries(opts.map((o) => [o._id, o.name]));
      const val = Array.isArray(value) ? value : [];
      return (
        <TextField
          {...common}
          select
          value={val}
          SelectProps={{ multiple: true, renderValue: (sel) => sel.map((id) => nameById[id] || id).join(', ') }}
          onChange={(e) => setField(field.name, e.target.value)}
        >
          {opts.map((o) => (
            <MenuItem key={o._id} value={o._id}>{o.name}</MenuItem>
          ))}
        </TextField>
      );
    }
    default:
      return <TextField {...common} required={field.required} value={value ?? ''} helperText={field.help} onChange={(e) => setField(field.name, e.target.value)} />;
  }
}

// --- Create / edit dialog ---------------------------------------------------
function RecordDialog({ open, onClose, onSave, saving, error, resource, record, refData }) {
  const [form, setForm] = useState({});
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(toFormState(resource.fields, record));
      setLocalError('');
    }
  }, [open, record, resource]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const optionsFor = (source) => (source === 'users' ? refData.users : source === 'contacts' ? refData.contacts : []);

  const handleSave = () => {
    for (const f of resource.fields) {
      if (f.required && !String(form[f.name] ?? '').trim()) {
        setLocalError(`${f.label} is required`);
        return;
      }
    }
    onSave(buildPayload(resource.fields, form));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{record ? `Edit ${resource.singular}` : `New ${resource.singular}`}</DialogTitle>
      <DialogContent dividers>
        {(error || localError) && <Alert severity="error" sx={{ mb: 2 }}>{error || localError}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          {resource.fields.map((f) => (
            <Box key={f.name} sx={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
              <FieldInput field={f} value={form[f.name]} setField={setField} optionsFor={optionsFor} />
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

// --- One resource tab (toolbar + table + dialog) ----------------------------
function ResourcePanel({ resource, perms, refData }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: [resource.queryKey, search],
    queryFn: () => resource.api.list({ limit: 100, ...(search ? { search } : {}) }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [resource.queryKey] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? resource.api.update(editing._id, payload) : resource.api.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidate(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => resource.api.remove(id),
    onSuccess: invalidate,
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (row) => {
    if (window.confirm(`Delete this ${resource.singular.toLowerCase()}? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, { onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete')) });
    }
  };

  const showActions = perms.update || perms.delete;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        {total != null && <Chip label={`${total} total`} size="small" />}
        <Box sx={{ flex: 1 }} />
        {perms.create && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New {resource.singular.toLowerCase()}
          </Button>
        )}
      </Box>

      {query.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {query.error && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}

      {!query.isLoading && !query.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { whiteSpace: 'nowrap' } }}>
                {resource.columns.map((col) => (
                  <TableCell key={col.key}>{col.label}</TableCell>
                ))}
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  {resource.columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.render
                        ? col.render(row)
                        : col.chip
                          ? (getPath(row, col.key) ? <Chip size="small" label={humanize(getPath(row, col.key))} color={chipColor(getPath(row, col.key))} /> : '—')
                          : col.primary
                            ? <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{getPath(row, col.key) || '—'}</Typography>
                            : (getPath(row, col.key) ?? '—')}
                    </TableCell>
                  ))}
                  {showActions && (
                    <TableCell align="right">
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
                  <TableCell colSpan={resource.columns.length + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No {resource.tabLabel.toLowerCase()} yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <RecordDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        resource={resource}
        record={editing}
        refData={refData}
      />
    </Box>
  );
}

// --- Resource configs -------------------------------------------------------
const RESOURCES = [
  {
    key: 'contacts', tabLabel: 'Contacts', singular: 'Contact', queryKey: 'rrrmas-contacts', api: contactsApi,
    columns: [
      { key: 'name', label: 'Name', primary: true },
      { key: 'type', label: 'Type', chip: true },
      { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status', chip: true },
      { key: 'owner', label: 'Owner', render: (r) => r.owner?.name || '—' },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'type', label: 'Type', type: 'select', options: CONTACT_TYPES, default: 'lead' },
      { name: 'company', label: 'Company', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: CONTACT_STATUSES, default: 'new' },
      { name: 'source', label: 'Source', type: 'text' },
      { name: 'owner', label: 'Owner', type: 'ref', source: 'users' },
      { name: 'tags', label: 'Tags', type: 'tags', full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
  },
  {
    key: 'projects', tabLabel: 'Projects', singular: 'Project', queryKey: 'rrrmas-projects', api: projectsApi,
    columns: [
      { key: 'name', label: 'Name', primary: true },
      { key: 'customer', label: 'Customer', render: (r) => r.customer?.name || '—' },
      { key: 'status', label: 'Status', chip: true },
      { key: 'manager', label: 'Manager', render: (r) => r.manager?.name || '—' },
      { key: 'progress', label: 'Progress', render: (r) => `${r.progress ?? 0}%` },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'customer', label: 'Customer', type: 'ref', source: 'contacts' },
      { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES, default: 'planning' },
      { name: 'manager', label: 'Manager', type: 'ref', source: 'users' },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'budget', label: 'Budget', type: 'number', min: 0 },
      { name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100 },
      { name: 'team', label: 'Team', type: 'refs', source: 'users', full: true },
      { name: 'tags', label: 'Tags', type: 'tags', full: true },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ],
  },
  {
    key: 'renewals', tabLabel: 'Renewals', singular: 'Renewal', queryKey: 'rrrmas-renewals', api: renewalsApi,
    columns: [
      { key: 'title', label: 'Title', primary: true },
      { key: 'customer', label: 'Customer', render: (r) => r.customer?.name || '—' },
      { key: 'amount', label: 'Amount', render: (r) => (r.amount != null ? `${r.currency || ''} ${r.amount}`.trim() : '—') },
      { key: 'dueDate', label: 'Due', render: (r) => formatDate(r.dueDate) },
      { key: 'status', label: 'Status', chip: true },
      { key: 'autoRenew', label: 'Auto-renew', render: (r) => (r.autoRenew ? 'Yes' : 'No') },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'customer', label: 'Customer', type: 'ref', source: 'contacts' },
      { name: 'product', label: 'Product (ID)', type: 'text', help: 'Product ObjectId (optional)' },
      { name: 'amount', label: 'Amount', type: 'number', min: 0 },
      { name: 'currency', label: 'Currency', type: 'text', default: 'INR' },
      { name: 'dueDate', label: 'Due date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: RENEWAL_STATUSES, default: 'upcoming' },
      { name: 'autoRenew', label: 'Auto-renew', type: 'switch' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
  },
  {
    key: 'campaigns', tabLabel: 'Campaigns', singular: 'Campaign', queryKey: 'rrrmas-campaigns', api: campaignsApi,
    columns: [
      { key: 'name', label: 'Name', primary: true },
      { key: 'channel', label: 'Channel', chip: true },
      { key: 'status', label: 'Status', chip: true },
      { key: 'budget', label: 'Budget', render: (r) => (r.budget != null ? r.budget : '—') },
      { key: 'metrics.reach', label: 'Reach', render: (r) => r.metrics?.reach ?? 0 },
      { key: 'metrics.leads', label: 'Leads', render: (r) => r.metrics?.leads ?? 0 },
      { key: 'metrics.conversions', label: 'Conversions', render: (r) => r.metrics?.conversions ?? 0 },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'channel', label: 'Channel', type: 'select', options: CAMPAIGN_CHANNELS, default: 'other' },
      { name: 'status', label: 'Status', type: 'select', options: CAMPAIGN_STATUSES, default: 'draft' },
      { name: 'budget', label: 'Budget', type: 'number', min: 0 },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'metrics.reach', label: 'Reach', type: 'number', min: 0 },
      { name: 'metrics.leads', label: 'Leads', type: 'number', min: 0 },
      { name: 'metrics.conversions', label: 'Conversions', type: 'number', min: 0 },
    ],
  },
  {
    key: 'tickets', tabLabel: 'Support', singular: 'Ticket', queryKey: 'rrrmas-tickets', api: ticketsApi,
    columns: [
      { key: 'subject', label: 'Subject', primary: true },
      { key: 'customer', label: 'Customer', render: (r) => r.customer?.name || '—' },
      { key: 'priority', label: 'Priority', chip: true },
      { key: 'status', label: 'Status', chip: true },
      { key: 'assignee', label: 'Assignee', render: (r) => r.assignee?.name || '—' },
      {
        key: 'sla',
        label: 'SLA',
        render: (r) =>
          r.sla?.breached
            ? <Chip size="small" color="error" label="Breached" />
            : (r.sla?.dueAt ? formatDate(r.sla.dueAt) : '—'),
      },
    ],
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'customer', label: 'Customer', type: 'ref', source: 'contacts' },
      { name: 'priority', label: 'Priority', type: 'select', options: TICKET_PRIORITIES, default: 'medium' },
      { name: 'status', label: 'Status', type: 'select', options: TICKET_STATUSES, default: 'open' },
      { name: 'assignee', label: 'Assignee', type: 'ref', source: 'users' },
      { name: 'sla.dueAt', label: 'SLA due', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
      { name: 'comment', label: 'Add comment', type: 'text', full: true },
    ],
  },
];

// --- Page -------------------------------------------------------------------
export default function RrrmasPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState(0);

  const perms = {
    create: hasPermission('rrrmas', 'create'),
    update: hasPermission('rrrmas', 'update'),
    delete: hasPermission('rrrmas', 'delete'),
  };

  // Option pools for reference selects (customer / owner / manager / assignee / team).
  const usersQuery = useQuery({
    queryKey: ['rrrmas-users'],
    queryFn: async () => (await api.get('/users', { params: { limit: 100 } })).data.data || [],
    retry: false,
  });
  const contactsRefQuery = useQuery({
    queryKey: ['rrrmas-contacts-ref'],
    queryFn: async () => (await contactsApi.list({ limit: 100 })).data || [],
    retry: false,
  });

  const refData = { users: usersQuery.data || [], contacts: contactsRefQuery.data || [] };

  // Live updates: refetch any RRRMAS list when a record changes anywhere.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () =>
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('rrrmas') });
    socket.on('rrrmas:changed', handler);
    return () => socket.off('rrrmas:changed', handler);
  }, [qc]);

  return (
    <Box>
      <PageHeader
        title="RRRMAS"
        subtitle="Recruitment CRM, Running Projects, Renewals, Marketing & Support."
      />

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {RESOURCES.map((r) => (
            <Tab key={r.key} label={r.tabLabel} />
          ))}
        </Tabs>
      </Paper>

      {RESOURCES.map((r, i) =>
        tab === i ? <ResourcePanel key={r.key} resource={r} perms={perms} refData={refData} /> : null
      )}
    </Box>
  );
}
