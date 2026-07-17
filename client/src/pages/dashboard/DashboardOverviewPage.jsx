import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  AvatarGroup,
  Box,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import Masonry from '@mui/lab/Masonry';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { dashboardApi } from '../../api/dashboard.api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const PRIORITY_SOFT = {
  low: { bgcolor: '#F3F4F6', color: '#4B5563' },
  medium: { bgcolor: '#F0F9FF', color: '#0369A1' },
  high: { bgcolor: '#FFFBEB', color: '#B45309' },
  urgent: { bgcolor: '#FEF2F2', color: '#B91C1C' },
};

function initialsOf(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatINR(n) {
  return inr.format(n || 0);
}

function compactINR(n) {
  return `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)}`;
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function StatCard({ label, value, hint, color = 'text.primary', badge }) {
  return (
    <Paper
      sx={{
        p: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        height: '100%',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
        <Typography
          component="div"
          sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.02em', color }}
        >
          {value}
        </Typography>
        {badge}
      </Box>
      {hint && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

/** Flatten the permission-aware overview into stat-card definitions. */
function buildCards(o) {
  const cards = [];

  if (o.tasks) {
    if (o.tasks.team) {
      cards.push({
        label: 'Team open tasks',
        value: o.tasks.team.open,
        hint: `${o.tasks.team.size} people report to you`,
        color: 'primary.main',
      });
    }
    cards.push(
      { label: 'My open tasks', value: o.tasks.myOpen, hint: 'assigned to you' },
      {
        label: 'Overdue tasks',
        value: o.tasks.overdue,
        hint: 'past their due date',
        color: o.tasks.overdue > 0 ? 'error.main' : 'text.primary',
      },
      {
        label: 'Due today',
        value: o.tasks.dueToday,
        hint: 'across the team',
        color: o.tasks.dueToday > 0 ? 'warning.main' : 'text.primary',
      }
    );
  }

  if (o.goals) {
    cards.push(
      {
        label: 'Active goals',
        value: o.goals.active,
        hint: `${o.goals.achievedThisMonth} achieved this month`,
      },
      {
        label: 'At-risk goals',
        value: o.goals.atRisk,
        hint: 'need attention',
        color: o.goals.atRisk > 0 ? 'warning.main' : 'text.primary',
      }
    );
  }

  if (o.projects) {
    cards.push({ label: 'Active projects', value: o.projects.active, hint: 'in delivery' });
  }

  if (o.renewals) {
    cards.push({
      label: 'Renewals due 30d',
      value: o.renewals.dueIn30,
      hint: `${formatINR(o.renewals.amountDueIn30)} to collect`,
    });
  }

  if (o.support) {
    cards.push({
      label: 'Open tickets',
      value: o.support.open,
      hint: 'in the support queue',
      badge:
        o.support.breached > 0 ? (
          <Chip
            size="small"
            label={`${o.support.breached} SLA breached`}
            sx={{ bgcolor: '#FEF2F2', color: '#B91C1C' }}
          />
        ) : null,
    });
  }

  if (o.finance) {
    cards.push(
      {
        label: 'Month income',
        value: compactINR(o.finance.monthIncome),
        hint: formatINR(o.finance.monthIncome),
        color: 'success.main',
      },
      {
        label: 'Month expense',
        value: compactINR(o.finance.monthExpense),
        hint: formatINR(o.finance.monthExpense),
        color: 'error.main',
      },
      {
        label: 'Month net',
        value: compactINR(o.finance.monthNet),
        hint: formatINR(o.finance.monthNet),
        color: o.finance.monthNet >= 0 ? 'success.main' : 'error.main',
      }
    );
  }

  if (o.maintenance) {
    cards.push(
      {
        label: 'Upcoming maintenance',
        value: o.maintenance.upcomingIn30,
        hint: 'next 30 days',
      },
      {
        label: 'Breakdown assets',
        value: o.maintenance.breakdownAssets,
        hint: 'need repair',
        color: o.maintenance.breakdownAssets > 0 ? 'error.main' : 'text.primary',
      }
    );
  }

  if (o.employees) {
    cards.push({
      label: 'Present today',
      value: o.employees.presentToday,
      hint: 'incl. work from home',
    });
  }

  if (o.reporting && typeof o.reporting.submittedToday === 'number') {
    cards.push({
      label: 'Reports today',
      value: o.reporting.submittedToday,
      hint: 'evening reports submitted',
    });
  }

  return cards;
}

function SectionCard({ label, children }) {
  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography
        variant="overline"
        sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontSize: 11 }}
      >
        {label}
      </Typography>
      {children}
    </Paper>
  );
}

/** One task row with full delegation context: priority, due, who assigned it, to whom. */
function TaskRow({ task, onClick, showAssignees = false }) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, cursor: 'pointer',
        borderBottom: '1px solid', borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
        '&:hover': { bgcolor: 'action.hover', mx: -1, px: 1, borderRadius: 1.5 },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{task.title}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {task.assignedBy?.name ? `from ${task.assignedBy.name}` : task.createdBy?.name ? `by ${task.createdBy.name}` : ''}
          {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ''}
        </Typography>
      </Box>
      {showAssignees && task.assignees?.length > 0 && (
        <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10 } }}>
          {task.assignees.map((a) => (
            <Tooltip key={a._id} title={a.name}>
              <Avatar sx={{ bgcolor: '#EEF2FF', color: '#4338CA' }}>{initialsOf(a.name)}</Avatar>
            </Tooltip>
          ))}
        </AvatarGroup>
      )}
      <Chip
        label={overdue ? 'overdue' : task.priority}
        size="small"
        sx={{
          height: 20, fontSize: 10, textTransform: 'capitalize', flexShrink: 0,
          ...(overdue ? { bgcolor: '#FEF2F2', color: '#B91C1C' } : (PRIORITY_SOFT[task.priority] || PRIORITY_SOFT.low)),
        }}
      />
    </Box>
  );
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardApi.overview(),
  });

  // Live refresh: any task change (assignment, delegation, completion)
  // re-renders the dashboard in real time.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
    socket.on('tasks:changed', handler);
    return () => socket.off('tasks:changed', handler);
  }, [qc]);

  const openTask = (t) => navigate(`/tasks?task=${t._id}`);

  const header = (
    <PageHeader
      title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'} 👋`}
      subtitle="Your business at a glance."
    />
  );

  if (isLoading) {
    return (
      <Box>
        {header}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box>
        {header}
        <Alert severity="error">{getErrorMessage(error, 'Could not load the dashboard')}</Alert>
      </Box>
    );
  }

  const o = data || {};
  const cards = buildCards(o);
  const renewalsNext = o.renewals?.next || [];
  const topProjects = o.projects?.topActive || [];

  const lowerCards = [];

  // My work queue — full details of tasks assigned to me (who assigned, due, priority).
  if (o.tasks?.assignedToMe?.length > 0) {
    lowerCards.push(
      <SectionCard key="my-tasks" label={`My tasks — assigned to me (${o.tasks.myOpen})`}>
        {o.tasks.assignedToMe.map((t) => (
          <TaskRow key={t._id} task={t} onClick={() => openTask(t)} />
        ))}
      </SectionCard>
    );
  }

  // Manager view — my team's open tasks and everything I've delegated onward.
  if (o.tasks?.team) {
    const team = o.tasks.team;
    lowerCards.push(
      <SectionCard
        key="team-tasks"
        label={`My team (${team.size}) — open tasks (${team.open})`}
      >
        {team.tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Your team has no open tasks.</Typography>
        ) : (
          team.tasks.map((t) => (
            <TaskRow key={t._id} task={t} onClick={() => openTask(t)} showAssignees />
          ))
        )}
      </SectionCard>
    );
    if (team.delegatedByMe.length > 0) {
      lowerCards.push(
        <SectionCard key="delegated" label={`Delegated by me (${team.delegatedByMe.length})`}>
          {team.delegatedByMe.map((t) => (
            <TaskRow key={t._id} task={t} onClick={() => openTask(t)} showAssignees />
          ))}
        </SectionCard>
      );
    }
  }

  if (o.renewals) {
    lowerCards.push(
      <SectionCard key="renewals" label="Next renewals">
        {renewalsNext.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No upcoming renewals.
          </Typography>
        ) : (
          renewalsNext.map((r) => (
            <Box
              key={r._id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {r.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(r.dueDate)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {formatINR(r.amount)}
              </Typography>
            </Box>
          ))
        )}
      </SectionCard>
    );
  }

  if (o.projects) {
    lowerCards.push(
      <SectionCard key="projects" label="Top active projects">
        {topProjects.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No active projects.
          </Typography>
        ) : (
          topProjects.map((p) => (
            <Box key={p._id} sx={{ py: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {p.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {Math.round(p.progress || 0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, p.progress || 0))}
                sx={{ height: 6, borderRadius: 99 }}
              />
            </Box>
          ))
        )}
      </SectionCard>
    );
  }

  return (
    <Box>
      {header}

      {o.reporting && o.reporting.myReportSubmittedToday === false && (
        <Alert
          severity="info"
          sx={{
            mb: 3,
            bgcolor: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #DBEAFE',
            '& .MuiAlert-icon': { color: '#2563EB' },
          }}
        >
          {"You haven't submitted today's evening report yet."}
        </Alert>
      )}

      {cards.length === 0 ? (
        <Alert severity="info">
          {"You don't have access to any dashboard sections yet. Ask an admin to grant you module permissions."}
        </Alert>
      ) : (
        <Grid container spacing={2.5} sx={{ mb: 4 }}>
          {cards.map((card) => (
            <Grid item xs={6} sm={4} md={3} key={card.label}>
              <StatCard {...card} />
            </Grid>
          ))}
        </Grid>
      )}

      {lowerCards.length > 0 && (
        <Masonry columns={{ xs: 1, md: 2 }} spacing={2.5} sx={{ width: 'auto' }}>
          {lowerCards}
        </Masonry>
      )}
    </Box>
  );
}
