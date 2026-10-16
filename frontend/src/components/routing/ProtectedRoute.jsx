import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../../context/AuthContext.jsx';

/** Gate that requires an authenticated user; optionally restricts by role. */
export default function ProtectedRoute({ children, allow }) {
  const { isAuthenticated, initializing, user } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allow && !allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
