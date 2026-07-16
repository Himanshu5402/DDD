import { useQuery } from '@tanstack/react-query';
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
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader.jsx';
import api, { getErrorMessage } from '../lib/axios.js';

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function UsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 50 } });
      return res.data;
    },
  });

  const users = data?.data || [];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="People with access to the Command Center."
        action={data?.meta ? <Chip label={`${data.meta.total} total`} /> : null}
      />

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
                <TableCell>Roles</TableCell>
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
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {(u.roles || []).map((r) => (
                        <Chip key={r._id} label={r.name} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={u.isActive ? 'Active' : 'Disabled'}
                      size="small"
                      color={u.isActive ? 'success' : 'default'}
                    />
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
