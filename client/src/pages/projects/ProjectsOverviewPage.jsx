import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Typography, Grid, Chip, LinearProgress, CircularProgress, Alert,
  Drawer, IconButton, Divider, Stack, Tooltip,
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
import PageHeader from '../../components/ui/PageHeader.jsx';
import api, { getErrorMessage } from '../../lib/axios.js';
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
  on_track: { label: 'On Track', color: 'success', soft: SOFT.success },
  at_risk: { label: 'At Risk', color: 'warning', soft: SOFT.warning },
  critical: { label: 'Critical', color: 'error', soft: SOFT.error },
};

const QUOTE_STAGE_COLOR = {
  Lead: 'default', Qualified: 'info', Proposal: 'secondary',
  Negotiation: 'warning', Won: 'success', Lost: 'error',
};

const MILESTONE_COLOR = {
  done: 'success', active: 'info', in_progress: 'info', planned: 'default', pending: 'default',
};

function nextMilestone(milestones = []) {
  return milestones
    .filter((m) => m.status !== 'done')
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[0];
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

  const projectsQuery = useQuery({
    queryKey: ['projects-overview'],
    queryFn: async () => {
      const res = await api.get('/rrrmas/projects', { params: { limit: 100, sort: '-contractValue' } });
      return res.data.data;
    },
  });

  const statusQuery = useQuery({
    queryKey: ['pepsi-status'],
    queryFn: async () => {
      const res = await api.get('/integrations/pepsi/status');
      return res.data.data;
    },
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
          statusQuery.data && (
            <Chip
              icon={<SyncIcon />}
              size="small"
              label={`PEPSI · ${statusQuery.data.projects} projects · synced ${statusQuery.data.lastSyncedAt ? formatDate(statusQuery.data.lastSyncedAt) : 'never'}`}
              variant="outlined"
              sx={{ color: 'text.secondary' }}
            />
          )
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
  const dl = daysLeft(p.endDate);
  const overdue = dl != null && dl < 0 && p.progress < 100;
  const nm = nextMilestone(p.milestones);
  const quote = (p.quotations || [])[0];
  const hasFooter = nm || quote || p.openItems?.ncrs > 0 || p.openItems?.tasks > 0;

  return (
    <Paper
      {...props}
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2.5, cursor: 'pointer',
        border: '1px solid', borderColor: 'divider', borderRadius: 3,
        transition: 'box-shadow .15s ease, transform .15s ease',
        '&:hover': { boxShadow: '0 10px 30px rgba(15,23,42,0.08)', transform: 'translateY(-2px)' },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }} noWrap title={p.name}>
            {p.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.code || p.externalId} {p.customerName ? `· ${p.customerName}` : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
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

      {/* Progress */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary">
            {p.currentStage?.index
              ? `Stage ${p.currentStage.index}/${p.currentStage.total || 8} · ${p.currentStage.name}`
              : 'Progress'}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>{p.progress ?? 0}%</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={p.progress ?? 0}
          color={health?.color || 'primary'}
          sx={{ height: 6 }}
        />
      </Box>

      {/* Facts */}
      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
        <Fact label="Contract" value={formatINR(p.contractValue)} strong />
        <Fact
          label="Deadline"
          value={
            p.endDate
              ? `${formatDate(p.endDate)}${dl != null ? ` · ${overdue ? `${Math.abs(dl)}d overdue` : `${dl}d left`}` : ''}`
              : '—'
          }
          color={overdue ? 'error.main' : dl != null && dl <= 14 ? 'warning.main' : undefined}
        />
        <Fact label="PM" value={p.pmName || '—'} />
        <Fact label="SPI / CPI" value={p.spi != null ? `${p.spi} / ${p.cpi}` : '—'} />
      </Grid>

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
    </Paper>
  );
}

function Fact({ label, value, color, strong }) {
  return (
    <Grid item xs={6}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 800 : 600, color }} noWrap title={String(value)}>
        {value}
      </Typography>
    </Grid>
  );
}

function ProjectDrawer({ project: p, onClose }) {
  if (!p) return null;
  const health = HEALTH_META[p.health];
  const dl = daysLeft(p.endDate);

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
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
