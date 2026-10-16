import { Card, CardContent, CardActionArea, Box, Typography, Avatar } from '@mui/material';

/**
 * Compact KPI card used across every dashboard. `color` accepts a theme colour
 * name (primary/success/…) or a hex string. When `onClick` is provided the whole
 * card becomes a button (used for dashboard drill-downs).
 */
export default function StatCard({ label, value, icon: Icon, color = 'primary', hint, onClick }) {
  const body = (
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {Icon && (
        <Avatar
          variant="rounded"
          sx={{
            bgcolor: (theme) => `${theme.palette[color]?.main || color}22`,
            color: (theme) => theme.palette[color]?.main || color,
            width: 52,
            height: 52,
          }}
        >
          <Icon />
        </Avatar>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.4rem' }, fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word' }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>
    </CardContent>
  );

  return (
    <Card sx={{ height: '100%' }}>
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}
