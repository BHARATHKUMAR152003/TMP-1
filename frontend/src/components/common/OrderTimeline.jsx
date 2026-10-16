import { Stepper, Step, StepLabel, Box, Typography } from '@mui/material';
import { ORDER_PIPELINE, STATUS_META } from '../../config/constants.js';

/**
 * Horizontal timeline of the order lifecycle: draft → invoiced → completed.
 * Cancelled orders and rows left on a legacy production status sit outside that
 * path, so a short note is shown instead.
 */
export default function OrderTimeline({ status }) {
  const index = ORDER_PIPELINE.indexOf(status);

  if (index === -1) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          This order is <strong>{STATUS_META[status]?.label || status}</strong> and sits outside the standard flow.
        </Typography>
      </Box>
    );
  }

  return (
    <Stepper activeStep={index} alternativeLabel sx={{ py: 2, overflowX: 'auto' }}>
      {ORDER_PIPELINE.map((step, i) => (
        <Step key={step} completed={i <= index}>
          <StepLabel>{STATUS_META[step]?.label || step}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

