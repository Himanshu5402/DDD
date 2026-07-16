import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App.jsx';
import theme from './theme/theme.js';
import { queryClient } from './lib/queryClient.js';
import { AuthProvider } from './auth/AuthContext.jsx';
import './index.css';

// NOTE: StrictMode intentionally omitted. Its dev-only double-invocation of
// effects fires duplicate /me + token-refresh calls, which races the refresh
// rotation. Production behavior is unaffected.
ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);
