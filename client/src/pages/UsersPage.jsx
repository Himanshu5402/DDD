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
  Avatar,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Snackbar,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import PageHeader from '../components/ui/PageHeader.jsx';
import api, { getErrorMessage } from '../lib/axios.js';
import { integrationsApi, hrmsErrorMessage } from '../api/integrations.api.js';
import { getSocket, connectSocket } from '../lib/socket.js';

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

// Employment status → chip label + colour (HRMS Active→active, Inactive→suspended,
// Exited→exited). Deleted-in-HRMS users are removed entirely, so never appear here.
const STATUS_META = {
  active: { label: 'Active', color: 'success' },
  on_notice: { label: 'On notice', color: 'warning' },
  on_leave: { label: 'On leave', color: 'info' },
  suspended: { label: 'Inactive', color: 'default' },
  exited: { label: 'Exited', color: 'default' },
};

function userStatus(u) {
  // A manually-disabled account (not via an HRMS status) reads as Disabled.
  if (u.isActive === false && (!u.employmentStatus || u.employmentStatus === 'active')) {
    return { label: 'Disabled', color: 'default' };
  }
  return (
    STATUS_META[u.employmentStatus] ||
    { label: u.isActive ? 'Active' : 'Disabled', color: u.isActive ? 'success' : 'default' }
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [snack, setSnack] = useState(null); // { severity, message }

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 50 } });
      return res.data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: integrationsApi.hrmsSync,
    onSuccess: (res) => {
      // New mirror rows can land in every module — refetch the lot.
      qc.invalidateQueries();
      const counts = res?.data;
      const deactivated = counts?.removed?.employees;
      setSnack({
        severity: 'success',
        message: counts?.employees != null
          ? `HRMS sync complete — ${counts.employees} employees updated${deactivated ? `, ${deactivated} deactivated` : ''}`
          : res?.message || 'HRMS sync complete',
      });
    },
    onError: (err) => setSnack({ severity: 'error', message: hrmsErrorMessage(err, 'HRMS sync failed') }),
  });

  const users = data?.data || [];

  // Live updates: refetch the directory when users change anywhere (incl. HRMS sync).
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['users'] });
    socket.on('users:changed', handler);
    return () => socket.off('users:changed', handler);
  }, [qc]);

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="People with access to the Command Center."
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {data?.meta ? <Chip label={`${data.meta.total} total`} /> : null}
            <Button
              variant="contained"
              size="small"
              startIcon={syncMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync HRMS'}
            </Button>
          </Box>
        }
      />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)} variant="filled">
          {snack?.message}
        </Alert>
      </Snackbar>

      {isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{getErrorMessage(error, 'Failed to load users')}</Alert>}

      {!isLoading && !error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Designation</TableCell>
                <TableCell align="right">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 13 }}>
                        {initials(u.name)}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {u.email}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {u.company ? (
                      <Chip
                        label={u.company.name}
                        size="small"
                        sx={{ bgcolor: u.company.color || 'primary.main', color: '#fff', fontWeight: 600 }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {u.designation || '—'}
                    {u.department && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {u.department}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const s = userStatus(u);
                      return <Chip label={s.label} size="small" color={s.color} />;
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
