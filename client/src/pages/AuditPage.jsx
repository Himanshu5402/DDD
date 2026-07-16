import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Chip,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Button,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader.jsx';
import { auditApi } from '../api/audit.api.js';
import { getErrorMessage } from '../lib/axios.js';

const MODULES = [
  '', 'users', 'roles', 'audit', 'custom_fields', 'goals', 'tasks', 'rrrmas',
  'products', 'finance', 'maintenance', 'employee_analytics', 'evening_reporting', 'ai', 'dashboard',
];

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function AuditPage() {
  const [page, setPage] = useState(0); // 0-based for TablePagination
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [filters, setFilters] = useState({ module: '', status: '' });

  const params = {
    page: page + 1,
    limit: rowsPerPage,
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['audit', params],
    queryFn: () => auditApi.list(params),
    placeholderData: keepPreviousData,
  });

  const entries = data?.data || [];
  const total = data?.meta?.total || 0;

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  return (
    <Box>
      <PageHeader title="Audit Log" subtitle="Immutable record of every meaningful action." />

      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Module"
          value={filters.module}
          onChange={(e) => setFilter('module', e.target.value)}
          sx={{ minWidth: 180 }}
        >
          {MODULES.map((m) => (
            <MenuItem key={m || 'all'} value={m}>
              {m ? m.replace(/_/g, ' ') : 'All modules'}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="success">Success</MenuItem>
          <MenuItem value="failure">Failure</MenuItem>
        </TextField>
        {(filters.module || filters.status) && (
          <Button onClick={() => { setFilters({ module: '', status: '' }); setPage(0); }}>Clear</Button>
        )}
        {isFetching && <CircularProgress size={18} />}
      </Paper>

      {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { whiteSpace: 'nowrap' } }}>
                  <TableCell>When</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Module</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>IP</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No audit entries match these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {entries.map((e) => (
                  <TableRow key={e._id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmt(e.createdAt)}</TableCell>
                    <TableCell>
                      {e.actor ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.actor.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{e.actor.email}</Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">{e.actorEmail || 'system'}</Typography>
                      )}
                    </TableCell>
                    <TableCell><Chip label={e.action} size="small" variant="outlined" /></TableCell>
                    <TableCell>{e.module || '—'}</TableCell>
                    <TableCell>
                      {e.entityType ? `${e.entityType}${e.entityId ? ` (${String(e.entityId).slice(-6)})` : ''}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={e.status} size="small" color={e.status === 'success' ? 'success' : 'error'} />
                    </TableCell>
                    <TableCell>{e.ip || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      )}
    </Box>
  );
}
