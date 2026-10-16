import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, buildPageMeta } from '../utils/ApiResponse.js';
import * as financeService from '../services/finance.service.js';
import { getCompanyProfile } from '../services/settings.service.js';
import { buildTaxInvoicePdf } from '../helpers/taxInvoice.js';
import { financialYearOptions, financialYearLabel } from '../utils/financialYear.js';

export const listInvoices = asyncHandler(async (req, res) => {
  const { items, page, limit, total, summary } = await financeService.listInvoices(req.query);
  sendSuccess(res, {
    message: 'Invoices fetched',
    data: items,
    meta: { ...buildPageMeta({ page, limit, total }), summary },
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Invoice fetched', data: await financeService.getInvoice(Number(req.params.id)) });
});

export const listOutstanding = asyncHandler(async (req, res) => {
  const { items, summary } = await financeService.listOutstanding(req.query);
  sendSuccess(res, { message: 'Outstanding balances fetched', data: items, meta: { summary } });
});

export const listBills = asyncHandler(async (req, res) => {
  const { items, page, limit, total, summary } = await financeService.listBills(req.query);
  sendSuccess(res, {
    message: 'Bills fetched',
    data: items,
    meta: { ...buildPageMeta({ page, limit, total }), summary },
  });
});

/** Financial-year picker options for the invoice/report filters. */
export const listFinancialYears = asyncHandler(async (_req, res) => {
  sendSuccess(res, {
    message: 'Financial years fetched',
    data: { current: financialYearLabel(new Date()), options: financialYearOptions().reverse() },
  });
});

/** Renders the tax invoice PDF. Used by Orders, Bills and both Payments tabs. */
export const billPdf = asyncHandler(async (req, res) => {
  financeService.ensureDocumentAccess(req.user);

  const order = await financeService.getOrderForDocument(Number(req.params.id));
  const [bill, payments, company] = await Promise.all([
    financeService.getBillForOrder(order.id),
    financeService.getPaymentsForOrder(order.id),
    getCompanyProfile(),
  ]);

  const pdf = await buildTaxInvoicePdf({ order, bill, company, payments });
  const safeName = String(order.order_number ?? `order-${order.id}`).replace(/[/\\]/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="tax-invoice-${safeName}.pdf"`);
  res.send(pdf);
});

export const cancelInvoice = asyncHandler(async (req, res) => {
  const result = await financeService.cancelInvoice(req.user, Number(req.params.id), req.body?.reason);
  sendSuccess(res, { message: 'Invoice cancelled', data: result });
});

