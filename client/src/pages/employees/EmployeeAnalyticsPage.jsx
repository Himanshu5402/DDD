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
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  employeeAnalyticsApi,
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABELS,
} from '../../api/employeeAnalytics.api.js';
import api, { getErrorMessage } from '../../lib/axios.js';
import { hrmsErrorMessage } from '../../api/integrations.api.js';
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
  const { user: authUser } = useAuth();

  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canCreate = perms.create;
  const canUpdate = perms.update;
  const canDelete = perms.delete;
  const canReadUsers = perms.read;

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
        <Tab label="Employees" value="employees" />
        <Tab label="Records" value="records" />
      </Tabs>

      {tab === 'team' && <TeamTab canSync={canUpdate} />}
      {tab === 'employees' && <EmployeesTab users={users} usersQuery={usersQuery} />}
      {tab === 'records' && (
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

// --- Employees (HRMS master data write-through) -------------------------------

const EMPLOYMENT_STATUS_LABELS = {
  active: 'Active',
  on_notice: 'On notice',
  on_leave: 'On leave',
  suspended: 'Inactive',
  exited: 'Exited',
};
const EMPLOYMENT_STATUS_COLOR = {
  active: 'success',
  on_notice: 'warning',
  on_leave: 'info',
  suspended: 'warning',
  exited: 'default',
};

// Reverse maps: DDD mirror fields -> HRMS enums (for pre-filling the edit form).
const ACCESS_FROM_LEVEL = { hr_admin: 'HR Admin', manager: 'HR Representative', employee: 'Employee' };
const STATUS_FROM_EMPLOYMENT = { active: 'Active', suspended: 'Inactive', exited: 'Exited' };

const HRMS_ACCESS_OPTIONS = ['HR Admin', 'HR Representative', 'Finance Representative', 'Employee'];
const HRMS_STATUS_OPTIONS = ['Active', 'Inactive', 'Exited'];
const HRMS_GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
];

function isoDateInput(v) {
  return v ? String(v).slice(0, 10) : '';
}

/**
 * Employee directory with owner create/edit against the HRMS master data.
 * Writes forward to the HRMS integration API; the mirror here refreshes via
 * the echoed employee.* events (and the users-query invalidation below).
 */
function EmployeesTab({ users, usersQuery }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // DDD user doc (source hrms) or null
  const [saveError, setSaveError] = useState('');
  const [snack, setSnack] = useState(null); // { severity, message }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['employee-analytics'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing
        ? employeeAnalyticsApi.updateHrmsEmployee(editing.hrmsId, payload)
        : employeeAnalyticsApi.createHrmsEmployee(payload),
    onSuccess: (res) => {
      setDialogOpen(false);
      setSaveError('');
      refresh();
      setSnack({ severity: 'success', message: res?.message || 'Synced to HRMS' });
    },
    onError: (err) => setSaveError(hrmsErrorMessage(err, 'Failed to save employee')),
  });

  const toggleMutation = useMutation({
    mutationFn: (empId) => employeeAnalyticsApi.toggleHrmsEmployee(empId),
    onSuccess: (res) => {
      refresh();
      setSnack({ severity: 'success', message: res?.message || 'Synced to HRMS' });
    },
    onError: (err) =>
      setSnack({ severity: 'error', message: hrmsErrorMessage(err, 'Failed to toggle status') }),
  });

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (u) => { setEditing(u); setSaveError(''); setDialogOpen(true); };
  const handleToggle = (u) => {
    if (window.confirm(`Toggle ${u.name}'s Active/Inactive status in the HRMS?`)) {
      toggleMutation.mutate(u.hrmsId);
    }
  };

  const rows = users || [];

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 2.5, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="body2" color="text.secondary">
          People master data lives in the HRMS — changes here are written through and mirrored back.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${rows.length} people`} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New employee
        </Button>
      </Paper>

      {usersQuery.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(usersQuery.error, 'Failed to load employees')}</Alert>
      )}

      {usersQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Emp ID</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Designation</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No employees yet — run the HRMS sync or add one.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((u) => {
                const isHrms = u.source === 'hrms' && Boolean(u.hrmsId);
                return (
                  <TableRow key={u._id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{u.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{u.email || ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{u.hrmsId || '—'}</TableCell>
                    <TableCell>{u.department || '—'}</TableCell>
                    <TableCell>{u.designation || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={EMPLOYMENT_STATUS_LABELS[u.employmentStatus] || u.employmentStatus || '—'}
                        size="small"
                        color={EMPLOYMENT_STATUS_COLOR[u.employmentStatus] || 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={isHrms ? 'HRMS' : 'Manual'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {isHrms ? (
                        <>
                          <Tooltip title="Edit in HRMS">
                            <IconButton size="small" onClick={() => openEdit(u)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Toggle Active/Inactive in HRMS">
                            <span>
                              <IconButton
                                size="small"
                                color={u.employmentStatus === 'active' ? 'warning' : 'success'}
                                onClick={() => handleToggle(u)}
                                disabled={toggleMutation.isPending}
                              >
                                <PowerSettingsNewIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip title="Managed in DDD (Users directory)">
                          <Typography component="span" variant="caption" color="text.disabled">—</Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <EmployeeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        record={editing}
        users={users}
        saving={saveMutation.isPending}
        error={saveError}
      />

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

function emptyEmployeeForm() {
  return {
    name: '',
    email: '',
    dept: '',
    role: '',
    phone: '',
    join: '',
    dob: '',
    salary: '',
    gender: '',
    access: '',
    managerId: '',
    status: '',
  };
}

/** DDD mirror user (source hrms) -> HRMS-shaped form values. */
function employeeToForm(u, users) {
  if (!u) return emptyEmployeeForm();
  const mgrId = u.reportsTo?._id || u.reportsTo || null;
  const manager = mgrId ? (users || []).find((x) => String(x._id) === String(mgrId)) : null;
  return {
    name: u.name || '',
    email: u.email || '',
    dept: u.department || '',
    role: u.designation || '',
    phone: u.phone || '',
    join: isoDateInput(u.dateOfJoining),
    dob: isoDateInput(u.dateOfBirth),
    salary: '', // never mirrored into DDD — set only when changing it
    gender: '', // not mirrored — set only when changing it
    access: ACCESS_FROM_LEVEL[u.accessLevel] || '',
    managerId: manager?.hrmsId || '',
    status: STATUS_FROM_EMPLOYMENT[u.employmentStatus] || '',
  };
}

/**
 * Create / edit form for an HRMS employee (HRMS field shape: name, dept, role,
 * email, phone, join, dob, salary, gender, access, managerId [+ status on edit]).
 */
function EmployeeDialog({ open, onClose, onSave, record, users, saving, error }) {
  const [form, setForm] = useState(emptyEmployeeForm);

  useEffect(() => {
    if (open) setForm(employeeToForm(record, users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const managerOptions = (users || []).filter(
    (u) => u.hrmsId && (!record || String(u._id) !== String(record._id))
  );

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      dept: form.dept.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
    };
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.join) payload.join = form.join;
    if (form.dob) payload.dob = form.dob;
    if (form.salary !== '' && !Number.isNaN(Number(form.salary))) payload.salary = Number(form.salary);
    if (form.gender) payload.gender = form.gender;
    if (form.access) payload.access = form.access;
    if (form.managerId) payload.managerId = form.managerId;
    if (record && form.status) payload.status = form.status;
    onSave(payload);
  };

  const canSubmit =
    form.name.trim().length > 0 &&
    form.dept.trim().length > 0 &&
    form.role.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.email.trim()) &&
    !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{record ? `Edit employee ${record.hrmsId}` : 'New employee'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus sx={{ flex: 1, minWidth: 200 }} />
            <TextField label="Email" value={form.email} onChange={set('email')} required sx={{ flex: 1, minWidth: 200 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Department" value={form.dept} onChange={set('dept')} required sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Designation" value={form.role} onChange={set('role')} required sx={{ flex: 1, minWidth: 160 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Phone" value={form.phone} onChange={set('phone')} sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Salary (monthly, INR)" value={form.salary} onChange={set('salary')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 160 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Date of joining" type="date" value={form.join} onChange={set('join')} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Date of birth" type="date" value={form.dob} onChange={set('dob')} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 160 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField select label="Gender" value={form.gender} onChange={set('gender')} sx={{ flex: 1, minWidth: 140 }}>
              <MenuItem value=""><em>{record ? 'Keep unchanged' : 'Not set'}</em></MenuItem>
              {HRMS_GENDER_OPTIONS.map((g) => (
                <MenuItem key={g.value} value={g.value}>{g.label}</MenuItem>
              ))}
            </TextField>
            <TextField select label="HRMS access" value={form.access} onChange={set('access')} sx={{ flex: 1, minWidth: 200 }}>
              <MenuItem value=""><em>{record ? 'Keep unchanged' : 'Employee (default)'}</em></MenuItem>
              {HRMS_ACCESS_OPTIONS.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField select label="Manager" value={form.managerId} onChange={set('managerId')} sx={{ flex: 1, minWidth: 200 }}>
              <MenuItem value=""><em>— None —</em></MenuItem>
              {managerOptions.map((u) => (
                <MenuItem key={u.hrmsId} value={u.hrmsId}>{u.name} ({u.hrmsId})</MenuItem>
              ))}
            </TextField>
            {record && (
              <TextField select label="Status" value={form.status} onChange={set('status')} sx={{ flex: 1, minWidth: 160 }}>
                <MenuItem value=""><em>Keep unchanged</em></MenuItem>
                {HRMS_STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : record ? 'Save to HRMS' : 'Create in HRMS'}
        </Button>
      </DialogActions>
    </Dialog>
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
