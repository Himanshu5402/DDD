import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useAuth } from '../auth/AuthContext.jsx';
import { getErrorMessage } from '../lib/axios.js';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values);
      const to = location.state?.from?.pathname || '/';
      navigate(to, { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err, 'Login failed'));
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { md: '1.1fr 1fr' } }}>
      {/* Brand panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          color: '#fff',
          background: 'radial-gradient(1200px 600px at -10% -10%, #6366f1 0%, transparent 50%), linear-gradient(135deg,#312e81,#0f172a)',
        }}
      >
        <Typography sx={{ fontWeight: 800, letterSpacing: 1 }}>ITSYBIZZ</Typography>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
            Your business,<br />one command center.
          </Typography>
          <Typography sx={{ mt: 2, opacity: 0.8, maxWidth: 420 }}>
            Goals, tasks, CRM, finance, maintenance, and AI insights — unified in one AI-powered
            operating system.
          </Typography>
        </Box>
        <Typography sx={{ opacity: 0.6, fontSize: 13 }}>© {new Date().getFullYear()} ITSYBIZZ</Typography>
      </Box>

      {/* Form panel */}
      <Box sx={{ display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
        <Paper
          elevation={0}
          sx={{ p: { xs: 3, sm: 5 }, width: '100%', maxWidth: 400, border: '1px solid', borderColor: 'divider' }}
        >
          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to your Command Center account.
          </Typography>

          {serverError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <TextField
              label="Email"
              type="email"
              fullWidth
              autoFocus
              margin="normal"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Password"
              type={showPw ? 'text' : 'password'}
              fullWidth
              margin="normal"
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPw((v) => !v)} edge="end" tabIndex={-1}>
                      {showPw ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              {...register('password')}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={isSubmitting}
              sx={{ mt: 3 }}
            >
              {isSubmitting ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
            </Button>
          </form>

          {import.meta.env.DEV && (
            <Alert severity="info" variant="outlined" sx={{ mt: 3, fontSize: 12.5 }}>
              Dev seed admin: <b>admin@itsybizzz.local</b> / <b>Admin@12345</b>
            </Alert>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
