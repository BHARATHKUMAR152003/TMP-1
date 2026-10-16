import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';

/**
 * Wraps async content and renders the right state: spinner while loading, an
 * alert on error (with retry), an empty placeholder, or the children.
 */
export default function DataState({ loading, error, empty, emptyLabel = 'Nothing here yet', onRetry, children }) {
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          )
        }
      >
        {typeof error === 'string' ? error : 'Failed to load data.'}
      </Alert>
    );
  }

  if (empty) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8, color: 'text.secondary' }}>
        <InboxRoundedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
        <Typography variant="body2">{emptyLabel}</Typography>
      </Box>
    );
  }

  return children;
}
