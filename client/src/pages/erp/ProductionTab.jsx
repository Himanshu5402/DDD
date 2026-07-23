import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import {
  erpFinishedGoodsApi, erpBomsApi, erpErrorMessage, FINISHED_GOOD_STATUSES, QC_STATUSES, QC_RESULTS,
} from '../../api/erp.api.js';
import {
  ErpTable, RecordDialog, StatusChip, formatDate, humanize, rowsOf, totalOf, useSnack,
} from './erpCommon.jsx';

const COLUMNS = [
  { key: 'barcode', label: 'Barcode', mono: true },
  {
    key: 'productCode', label: 'Product',
    render: (r) => (
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{r.productName || r.productCode || '—'}</Typography>
        {r.productName && r.productCode && (
          <Typography variant="caption" color="text.secondary">{r.productCode}</Typography>
        )}
      </Box>
    ),
  },
  { key: 'productionDate', label: 'Built', render: (r) => formatDate(r.productionDate) },
  { key: 'qcStatus', label: 'QC', render: (r) => <StatusChip value={r.qcStatus} /> },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
  { key: 'customerName', label: 'Customer', render: (r) => r.customerName || '—' },
  {
    key: 'rawMaterials', label: 'Materials',
    render: (r) => (Array.isArray(r.rawMaterials) ? `${r.rawMaterials.length} unit${r.rawMaterials.length === 1 ? '' : 's'}` : '—'),
  },
];

const QC_FIELDS = [
  { name: 'result', label: 'Result', type: 'select', options: QC_RESULTS, required: true },
  { name: 'qcBy', label: 'Checked by', type: 'text' },
  { name: 'qcRemarks', label: 'Remarks', type: 'textarea', full: true },
];

export default function ProductionTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [qcFilter, setQcFilter] = useState('');
  const [buildOpen, setBuildOpen] = useState(false);
  const [qcTarget, setQcTarget] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', 'finished-goods', { search, status, qc: qcFilter }],
    queryFn: () =>
      erpFinishedGoodsApi.list({
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(qcFilter ? { qc: qcFilter } : {}),
      }),
  });
  // BOM options for the build dialog (optional recipe).
  const bomsQuery = useQuery({
    queryKey: ['erp', 'boms'],
    queryFn: () => erpBomsApi.list(),
  });

  const rows = rowsOf(listQuery.data);
  const total = totalOf(listQuery.data, rows);
  const boms = rowsOf(bomsQuery.data);

  const buildFields = useMemo(() => [
    { name: 'productCode', label: 'Product code', type: 'text', required: true, help: 'e.g. KS1' },
    { name: 'productName', label: 'Product name', type: 'text' },
    {
      name: 'bomExternalId', label: 'BOM (recipe)', type: 'select',
      options: boms.map((b) => ({ value: b.externalId, label: `${b.productName || b.productCode || 'BOM'}${b.productCode ? ` (${b.productCode})` : ''}` })),
    },
    {
      name: 'rawMaterialBarcodes', label: 'Raw material barcodes', type: 'codes', required: true, full: true,
      help: 'Scan or paste the in-stock raw material barcodes consumed by this unit',
    },
  ], [boms]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const buildMutation = useMutation({
    mutationFn: (payload) => erpFinishedGoodsApi.create(payload),
    onSuccess: () => {
      setBuildOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Finished good built — raw materials consumed' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to build finished good')),
  });

  const qcMutation = useMutation({
    mutationFn: ({ externalId, payload }) => erpFinishedGoodsApi.qc(externalId, payload),
    onSuccess: () => {
      setQcTarget(null);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'QC result recorded in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to submit QC')),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => erpFinishedGoodsApi.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'Finished good deleted — raw materials released' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to delete') }),
  });

  const handleDelete = (row) => {
    if (window.confirm(`Delete finished good ${row.barcode}? Its raw materials return to stock.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search barcode / product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {FINISHED_GOOD_STATUSES.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="QC" value={qcFilter} onChange={(e) => setQcFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value=""><em>All QC states</em></MenuItem>
          {QC_STATUSES.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
        </TextField>
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setSaveError(''); setBuildOpen(true); }}>
          Build unit
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, 'Failed to load finished goods') : ''}
        emptyText="No finished goods in the mirror yet — build a unit or run a sync."
        actions={(row) => (
          <>
            <Tooltip title={row.qcStatus === 'pending' ? 'Record QC result' : 'Update QC result'}>
              <IconButton
                size="small"
                color={row.qcStatus === 'pending' ? 'warning' : 'default'}
                onClick={() => { setSaveError(''); setQcTarget(row); }}
              >
                <FactCheckIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={row.status === 'dispatched' ? 'Dispatched units cannot be deleted' : 'Delete'}>
              <span>
                <IconButton size="small" color="error" disabled={row.status === 'dispatched'} onClick={() => handleDelete(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      />

      <RecordDialog
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onSave={(payload) => buildMutation.mutate(payload)}
        saving={buildMutation.isPending}
        error={saveError}
        title="Build finished good"
        intro="Consumes the listed in-stock raw materials and creates a barcoded unit in the ERP."
        fields={buildFields}
        record={null}
      />

      <RecordDialog
        open={Boolean(qcTarget)}
        onClose={() => setQcTarget(null)}
        onSave={(payload) => qcMutation.mutate({ externalId: qcTarget.externalId, payload })}
        saving={qcMutation.isPending}
        error={saveError}
        title={`QC — ${qcTarget?.barcode || ''}`}
        fields={QC_FIELDS}
        record={null}
      />

      {snackEl}
    </Box>
  );
}
