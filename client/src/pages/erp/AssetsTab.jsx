import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import { erpAssetsApi, erpErrorMessage } from '../../api/erp.api.js';
import {
  ErpTable, Mono, RecordDialog, StatusChip, formatDate, rowsOf, totalOf, useSnack,
} from './erpCommon.jsx';

const COLUMNS = [
  { key: 'name', label: 'Asset', primary: true },
  { key: 'assetType', label: 'Type' },
  { key: 'tag', label: 'Tag', render: (r) => (r.tag ? <Mono>{r.tag}</Mono> : '—') },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
  { key: 'currentHolder', label: 'Holder', render: (r) => r.currentHolder || '—' },
  { key: 'purchaseDate', label: 'Purchased', render: (r) => formatDate(r.purchaseDate) },
  {
    key: 'history', label: 'Movements',
    render: (r) => (Array.isArray(r.history) ? r.history.length : 0),
  },
];

const ASSET_FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true, help: 'e.g. Dell Latitude 5440' },
  { name: 'assetType', label: 'Type', type: 'text', help: 'Laptop, Monitor, Phone…' },
  { name: 'tag', label: 'Tag / serial', type: 'text' },
  { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
  { name: 'purchasedBy', label: 'Purchased by', type: 'text' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const ASSIGN_FIELDS = [
  { name: 'person', label: 'Assign to', type: 'text', required: true },
  { name: 'note', label: 'Note', type: 'text' },
];

export default function AssetsTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', 'assets'],
    queryFn: () => erpAssetsApi.list(),
  });

  const allRows = rowsOf(listQuery.data);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) =>
      [r.name, r.assetType, r.tag, r.currentHolder].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [allRows, search]);
  const total = totalOf(listQuery.data, allRows);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? erpAssetsApi.update(editing.externalId, payload) : erpAssetsApi.create(payload)),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: editing ? 'Asset updated in the ERP' : 'Asset created in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to save asset')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ externalId, payload }) => erpAssetsApi.assign(externalId, payload),
    onSuccess: () => {
      setAssigning(null);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Asset assigned' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to assign asset')),
  });

  const returnMutation = useMutation({
    mutationFn: (externalId) => erpAssetsApi.returnAsset(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'Asset returned to store' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to return asset') }),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => erpAssetsApi.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'Asset deleted' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to delete asset') }),
  });

  const handleReturn = (row) => {
    if (window.confirm(`Return ${row.name} from ${row.currentHolder || 'its holder'} to the store?`)) {
      returnMutation.mutate(row.externalId);
    }
  };
  const handleDelete = (row) => {
    if (window.confirm(`Delete asset ${row.name}? This cannot be undone.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search asset / holder…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setSaveError(''); setDialogOpen(true); }}>
          New asset
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, 'Failed to load assets') : ''}
        emptyText="No assets in the mirror yet — add one or run a sync."
        actions={(row) => (
          <>
            {row.status === 'assigned' ? (
              <Tooltip title="Return to store">
                <IconButton size="small" color="primary" onClick={() => handleReturn(row)}>
                  <KeyboardReturnIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Assign to a person">
                <IconButton size="small" color="primary" onClick={() => { setSaveError(''); setAssigning(row); }}>
                  <PersonAddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
        title={editing ? `Edit ${editing.name}` : 'New asset'}
        fields={ASSET_FIELDS}
        record={editing}
      />

      <RecordDialog
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        onSave={(payload) => assignMutation.mutate({ externalId: assigning.externalId, payload })}
        saving={assignMutation.isPending}
        error={saveError}
        title={`Assign — ${assigning?.name || ''}`}
        fields={ASSIGN_FIELDS}
        record={null}
      />

      {snackEl}
    </Box>
  );
}
