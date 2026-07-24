import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, Paper, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { erpSuppliersApi, erpCustomersApi, erpErrorMessage } from '../../api/erp.api.js';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import { ErpTable, RecordDialog, rowsOf, totalOf, useSnack } from './erpCommon.jsx';

// ERP suppliers/customers live in DDD as Contact mirrors with the full ERP
// shape under customFields.erp — hydrate the form from there.
const erpOf = (r) => r.customFields?.erp || {};

const FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true, from: (r) => r.name },
  { name: 'contact', label: 'Contact number', type: 'text', from: (r) => erpOf(r).contact || r.phone },
  { name: 'email', label: 'Email', type: 'text', from: (r) => r.email },
  { name: 'gstin', label: 'GSTIN', type: 'text', from: (r) => erpOf(r).gstin },
  { name: 'address', label: 'Address', type: 'textarea', full: true, from: (r) => erpOf(r).address },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true, from: (r) => erpOf(r).notes },
];

const COLUMNS = [
  { key: 'name', label: 'Name', primary: true },
  { key: 'contact', label: 'Contact', render: (r) => erpOf(r).contact || r.phone || '—' },
  { key: 'email', label: 'Email' },
  { key: 'gstin', label: 'GSTIN', render: (r) => erpOf(r).gstin || '—' },
  {
    key: 'address', label: 'Address',
    render: (r) => (
      <Typography variant="body2" sx={{ maxWidth: 260 }} noWrap title={erpOf(r).address || ''}>
        {erpOf(r).address || '—'}
      </Typography>
    ),
  },
];

/* ------------------------- File import (Excel/PDF) ------------------------ */

// Keys mirror the server contactBodySchema (suppliers and customers share it).
const CONTACT_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'contact', label: 'Contact number' },
  { key: 'email', label: 'Email' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
];

function buildContactImportPayload(m) {
  if (!m.name) throw new Error('Name is required');
  const payload = { name: m.name };
  if (m.contact) payload.contact = m.contact;
  if (m.email) payload.email = m.email;
  if (m.gstin) payload.gstin = m.gstin;
  if (m.address) payload.address = m.address;
  if (m.notes) payload.notes = m.notes;
  return payload;
}

const KINDS = [
  { key: 'suppliers', label: 'Suppliers', singular: 'supplier', api: erpSuppliersApi },
  { key: 'customers', label: 'Customers', singular: 'customer', api: erpCustomersApi },
];

function MastersPanel({ kind }) {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', kind.key],
    queryFn: () => kind.api.list(),
  });

  const allRows = rowsOf(listQuery.data);
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? allRows.filter((r) =>
        [r.name, r.email, erpOf(r).contact, r.phone, erpOf(r).gstin]
          .some((v) => String(v || '').toLowerCase().includes(needle)))
    : allRows;
  const total = totalOf(listQuery.data, allRows);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? kind.api.update(editing.externalId, payload) : kind.api.create(payload)),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: `${editing ? 'Updated' : 'Created'} ${kind.singular} in the ERP` });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, `Failed to save ${kind.singular}`)),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => kind.api.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: `Deleted ${kind.singular}` });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, `Failed to delete ${kind.singular}`) }),
  });

  const handleDelete = (row) => {
    if (window.confirm(`Delete ${kind.singular} "${row.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
          Import
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setSaveError(''); setDialogOpen(true); }}>
          New {kind.singular}
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, `Failed to load ${kind.label.toLowerCase()}`) : ''}
        emptyText={`No ${kind.label.toLowerCase()} in the mirror yet — add one or run a sync.`}
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
        title={editing ? `Edit ${editing.name}` : `New ${kind.singular}`}
        fields={FIELDS}
        record={editing}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={`Import ${kind.label.toLowerCase()} from Excel / PDF`}
        entity={`ERP ${kind.label.toLowerCase()} (business contacts: name, phone, email, GSTIN, address)`}
        fields={CONTACT_IMPORT_FIELDS}
        buildPayload={buildContactImportPayload}
        createFn={(p) => kind.api.create(p)}
        onDone={invalidate}
      />

      {snackEl}
    </Box>
  );
}

export default function MastersTab() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          {KINDS.map((k) => <Tab key={k.key} label={k.label} />)}
        </Tabs>
      </Paper>
      {KINDS.map((k, i) => (tab === i ? <MastersPanel key={k.key} kind={k} /> : null))}
    </Box>
  );
}
