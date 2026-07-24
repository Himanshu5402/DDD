import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, MenuItem, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { erpRawMaterialsApi, erpSuppliersApi, erpErrorMessage, RAW_MATERIAL_STATUSES } from '../../api/erp.api.js';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import {
  ErpTable, Mono, RecordDialog, StatusChip, formatDate, humanize, rowsOf, splitCodes, totalOf, useSnack,
} from './erpCommon.jsx';

const COLUMNS = [
  { key: 'barcode', label: 'Barcode', mono: true },
  { key: 'materialType', label: 'Type', render: (r) => (r.materialType ? <Chip size="small" variant="outlined" label={r.materialType} /> : '—') },
  { key: 'supplierName', label: 'Supplier' },
  { key: 'supplierSerial', label: 'Supplier serial', render: (r) => (r.supplierSerial ? <Mono>{r.supplierSerial}</Mono> : '—') },
  { key: 'model', label: 'Model' },
  { key: 'purchaseDate', label: 'Purchased', render: (r) => formatDate(r.purchaseDate) },
  { key: 'warranty', label: 'Warranty' },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
];

// Editable subset — barcode/type/status are ERP-owned.
const EDIT_FIELDS = [
  { name: 'supplierSerial', label: 'Supplier serial', type: 'text' },
  { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
  { name: 'model', label: 'Model', type: 'text' },
  { name: 'specification', label: 'Specification', type: 'text' },
  { name: 'warranty', label: 'Warranty', type: 'text' },
  { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
];

/* ------------------------- File import (Excel/PDF) ------------------------ */

// Keys mirror the server receiveRawMaterialsSchema. One row = one batch: the
// ERP creates `quantity` barcoded units per row. supplierExternalId is an ERP
// Mongo id (picker-only in the dialog) so it is not importable from a file.
const RECEIVE_IMPORT_FIELDS = [
  { key: 'materialType', label: 'Material type', required: true, hint: 'e.g. RAM, SSD, CPU' },
  { key: 'quantity', label: 'Quantity', required: true, hint: 'whole number 1–500' },
  { key: 'serials', label: 'Supplier serials', hint: 'comma / newline separated' },
  { key: 'purchaseDate', label: 'Purchase date', hint: 'YYYY-MM-DD' },
  { key: 'model', label: 'Model' },
  { key: 'specification', label: 'Specification' },
  { key: 'warranty', label: 'Warranty' },
  { key: 'remarks', label: 'Remarks' },
];

function buildReceiveImportPayload(m) {
  if (!m.materialType) throw new Error('Material type is required');
  const quantity = Number(String(m.quantity).replace(/[^0-9.-]/g, ''));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    throw new Error('Quantity must be a whole number between 1 and 500');
  }
  const payload = { materialType: m.materialType, quantity };
  const serials = splitCodes(m.serials);
  if (serials.length) payload.serials = serials;
  if (m.purchaseDate) payload.purchaseDate = m.purchaseDate;
  if (m.model) payload.model = m.model;
  if (m.specification) payload.specification = m.specification;
  if (m.warranty) payload.warranty = m.warranty;
  if (m.remarks) payload.remarks = m.remarks;
  return payload;
}

export default function InventoryTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', 'raw-materials', { search, type, status }],
    queryFn: () =>
      erpRawMaterialsApi.list({
        ...(search ? { search } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      }),
  });
  // Supplier options for the receive dialog.
  const suppliersQuery = useQuery({
    queryKey: ['erp', 'suppliers'],
    queryFn: () => erpSuppliersApi.list(),
  });

  const rows = rowsOf(listQuery.data);
  const total = totalOf(listQuery.data, rows);
  const suppliers = rowsOf(suppliersQuery.data);

  // Material-type filter options come from the mirror itself (free-form in ERP).
  const typeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.materialType).filter(Boolean));
    if (type) set.add(type);
    return [...set].sort();
  }, [rows, type]);

  const receiveFields = useMemo(() => [
    { name: 'materialType', label: 'Material type', type: 'text', required: true, help: 'e.g. RAM, SSD, CPU' },
    { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1 },
    {
      name: 'supplierExternalId', label: 'Supplier', type: 'select',
      options: suppliers.map((s) => ({ value: s.externalId, label: s.name })),
    },
    { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
    { name: 'serials', label: 'Supplier serials', type: 'codes', full: true, help: 'Optional — one per unit, comma / newline separated' },
    { name: 'model', label: 'Model', type: 'text' },
    { name: 'specification', label: 'Specification', type: 'text' },
    { name: 'warranty', label: 'Warranty', type: 'text' },
    { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
  ], [suppliers]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const receiveMutation = useMutation({
    mutationFn: (payload) => erpRawMaterialsApi.create(payload),
    onSuccess: () => {
      setReceiveOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Batch received in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to receive batch')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ externalId, payload }) => erpRawMaterialsApi.update(externalId, payload),
    onSuccess: () => {
      setEditing(null);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Raw material updated in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to update')),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => erpRawMaterialsApi.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'Raw material deleted' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to delete') }),
  });

  const handleDelete = (row) => {
    if (window.confirm(`Delete raw material ${row.barcode}? This cannot be undone.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search barcode / model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField size="small" select label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value=""><em>All types</em></MenuItem>
          {typeOptions.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {RAW_MATERIAL_STATUSES.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
        </TextField>
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
          Import
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setSaveError(''); setReceiveOpen(true); }}>
          Receive batch
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, 'Failed to load raw materials') : ''}
        emptyText="No raw materials in the mirror yet — run a sync or receive a batch."
        actions={(row) => (
          <>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => { setSaveError(''); setEditing(row); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={row.status === 'consumed' ? 'Consumed units cannot be deleted' : 'Delete'}>
              <span>
                <IconButton size="small" color="error" disabled={row.status === 'consumed'} onClick={() => handleDelete(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      />

      <RecordDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onSave={(payload) => receiveMutation.mutate(payload)}
        saving={receiveMutation.isPending}
        error={saveError}
        title="Receive raw material batch"
        intro="Creates one barcoded unit per quantity in the ERP; the mirror updates instantly."
        fields={receiveFields}
        record={null}
      />

      <RecordDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSave={(payload) => updateMutation.mutate({ externalId: editing.externalId, payload })}
        saving={updateMutation.isPending}
        error={saveError}
        title={`Edit ${editing?.barcode || 'raw material'}`}
        fields={EDIT_FIELDS}
        record={editing}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import raw material batches from Excel / PDF"
        entity="ERP raw material batches (received stock: material type, quantity, serials)"
        fields={RECEIVE_IMPORT_FIELDS}
        buildPayload={buildReceiveImportPayload}
        createFn={(p) => erpRawMaterialsApi.create(p)}
        onDone={invalidate}
      />

      {snackEl}
    </Box>
  );
}
