import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Paper, Grid, Typography, Button, TextField, CircularProgress, Alert, Divider, InputAdornment, Chip,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { erpApi, erpErrorMessage } from '../../api/erp.api.js';
import { ErpTable, Mono, StatusChip, formatDate } from './erpCommon.jsx';

function Field({ label, children }) {
  return (
    <Grid item xs={6} sm={4} md={3}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }} component="div">
        {children ?? '—'}
      </Typography>
    </Grid>
  );
}

function SectionCard({ title, chip, children }) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{title}</Typography>
        {chip}
      </Box>
      {children}
    </Paper>
  );
}

const RM_COLUMNS = [
  { key: 'barcode', label: 'Barcode', mono: true },
  { key: 'materialType', label: 'Type' },
  { key: 'supplierName', label: 'Supplier', render: (r) => r.supplier?.name || r.supplierName || '—' },
  { key: 'supplierSerial', label: 'Serial', render: (r) => (r.supplierSerial ? <Mono>{r.supplierSerial}</Mono> : '—') },
  { key: 'purchaseDate', label: 'Purchased', render: (r) => formatDate(r.purchaseDate) },
  { key: 'warranty', label: 'Warranty' },
  { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} /> },
];

function SalesOrderLine({ so }) {
  if (!so) return null;
  return (
    <Typography variant="body2" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Mono>{so.orderNo}</Mono>
      {so.orderedQty != null && <span>{`${so.deliveredQty ?? 0} / ${so.orderedQty} delivered`}</span>}
      <StatusChip value={so.status} />
    </Typography>
  );
}

function FinishedGoodPassport({ fg, title = 'Finished good' }) {
  if (!fg) return null;
  return (
    <SectionCard
      title={title}
      chip={
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <StatusChip value={fg.qcStatus} />
          <StatusChip value={fg.status} />
        </Box>
      }
    >
      <Grid container spacing={2}>
        <Field label="Barcode"><Mono>{fg.barcode}</Mono></Field>
        <Field label="Product">{fg.productName || fg.productCode}</Field>
        <Field label="Product code">{fg.productCode}</Field>
        <Field label="Built">{formatDate(fg.productionDate)}</Field>
        <Field label="QC by">{fg.qcBy || '—'}</Field>
        <Field label="QC date">{formatDate(fg.qcDate)}</Field>
        <Field label="QC remarks">{fg.qcRemarks || '—'}</Field>
        <Field label="Customer">{fg.customerName || fg.customer?.name || '—'}</Field>
        <Field label="Dispatched">{formatDate(fg.dispatchDate)}</Field>
      </Grid>

      {fg.salesOrder && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Sales order
          </Typography>
          <SalesOrderLine so={fg.salesOrder} />
        </>
      )}

      {Array.isArray(fg.rawMaterials) && fg.rawMaterials.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            {`Raw materials consumed (${fg.rawMaterials.length})`}
          </Typography>
          <ErpTable columns={RM_COLUMNS} rows={fg.rawMaterials} emptyText="No raw materials recorded." />
        </>
      )}
    </SectionCard>
  );
}

function RawMaterialPassport({ rm }) {
  if (!rm) return null;
  return (
    <SectionCard title="Raw material" chip={<StatusChip value={rm.status} />}>
      <Grid container spacing={2}>
        <Field label="Barcode"><Mono>{rm.barcode}</Mono></Field>
        <Field label="Material type">{rm.materialType}</Field>
        <Field label="Supplier">{rm.supplier?.name || rm.supplierName || '—'}</Field>
        <Field label="Supplier contact">{rm.supplier?.contact || rm.supplierContact || '—'}</Field>
        <Field label="Supplier serial">{rm.supplierSerial ? <Mono>{rm.supplierSerial}</Mono> : '—'}</Field>
        <Field label="Purchased">{formatDate(rm.purchaseDate)}</Field>
        <Field label="Model">{rm.model || '—'}</Field>
        <Field label="Specification">{rm.specification || '—'}</Field>
        <Field label="Warranty">{rm.warranty || '—'}</Field>
        <Field label="Remarks">{rm.remarks || '—'}</Field>
      </Grid>
    </SectionCard>
  );
}

export default function TrackTab() {
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');

  const trackQuery = useQuery({
    queryKey: ['erp', 'track', code],
    queryFn: () => erpApi.track(code),
    enabled: Boolean(code),
    retry: false,
  });

  const submit = (e) => {
    e.preventDefault();
    setCode(input.trim());
  };

  const data = trackQuery.data;

  return (
    <Box>
      <Paper
        component="form"
        onSubmit={submit}
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 2.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <TextField
          size="small"
          sx={{ flex: 1, minWidth: 240 }}
          placeholder="Scan or type a finished-good or raw-material barcode…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon fontSize="small" /></InputAdornment> }}
        />
        <Button type="submit" variant="contained" disabled={!input.trim() || trackQuery.isFetching}>
          {trackQuery.isFetching ? 'Looking up…' : 'Look up'}
        </Button>
      </Paper>

      {!code && (
        <Alert severity="info">
          Live traceability passport straight from the ERP — works for both finished-good and raw-material barcodes.
        </Alert>
      )}

      {trackQuery.isFetching && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}

      {trackQuery.error && !trackQuery.isFetching && (
        <Alert severity={trackQuery.error?.response?.status === 404 ? 'warning' : 'error'}>
          {erpErrorMessage(trackQuery.error, 'Lookup failed')}
        </Alert>
      )}

      {data && !trackQuery.isFetching && !trackQuery.error && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={data.kind === 'finished_good' ? 'Finished good barcode' : 'Raw material barcode'}
            />
            <Mono>{code}</Mono>
          </Box>

          {data.kind === 'finished_good' && <FinishedGoodPassport fg={data.finishedGood} />}

          {data.kind === 'raw_material' && (
            <>
              <RawMaterialPassport rm={data.rawMaterial} />
              {data.finishedGood && <FinishedGoodPassport fg={data.finishedGood} title="Consumed in finished good" />}
              {!data.finishedGood && data.rawMaterial?.status === 'in_stock' && (
                <Alert severity="success">
                  This unit is still in stock — not consumed by any finished good yet.
                </Alert>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
