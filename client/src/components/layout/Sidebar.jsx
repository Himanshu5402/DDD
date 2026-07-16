import { NavLink } from 'react-router-dom';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Divider,
} from '@mui/material';
import { NAV_SECTIONS } from '../../constants/navigation.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export const DRAWER_WIDTH = 264;

function BrandMark() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 2.25 }}>
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 2.5,
          background: 'linear-gradient(135deg,#4f46e5,#0ea5e9)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        IB
      </Box>
      <Box sx={{ lineHeight: 1.15 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary', letterSpacing: '-0.01em' }}>
          ITSYBIZZ
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>Command Center</Typography>
      </Box>
    </Box>
  );
}

export default function Sidebar() {
  const { hasPermission } = useAuth();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#FFFFFF',
        borderRight: '1px solid',
        borderColor: 'divider',
      }}
    >
      <BrandMark />
      <Divider sx={{ borderColor: 'divider' }} />

      <Box sx={{ overflowY: 'auto', flex: 1, py: 1.5 }}>
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.module || hasPermission(i.module, i.action || 'read'));
          if (!items.length) return null;
          return (
            <Box key={section.heading} sx={{ mb: 1.5 }}>
              <Typography
                sx={{
                  px: 2.75,
                  py: 1,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'text.disabled',
                }}
              >
                {section.heading}
              </Typography>
              <List dense disablePadding>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <ListItemButton
                      key={item.to}
                      component={item.ready ? NavLink : 'div'}
                      to={item.ready ? item.to : undefined}
                      disabled={!item.ready}
                      sx={{
                        mx: 1.5,
                        my: 0.25,
                        px: 1.5,
                        borderRadius: 2.5,
                        color: '#4B5563',
                        '& .MuiListItemIcon-root': { color: '#9CA3AF' },
                        '&.active': {
                          bgcolor: '#EEF2FF',
                          color: '#4338CA',
                          '& .MuiListItemIcon-root': { color: '#4F46E5' },
                          '& .MuiListItemText-primary': { fontWeight: 700 },
                        },
                        '&:hover': { bgcolor: '#F5F7FA' },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 34 }}>
                        <Icon sx={{ fontSize: 19 }} />
                      </ListItemIcon>
                      <ListItemText primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }}>
                        {item.label}
                      </ListItemText>
                      {!item.ready && (
                        <Chip
                          label="soon"
                          size="small"
                          sx={{ height: 18, fontSize: 10, bgcolor: '#F3F4F6', color: '#9CA3AF' }}
                        />
                      )}
                    </ListItemButton>
                  );
                })}
              </List>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
