import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, buildPageMeta } from '../utils/ApiResponse.js';
import * as paymentService from '../services/payment.service.js';
import * as financeService from '../services/finance.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total, summary } = await paymentService.listPayments(req.query);
  sendSuccess(res, {
    message: 'Payments fetched',
    data: items,
    meta: { ...buildPageMeta({ page, limit, total }), summary },
  });
});

/** UNPAID tab: invoices still carrying an outstanding balance. */
export const listUnpaid = asyncHandler(async (req, res) => {
  const { items, summary } = await financeService.listOutstanding(req.query);
  sendSuccess(res, { message: 'Unpaid invoices fetched', data: items, meta: { summary } });
});

export const record = asyncHandler(async (req, res) => {
  const files = req.files?.paymentScreenshot ?? req.files?.paymentScreenshots ?? [];
  const data = await paymentService.recordPayment({ user: req.user, data: req.body, files });
  sendCreated(res, { message: 'Payment recorded', data });
});

