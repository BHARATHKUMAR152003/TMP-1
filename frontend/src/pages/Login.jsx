import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Box, Paper, TextField, Button, Typography, Avatar, Alert, InputAdornment,
  IconButton, Divider, Stack,
} from '@mui/material';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useAuth } from '../context/AuthContext.jsx';
import { CMYK, CMYK_STRIPE, INK, INK_LIGHT } from '../theme/theme.js';

const PROCESS_SWATCHES = [
  { label: 'C', color: CMYK.cyan },
  { label: 'M', color: CMYK.magenta },
  { label: 'Y', color: CMYK.yellow },
  { label: 'K', color: CMYK.key },
];

export default function Login() {
  const { login, isAuthenticated, initializing } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  if (!initializing && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.displayMessage || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' },
        bgcolor: 'background.default',
      }}
    >
      {/* Brand panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          p: 8,
          gap: 3,
          color: '#fff',
          background: `radial-gradient(900px 500px at 0% 0%, ${INK_LIGHT} 0%, ${INK} 60%)`,
          // Faint halftone dot screen, like a print plate.
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.5px)',
            backgroundSize: '14px 14px',
            maskImage: 'linear-gradient(135deg, transparent 30%, #000 100%)',
            pointerEvents: 'none',
          },
          '& > *': { position: 'relative' },
        }}
      >
        <Box sx={{ position: 'absolute !important', top: 0, left: 0, right: 0, height: 6, background: CMYK_STRIPE }} />
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
            <PrintRoundedIcon fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h4">TMP</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>
              Printing Press · Billing &amp; Accounts
            </Typography>
          </Box>
        </Stack>
        <Typography variant="h3" sx={{ maxWidth: 540, lineHeight: 1.1 }}>
          Every job, invoice and payment — printed to perfection.
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 480, color: 'rgba(255,255,255,0.7)' }}>
          Raise a GST tax invoice at the counter in seconds, track what has been received and what
          is still outstanding, and keep every year of company history searchable.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
          {PROCESS_SWATCHES.map((s) => (
            <Box
              key={s.label}
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: s.color,
                border: '2px solid rgba(255,255,255,0.25)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 13,
                color: s.label === 'Y' ? INK : '#fff',
              }}
            >
              {s.label}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Auth card */}
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, md: 6 } }}>
        <Paper
          elevation={1}
          sx={{ p: { xs: 3, md: 4 }, width: '100%', maxWidth: 440, borderRadius: 3, position: 'relative', overflow: 'hidden' }}
        >
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: CMYK_STRIPE }} />
          <Box sx={{ display: { md: 'none' }, textAlign: 'center', mb: 2 }}>
            <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', width: 48, height: 48, mx: 'auto', mb: 1 }}>
              <PrintRoundedIcon />
            </Avatar>
            <Typography variant="h5">TMP</Typography>
          </Box>

          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Use the account your administrator created for you.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              margin="normal"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              required
              margin="normal"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword((v) => !v)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={submitting} sx={{ mt: 3 }}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Printing Press ERP
            </Typography>
          </Divider>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
            Accounts are created by your administrator under Users.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}

