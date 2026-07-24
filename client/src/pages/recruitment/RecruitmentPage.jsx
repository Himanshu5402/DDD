import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Grid,
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
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import GroupsIcon from '@mui/icons-material/Groups';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import { getErrorMessage } from '../../lib/axios.js';
import { hrmsErrorMessage } from '../../api/integrations.api.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { usersApi } from '../../api/users.api.js';
import {
  positionsApi,
  candidatesApi,
  recruitmentApi,
  POSITION_STATUSES,
  POSITION_STATUS_LABELS,
  POSITION_PRIORITIES,
  POSITION_PRIORITY_LABELS,
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_LABELS,
} from '../../api/recruitment.api.js';

// --- Helpers ------------------------------------------------------------------
function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const STATUS_COLORS = { open: 'success', on_hold: 'warning', closed: 'default', filled: 'info' };
const PRIORITY_COLORS = { low: 'default', medium: 'info', high: 'warning', urgent: 'error' };
const STAGE_COLORS = {
  applied: 'default',
  screening: 'info',
  interview: 'secondary',
  offer: 'warning',
  hired: 'success',
  rejected: 'error',
  dropped: 'default',
};

function StatusChip({ value }) {
  return value ? (
    <Chip size="small" label={POSITION_STATUS_LABELS[value] || value} color={STATUS_COLORS[value] || 'default'} />
  ) : (
    '—'
  );
}
function PriorityChip({ value }) {
  return value ? (
    <Chip size="small" variant="outlined" label={POSITION_PRIORITY_LABELS[value] || value} color={PRIORITY_COLORS[value] || 'default'} />
  ) : (
    '—'
  );
}
function StageChip({ value }) {
  return value ? (
    <Chip size="small" label={CANDIDATE_STAGE_LABELS[value] || value} color={STAGE_COLORS[value] || 'default'} />
  ) : (
    '—'
  );
}

// --- Summary metric card ------------------------------------------------------
function MetricCard({ icon, label, value, tint }) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: tint || 'action.hover',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {label}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

// --- Summary + funnel ---------------------------------------------------------
function SummarySection() {
  const query = useQuery({ queryKey: ['recruitment', 'summary'], queryFn: recruitmentApi.summary });
  const s = query.data;

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <MetricCard icon={<WorkOutlineIcon />} label="Open positions" value={s?.openPositions ?? '—'} tint="#EEF2FF" />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard icon={<GroupsIcon />} label="Total openings" value={s?.totalOpenings ?? '—'} tint="#ECFDF5" />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard icon={<LocalOfferIcon />} label="Offers pending" value={s?.offersPending ?? '—'} tint="#FFFBEB" />
        </Grid>
        <Grid item xs={6} md={3}>
          <MetricCard
            icon={<TimelapseIcon />}
            label="Avg time-to-hire (days)"
            value={s?.avgTimeToHireDays ?? '—'}
            tint="#FEF2F2"
          />
        </Grid>
      </Grid>

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mt: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1.5 }}>Pipeline funnel</Typography>
        {query.isLoading ? (
          <CircularProgress size={20} />
        ) : (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {CANDIDATE_STAGES.map((stage) => (
              <Chip
                key={stage}
                label={`${CANDIDATE_STAGE_LABELS[stage]} · ${s?.funnel?.[stage] ?? 0}`}
                color={STAGE_COLORS[stage] || 'default'}
                variant={s?.funnel?.[stage] ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// --- Shared list states -------------------------------------------------------
function ListStates({ query }) {
  return (
    <>
      {query.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {query.error && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
    </>
  );
}

const headSx = { '& th': { whiteSpace: 'nowrap' } };

// --- Position dialog ----------------------------------------------------------
const emptyPosition = {
  title: '',
  department: '',
  openings: '1',
  priority: 'medium',
  status: 'open',
  targetHireDate: '',
  hiringManager: '',
  description: '',
};

function positionToForm(p) {
  if (!p) return { ...emptyPosition };
  return {
    title: p.title || '',
    department: p.department || '',
    openings: p.openings === 0 || p.openings ? String(p.openings) : '1',
    priority: p.priority || 'medium',
    status: p.status || 'open',
    targetHireDate: p.targetHireDate ? String(p.targetHireDate).slice(0, 10) : '',
    hiringManager: p.hiringManager?._id || p.hiringManager || '',
    description: p.description || '',
  };
}

function PositionDialog({ open, onClose, onSave, saving, error, record, users }) {
  const [form, setForm] = useState(emptyPosition);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(positionToForm(record));
      setLocalError('');
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) {
      setLocalError('Title is required');
      return;
    }
    if (!form.department.trim()) {
      setLocalError('Department is required'); // the HRMS opening requires one
      return;
    }
    const payload = {
      title: form.title.trim(),
      department: form.department.trim(),
      openings: Number(form.openings) || 0,
      priority: form.priority,
      status: form.status,
      description: form.description,
      hiringManager: form.hiringManager || null,
      targetHireDate: form.targetHireDate || null,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{record ? 'Edit Position' : 'New Position'}</DialogTitle>
      <DialogContent dividers>
        {(error || localError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || localError}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <TextField fullWidth size="small" label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Box>
          <TextField fullWidth size="small" label="Department" required value={form.department} onChange={(e) => set('department', e.target.value)} />
          <TextField fullWidth size="small" type="number" label="Openings" inputProps={{ min: 0 }} value={form.openings} onChange={(e) => set('openings', e.target.value)} />
          <TextField fullWidth size="small" select label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {POSITION_PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>{POSITION_PRIORITY_LABELS[p]}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth size="small" select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {POSITION_STATUSES.map((st) => (
              <MenuItem key={st} value={st}>{POSITION_STATUS_LABELS[st]}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth size="small" type="date" label="Target hire date" InputLabelProps={{ shrink: true }} value={form.targetHireDate} onChange={(e) => set('targetHireDate', e.target.value)} />
          <TextField fullWidth size="small" select label="Hiring manager" value={form.hiringManager} onChange={(e) => set('hiringManager', e.target.value)}>
            <MenuItem value=""><em>— None —</em></MenuItem>
            {(users || []).map((u) => (
              <MenuItem key={u._id} value={u._id}>{u.name}{u.email ? ` — ${u.email}` : ''}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <TextField fullWidth size="small" multiline minRows={3} label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Box>
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

// --- File import (Excel/PDF): positions ---------------------------------------
const POSITION_IMPORT_FIELDS = [
  { key: 'title', label: 'Title', required: true },
  { key: 'department', label: 'Department', required: true },
  { key: 'openings', label: 'Openings', hint: 'whole number ≥ 0' },
  { key: 'priority', label: 'Priority', hint: 'low / medium / high / urgent' },
  { key: 'status', label: 'Status', hint: 'open / on_hold / closed / filled' },
  { key: 'openSince', label: 'Open since', hint: 'YYYY-MM-DD' },
  { key: 'targetHireDate', label: 'Target hire date', hint: 'YYYY-MM-DD' },
  { key: 'description', label: 'Description' },
];

function buildPositionImportPayload(m) {
  if (!m.title) throw new Error('Title is required');
  if (!m.department) throw new Error('Department is required');
  const payload = { title: m.title, department: m.department };
  if (m.openings) {
    const openings = Number(String(m.openings).replace(/[^0-9.-]/g, ''));
    if (!Number.isInteger(openings) || openings < 0) throw new Error('Openings must be a whole number ≥ 0');
    payload.openings = openings;
  }
  const priority = (m.priority || '').toLowerCase().trim();
  if (POSITION_PRIORITIES.includes(priority)) payload.priority = priority;
  const status = (m.status || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (POSITION_STATUSES.includes(status)) payload.status = status;
  if (m.openSince) payload.openSince = m.openSince;
  if (m.targetHireDate) payload.targetHireDate = m.targetHireDate;
  if (m.description) payload.description = m.description;
  return payload;
}

// --- Positions panel ----------------------------------------------------------
function PositionsPanel({ perms, users, notify }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['recruitment', 'positions', status, department],
    queryFn: () => positionsApi.list({ limit: 100, ...(status ? { status } : {}), ...(department ? { department } : {}) }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? positionsApi.update(editing._id, payload) : positionsApi.create(payload)),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
      // Creates go to the HRMS first (which assigns the JOB-## code); edits on
      // hrms rows write through to the HRMS opening.
      if (!editing || editing.source === 'hrms') notify({ severity: 'success', message: 'Synced to HRMS' });
    },
    onError: (err) => setSaveError(hrmsErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => positionsApi.remove(id),
    onSuccess: () => invalidate(),
    onError: (err) => notify({ severity: 'error', message: hrmsErrorMessage(err, 'Failed to delete') }),
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => {
    setEditing(null);
    setSaveError('');
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setSaveError('');
    setDialogOpen(true);
  };
  const handleDelete = (row) => {
    if (window.confirm(`Delete position "${row.title}"? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, {
        onSuccess: () => {
          if (row.source === 'hrms') notify({ severity: 'success', message: 'Synced to HRMS' });
        },
      });
    }
  };

  const showActions = perms.update || perms.delete;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {POSITION_STATUSES.map((st) => (
            <MenuItem key={st} value={st}>{POSITION_STATUS_LABELS[st]}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Department" placeholder="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)} sx={{ minWidth: 200 }} />
        {total != null && <Chip label={`${total} total`} size="small" />}
        <Box sx={{ flex: 1 }} />
        {perms.create && (
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        )}
        {perms.create && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New position
          </Button>
        )}
      </Box>

      <ListStates query={query} />

      {!query.isLoading && !query.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={headSx}>
                <TableCell>Title</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Openings</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Open since</TableCell>
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{row.title}</Typography>
                    {row.company?.name && (
                      <Typography variant="caption" color="text.secondary">{row.company.name}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{row.department || '—'}</TableCell>
                  <TableCell>{row.openings ?? '—'}</TableCell>
                  <TableCell><PriorityChip value={row.priority} /></TableCell>
                  <TableCell><StatusChip value={row.status} /></TableCell>
                  <TableCell>{formatDate(row.openSince)}</TableCell>
                  {showActions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
                  <TableCell colSpan={6 + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No positions yet. Add an open requisition or wait for the HRMS sync.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <PositionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        record={editing}
        users={users}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import positions from Excel / PDF"
        entity="job positions (open hiring requisitions)"
        fields={POSITION_IMPORT_FIELDS}
        buildPayload={buildPositionImportPayload}
        createFn={(payload) => positionsApi.create(payload)}
        onDone={invalidate}
      />
    </Box>
  );
}

// --- Candidate dialog ---------------------------------------------------------
const emptyCandidate = {
  name: '',
  email: '',
  phone: '',
  position: '',
  stage: 'applied',
  source: '',
  expectedJoining: '',
  rating: '',
  notes: '',
};

function candidateToForm(c) {
  if (!c) return { ...emptyCandidate };
  return {
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    position: c.position?._id || c.position || '',
    stage: c.stage || 'applied',
    source: c.source || '',
    expectedJoining: c.expectedJoining ? String(c.expectedJoining).slice(0, 10) : '',
    rating: c.rating === 0 || c.rating ? String(c.rating) : '',
    notes: c.notes || '',
  };
}

function CandidateDialog({ open, onClose, onSave, saving, error, record, positions }) {
  const [form, setForm] = useState(emptyCandidate);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(candidateToForm(record));
      setLocalError('');
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) {
      setLocalError('Name is required');
      return;
    }
    if (!form.position) {
      setLocalError('Position is required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      position: form.position,
      stage: form.stage,
      source: form.source,
      notes: form.notes,
      expectedJoining: form.expectedJoining || null,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.rating !== '') payload.rating = Number(form.rating);
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{record ? 'Edit Candidate' : 'New Candidate'}</DialogTitle>
      <DialogContent dividers>
        {(error || localError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || localError}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <TextField fullWidth size="small" label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <TextField fullWidth size="small" select label="Position" required value={form.position} onChange={(e) => set('position', e.target.value)}>
            {(positions || []).map((p) => (
              <MenuItem key={p._id} value={p._id}>{p.title}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth size="small" label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <TextField fullWidth size="small" label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <TextField fullWidth size="small" select label="Stage" value={form.stage} onChange={(e) => set('stage', e.target.value)}>
            {CANDIDATE_STAGES.map((st) => (
              <MenuItem key={st} value={st}>{CANDIDATE_STAGE_LABELS[st]}</MenuItem>
            ))}
          </TextField>
          <TextField fullWidth size="small" label="Source" placeholder="referral / linkedin…" value={form.source} onChange={(e) => set('source', e.target.value)} />
          <TextField fullWidth size="small" type="date" label="Expected joining" InputLabelProps={{ shrink: true }} value={form.expectedJoining} onChange={(e) => set('expectedJoining', e.target.value)} />
          <TextField fullWidth size="small" type="number" label="Rating (0-5)" inputProps={{ min: 0, max: 5, step: 0.5 }} value={form.rating} onChange={(e) => set('rating', e.target.value)} />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <TextField fullWidth size="small" multiline minRows={3} label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Box>
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

// --- File import (Excel/PDF): candidates --------------------------------------
const CANDIDATE_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'position', label: 'Position', required: true, hint: 'existing position title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'stage', label: 'Stage', hint: 'applied / screening / interview / offer / hired / rejected / dropped' },
  { key: 'source', label: 'Source', hint: 'referral / linkedin…' },
  { key: 'appliedAt', label: 'Applied date', hint: 'YYYY-MM-DD' },
  { key: 'expectedJoining', label: 'Expected joining', hint: 'YYYY-MM-DD' },
  { key: 'rating', label: 'Rating', hint: 'number 0-5' },
  { key: 'notes', label: 'Notes' },
];

// `position` in the create schema is an ObjectId — resolve the file's position
// title (or a raw id) against the already-loaded position pool.
function buildCandidateImportPayload(m, positions) {
  if (!m.name) throw new Error('Name is required');
  if (!m.position) throw new Error('Position is required');
  const wanted = m.position.toLowerCase();
  const match = (positions || []).find(
    (p) => p._id === m.position || (p.title || '').toLowerCase() === wanted
  );
  if (!match) throw new Error(`Position "${m.position}" not found — create the position first`);
  const payload = { name: m.name, position: match._id };
  if (m.email) payload.email = m.email;
  if (m.phone) payload.phone = m.phone;
  const stage = (m.stage || '').toLowerCase().trim();
  if (CANDIDATE_STAGES.includes(stage)) payload.stage = stage;
  if (m.source) payload.source = m.source;
  if (m.appliedAt) payload.appliedAt = m.appliedAt;
  if (m.expectedJoining) payload.expectedJoining = m.expectedJoining;
  if (m.rating) {
    const rating = Number(String(m.rating).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw new Error('Rating must be a number between 0 and 5');
    payload.rating = rating;
  }
  if (m.notes) payload.notes = m.notes;
  return payload;
}

// --- Candidates panel ---------------------------------------------------------
function CandidatesPanel({ perms, positions, notify }) {
  const qc = useQueryClient();
  const [position, setPosition] = useState('');
  const [stage, setStage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const query = useQuery({
    queryKey: ['recruitment', 'candidates', position, stage],
    queryFn: () => candidatesApi.list({ limit: 100, ...(position ? { position } : {}), ...(stage ? { stage } : {}) }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recruitment'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? candidatesApi.update(editing._id, payload) : candidatesApi.create(payload)),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
      // Creates go to the HRMS first (which assigns the CND-## code); edits on
      // hrms rows write through to the HRMS candidate.
      if (!editing || editing.sourceSystem === 'hrms') notify({ severity: 'success', message: 'Synced to HRMS' });
    },
    onError: (err) => setSaveError(hrmsErrorMessage(err, 'Failed to save')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => candidatesApi.remove(id),
    onSuccess: () => invalidate(),
    onError: (err) => notify({ severity: 'error', message: hrmsErrorMessage(err, 'Failed to delete') }),
  });

  // Stage moves on hrms candidates forward to the HRMS pipeline (write-through).
  const stageMutation = useMutation({
    mutationFn: ({ id, nextStage }) => candidatesApi.moveStage(id, nextStage),
    onSuccess: (_res, { isHrms }) => {
      invalidate();
      if (isHrms) notify({ severity: 'success', message: 'Synced to HRMS' });
    },
    onError: (err) => notify({ severity: 'error', message: hrmsErrorMessage(err, 'Failed to move stage') }),
  });

  const rows = query.data?.data || [];
  const total = query.data?.meta?.total;

  const openCreate = () => {
    setEditing(null);
    setSaveError('');
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setSaveError('');
    setDialogOpen(true);
  };
  const handleDelete = (row) => {
    if (window.confirm(`Delete candidate "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row._id, {
        onSuccess: () => {
          if (row.sourceSystem === 'hrms') notify({ severity: 'success', message: 'Synced to HRMS' });
        },
      });
    }
  };

  const showActions = perms.update || perms.delete;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" select label="Position" value={position} onChange={(e) => setPosition(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value=""><em>All positions</em></MenuItem>
          {(positions || []).map((p) => (
            <MenuItem key={p._id} value={p._id}>{p.title}</MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value=""><em>All stages</em></MenuItem>
          {CANDIDATE_STAGES.map((st) => (
            <MenuItem key={st} value={st}>{CANDIDATE_STAGE_LABELS[st]}</MenuItem>
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
            New candidate
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
                <TableCell>Position</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell>Applied</TableCell>
                {perms.update && <TableCell>Move stage</TableCell>}
                {showActions && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{row.name}</Typography>
                    {row.email && (
                      <Typography variant="caption" color="text.secondary">{row.email}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{row.position?.title || '—'}</TableCell>
                  <TableCell><StageChip value={row.stage} /></TableCell>
                  <TableCell>{formatDate(row.appliedAt)}</TableCell>
                  {perms.update && (
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        variant="standard"
                        value={row.stage}
                        onChange={(e) =>
                          stageMutation.mutate({
                            id: row._id,
                            nextStage: e.target.value,
                            isHrms: row.sourceSystem === 'hrms',
                          })
                        }
                        sx={{ minWidth: 130 }}
                      >
                        {CANDIDATE_STAGES.map((st) => (
                          <MenuItem key={st} value={st}>{CANDIDATE_STAGE_LABELS[st]}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                  )}
                  {showActions && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
                  <TableCell colSpan={4 + (perms.update ? 1 : 0) + (showActions ? 1 : 0)}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                      No candidates yet. Add one manually or wait for the HRMS sync.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <CandidateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        record={editing}
        positions={positions}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import candidates from Excel / PDF"
        entity="job candidates (hiring pipeline applicants)"
        fields={CANDIDATE_IMPORT_FIELDS}
        buildPayload={(m) => buildCandidateImportPayload(m, positions)}
        createFn={(payload) => candidatesApi.create(payload)}
        onDone={invalidate}
      />
    </Box>
  );
}

// --- Page ---------------------------------------------------------------------
const TABS = ['Positions', 'Candidates'];

export default function RecruitmentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [snack, setSnack] = useState(null); // { severity, message }

  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { read: true, create: true, update: true, delete: true };

  // Position pool for candidate filters + dialog select.
  const positionsRefQuery = useQuery({
    queryKey: ['recruitment', 'positions-ref'],
    queryFn: async () => (await positionsApi.list({ limit: 200 })).data || [],
    retry: false,
  });
  const positions = positionsRefQuery.data || [];

  // User pool for the hiring-manager select (active directory, auth-only).
  const usersRefQuery = useQuery({
    queryKey: ['recruitment', 'users-ref'],
    queryFn: usersApi.orgChart,
    retry: false,
  });
  const users = usersRefQuery.data || [];

  // Live updates: refetch any recruitment query when data changes anywhere.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['recruitment'] });
    socket.on('recruitment:changed', handler);
    return () => socket.off('recruitment:changed', handler);
  }, [qc]);

  return (
    <Box>
      <PageHeader
        title="Recruitment"
        subtitle="Track open positions and move candidates through your hiring pipeline."
      />

      <SummarySection />

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          {TABS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Paper>

      {tab === 0 && <PositionsPanel perms={perms} users={users} notify={setSnack} />}
      {tab === 1 && <CandidatesPanel perms={perms} positions={positions} notify={setSnack} />}

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
    </Box>
  );
}
