import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';

export default function NotFoundPage() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '70vh', textAlign: 'center' }}>
      <Box>
        <Typography variant="h2" sx={{ fontWeight: 800, color: 'primary.main' }}>
          404
        </Typography>
        <Typography variant="h6">Page not found</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The page you're looking for doesn't exist yet.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Back to dashboard
        </Button>
      </Box>
    </Box>
  );
}
