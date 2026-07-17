import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Avatar, Box, Chip, CircularProgress, Paper, Tooltip, Typography,
} from '@mui/material';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { usersApi } from '../../api/users.api.js';
import { getErrorMessage } from '../../lib/axios.js';

function initialsOf(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function PersonCard({ person, reportCount = 0, root = false }) {
  const company = person.company;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2, minWidth: 190, maxWidth: 230,
        border: '1px solid', borderColor: root ? 'primary.light' : 'divider',
        borderRadius: 3, textAlign: 'center',
        bgcolor: root ? '#EEF2FF' : '#FFFFFF',
      }}
    >
      <Avatar
        sx={{
          width: 44, height: 44, mx: 'auto', mb: 1, fontSize: 16, fontWeight: 700,
          bgcolor: root ? 'primary.main' : '#EEF2FF',
          color: root ? '#fff' : '#4338CA',
        }}
      >
        {initialsOf(person.name)}
      </Avatar>
      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={person.name}>
        {person.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
        {person.designation || person.department || '—'}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {company && (
          <Chip
            label={company.code || company.name}
            size="small"
            sx={{ height: 20, fontSize: 10 }}
            icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: company.color || 'primary.main', ml: 0.75 }} />}
          />
        )}
        {reportCount > 0 && (
          <Tooltip title={`${reportCount} direct report${reportCount > 1 ? 's' : ''}`}>
            <Chip
              icon={<SupervisorAccountIcon sx={{ fontSize: 13 }} />}
              label={reportCount}
              size="small"
              sx={{ height: 20, fontSize: 10, bgcolor: '#ECFDF5', color: '#047857' }}
            />
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}

/** A manager node with its reports rendered beneath a connector. */
function TreeNode({ person, childrenByManager, root = false }) {
  const reports = childrenByManager.get(String(person._id)) || [];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <PersonCard person={person} reportCount={reports.length} root={root} />
      {reports.length > 0 && (
        <>
          <Box sx={{ width: 2, height: 22, bgcolor: 'divider' }} />
          <Box
            sx={{
              display: 'flex', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center',
              pt: 2.5, px: 2.5, borderTop: '2px solid', borderColor: 'divider',
            }}
          >
            {reports.map((r) => (
              <TreeNode key={r._id} person={r} childrenByManager={childrenByManager} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

export default function OrgChartPage() {
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['org-chart'],
    queryFn: usersApi.orgChart,
  });

  const { roots, childrenByManager, unassigned } = useMemo(() => {
    const byManager = new Map();
    for (const u of users) {
      if (!u.reportsTo) continue;
      const key = String(u.reportsTo);
      if (!byManager.has(key)) byManager.set(key, []);
      byManager.get(key).push(u);
    }
    const isSuper = (u) => (u.roles || []).some((r) => r.isSuperAdmin);
    const topLevel = users.filter((u) => !u.reportsTo);
    // Roots worth drawing as trees: super admins and anyone with reports.
    const treeRoots = topLevel
      .filter((u) => isSuper(u) || byManager.has(String(u._id)))
      .sort((a, b) => (isSuper(b) ? 1 : 0) - (isSuper(a) ? 1 : 0));
    const flat = topLevel.filter((u) => !treeRoots.includes(u));
    return { roots: treeRoots, childrenByManager: byManager, unassigned: flat };
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
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, overflowX: 'auto', pb: 2 }}>
            {roots.map((root) => (
              <TreeNode key={root._id} person={root} childrenByManager={childrenByManager} root />
            ))}
          </Box>

          {unassigned.length > 0 && (
            <Box sx={{ mt: 5 }}>
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
