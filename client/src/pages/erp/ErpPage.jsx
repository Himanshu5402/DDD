import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Paper, Tabs, Tab, Chip } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { erpApi } from '../../api/erp.api.js';
import { formatDate } from './erpCommon.jsx';
import OverviewTab from './OverviewTab.jsx';
import InventoryTab from './InventoryTab.jsx';
import ProductionTab from './ProductionTab.jsx';
import SalesTab from './SalesTab.jsx';
import AssetsTab from './AssetsTab.jsx';
import MastersTab from './MastersTab.jsx';
import UsersTab from './UsersTab.jsx';
import TrackTab from './TrackTab.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', Component: OverviewTab },
  { key: 'inventory', label: 'Inventory', Component: InventoryTab },
  { key: 'production', label: 'Production', Component: ProductionTab },
  { key: 'sales', label: 'Sales', Component: SalesTab },
  { key: 'assets', label: 'Assets', Component: AssetsTab },
  { key: 'masters', label: 'Masters', Component: MastersTab },
  { key: 'users', label: 'Users', Component: UsersTab },
  { key: 'track', label: 'Track', Component: TrackTab },
];

export default function ErpPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);

  const statusQuery = useQuery({
    queryKey: ['erp', 'status'],
    queryFn: erpApi.status,
    refetchInterval: 60_000,
    retry: false,
  });

  // Live updates: any ERP mirror change (event, write-through echo or sync)
  // broadcasts 'erp:changed' — refetch every erp-rooted query.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () =>
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]) === 'erp' });
    socket.on('erp:changed', handler);
    return () => socket.off('erp:changed', handler);
  }, [qc]);

  const s = statusQuery.data;

  return (
    <Box>
      <PageHeader
        title="ERP"
        subtitle="itsybizz ERP — inventory, production, sales and masters, synced two-way."
        action={
          s && (
            <Chip
              icon={<SyncIcon />}
              size="small"
              label={`ERP · ${s.erpReachable ? 'connected' : 'offline'} · synced ${s.lastSyncAt ? formatDate(s.lastSyncAt) : 'never'}`}
              variant="outlined"
              sx={{ color: 'text.secondary' }}
            />
          )
        }
      />

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {TABS.map((t) => (
            <Tab key={t.key} label={t.label} />
          ))}
        </Tabs>
      </Paper>

      {TABS.map((t, i) => (tab === i ? <t.Component key={t.key} /> : null))}
    </Box>
  );
}
