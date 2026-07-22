import { Box, Paper, Typography, Grid, Chip, LinearProgress } from '@mui/material';
import { motion } from 'framer-motion';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV_SECTIONS } from '../constants/navigation.js';

const MotionPaper = motion(Paper);

function StatCard({ label, value, hint, color = 'primary.main' }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const allModules = NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.module);
  const ready = allModules.filter((m) => m.ready).length;
  const total = allModules.length;

  return (
    <Box>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'Owner'} 👋`}
        subtitle="Your owner console — every module, full access."
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <StatCard label="Workspace" value="Owner" hint="full console access" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Access" value="All modules" hint="no restrictions" color="secondary.main" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Modules live" value={`${ready}/${total}`} hint="foundation + built" color="success.main" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Platform" value="v0.1" hint="foundation release" color="warning.main" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <MotionPaper
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            elevation={0}
            sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}
          >
            <Typography variant="h6" sx={{ mb: 2 }}>
              Module roadmap
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Build progress
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {Math.round((ready / total) * 100)}%
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={(ready / total) * 100} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allModules.map((m) => (
                <Chip
                  key={m.to}
                  label={m.label}
                  size="small"
                  color={m.ready ? 'primary' : 'default'}
                  variant={m.ready ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </MotionPaper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Foundation status
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The shared core every module builds on is in place:
            </Typography>
            {[
              'JWT auth with refresh-token rotation',
              'Owner-only access (RBAC retired)',
              'Users directory & audit trail',
              'Dynamic custom-fields engine',
              'Pluggable storage & AI providers',
              'Real-time Socket.IO channel',
            ].map((f) => (
              <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.main' }} />
                <Typography variant="body2">{f}</Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
