import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { buildTheme } from './theme/theme.js';
import { ROLE_COLORS } from './config/constants.js';
import './index.css';

// Default theme at boot; UnifiedLayout re-themes per role once a user is known.
const theme = buildTheme(ROLE_COLORS.admin);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
