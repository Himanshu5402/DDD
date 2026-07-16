import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tabs,
  Tab,
  Chip,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Snackbar,
  TextField,
  MenuItem,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SyncIcon from '@mui/icons-material/Sync';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  employeeAnalyticsApi,
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABELS,
} from '../../api/employeeAnalytics.api.js';
import api, { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const ATTENDANCE_COLOR = {
  present: 'success',
  wfh: 'info',
  half_day: 'warning',
  leave: 'secondary',
  absent: 'error',
  holiday: 'default',
};

/** Local calendar date -> 'YYYY-MM-DD' (for date inputs / query params). */
function toDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Stored record dates are UTC start-of-day; format them in UTC to avoid timezone drift. */
function recordDateInput(value) {
  const d = new Date(value);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRecordDate(value) {
  return new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

const RANGE_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
];

function rangeToParams(range) {
  const today = new Date();
  const to = toDateInput(today);
  if (range === 'this_month') {
    return { from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  const days = range === 'last_90' ? 90 : 30;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: toDateInput(from), to };
}

export default function EmployeeAnalyticsPage() {
  const qc = useQueryClient();
  const { hasPermission, user: authUser } = useAuth();

  const canCreate = hasPermission('employee_analytics', 'create');
  const canUpdate = hasPermission('employee_analytics', 'update');
  const canDelete = hasPermission('employee_analytics', 'delete');
  const canReadUsers = hasPermission('users', 'read');

  const [tab, setTab] = useState('team');

  // Employee options for filters + the record dialog.
  const usersQuery = useQuery({
    queryKey: ['users', 'employee-analytics-options'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 100 } });
      return res.data.data;
    },
    enabled: canReadUsers,
  });
  const users = usersQuery.data || [];

  // Live updates: refetch whenever any client changes analytics data.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['employee-analytics'] });
    socket.on('employee_analytics:changed', handler);
    return () => socket.off('employee_analytics:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <PageHeader
        title="Employee Analytics"
        subtitle="Attendance, hours, productivity and KPI insights across the team."
      />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Team" value="team" />
        <Tab label="Records" value="records" />
      </Tabs>

      {tab === 'team' ? (
        <TeamTab canSync={canUpdate} />
      ) : (
        <RecordsTab
          users={users}
          canReadUsers={canReadUsers}
          authUser={authUser}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      )}
    </Box>
  );
}

/** Team leaderboard over a selectable date range + the HRMS sync entry point. */
function TeamTab({ canSync }) {
  const [range, setRange] = useState('last_30');
  const [snack, setSnack] = useState(null); // { severity, message }

  const params = rangeToParams(range);
  const teamQuery = useQuery({
    queryKey: ['employee-analytics', 'team', params],
    queryFn: () => employeeAnalyticsApi.team(params),
  });

  const syncMutation = useMutation({
    mutationFn: () => employeeAnalyticsApi.hrmsSync(),
    onSuccess: (res) => {
      const status = res.data?.status || 'unknown';
      setSnack({
        severity: status === 'not_configured' ? 'info' : 'success',
        message: res.message || `HRMS sync status: ${status}`,
      });
    },
    onError: (err) => setSnack({ severity: 'error', message: getErrorMessage(err, 'HRMS sync failed') }),
  });

  const team = teamQuery.data?.team || [];

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 2.5, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <TextField
          select
          size="small"
          label="Range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {RANGE_OPTIONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {canSync && (
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Syncing…' : 'HRMS sync'}
          </Button>
        )}
      </Paper>

      {teamQuery.error && (
        <Alert severity="error">{getErrorMessage(teamQuery.error, 'Failed to load team analytics')}</Alert>
      )}

      {teamQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Department</TableCell>
                <TableCell align="right">Present days</TableCell>
                <TableCell align="right">Avg hours</TableCell>
                <TableCell sx={{ width: 240 }}>Avg productivity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {team.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No records in this range yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {team.map((row) => (
                <TableRow key={row.userId} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{row.name || 'Unknown user'}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.email || ''}</Typography>
                  </TableCell>
                  <TableCell>{row.department || '—'}</TableCell>
                  <TableCell align="right">{row.presentDays}</TableCell>
                  <TableCell align="right">{row.avgHours}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.max(0, Math.min(100, row.avgProductivity || 0))}
                        sx={{ flex: 1, height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                        {row.avgProductivity ?? 0}%
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

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

/** Daily records list with filters + create/edit/delete. */
function RecordsTab({ users, canReadUsers, authUser, canCreate, canUpdate, canDelete }) {
  const qc = useQueryClient();
  const [userFilter, setUserFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const params = { limit: 100 };
  if (userFilter) params.user = userFilter;
  if (from) params.from = from;
  if (to) params.to = to;

  const listQuery = useQuery({
    queryKey: ['employee-analytics', 'records', params],
    queryFn: () => employeeAnalyticsApi.listRecords(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['employee-analytics'] });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing
        ? employeeAnalyticsApi.updateRecord(editing._id, payload)
        : employeeAnalyticsApi.createRecord(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save record')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => employeeAnalyticsApi.removeRecord(id),
    onSuccess: invalidate,
  });

  const records = listQuery.data?.data || [];
  const total = listQuery.data?.meta?.total ?? records.length;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (record) => { setEditing(record); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (record) => {
    const name = record.user?.name || 'this employee';
    if (window.confirm(`Delete the record for ${name} on ${formatRecordDate(record.date)}?`)) {
      deleteMutation.mutate(record._id);
    }
  };

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 2.5, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {canReadUsers && (
          <TextField
            select
            size="small"
            label="Employee"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All employees</MenuItem>
            {users.map((u) => (
              <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          size="small"
          type="date"
          label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Box sx={{ flex: 1 }} />
        <Chip label={`${total} total`} />
        {canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New record
          </Button>
        )}
      </Paper>

      {listQuery.error && (
        <Alert severity="error">{getErrorMessage(listQuery.error, 'Failed to load records')}</Alert>
      )}

      {listQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Attendance</TableCell>
                <TableCell align="right">Hours</TableCell>
                <TableCell align="right">Productivity</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No records found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {records.map((r) => (
                <TableRow key={r._id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{r.user?.name || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.user?.email || ''}</Typography>
                  </TableCell>
                  <TableCell>{formatRecordDate(r.date)}</TableCell>
                  <TableCell>
                    <Chip
                      label={ATTENDANCE_LABELS[r.attendance] || r.attendance}
                      size="small"
                      color={ATTENDANCE_COLOR[r.attendance] || 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">{r.hoursWorked}</TableCell>
                  <TableCell align="right">{r.productivityScore}%</TableCell>
                  <TableCell align="right">
                    {canUpdate && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(r)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(r)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <RecordDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        record={editing}
        users={users.length ? users : authUser ? [authUser] : []}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}

const KPI_ROWS = [0, 1, 2];

function emptyForm() {
  return {
    user: '',
    date: toDateInput(new Date()),
    attendance: 'present',
    hoursWorked: '8',
    productivityScore: '0',
    notes: '',
    kpis: KPI_ROWS.map(() => ({ name: '', score: '' })),
  };
}

/** Create / edit form for a daily employee record. */
function RecordDialog({ open, onClose, onSave, record, users, saving, error }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({
        user: record.user?._id || record.user || '',
        date: record.date ? recordDateInput(record.date) : toDateInput(new Date()),
        attendance: record.attendance || 'present',
        hoursWorked: String(record.hoursWorked ?? 0),
        productivityScore: String(record.productivityScore ?? 0),
        notes: record.notes || '',
        kpis: KPI_ROWS.map((i) =>
          record.kpis?.[i]
            ? { name: record.kpis[i].name || '', score: String(record.kpis[i].score ?? 0) }
            : { name: '', score: '' }
        ),
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, record]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setKpi = (index, key) => (e) =>
    setForm((f) => ({
      ...f,
      kpis: f.kpis.map((k, i) => (i === index ? { ...k, [key]: e.target.value } : k)),
    }));

  const submit = () => {
    const payload = {
      user: form.user,
      date: form.date,
      attendance: form.attendance,
      hoursWorked: Number(form.hoursWorked) || 0,
      productivityScore: Number(form.productivityScore) || 0,
      notes: form.notes,
      kpis: form.kpis
        .filter((k) => k.name.trim())
        .map((k) => ({ name: k.name.trim(), score: Number(k.score) || 0 })),
    };
    onSave(payload);
  };

  const canSubmit = Boolean(form.user && form.date) && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{record ? 'Edit record' : 'New record'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              select
              label="Employee"
              value={form.user}
              onChange={set('user')}
              required
              sx={{ flex: 1, minWidth: 200 }}
            >
              {users.map((u) => (
                <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Date"
              value={form.date}
              onChange={set('date')}
              required
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 180 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              select
              label="Attendance"
              value={form.attendance}
              onChange={set('attendance')}
              sx={{ flex: 1, minWidth: 160 }}
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{ATTENDANCE_LABELS[s]}</MenuItem>
              ))}
            </TextField>
            <TextField
              type="number"
              label="Hours worked"
              value={form.hoursWorked}
              onChange={set('hoursWorked')}
              inputProps={{ min: 0, max: 24, step: 0.5 }}
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              type="number"
              label="Productivity (0–100)"
              value={form.productivityScore}
              onChange={set('productivityScore')}
              inputProps={{ min: 0, max: 100 }}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>KPIs (optional)</Typography>
            <Stack spacing={1.25}>
              {KPI_ROWS.map((i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                  <TextField
                    size="small"
                    label={`KPI ${i + 1} name`}
                    value={form.kpis[i].name}
                    onChange={setKpi(i, 'name')}
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Score"
                    value={form.kpis[i].score}
                    onChange={setKpi(i, 'score')}
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ flex: 1 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>

          <TextField label="Notes" value={form.notes} onChange={set('notes')} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
