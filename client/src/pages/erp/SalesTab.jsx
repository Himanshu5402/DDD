import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, InputAdornment, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShippingOutlined';
import { erpSalesOrdersApi, erpCustomersApi, erpErrorMessage, SALES_ORDER_STATUSES } from '../../api/erp.api.js';
import {
  ErpTable, RecordDialog, StatusChip, formatDate, humanize, rowsOf, totalOf, useSnack,
} from './erpCommon.jsx';

const COLUMNS = [
  { key: 'orderNo', label: 'Order no.', mono: true },
  { key: 'customerName', label: 'Customer', primary: true },
  {
    key: 'productCode', label: 'Product',
    render: (r) => (r.productName ? `${r.productName}${r.productCode ? ` (${r.productCode})` : ''}` : r.productCode || '—'),
  },
  {
    key: 'orderedQty', label: 'Delivered / ordered',
    render: (r) => `${r.deliveredQty ?? 0} / ${r.orderedQty ?? 0}`,
  },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
  { key: 'orderDate', label: 'Ordered', render: (r) => formatDate(r.orderDate) },
  {
    key: 'deliveries', label: 'Deliveries',
    render: (r) => (Array.isArray(r.deliveries) ? r.deliveries.length : 0),
  },
];

const EDIT_FIELDS = [
  { name: 'orderedQty', label: 'Ordered quantity', type: 'number', min: 1 },
  { name: 'orderDate', label: 'Order date', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

const DISPATCH_FIELDS = [
  {
    name: 'finishedGoodBarcodes', label: 'Finished good barcodes', type: 'codes', required: true, full: true,
    help: 'Scan or paste QC-passed, in-stock finished good barcodes to dispatch',
  },
];

export default function SalesTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dispatching, setDispatching] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['erp', 'sales-orders'],
    queryFn: () => erpSalesOrdersApi.list(),
  });
  const customersQuery = useQuery({
    queryKey: ['erp', 'customers'],
    queryFn: () => erpCustomersApi.list(),
  });

  const allRows = rowsOf(listQuery.data);
  // Lists serve the full mirror — filter client-side.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!needle) return true;
      return [r.orderNo, r.customerName, r.productCode, r.productName]
        .some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [allRows, search, status]);
  const total = totalOf(listQuery.data, allRows);
  const customers = rowsOf(customersQuery.data);

  const createFields = useMemo(() => [
    {
      name: 'customerExternalId', label: 'Customer', type: 'select', required: true,
      options: customers.map((c) => ({ value: c.externalId, label: c.name })),
    },
    { name: 'orderedQty', label: 'Ordered quantity', type: 'number', required: true, min: 1 },
    { name: 'productCode', label: 'Product code', type: 'text', help: 'e.g. KS1' },
    { name: 'productName', label: 'Product name', type: 'text' },
    { name: 'orderDate', label: 'Order date', type: 'date' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true },
  ], [customers]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['erp'] });

  const createMutation = useMutation({
    mutationFn: (payload) => erpSalesOrdersApi.create(payload),
    onSuccess: () => {
      setCreateOpen(false);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Sales order created in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to create order')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ externalId, payload }) => erpSalesOrdersApi.update(externalId, payload),
    onSuccess: () => {
      setEditing(null);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Sales order updated in the ERP' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to update order')),
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ externalId, barcodes }) => erpSalesOrdersApi.dispatch(externalId, barcodes),
    onSuccess: () => {
      setDispatching(null);
      setSaveError('');
      invalidate();
      setSnack({ severity: 'success', message: 'Dispatch recorded — finished goods marked dispatched' });
    },
    onError: (err) => setSaveError(erpErrorMessage(err, 'Failed to dispatch')),
  });

  const deleteMutation = useMutation({
    mutationFn: (externalId) => erpSalesOrdersApi.remove(externalId),
    onSuccess: () => {
      invalidate();
      setSnack({ severity: 'success', message: 'Sales order deleted' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'Failed to delete') }),
  });

  const handleDelete = (row) => {
    if (window.confirm(`Delete order ${row.orderNo}? This cannot be undone.`)) {
      deleteMutation.mutate(row.externalId);
    }
  };

  const remaining = dispatching ? Math.max(0, (dispatching.orderedQty ?? 0) - (dispatching.deliveredQty ?? 0)) : 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search order / customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value=""><em>All statuses</em></MenuItem>
          {SALES_ORDER_STATUSES.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
        </TextField>
        <Chip label={`${total} total`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setSaveError(''); setCreateOpen(true); }}>
          New order
        </Button>
      </Box>

      <ErpTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        error={listQuery.error ? erpErrorMessage(listQuery.error, 'Failed to load sales orders') : ''}
        emptyText="No sales orders in the mirror yet — create one or run a sync."
        actions={(row) => (
          <>
            <Tooltip title={row.status === 'completed' ? 'Order fully delivered' : 'Dispatch finished goods'}>
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  disabled={row.status === 'completed'}
                  onClick={() => { setSaveError(''); setDispatching(row); }}
                >
                  <LocalShippingIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => { setSaveError(''); setEditing(row); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={(row.deliveredQty ?? 0) > 0 ? 'Orders with deliveries cannot be deleted' : 'Delete'}>
              <span>
                <IconButton size="small" color="error" disabled={(row.deliveredQty ?? 0) > 0} onClick={() => handleDelete(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      />

      <RecordDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(payload) => createMutation.mutate(payload)}
        saving={createMutation.isPending}
        error={saveError}
        title="New sales order"
        intro="The ERP assigns the order number."
        fields={createFields}
        record={null}
      />

      <RecordDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSave={(payload) => updateMutation.mutate({ externalId: editing.externalId, payload })}
        saving={updateMutation.isPending}
        error={saveError}
        title={`Edit ${editing?.orderNo || 'order'}`}
        fields={EDIT_FIELDS}
        record={editing}
      />

      <RecordDialog
        open={Boolean(dispatching)}
        onClose={() => setDispatching(null)}
        onSave={(payload) => dispatchMutation.mutate({
          externalId: dispatching.externalId,
          barcodes: payload.finishedGoodBarcodes || [],
        })}
        saving={dispatchMutation.isPending}
        error={saveError}
        title={`Dispatch — ${dispatching?.orderNo || ''}`}
        intro={
          <Typography component="span" variant="body2">
            {`${dispatching?.customerName || 'Customer'} · ${remaining} unit${remaining === 1 ? '' : 's'} remaining to deliver.`}
          </Typography>
        }
        fields={DISPATCH_FIELDS}
        record={null}
      />

      {snackEl}
    </Box>
  );
}
