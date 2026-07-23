import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { erpUsersApi, erpErrorMessage, ERP_USER_STATUSES } from '../../api/erp.api.js';
import { ErpTable, Mono, RecordDialog, StatusChip, rowsOf, totalOf, useSnack } from './erpCommon.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name', primary: true },
  { key: 'username', label: 'Username', render: (r) => (r.username ? <Mono>{r.username}</Mono> : '—') },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role', render: (r) => (r.role ? <Chip size="small" variant="outlined" label={r.role} /> : '—') },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
];

export default function UsersTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', 'users'],
    queryFn: () => erpUsersApi.list(),
  });

  const allRows = rowsOf(listQuery.data);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) =>
      [r.name, r.username, r.email, r.role].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [allRows, search]);
  const total = totalOf(listQuery.data, allRows);

  // Password is required on create, optional on edit (blank = unchanged).
  // Forwarded to the ERP only — never stored in DDD.
  const fields = useMemo(() => [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'username', label: 'Username', type: 'text', required: !editing, help: 'ERP login id' },
    { name: 'email', label: 'Email', type: 'text' },
    { name: 'role', label: 'Role', type: 'text', default: 'Production', help: 'e.g. Admin, Production' },
    { name: 'status', label: 'Status', type: 'select', options: ERP_USER_STATUSES, required: true, default: 'active' },
    {
      name: 'password', label: 'Password', type: 'password', required: !editing,
      help: editing ? 'Leave blank to keep the current password' : 'Sent to the ERP only — never stored here',
    },
  ], [editing]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? erpUsersApi.update(editing.externalId, payload) : erpUsersApi.create(payload)),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: editing ? 'ERP user updated' : 'ERP user created' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to save user')),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => erpUsersApi.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'ERP user deleted' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to delete user') }),
  });

  const handleDelete = (row) => {
    if (window.confirm(`Delete ERP user "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search name / username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setSaveError(''); setDialogOpen(true); }}>
          New user
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, 'Failed to load ERP users') : ''}
        emptyText="No ERP users in the mirror yet — run a sync."
        actions={(row) => (
          <>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => { setEditing(row); setSaveError(''); setDialogOpen(true); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => handleDelete(row)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      />

      <RecordDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        error={saveError}
        title={editing ? `Edit ${editing.name}` : 'New ERP user'}
        fields={fields}
        record={editing}
      />

      {snackEl}
    </Box>
  );
}
