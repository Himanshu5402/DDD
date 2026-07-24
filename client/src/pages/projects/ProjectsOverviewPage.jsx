import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Typography, Grid, Chip, LinearProgress, CircularProgress, Alert,
  Drawer, IconButton, Divider, Stack, Tooltip, Avatar, Button, Snackbar,
} from '@mui/material';
import Masonry from '@mui/lab/Masonry';
import CloseIcon from '@mui/icons-material/Close';
import EventIcon from '@mui/icons-material/Event';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import SyncIcon from '@mui/icons-material/Sync';
import FlagIcon from '@mui/icons-material/OutlinedFlag';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import api, { getErrorMessage } from '../../lib/axios.js';
import { integrationsApi, pepsiErrorMessage } from '../../api/integrations.api.js';
import { projectsApi, PROJECT_STATUSES } from '../../api/rrrmas.api.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

// ---------- formatting helpers ----------

/** Indian currency, compact: ₹2.64Cr / ₹32.0L / ₹18,500 */
export function formatINR(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.00$/, '')}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
}

// Soft accent chips — tinted background, saturated text, no fill blocks.
const SOFT = {
  indigo: { bgcolor: '#EEF2FF', color: '#4338CA' },
  success: { bgcolor: '#ECFDF5', color: '#047857' },
  warning: { bgcolor: '#FFFBEB', color: '#B45309' },
  error: { bgcolor: '#FEF2F2', color: '#B91C1C' },
};

const HEALTH_META = {
  on_track: { label: 'On Track', color: 'success', soft: SOFT.success, accent: '#059669' },
  at_risk: { label: 'At Risk', color: 'warning', soft: SOFT.warning, accent: '#D97706' },
  critical: { label: 'Critical', color: 'error', soft: SOFT.error, accent: '#DC2626' },
};

const NEUTRAL_ACCENT = '#CBD5E1';

/** SPI/CPI colour band: healthy (>=1) → amber (>=0.9) → red. */
function perfColor(v) {
  if (v == null) return 'text.secondary';
  if (v >= 1) return 'success.main';
  if (v >= 0.9) return 'warning.main';
  return 'error.main';
}

/** Roll budget lines into one { budget, actual, pct } total for the card bar. */
function budgetTotals(lines = []) {
  if (!lines.length) return null;
  const budget = lines.reduce((s, b) => s + (b.budget || 0), 0);
  const actual = lines.reduce((s, b) => s + (b.actual || 0), 0);
  return { budget, actual, pct: budget > 0 ? Math.round((actual / budget) * 100) : 0 };
}

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/** Compact SPI / CPI pill with a colour band. */
function PerfPill({ label, value }) {
  return (
    <Box
      sx={{
        textAlign: 'center', px: 1, py: 0.4, borderRadius: 2,
        border: '1px solid', borderColor: 'divider', minWidth: 50,
      }}
    >
      <Typography sx={{ display: 'block', fontSize: 9, lineHeight: 1, color: 'text.disabled', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.35, color: perfColor(value) }}>
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

const QUOTE_STAGE_COLOR = {
  Lead: 'default', Qualified: 'info', Proposal: 'secondary',
  Negotiation: 'warning', Won: 'success', Lost: 'error',
};

const MILESTONE_COLOR = {
  done: 'success', active: 'info', in_progress: 'info', planned: 'default', pending: 'default', blocked: 'error',
};

// Portal execution-data status colours (drawer sections).
const NCR_STATUS_COLOR = { Open: 'error', CAPA: 'warning', Closed: 'success' };
// Portal expense workflow: Draft → Submitted → PM → Finance → Booked / Reimbursed.
const EXPENSE_STATUS_COLOR = {
  Draft: 'default', Submitted: 'default', 'PM Approved': 'info', 'Finance Verified': 'info',
  Booked: 'success', Reimbursed: 'success', Rejected: 'error',
};
const TEST_STATUS_COLOR = { PASS: 'success', RUNNING: 'info', PLANNED: 'default', BLOCKED: 'error', FAIL: 'error' };
const CR_STATUS_COLOR = { Approved: 'success', 'Client Review': 'warning', Rejected: 'error', Draft: 'default' };
const STAGE_DOT = { Completed: '#059669', 'In Progress': '#0284C7', Blocked: '#DC2626', Pending: '#CBD5E1' };

function nextMilestone(milestones = []) {
  return milestones
    .filter((m) => m.status !== 'done')
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[0];
}

/* ------------------------- File import (Excel/PDF) ------------------------ */

const PROJECT_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status', hint: 'planning / active / on_hold / completed / cancelled' },
  { key: 'startDate', label: 'Start date', hint: 'YYYY-MM-DD' },
  { key: 'endDate', label: 'End date', hint: 'YYYY-MM-DD' },
  { key: 'budget', label: 'Budget', hint: 'number ≥ 0' },
  { key: 'contractValue', label: 'Contract value', hint: 'number ≥ 0' },
  { key: 'progress', label: 'Progress', hint: '0 – 100' },
  { key: 'pmName', label: 'Project manager', hint: 'name, free text' },
  { key: 'location', label: 'Location' },
  { key: 'workType', label: 'Work type', hint: 'HW / SW / HW+SW' },
  { key: 'health', label: 'Health', hint: 'on_track / at_risk / critical' },
  { key: 'tags', label: 'Tags', hint: 'comma-separated' },
];

const PROJECT_IMPORT_WORK_TYPES = ['HW', 'SW', 'HW+SW'];
const PROJECT_IMPORT_HEALTH = ['on_track', 'at_risk', 'critical'];

function buildProjectImportPayload(m) {
  if (!m.name) throw new Error('Name is required');
  const payload = { name: m.name };
  if (m.description) payload.description = m.description;
  const status = (m.status || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (PROJECT_STATUSES.includes(status)) payload.status = status;
  if (m.startDate) payload.startDate = m.startDate;
  if (m.endDate) payload.endDate = m.endDate;
  if (m.budget) {
    const budget = Number(String(m.budget).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(budget) || budget < 0) throw new Error('Budget must be a number ≥ 0');
    payload.budget = budget;
  }
  if (m.contractValue) {
    const contractValue = Number(String(m.contractValue).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(contractValue) || contractValue < 0) throw new Error('Contract value must be a number ≥ 0');
    payload.contractValue = contractValue;
  }
  if (m.progress) {
    const progress = Math.round(Number(String(m.progress).replace(/[^0-9.-]/g, '')));
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new Error('Progress must be a number between 0 and 100');
    }
    payload.progress = progress;
  }
  if (m.pmName) payload.pmName = m.pmName;
  if (m.location) payload.location = m.location;
  const workType = (m.workType || '').toUpperCase().replace(/\s+/g, '');
  if (PROJECT_IMPORT_WORK_TYPES.includes(workType)) payload.workType = workType;
  const health = (m.health || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (PROJECT_IMPORT_HEALTH.includes(health)) payload.health = health;
  if (m.tags) {
    const tags = m.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length) payload.tags = tags;
  }
  return payload;
}

/** Health rendered as a tiny dot + soft chip. */
function HealthChip({ health, size = 'small', sx }) {
  if (!health) return null;
  return (
    <Chip
      size={size}
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            component="span"
            sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: `${health.color}.main`, flexShrink: 0 }}
          />
          {health.label}
        </Box>
      }
      sx={{ ...health.soft, ...sx }}
    />
  );
}

// ---------- page ----------

export default function ProjectsOverviewPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [snack, setSnack] = useState(null); // { severity, message }

  const projectsQuery = useQuery({
    queryKey: ['projects-overview'],
    queryFn: async () => {
      const res = await api.get('/rrrmas/projects', { params: { limit: 100, sort: '-contractValue' } });
      return res.data.data;
    },
  });

  const statusQuery = useQuery({
    queryKey: ['pepsi-status'],
    queryFn: integrationsApi.pepsiStatus,
  });

  const pullMutation = useMutation({
    mutationFn: integrationsApi.pepsiPull,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects-overview'] });
      qc.invalidateQueries({ queryKey: ['pepsi-status'] });
      setSnack({ severity: 'success', message: res?.message || 'PEPSI pull complete' });
    },
    onError: (err) => setSnack({ severity: 'error', message: pepsiErrorMessage(err, 'PEPSI pull failed') }),
  });

  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['projects-overview'] });
      qc.invalidateQueries({ queryKey: ['pepsi-status'] });
    };
    socket.on('rrrmas:changed', handler);
    return () => socket.off('rrrmas:changed', handler);
  }, [qc]);

  const projects = projectsQuery.data || [];

  const stats = useMemo(() => {
    const total = projects.reduce((s, p) => s + (p.contractValue || 0), 0);
    const byHealth = { on_track: 0, at_risk: 0, critical: 0 };
    let progressSum = 0;
    projects.forEach((p) => {
      if (byHealth[p.health] !== undefined) byHealth[p.health] += 1;
      progressSum += p.progress || 0;
    });
    return {
      total,
      count: projects.length,
      byHealth,
      avgProgress: projects.length ? Math.round(progressSum / projects.length) : 0,
    };
  }, [projects]);

  return (
    <Box>
      <PageHeader
        title="Projects"
        subtitle="Portfolio synced from the PEPSI execution portal — read-only here."
        action={
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {statusQuery.data && (
              <Chip
                icon={<SyncIcon />}
                size="small"
                label={`PEPSI · ${statusQuery.data.projects} projects · synced ${statusQuery.data.lastSyncedAt ? formatDate(statusQuery.data.lastSyncedAt) : 'never'}`}
                variant="outlined"
                sx={{ color: 'text.secondary' }}
              />
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<SyncIcon />}
              disabled={pullMutation.isPending}
              onClick={() => pullMutation.mutate()}
            >
              {pullMutation.isPending ? 'Pulling…' : 'Pull from PEPSI'}
            </Button>
          </Stack>
        }
      />

      {/* Portfolio stats */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <StatCard label="Contract value" value={formatINR(stats.total)} hint={`${stats.count} projects`} />
        <StatCard label="On track" value={stats.byHealth.on_track} color="success.main" />
        <StatCard label="At risk" value={stats.byHealth.at_risk} color="warning.main" />
        <StatCard label="Critical" value={stats.byHealth.critical} color="error.main" />
        <StatCard label="Avg progress" value={`${stats.avgProgress}%`} color="primary.main" />
      </Grid>

      {projectsQuery.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>
      )}
      {projectsQuery.error && <Alert severity="error">{getErrorMessage(projectsQuery.error)}</Alert>}

      {!projectsQuery.isLoading && !projectsQuery.error && projects.length === 0 && (
        <Alert severity="info">
          No projects synced yet. Run <b>npm run seed:pepsi</b> on the server, or POST the portal feed to
          <b> /integrations/pepsi/sync</b>.
        </Alert>
      )}

      {projects.length > 0 && (
        <Masonry columns={{ xs: 1, sm: 2, lg: 3 }} spacing={2.5}>
          {projects.map((p) => (
            <ProjectCard key={p._id} project={p} onClick={() => setSelected(p)} />
          ))}
        </Masonry>
      )}

      <ProjectDrawer project={selected} onClose={() => setSelected(null)} />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import projects from Excel / PDF"
        entity="company projects (portfolio records)"
        fields={PROJECT_IMPORT_FIELDS}
        buildPayload={buildProjectImportPayload}
        createFn={(payload) => projectsApi.create(payload)}
        onDone={() => qc.invalidateQueries({ queryKey: ['projects-overview'] })}
      />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)} variant="filled">
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function StatCard({ label, value, hint, color = 'text.primary' }) {
  return (
    <Grid item xs={6} sm={4} md={2.4}>
      <Paper
        elevation={0}
        sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: '0.02em', display: 'block' }}
        >
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

function ProjectCard({ project: p, onClick, ...props }) {
  const health = HEALTH_META[p.health];
  const accent = health?.accent || NEUTRAL_ACCENT;
  const dl = daysLeft(p.endDate);
  const overdue = dl != null && dl < 0 && p.progress < 100;
  const dueSoon = dl != null && dl >= 0 && dl <= 14;
  const nm = nextMilestone(p.milestones);
  const quote = (p.quotations || [])[0];
  const bt = budgetTotals(p.budgetLines);
  const hasFooter = nm || quote || p.openItems?.ncrs > 0 || p.openItems?.tasks > 0;

  return (
    <Paper
      {...props}
      elevation={0}
      onClick={onClick}
      sx={{
        cursor: 'pointer', overflow: 'hidden',
        border: '1px solid', borderColor: 'divider', borderRadius: 3,
        transition: 'box-shadow .18s ease, transform .18s ease, border-color .18s ease',
        '&:hover': {
          boxShadow: '0 14px 34px rgba(15,23,42,0.10)',
          transform: 'translateY(-3px)',
          borderColor: 'transparent',
        },
      }}
    >
      {/* Health accent bar */}
      <Box sx={{ height: 4, bgcolor: accent }} />

      <Box sx={{ p: 2.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.3 }} noWrap title={p.name}>
              {p.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {p.code || p.externalId} {p.customerName ? `· ${p.customerName}` : ''}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            {p.blocked && (
              <Chip label="Blocked" size="small" sx={{ height: 22, fontSize: 10.5, ...SOFT.error }} />
            )}
            {p.workType && (
              <Chip
                label={p.workType}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: 10.5, color: 'text.secondary' }}
              />
            )}
            <HealthChip health={health} sx={{ height: 22, fontSize: 10.5 }} />
          </Stack>
        </Box>

        {/* Stage + progress */}
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
            <Typography variant="caption" color="text.secondary" noWrap>
              {p.currentStage?.index
                ? `Stage ${p.currentStage.index}/${p.currentStage.total || 8} · ${p.currentStage.name}`
                : 'Progress'}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, flexShrink: 0 }}>{p.progress ?? 0}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={p.progress ?? 0}
            color={health?.color || 'primary'}
            sx={{ height: 7 }}
          />
        </Box>

        {/* Contract value + SPI/CPI pills */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1, mt: 2.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
              Contract value
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 21, lineHeight: 1.2 }} noWrap>
              {formatINR(p.contractValue)}
            </Typography>
          </Box>
          {p.spi != null && (
            <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
              <PerfPill label="SPI" value={p.spi} />
              <PerfPill label="CPI" value={p.cpi} />
            </Stack>
          )}
        </Box>

        {/* PM + deadline */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Avatar sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 700, bgcolor: '#EEF2FF', color: '#4338CA' }}>
              {initialsOf(p.pmName)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ display: 'block', fontSize: 9.5, lineHeight: 1.1, color: 'text.disabled', fontWeight: 700, letterSpacing: '0.04em' }}>
                PROJECT MANAGER
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={p.pmName || '—'}>
                {p.pmName || '—'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ display: 'block', fontSize: 9.5, lineHeight: 1.1, color: 'text.disabled', fontWeight: 700, letterSpacing: '0.04em' }}>
              DEADLINE
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: overdue ? 'error.main' : dueSoon ? 'warning.main' : 'text.primary' }}
              noWrap
            >
              {p.endDate ? formatDate(p.endDate) : '—'}
            </Typography>
            {dl != null && (
              <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: overdue ? 'error.main' : dueSoon ? 'warning.main' : 'text.disabled' }}>
                {overdue ? `${Math.abs(dl)}d overdue` : `${dl}d left`}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Budget burn */}
        {bt && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 1 }}>
              <Typography variant="caption" color="text.secondary">Budget burn</Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: bt.pct >= 100 ? 'error.main' : bt.pct >= 85 ? 'warning.main' : 'text.secondary' }}
                noWrap
              >
                {formatINR(bt.actual)} / {formatINR(bt.budget)} · {bt.pct}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, bt.pct)}
              color={bt.pct >= 100 ? 'error' : bt.pct >= 85 ? 'warning' : 'primary'}
              sx={{ height: 5 }}
            />
          </Box>
        )}

        {/* Next milestone + quotation + open items */}
        {hasFooter && (
          <Box sx={{ mt: 2, pt: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
            {nm && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                <FlagIcon sx={{ fontSize: 15 }} />
                <Typography variant="caption" noWrap>
                  Next: <b>{nm.name}</b> · {formatDate(nm.date)}
                </Typography>
              </Box>
            )}
            {quote && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', mt: nm ? 0.75 : 0 }}>
                <RequestQuoteIcon sx={{ fontSize: 15 }} />
                <Typography variant="caption" noWrap>
                  {quote.externalId} · {formatINR(quote.estValue)}
                </Typography>
                <Chip
                  label={quote.stage}
                  size="small"
                  color={QUOTE_STAGE_COLOR[quote.stage] || 'default'}
                  sx={{ height: 18, fontSize: 9.5 }}
                />
              </Box>
            )}
            {(p.openItems?.ncrs > 0 || p.openItems?.tasks > 0) && (
              <Stack direction="row" spacing={0.75} sx={{ mt: nm || quote ? 1.25 : 0 }}>
                {p.openItems.ncrs > 0 && (
                  <Chip
                    icon={<WarningAmberIcon sx={{ fontSize: 13, color: '#B91C1C !important' }} />}
                    label={`${p.openItems.ncrs} NCR`}
                    size="small"
                    sx={{ height: 22, fontSize: 10.5, ...SOFT.error }}
                  />
                )}
                {p.openItems.tasks > 0 && (
                  <Chip
                    label={`${p.openItems.tasks} open tasks`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: 10.5, color: 'text.secondary' }}
                  />
                )}
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function ProjectDrawer({ project: p, onClose }) {
  if (!p) return null;
  const health = HEALTH_META[p.health];
  const dl = daysLeft(p.endDate);
  const accent = health?.accent || NEUTRAL_ACCENT;

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 500 } } }}>
      <Box sx={{ height: 4, bgcolor: accent }} />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.25 }}>{p.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {p.code || p.externalId} · {p.customerName}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.75 }}>
          {p.blocked && (
            <Chip
              icon={<BlockIcon sx={{ fontSize: 14, color: '#B91C1C !important' }} />}
              label="Blocked"
              size="small"
              sx={SOFT.error}
            />
          )}
          <HealthChip health={health} />
          {p.workType && (
            <Chip label={p.workType} size="small" variant="outlined" sx={{ color: 'text.secondary' }} />
          )}
          {p.spi != null && (
            <Chip label={`SPI ${p.spi}`} size="small" variant="outlined" sx={{ color: 'text.secondary' }} />
          )}
          {p.cpi != null && (
            <Chip label={`CPI ${p.cpi}`} size="small" variant="outlined" sx={{ color: 'text.secondary' }} />
          )}
          <Chip label={formatINR(p.contractValue)} size="small" sx={{ ...SOFT.indigo }} />
        </Stack>

        {/* Meta */}
        <Stack spacing={0.75} sx={{ mt: 3 }}>
          <MetaRow icon={PersonIcon} text={`PM: ${p.pmName || '—'}`} />
          {p.location && <MetaRow icon={PlaceIcon} text={p.location} />}
          <MetaRow
            icon={EventIcon}
            text={`${formatDate(p.startDate)} → ${formatDate(p.endDate)}${dl != null ? ` (${dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`})` : ''}`}
          />
        </Stack>

        {/* Stage + progress */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              {p.currentStage?.index ? `Stage ${p.currentStage.index}/${p.currentStage.total || 8} · ${p.currentStage.name}` : 'Progress'}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{p.progress ?? 0}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={p.progress ?? 0} color={health?.color || 'primary'} sx={{ height: 8 }} />
        </Box>

        {p.statusNote && (
          <Alert icon={false} severity="info" sx={{ mt: 3, fontSize: 13 }}>{p.statusNote}</Alert>
        )}
        {p.insightNote && (
          <Alert severity={p.health === 'critical' ? 'error' : p.health === 'at_risk' ? 'warning' : 'success'} sx={{ mt: 1.5, fontSize: 13 }}>
            <b>PEPSI insight:</b> {p.insightNote}
          </Alert>
        )}

        {/* Execution stages (8-stage PEPSI cycle) */}
        {p.stages?.length > 0 && (
          <Section title="Execution stages">
            {p.stages.map((s, i) => {
              const active = s.status === 'In Progress' || s.status === 'Blocked';
              return (
                <Box key={s._id || i} sx={{ mb: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STAGE_DOT[s.status] || '#CBD5E1', flexShrink: 0 }} />
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: active ? 700 : 500, color: s.status === 'Pending' ? 'text.disabled' : 'text.primary', flex: 1 }}
                      noWrap
                    >
                      {i + 1}. {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{s.progress}%</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={s.progress}
                    color={s.status === 'Blocked' ? 'error' : s.status === 'Completed' ? 'success' : 'primary'}
                    sx={{ height: 4, ml: 2 }}
                  />
                </Box>
              );
            })}
          </Section>
        )}

        {/* Milestones */}
        {p.milestones?.length > 0 && (
          <Section title="Milestones">
            {p.milestones.map((m) => (
              <Box key={m._id || m.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75 }}>
                <Typography variant="body2" sx={{ textDecoration: m.status === 'done' ? 'line-through' : 'none', color: m.status === 'done' ? 'text.disabled' : 'text.primary' }}>
                  {m.name}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary">{formatDate(m.date)}</Typography>
                  <Chip label={m.status} size="small" color={MILESTONE_COLOR[m.status] || 'default'} sx={{ height: 18, fontSize: 10, textTransform: 'capitalize' }} />
                </Stack>
              </Box>
            ))}
          </Section>
        )}

        {/* QC & production tests */}
        {p.tests?.length > 0 && (
          <Section title="QC & production tests">
            {p.tests.map((t, i) => (
              <Paper key={t._id || i} elevation={0} sx={{ p: 1.75, mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.type}{t.window ? ` · ${t.window}` : ''}</Typography>
                  </Box>
                  <Chip label={t.status} size="small" color={TEST_STATUS_COLOR[t.status] || 'default'} sx={{ height: 20, flexShrink: 0 }} />
                </Box>
                {t.metrics?.map((m, j) => (
                  <Box key={j} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.3 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>{m.name}</Typography>
                    <Typography variant="caption" sx={{ mx: 1, color: 'text.disabled', flexShrink: 0 }}>{m.target}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: m.pass ? 'success.main' : 'error.main', minWidth: 62, textAlign: 'right', flexShrink: 0 }}>
                      {m.actual} {m.pass ? '✓' : '✗'}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            ))}
          </Section>
        )}

        {/* Non-conformance reports */}
        {p.ncrs?.length > 0 && (
          <Section title="Non-conformance (NCRs)">
            {p.ncrs.map((n, i) => (
              <Paper key={n._id || i} elevation={0} sx={{ p: 1.75, mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{n.externalId}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Chip label={n.severity} size="small" sx={{ height: 18, fontSize: 9.5, ...(n.severity === 'Major' ? SOFT.error : SOFT.warning) }} />
                    <Chip label={n.status} size="small" color={NCR_STATUS_COLOR[n.status] || 'default'} sx={{ height: 18, fontSize: 9.5 }} />
                  </Stack>
                </Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{n.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Owner: {n.owner || '—'}{n.ageDays ? ` · ${n.ageDays}d open` : ''}
                </Typography>
                {n.correctiveAction && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    <b>CA:</b> {n.correctiveAction}
                  </Typography>
                )}
              </Paper>
            ))}
          </Section>
        )}

        {/* Budget vs actual */}
        {p.budgetLines?.length > 0 && (
          <Section title="Budget vs actual">
            {p.budgetLines.map((b) => {
              const pct = b.budget > 0 ? Math.round((b.actual / b.budget) * 100) : 0;
              return (
                <Box key={b._id || b.category} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption">{b.category}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatINR(b.actual)} / {formatINR(b.budget)} · {pct}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, pct)}
                    color={pct >= 100 ? 'error' : pct >= 85 ? 'warning' : 'primary'}
                    sx={{ height: 6 }}
                  />
                </Box>
              );
            })}
          </Section>
        )}

        {/* Expenses (portal-owned, read-only) */}
        {p.expensesExternal?.length > 0 && (
          <Section title="Expenses">
            {p.expensesExternal.map((e, i) => (
              <Paper key={e._id || e.externalId || i} elevation={0} sx={{ p: 1.75, mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.externalId}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    {e.paid && (
                      <Chip label={`Paid: ${e.paid}`} size="small" variant="outlined" sx={{ height: 18, fontSize: 9.5, color: 'text.secondary' }} />
                    )}
                    {e.status && (
                      <Chip label={e.status} size="small" color={EXPENSE_STATUS_COLOR[e.status] || 'default'} sx={{ height: 18, fontSize: 9.5 }} />
                    )}
                  </Stack>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2">{e.category || '—'}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>{formatINR(e.amount)}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {/* `date` is the portal's display string (e.g. "03 Jul") — render as-is. */}
                  {e.by || '—'}{e.date ? ` · ${e.date}` : ''}
                </Typography>
                {e.note && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {e.note}
                  </Typography>
                )}
                {e.rejectReason && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main' }}>
                    <b>Rejected:</b> {e.rejectReason}
                  </Typography>
                )}
              </Paper>
            ))}
          </Section>
        )}

        {/* Change requests */}
        {p.changeRequests?.length > 0 && (
          <Section title="Change requests">
            {p.changeRequests.map((c, i) => (
              <Paper key={c._id || i} elevation={0} sx={{ p: 1.75, mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.externalId}</Typography>
                  <Chip label={c.status} size="small" color={CR_STATUS_COLOR[c.status] || 'default'} sx={{ height: 20, flexShrink: 0 }} />
                </Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{c.scope}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Cost {c.cost || '—'} · Schedule {c.schedule || '—'}
                </Typography>
              </Paper>
            ))}
          </Section>
        )}

        {/* Quotations */}
        {p.quotations?.length > 0 && (
          <Section title="Related quotations (sales pipeline)">
            {p.quotations.map((q) => (
              <Paper
                key={q._id || q.externalId}
                elevation={0}
                sx={{ p: 1.75, mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{q.title}</Typography>
                  <Chip label={q.stage} size="small" color={QUOTE_STAGE_COLOR[q.stage] || 'default'} sx={{ height: 20 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {q.externalId} · {formatINR(q.estValue)}
                  {q.probability != null ? ` · ${q.probability}% probability` : ''}
                  {q.closeDate ? ` · close ${formatDate(q.closeDate)}` : ''}
                  {q.owner ? ` · ${q.owner}` : ''}
                </Typography>
              </Paper>
            ))}
          </Section>
        )}

        {/* Risks */}
        {p.risksExternal?.length > 0 && (
          <Section title="Top risks">
            {p.risksExternal.map((r, i) => (
              <Alert key={r._id || i} severity="warning" icon={<WarningAmberIcon fontSize="small" />} sx={{ mb: 1, fontSize: 12.5 }}>
                <b>P:{r.probability} / I:{r.impact}</b> — {r.description}
              </Alert>
            ))}
          </Section>
        )}

        {/* Team */}
        {p.teamExternal?.length > 0 && (
          <Section title="Team">
            {p.teamExternal.map((t, i) => (
              <Box key={t._id || i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6 }}>
                <Typography variant="body2">
                  {t.name}
                  <Typography component="span" variant="caption" color="text.secondary"> · {t.role || '—'}</Typography>
                </Typography>
                {t.utilization != null && (
                  <Tooltip title="Utilization">
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{t.utilization}%</Typography>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Section>
        )}

        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="text.secondary">
          Source: PEPSI portal · last synced {p.lastSyncedAt ? formatDate(p.lastSyncedAt) : '—'} · read-only in DDD
        </Typography>
      </Box>
    </Drawer>
  );
}

function MetaRow({ icon: Icon, text }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
      <Icon sx={{ fontSize: 16 }} />
      <Typography variant="body2">{text}</Typography>
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  );
}
