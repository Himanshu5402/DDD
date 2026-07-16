import { Box, Typography, Paper } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from './AuthContext.jsx';

/**
 * Route/element guard for module-level permissions.
 *
 *   <RequirePermission module="users" action="read">
 *     <UsersPage />
 *   </RequirePermission>
 */
export default function RequirePermission({ module, action = 'read', children, fallback }) {
  const { hasPermission } = useAuth();

  if (hasPermission(module, action)) return children;

  if (fallback) return fallback;

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh', p: 3 }}>
      <Paper elevation={0} sx={{ p: 5, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
        <LockOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography variant="h6" sx={{ mt: 1 }}>
          Access restricted
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You don't have permission to view this module ({module}:{action}).
        </Typography>
      </Paper>
    </Box>
  );
}
