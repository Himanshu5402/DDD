import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Grid,
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
  TextField,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Divider,
  Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import {
  payrollApi,
  PAYROLL_STATUSES,
  PAYROLL_STATUS_LABELS,
} from '../../api/payroll.api.js';
import api from '../../lib/axios.js';
import { getErrorMessage } from '../../lib/axios.js';
import { hrmsErrorMessage } from '../../api/integrations.api.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const STATUS_COLOR = { draft: 'default', processing: 'warning', processed: 'info', paid: 'success' };

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatInr(amount) {
  if (amount === null || amount === undefined) return '—';
  try {
    return inr.format(amount);
  } catch {
    return `₹${amount}`;
  }
}

const EMPTY_FORM = {
  month: '',
  company: '',
  status: 'processed',
  totalCost: '',
  headcount: '',
  reimbursementsPending: '',
  reimbursementsAmount: '',
  byDepartment: [],
};

/* ------------------------- File import (Excel/PDF) ------------------------ */

const PAYROLL_IMPORT_FIELDS = [
  { key: 'month', label: 'Month', required: true, hint: 'YYYY-MM' },
  { key: 'status', label: 'Status', hint: 'draft / processing / processed / paid' },
  { key: 'totalCost', label: 'Total cost', hint: 'number ≥ 0' },
  { key: 'headcount', label: 'Headcount', hint: 'number ≥ 0' },
  { key: 'reimbursementsPending', label: 'Reimbursements pending', hint: 'count' },
  { key: 'reimbursementsAmount', label: 'Reimbursements amount', hint: 'number ≥ 0' },
];

function buildPayrollImportPayload(m) {
  const month = (m.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must be in YYYY-MM format');
  const payload = { month };
  const status = (m.status || '').toLowerCase().trim();
  if (status) {
    if (!PAYROLL_STATUSES.includes(status)) {
      throw new Error(`Status must be one of: ${PAYROLL_STATUSES.join(', ')}`);
    }
    payload.status = status;
  }
  const num = (label, v) => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`);
    return n;
  };
  if (m.totalCost) payload.totalCost = num('Total cost', m.totalCost);
  if (m.headcount) payload.headcount = num('Headcount', m.headcount);
  if (m.reimbursementsPending) payload.reimbursementsPending = num('Reimbursements pending', m.reimbursementsPending);
  if (m.reimbursementsAmount) payload.reimbursementsAmount = num('Reimbursements amount', m.reimbursementsAmount);
  return payload;
}

export default function PayrollPage() {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { read: true, create: true, update: true, delete: true };

  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runError, setRunError] = useState('');
  const [viewing, setViewing] = useState(null); // period whose detail dialog is open
  const [snack, setSnack] = useState(null); // { severity, message }

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data.companies;
    },
    staleTime: 5 * 60_000,
  });

  const params = {};
  if (status) params.status = status;
  if (company) params.company = company;

  const listQuery = useQuery({
    queryKey: ['payroll', { status, company }],
    queryFn: () => payrollApi.list(params),
  });

  const summaryQuery = useQuery({
    queryKey: ['payroll', 'summary'],
    queryFn: () => payrollApi.summary(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll'] });
  };

  // Live updates: refetch whenever any client changes payroll data.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => invalidate();
    socket.on('payroll:changed', handler);
    return () => socket.off('payroll:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing ? payrollApi.update(editing._id, payload) : payrollApi.create(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save payroll period')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => payrollApi.remove(id),
    onSuccess: invalidate,
    onError: (err) =>
      setSnack({ severity: 'error', message: getErrorMessage(err, 'Failed to delete the period') }),
  });

  // Write-through: run the month's payroll inside the HRMS; the mirror row
  // refreshes via the echo event (payroll:changed) + invalidation below.
  const runHrmsMutation = useMutation({
    mutationFn: (month) => payrollApi.runHrms(month),
    onSuccess: (res, month) => {
      setRunDialogOpen(false);
      setRunError('');
      invalidate();
      setSnack({ severity: 'success', message: res?.message || `Payroll run in HRMS for ${month}` });
    },
    onError: (err) => setRunError(hrmsErrorMessage(err, 'Failed to run payroll in HRMS')),
  });

  const periods = listQuery.data?.data || [];
  const total = listQuery.data?.meta?.total ?? periods.length;
  const summary = summaryQuery.data || {};
  const latest = summary.latest || null;
  const trend = summary.trend || [];
  const trendMax = Math.max(1, ...trend.map((t) => t.totalCost || 0));

  const companyName = (c) => {
    if (!c) return 'All companies';
    if (typeof c === 'object') return c.name || c.code || '—';
    const match = companies.find((x) => x._id === c);
    return match ? match.name : '—';
  };

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (period) => { setEditing(period); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (period) => {
    if (window.confirm(`Delete the payroll period for ${period.month}? This cannot be undone.`)) {
      deleteMutation.mutate(period._id);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Payroll"
        subtitle="Monthly payroll — cost roll-ups plus every employee's salary breakup and reimbursements, synced from HRMS."
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip label={`${total} periods`} />
            {perms.create && (
              <Button
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                onClick={() => { setRunError(''); setRunDialogOpen(true); }}
              >
                Run payroll in HRMS
              </Button>
            )}
            {perms.create && (
              <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
            )}
            {perms.create && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New period
              </Button>
            )}
          </Box>
        }
      />

      {/* Summary metric cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <MetricCard
          label="This month payroll cost"
          value={latest ? formatInr(latest.totalCost) : '—'}
          hint={latest ? latest.month : 'No data yet'}
          loading={summaryQuery.isLoading}
        />
        <MetricCard
          label="Headcount"
          value={latest ? latest.headcount ?? 0 : '—'}
          hint={latest ? latest.month : 'No data yet'}
          loading={summaryQuery.isLoading}
        />
        <MetricCard
          label="Reimbursements pending"
          value={latest ? latest.reimbursementsPending ?? 0 : '—'}
          hint={latest ? formatInr(latest.reimbursementsAmount) : '—'}
          loading={summaryQuery.isLoading}
        />
      </Grid>

      {/* Trend + by-department */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>6-month cost trend</Typography>
            {trend.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No payroll history yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {trend.map((t) => (
                  <Box key={t.month} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="caption" sx={{ width: 64, flexShrink: 0, fontFamily: 'monospace' }}>
                      {t.month}
                    </Typography>
                    <Box
                      sx={{
                        height: 10,
                        borderRadius: 1,
                        bgcolor: 'primary.main',
                        width: `${Math.max(4, ((t.totalCost || 0) / trendMax) * 100)}%`,
                        transition: 'width .3s',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {formatInr(t.totalCost)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              By department{latest ? ` — ${latest.month}` : ''}
            </Typography>
            {!latest || (latest.byDepartment || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No department breakdown for the latest period.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Department</TableCell>
                    <TableCell align="right">Headcount</TableCell>
                    <TableCell align="right">Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {latest.byDepartment.map((d, i) => (
                    <TableRow key={d.department || i}>
                      <TableCell>{d.department || '—'}</TableCell>
                      <TableCell align="right">{d.headcount ?? 0}</TableCell>
                      <TableCell align="right">{formatInr(d.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}
      >
        <TextField
          select
          size="small"
          label="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All companies</MenuItem>
          {companies.map((c) => (
            <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {PAYROLL_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{PAYROLL_STATUS_LABELS[s]}</MenuItem>
          ))}
        </TextField>
      </Paper>

      {listQuery.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(listQuery.error, 'Failed to load payroll periods')}</Alert>
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
                <TableCell>Month</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Headcount</TableCell>
                <TableCell align="right">Total cost</TableCell>
                <TableCell align="right">Reimb. pending</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {periods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No payroll periods yet. They appear here once HRMS syncs or you add one manually.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {periods.map((p) => {
                const isHrms = p.source === 'hrms';
                return (
                  <TableRow key={p._id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, fontFamily: 'monospace' }}>{p.month}</Typography>
                    </TableCell>
                    <TableCell>{companyName(p.company)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Chip
                          label={PAYROLL_STATUS_LABELS[p.status] || p.status}
                          size="small"
                          color={STATUS_COLOR[p.status] || 'default'}
                        />
                        {isHrms && <Chip label="HRMS" size="small" variant="outlined" />}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{p.headcount ?? 0}</TableCell>
                    <TableCell align="right">{formatInr(p.totalCost)}</TableCell>
                    <TableCell align="right">{p.reimbursementsPending ?? 0}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="View salaries & reimbursements">
                        <IconButton size="small" onClick={() => setViewing(p)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {perms.update && (
                        <Tooltip title={isHrms ? 'Managed by HRMS — read only' : 'Edit'}>
                          <span>
                            <IconButton size="small" onClick={() => openEdit(p)} disabled={isHrms}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {perms.delete && (
                        <Tooltip title={isHrms ? 'Managed by HRMS — read only' : 'Delete'}>
                          <span>
                            <IconButton size="small" color="error" onClick={() => handleDelete(p)} disabled={isHrms}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
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

      <PeriodDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        period={editing}
        companies={companies}
        saving={saveMutation.isPending}
        error={saveError}
      />

      <RunHrmsDialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        onRun={(month) => runHrmsMutation.mutate(month)}
        running={runHrmsMutation.isPending}
        error={runError}
      />

      <PeriodDetailDialog period={viewing} onClose={() => setViewing(null)} />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import payroll periods from Excel / PDF"
        entity="monthly payroll period cost roll-ups (aggregates, never individual salaries)"
        fields={PAYROLL_IMPORT_FIELDS}
        buildPayload={buildPayrollImportPayload}
        createFn={(payload) => payrollApi.create(payload)}
        onDone={invalidate}
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

/** Current local month as 'YYYY-MM' (default for the HRMS payroll run). */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Month picker for the HRMS payroll run (write-through owner action). */
function RunHrmsDialog({ open, onClose, onRun, running, error }) {
  const [month, setMonth] = useState(currentMonth());

  useEffect(() => {
    if (open) setMonth(currentMonth());
  }, [open]);

  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Run payroll in HRMS</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Starts the payroll run for the selected month inside the HRMS. The
            aggregates here refresh automatically once the HRMS reports back.
          </Typography>
          <TextField
            label="Month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onRun(month)} disabled={!monthValid || running}>
          {running ? 'Running…' : 'Run payroll'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MetricCard({ label, value, hint, loading }) {
  return (
    <Grid item xs={12} sm={4}>
      <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {loading ? (
          <Box sx={{ py: 1 }}><CircularProgress size={20} /></Box>
        ) : (
          <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>{value}</Typography>
        )}
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </Paper>
    </Grid>
  );
}

/** Create / edit form for a payroll period, including a simple by-department editor. */
function PeriodDialog({ open, onClose, onSave, period, companies, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (period) {
      setForm({
        month: period.month || '',
        company: period.company?._id || period.company || '',
        status: period.status || 'processed',
        totalCost: period.totalCost ?? '',
        headcount: period.headcount ?? '',
        reimbursementsPending: period.reimbursementsPending ?? '',
        reimbursementsAmount: period.reimbursementsAmount ?? '',
        byDepartment: (period.byDepartment || []).map((d) => ({
          department: d.department || '',
          headcount: d.headcount ?? '',
          cost: d.cost ?? '',
        })),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, period]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setDept = (idx, key) => (e) =>
    setForm((f) => ({
      ...f,
      byDepartment: f.byDepartment.map((d, i) => (i === idx ? { ...d, [key]: e.target.value } : d)),
    }));

  const addDept = () =>
    setForm((f) => ({ ...f, byDepartment: [...f.byDepartment, { department: '', headcount: '', cost: '' }] }));

  const removeDept = (idx) =>
    setForm((f) => ({ ...f, byDepartment: f.byDepartment.filter((_, i) => i !== idx) }));

  const num = (v) => {
    const s = String(v).trim();
    return s !== '' && !Number.isNaN(Number(s)) ? Number(s) : undefined;
  };

  const submit = () => {
    const payload = {
      month: form.month.trim(),
      status: form.status,
    };
    payload.company = form.company || null;

    const tc = num(form.totalCost);
    if (tc !== undefined) payload.totalCost = tc;
    const hc = num(form.headcount);
    if (hc !== undefined) payload.headcount = hc;
    const rp = num(form.reimbursementsPending);
    if (rp !== undefined) payload.reimbursementsPending = rp;
    const ra = num(form.reimbursementsAmount);
    if (ra !== undefined) payload.reimbursementsAmount = ra;

    const depts = form.byDepartment
      .filter((d) => String(d.department).trim() || num(d.headcount) !== undefined || num(d.cost) !== undefined)
      .map((d) => ({
        department: String(d.department).trim(),
        headcount: num(d.headcount) ?? 0,
        cost: num(d.cost) ?? 0,
      }));
    if (depts.length > 0 || period) payload.byDepartment = depts;

    onSave(payload);
  };

  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(form.month.trim());
  const canSubmit = monthValid && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{period ? 'Edit payroll period' : 'New payroll period'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Month"
              value={form.month}
              onChange={set('month')}
              required
              autoFocus
              placeholder="YYYY-MM"
              disabled={Boolean(period)}
              helperText="Format: YYYY-MM"
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField select label="Company" value={form.company} onChange={set('company')} sx={{ flex: 1, minWidth: 180 }}>
              <MenuItem value="">All companies</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField select label="Status" value={form.status} onChange={set('status')} sx={{ flex: 1, minWidth: 160 }}>
              {PAYROLL_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{PAYROLL_STATUS_LABELS[s]}</MenuItem>
              ))}
            </TextField>
            <TextField label="Headcount" value={form.headcount} onChange={set('headcount')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 160 }} />
          </Box>
          <TextField label="Total cost (INR)" value={form.totalCost} onChange={set('totalCost')} type="number" inputProps={{ min: 0 }} fullWidth />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Reimbursements pending" value={form.reimbursementsPending} onChange={set('reimbursementsPending')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Reimbursements amount (INR)" value={form.reimbursementsAmount} onChange={set('reimbursementsAmount')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 160 }} />
          </Box>

          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">By department (optional)</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addDept}>Add</Button>
          </Box>
          {form.byDepartment.length === 0 && (
            <Typography variant="caption" color="text.secondary">No department rows.</Typography>
          )}
          {form.byDepartment.map((d, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" label="Department" value={d.department} onChange={setDept(i, 'department')} sx={{ flex: 2, minWidth: 120 }} />
              <TextField size="small" label="Headcount" value={d.headcount} onChange={setDept(i, 'headcount')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 90 }} />
              <TextField size="small" label="Cost" value={d.cost} onChange={setDept(i, 'cost')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 90 }} />
              <IconButton size="small" color="error" onClick={() => removeDept(i)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
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

/**
 * Read-only per-period detail: every employee's salary breakup (mirrored from
 * HRMS payroll) and the month's reimbursement claims.
 */
function PeriodDetailDialog({ period, onClose }) {
  const entries = period?.entries || [];
  const reimbursements = period?.reimbursements || [];

  const totals = entries.reduce(
    (acc, e) => {
      acc.gross += e.gross || 0;
      acc.deductions += e.deductions || 0;
      acc.net += e.net || 0;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 }
  );

  return (
    <Dialog open={Boolean(period)} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        Payroll {period?.month} — salaries & payments
        {period?.paidOn && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            paid on {period.paidOn}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {entries.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            No per-employee detail for this period yet — press the HRMS sync (sidebar widget or
            Users page) to pull the full salary breakup.
          </Alert>
        ) : (
          <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell align="right">Basic</TableCell>
                  <TableCell align="right">HRA</TableCell>
                  <TableCell align="right">Special</TableCell>
                  <TableCell align="right">PF</TableCell>
                  <TableCell align="right">PT</TableCell>
                  <TableCell align="right">TDS</TableCell>
                  <TableCell align="right">Deductions</TableCell>
                  <TableCell align="right">Net pay</TableCell>
                  <TableCell>Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.empId || e.name} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.name || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {e.empId}{e.designation ? ` · ${e.designation}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>{e.department || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.gross)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.basic)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.hra)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.special)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.pf)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.pt)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.tds)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.deductions)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatInr(e.net)}</TableCell>
                    <TableCell>
                      <Chip label={e.paid ? 'Paid' : 'Pending'} size="small" color={e.paid ? 'success' : 'warning'} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Totals ({entries.length})</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatInr(totals.gross)}</TableCell>
                  <TableCell colSpan={6} />
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatInr(totals.deductions)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatInr(totals.net)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        )}

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Reimbursements — {period?.month} ({reimbursements.length})
        </Typography>
        {reimbursements.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No reimbursement claims dated in this month.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Employee</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reimbursements.map((r) => (
                  <TableRow key={r.code} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.code}</TableCell>
                    <TableCell>{r.empId}</TableCell>
                    <TableCell>{r.title || '—'}</TableCell>
                    <TableCell>{r.category || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatInr(r.amount)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.date || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.status || '—'}
                        size="small"
                        color={r.status === 'Paid' ? 'success' : r.status === 'Approved' ? 'info' : r.status === 'Rejected' ? 'error' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
