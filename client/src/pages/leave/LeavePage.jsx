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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import UpcomingIcon from '@mui/icons-material/Upcoming';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  leaveApi,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  LEAVE_REQUEST_STATUSES,
  LEAVE_REQUEST_STATUS_LABELS,
} from '../../api/leave.api.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const STATUS_COLOR = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

function statusChipColor(status) {
  return STATUS_COLOR[status] || 'default';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return '—';
  }
}

function StatCard({ label, value, hint, icon, color = 'text.primary' }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, flex: 1, minWidth: 200 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      <Typography component="div" sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.2, mt: 0.75, color }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

const EMPTY_FORM = {
  user: '',
  leaveType: 'casual',
  fromDate: '',
  toDate: '',
  days: '1',
  reason: '',
};

export default function LeavePage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const perms = {
    read: hasPermission('leave', 'read'),
    create: hasPermission('leave', 'create'),
    update: hasPermission('leave', 'update'),
    delete: hasPermission('leave', 'delete'),
  };

  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState('');

  const filters = { status, leaveType };

  const summaryQuery = useQuery({
    queryKey: ['leave', 'summary'],
    queryFn: () => leaveApi.summary(),
  });

  const requestsQuery = useQuery({
    queryKey: ['leave', 'requests', filters],
    queryFn: () => leaveApi.listRequests(filters),
  });

  const balancesQuery = useQuery({
    queryKey: ['leave', 'balances'],
    queryFn: () => leaveApi.listBalances(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leave'] });
  };

  // Live updates: refetch whenever any client changes leave data.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => invalidate();
    socket.on('leave:changed', handler);
    return () => socket.off('leave:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload) => leaveApi.createRequest(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to create leave request')),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }) => leaveApi.decideRequest(id, decision),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => leaveApi.removeRequest(id),
    onSuccess: invalidate,
  });

  const requests = requestsQuery.data?.data || [];
  const total = requestsQuery.data?.meta?.total ?? requests.length;
  const balances = balancesQuery.data?.data || [];
  const summary = summaryQuery.data || {};

  const openCreate = () => { setSaveError(''); setDialogOpen(true); };
  const handleDelete = (req) => {
    if (window.confirm('Delete this leave request? This cannot be undone.')) {
      deleteMutation.mutate(req._id);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Leave"
        subtitle="Who's out, pending approvals and leave balances — mirrored from HRMS."
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip label={`${total} requests`} />
            {perms.create && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New request
              </Button>
            )}
          </Box>
        }
      />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <StatCard
          label="On leave today"
          value={summaryQuery.isLoading ? '—' : (summary.onLeaveToday ?? 0)}
          icon={<EventBusyIcon fontSize="small" color="action" />}
        />
        <StatCard
          label="Pending approvals"
          value={summaryQuery.isLoading ? '—' : (summary.pendingApprovals ?? 0)}
          color={summary.pendingApprovals ? 'warning.main' : 'text.primary'}
          icon={<PendingActionsIcon fontSize="small" color="action" />}
        />
        <StatCard
          label="Upcoming this week"
          value={summaryQuery.isLoading ? '—' : (summary.upcomingThisWeek ?? 0)}
          hint="Approved leave starting within 7 days"
          icon={<UpcomingIcon fontSize="small" color="action" />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}
      >
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All statuses</MenuItem>
          {LEAVE_REQUEST_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{LEAVE_REQUEST_STATUS_LABELS[s]}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Leave type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All types</MenuItem>
          {LEAVE_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</MenuItem>
          ))}
        </TextField>
      </Paper>

      {requestsQuery.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(requestsQuery.error, 'Failed to load leave requests')}</Alert>
      )}

      {requestsQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto', mb: 4 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell align="right">Days</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Approver</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No leave requests found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r._id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{r.user?.name || '—'}</Typography>
                    {r.user?.email && (
                      <Typography variant="caption" color="text.secondary">{r.user.email}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={LEAVE_TYPE_LABELS[r.leaveType] || r.leaveType} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {fmtDate(r.fromDate)} – {fmtDate(r.toDate)}
                  </TableCell>
                  <TableCell align="right">{r.days}</TableCell>
                  <TableCell>
                    <Chip label={LEAVE_REQUEST_STATUS_LABELS[r.status] || r.status} size="small" color={statusChipColor(r.status)} />
                  </TableCell>
                  <TableCell>{r.approver?.name || '—'}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {perms.update && r.status === 'pending' && (
                        <>
                          <Tooltip title="Approve">
                            <span>
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => decideMutation.mutate({ id: r._id, decision: 'approved' })}
                                disabled={decideMutation.isPending}
                              >
                                <CheckIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => decideMutation.mutate({ id: r._id, decision: 'rejected' })}
                                disabled={decideMutation.isPending}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      )}
                      {perms.delete && r.source !== 'hrms' && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDelete(r)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        Leave balances
      </Typography>
      {balancesQuery.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(balancesQuery.error, 'Failed to load leave balances')}</Alert>
      )}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Year</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Entitled</TableCell>
              <TableCell align="right">Taken</TableCell>
              <TableCell align="right">Balance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {balances.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No leave balances yet — they appear once HRMS syncs.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {balances.map((b) => (
              <TableRow key={b._id} hover>
                <TableCell>{b.user?.name || '—'}</TableCell>
                <TableCell>{b.year}</TableCell>
                <TableCell>
                  <Chip label={LEAVE_TYPE_LABELS[b.leaveType] || b.leaveType} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">{b.entitled}</TableCell>
                <TableCell align="right">{b.taken}</TableCell>
                <TableCell align="right">
                  <Typography sx={{ fontWeight: 700 }}>{b.balance ?? Math.max(0, (b.entitled || 0) - (b.taken || 0))}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <LeaveDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}

/** Manual leave-request entry form. */
function LeaveDialog({ open, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    const payload = {
      user: form.user.trim(),
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      days: Number(form.days),
    };
    const reason = form.reason.trim();
    if (reason) payload.reason = reason;
    onSave(payload);
  };

  const canSubmit =
    /^[a-f\d]{24}$/i.test(form.user.trim()) &&
    form.fromDate &&
    form.toDate &&
    Number(form.days) >= 0.5 &&
    !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New leave request</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Employee (User ID)"
            value={form.user}
            onChange={set('user')}
            required
            autoFocus
            placeholder="24-char user id"
            fullWidth
          />
          <TextField select label="Leave type" value={form.leaveType} onChange={set('leaveType')} fullWidth>
            {LEAVE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="From"
              type="date"
              value={form.fromDate}
              onChange={set('fromDate')}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              label="To"
              type="date"
              value={form.toDate}
              onChange={set('toDate')}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>
          <TextField
            label="Days"
            type="number"
            value={form.days}
            onChange={set('days')}
            inputProps={{ min: 0.5, step: 0.5 }}
            sx={{ maxWidth: 160 }}
          />
          <TextField label="Reason" value={form.reason} onChange={set('reason')} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
