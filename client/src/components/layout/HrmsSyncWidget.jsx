import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, IconButton, Tooltip, CircularProgress, Snackbar, Alert, Divider } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { integrationsApi, hrmsErrorMessage } from '../../api/integrations.api.js';

/** '2026-07-22T09:00:00Z' -> 'just now' / '5m ago' / '3h ago' / '2d ago'. */
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Sidebar footer widget: HRMS integration health + an owner "Sync now" button
 * (full bootstrap pull). Mirrors refresh via socket events + invalidation.
 */
export default function HrmsSyncWidget() {
  const qc = useQueryClient();
  const [snack, setSnack] = useState(null); // { severity, message }

  const statusQuery = useQuery({
    queryKey: ['integrations', 'hrms-status'],
    queryFn: integrationsApi.hrmsStatus,
    refetchInterval: 60_000,
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: integrationsApi.hrmsSync,
    onSuccess: (res) => {
      // Every module may have new mirror rows — refetch the lot.
      qc.invalidateQueries();
      setSnack({ severity: 'success', message: res?.message || 'HRMS sync complete' });
    },
    onError: (err) => setSnack({ severity: 'error', message: hrmsErrorMessage(err, 'HRMS sync failed') }),
  });

  const s = statusQuery.data;
  const state = statusQuery.isError
    ? 'down'
    : !s
      ? 'loading'
      : !s.enabled
        ? 'off'
        : s.hrmsReachable
          ? 'ok'
          : 'down';

  const dotColor = { ok: 'success.main', down: 'warning.main', off: 'text.disabled', loading: 'text.disabled' }[state];
  const label = { ok: 'HRMS connected', down: 'HRMS unreachable', off: 'HRMS sync off', loading: 'HRMS status…' }[state];
  const sub = s?.lastSyncAt ? `Synced ${timeAgo(s.lastSyncAt)}` : 'Never synced';

  return (
    <>
      <Divider sx={{ borderColor: 'divider' }} />
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }} noWrap>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }} noWrap>
            {sub}
          </Typography>
        </Box>
        <Tooltip title="Sync now — full pull from the HRMS">
          <span>
            <IconButton
              size="small"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || state === 'off'}
            >
              {syncMutation.isPending ? <CircularProgress size={16} /> : <SyncIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)} sx={{ width: '100%' }}>
          {snack?.message || ''}
        </Alert>
      </Snackbar>
    </>
  );
}
