import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Avatar, Box, Chip, CircularProgress, Paper, Tooltip, Typography,
} from '@mui/material';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { usersApi } from '../../api/users.api.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

function initialsOf(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

// Deterministic avatar colour per person (validated categorical hues) so every
// card is distinct but stable across renders.
const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#0891b2', '#e34948'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Soft connector colour for the tree branch lines.
const CONNECTOR = '#D7DCE5';

function PersonCard({ person, reportCount = 0, root = false }) {
  const company = person.company;
  const accent = colorFor(person.name);
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        p: 2, width: 210,
        borderRadius: 3.5,
        textAlign: 'center',
        border: '1px solid',
        borderColor: root ? 'transparent' : 'divider',
        color: root ? '#fff' : 'inherit',
        background: root
          ? 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #FBFBFE 100%)',
        boxShadow: root
          ? '0 10px 28px rgba(79,70,229,0.32)'
          : '0 1px 2px rgba(16,24,40,0.05)',
        overflow: 'hidden',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: root ? '0 14px 34px rgba(79,70,229,0.4)' : '0 12px 28px rgba(16,24,40,0.12)',
          borderColor: root ? 'transparent' : accent,
        },
        // Top accent bar coloured by the person (hidden on the root's gradient).
        '&::before': root ? {} : {
          content: '""', position: 'absolute', top: 0, left: 0, right: 0,
          height: 4, background: accent,
        },
      }}
    >
      <Avatar
        src={person.avatar || undefined}
        sx={{
          width: 54, height: 54, mx: 'auto', mb: 1.25, fontSize: 18, fontWeight: 700,
          bgcolor: root ? 'rgba(255,255,255,0.22)' : accent,
          color: '#fff',
          boxShadow: root ? 'none' : `0 0 0 3px ${accent}22`,
        }}
      >
        {initialsOf(person.name)}
      </Avatar>
      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap title={person.name}>
        {person.name}
      </Typography>
      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 0.25, color: root ? 'rgba(255,255,255,0.82)' : 'text.secondary' }}
        noWrap
        title={person.designation || person.department || ''}
      >
        {person.designation || person.department || '—'}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1.25, flexWrap: 'wrap' }}>
        {company && (
          <Chip
            label={company.code || company.name}
            size="small"
            sx={{
              height: 22, fontSize: 10, fontWeight: 600,
              bgcolor: root ? 'rgba(255,255,255,0.18)' : '#F1F5F9',
              color: root ? '#fff' : 'text.secondary',
              '& .MuiChip-icon': { ml: 0.75 },
            }}
            icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: company.color || accent }} />}
          />
        )}
        {reportCount > 0 && (
          <Tooltip title={`${reportCount} direct report${reportCount > 1 ? 's' : ''}`}>
            <Chip
              icon={<SupervisorAccountIcon sx={{ fontSize: 13 }} />}
              label={reportCount}
              size="small"
              sx={{
                height: 22, fontSize: 10, fontWeight: 600,
                bgcolor: root ? 'rgba(255,255,255,0.18)' : '#ECFDF5',
                color: root ? '#fff' : '#047857',
                '& .MuiChip-icon': { color: root ? '#fff' : '#047857' },
              }}
            />
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}

/**
 * A manager node with its reports rendered beneath elbow connectors.
 * Connectors are drawn with pseudo-elements: a stem from the parent down to a
 * horizontal bus, then a vertical drop from the bus to each child.
 */
function TreeNode({ person, childrenByManager, root = false }) {
  const reports = childrenByManager.get(String(person._id)) || [];
  const hasReports = reports.length > 0;
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <PersonCard person={person} reportCount={reports.length} root={root} />

      {hasReports && (
        <>
          {/* Stem from the parent card down to the bus. */}
          <Box sx={{ width: '2px', height: 26, bgcolor: CONNECTOR }} />

          {/* Children row: each cell paints its half of the bus + a vertical drop. */}
          <Box sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center' }}>
            {reports.map((r) => (
              <Box
                key={r._id}
                sx={{
                  position: 'relative',
                  px: 1.5,
                  pt: '26px',
                  display: 'flex',
                  justifyContent: 'center',
                  // left half of the horizontal bus
                  '&::before': {
                    content: '""', position: 'absolute', top: 0, right: '50%',
                    width: '50%', height: '26px',
                    borderTop: `2px solid ${CONNECTOR}`,
                  },
                  // right half of the bus + the vertical drop to this child
                  '&::after': {
                    content: '""', position: 'absolute', top: 0, left: '50%',
                    width: '50%', height: '26px',
                    borderTop: `2px solid ${CONNECTOR}`,
                    borderLeft: `2px solid ${CONNECTOR}`,
                  },
                  // trim the bus at the outer edges so it doesn't overhang
                  '&:first-of-type::before': { border: 'none' },
                  '&:last-of-type::after': { borderTop: 'none' },
                  // a lone child needs only the vertical drop, no bus
                  '&:only-of-type::before': { display: 'none' },
                  '&:only-of-type::after': { borderTop: 'none' },
                }}
              >
                <TreeNode person={r} childrenByManager={childrenByManager} />
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function StatPill({ value, label }) {
  return (
    <Box
      sx={{
        px: 2, py: 1, borderRadius: 2.5, bgcolor: '#FFFFFF',
        border: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'baseline', gap: 0.75,
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: 18, color: 'primary.main', lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function OrgChartPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['org-chart'],
    queryFn: usersApi.orgChart,
  });

  // Live updates: redraw the tree when users change anywhere (incl. HRMS sync).
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['org-chart'] });
    socket.on('users:changed', handler);
    return () => socket.off('users:changed', handler);
  }, [qc]);

  const { roots, childrenByManager, unassigned, managerCount } = useMemo(() => {
    const byManager = new Map();
    for (const u of users) {
      if (!u.reportsTo) continue;
      const key = String(u.reportsTo);
      if (!byManager.has(key)) byManager.set(key, []);
      byManager.get(key).push(u);
    }
    const isSuper = (u) => (u.roles || []).some((r) => r.isSuperAdmin);
    const topLevel = users.filter((u) => !u.reportsTo);
    const treeRoots = topLevel
      .filter((u) => isSuper(u) || byManager.has(String(u._id)))
      .sort((a, b) => (isSuper(b) ? 1 : 0) - (isSuper(a) ? 1 : 0));
    const flat = topLevel.filter((u) => !treeRoots.includes(u));
    return {
      roots: treeRoots,
      childrenByManager: byManager,
      unassigned: flat,
      managerCount: byManager.size,
    };
  }, [users]);

  return (
    <Box>
      <PageHeader
        title="Organization"
        subtitle="Who reports to whom — managers can delegate tasks to their direct reports."
      />

      {isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}><CircularProgress /></Box>
      )}
      {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}

      {!isLoading && !error && (
        <>
          {users.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
              <StatPill value={users.length} label="people" />
              <StatPill value={managerCount} label="managers" />
              <StatPill value={unassigned.length} label="unassigned" />
            </Box>
          )}

          {/* Subtle dotted canvas behind the tree for a modern chart feel. */}
          <Box
            sx={{
              overflowX: 'auto',
              pb: 3, pt: 1,
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: '#FBFCFE',
              backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 'min-content', px: 4, pt: 3 }}>
              {roots.map((root) => (
                <TreeNode key={root._id} person={root} childrenByManager={childrenByManager} root />
              ))}
            </Box>
          </Box>

          {unassigned.length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                Not yet in the reporting structure
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {unassigned.map((u) => (
                  <PersonCard key={u._id} person={u} />
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
