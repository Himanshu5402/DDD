import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Grid, Typography, Button, CircularProgress, Alert, LinearProgress, Chip,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { erpApi, erpErrorMessage } from '../../api/erp.api.js';
import { humanize, timeAgo, useSnack } from './erpCommon.jsx';

/** First numeric candidate wins — the overview payload is server-owned. */
function num(...vals) {
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return 0;
}

/** Normalize stock-by-type into [{ type, count }] from array or map shapes. */
function normalizeByType(ov) {
  const src = ov?.rawMaterials?.byType ?? ov?.stockByType ?? ov?.byType ?? [];
  if (Array.isArray(src)) {
    return src
      .map((r) => ({ type: r.type ?? r.materialType ?? r._id ?? '—', count: num(r.count, r.total) }))
      .filter((r) => r.type);
  }
  if (src && typeof src === 'object') {
    return Object.entries(src).map(([type, count]) => ({ type, count: num(count) }));
  }
  return [];
}

function StatCard({ label, value, hint, color = 'text.primary' }) {
  return (
    <Grid item xs={6} sm={4} md={3}>
      <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.02em', display: 'block' }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.25, color, mt: 0.5 }}>
          {value}
        </Typography>
        {hint && <Typography variant="caption" color="text.disabled">{hint}</Typography>}
      </Paper>
    </Grid>
  );
}

export default function OverviewTab() {
  const qc = useQueryClient();
  const { setSnack, snackEl } = useSnack();

  const overviewQuery = useQuery({
    queryKey: ['erp', 'overview'],
    queryFn: erpApi.overview,
  });
  const statusQuery = useQuery({
    queryKey: ['erp', 'status'],
    queryFn: erpApi.status,
    refetchInterval: 60_000,
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: erpApi.sync,
    onSuccess: (res) => {
      // Every ERP mirror (and contacts) may have new rows — refetch the lot.
      qc.invalidateQueries();
      setSnack({ severity: 'success', message: res?.message || 'ERP sync complete' });
    },
    onError: (err) => setSnack({ severity: 'error', message: erpErrorMessage(err, 'ERP sync failed') }),
  });

  const ov = overviewQuery.data || {};
  const status = statusQuery.data;
  const byType = normalizeByType(ov);
  const maxByType = Math.max(1, ...byType.map((r) => r.count));

  const rmInStock = num(ov.rawMaterials?.inStock, ov.rawMaterialsInStock);
  const rmConsumed = num(ov.rawMaterials?.consumed, ov.rawMaterialsConsumed);
  const fgInStock = num(ov.finishedGoods?.inStock, ov.finishedGoodsInStock);
  const pendingQC = num(ov.finishedGoods?.pendingQC, ov.finishedGoods?.pendingQc, ov.finishedGoods?.byQcStatus?.pending, ov.pendingQC);
  const dispatched = num(ov.finishedGoods?.dispatched, ov.dispatched);
  const openOrders = num(ov.salesOrders?.open, ov.orders?.open, ov.openOrders);
  const partialOrders = num(ov.salesOrders?.partial, ov.orders?.partial, ov.partialOrders);
  const assetsAssigned = num(ov.assets?.assigned, ov.assetsAssigned);
  const assetsAvailable = num(ov.assets?.available, ov.assetsAvailable);
  const suppliers = num(ov.suppliers, ov.counts?.suppliers, status?.counts?.suppliers);
  const customers = num(ov.customers, ov.counts?.customers, status?.counts?.customers);
  const users = num(ov.users, ov.counts?.users, status?.counts?.users);

  const reachable = ov.erpReachable ?? ov.reachable ?? status?.erpReachable;
  const lastSyncAt = ov.lastSyncAt ?? status?.lastSyncAt;
  const state = statusQuery.isError
    ? 'down'
    : status && !status.enabled
      ? 'off'
      : reachable == null
        ? 'loading'
        : reachable
          ? 'ok'
          : 'down';
  const dotColor = { ok: 'success.main', down: 'warning.main', off: 'text.disabled', loading: 'text.disabled' }[state];
  const stateLabel = { ok: 'ERP connected', down: 'ERP unreachable', off: 'ERP sync off', loading: 'ERP status…' }[state];

  if (overviewQuery.isLoading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {overviewQuery.error && (
        <Alert severity="error" sx={{ mb: 2 }}>{erpErrorMessage(overviewQuery.error, 'Failed to load ERP overview')}</Alert>
      )}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <StatCard label="Raw materials in stock" value={rmInStock} hint={`${rmConsumed} consumed`} color="success.main" />
        <StatCard label="Finished goods in stock" value={fgInStock} hint={`${dispatched} dispatched`} color="primary.main" />
        <StatCard label="Pending QC" value={pendingQC} color={pendingQC > 0 ? 'warning.main' : 'text.primary'} />
        <StatCard label="Open orders" value={openOrders} hint={`${partialOrders} partially delivered`} color="info.main" />
        <StatCard label="Assets assigned" value={assetsAssigned} hint={`${assetsAvailable} available`} />
        <StatCard label="Suppliers" value={suppliers} />
        <StatCard label="Customers" value={customers} />
        <StatCard label="ERP users" value={users} />
      </Grid>

      <Grid container spacing={2.5}>
        {/* Stock by material type */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 2 }}>Stock by material type</Typography>
            {byType.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No raw material stock yet — receive a batch in the Inventory tab, or run a sync.
              </Typography>
            )}
            {byType.map((row) => (
              <Box key={row.type} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{humanize(row.type)}</Typography>
                  <Typography variant="body2" color="text.secondary">{row.count}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={Math.round((row.count / maxByType) * 100)} />
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Connection + sync */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 2 }}>Connection</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{stateLabel}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {lastSyncAt ? `Synced ${timeAgo(lastSyncAt)}` : 'Never synced'}
            </Typography>

            {status?.counts && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                {Object.entries(status.counts).map(([key, count]) => (
                  <Chip key={key} size="small" variant="outlined" label={`${humanize(key)}: ${count}`} sx={{ color: 'text.secondary' }} />
                ))}
              </Box>
            )}

            <Button
              variant="contained"
              startIcon={syncMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || state === 'off'}
            >
              {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              Full bootstrap pull from the ERP into the local mirrors.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {snackEl}
    </Box>
  );
}
