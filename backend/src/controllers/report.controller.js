import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as reportService from '../services/report.service.js';
import { getCompanyProfile } from '../services/settings.service.js';
import { buildCsv, buildExcel, buildPdf, normalizeFormat } from '../helpers/reportExport.js';

export const summary = asyncHandler(async (req, res) => {
  const data = await reportService.getReport({
    from: req.query.from,
    to: req.query.to,
    financialYear: req.query.financialYear,
  });
  sendSuccess(res, { message: 'Report generated', data });
});

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  excel: 'application/vnd.ms-excel; charset=utf-8',
  pdf: 'application/pdf',
};

const EXTENSIONS = { csv: 'csv', excel: 'xls', pdf: 'pdf' };

export const exportOrders = asyncHandler(async (req, res) => {
  const format = normalizeFormat(req.query.format);
  const { rows, range } = await reportService.exportOrders({
    from: req.query.from,
    to: req.query.to,
    financialYear: req.query.financialYear,
  });

  const subtitle = range.financialYear
    ? `Financial year ${range.financialYear}`
    : `Period: ${range.from} to ${range.to}`;
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', CONTENT_TYPES[format]);
  res.setHeader('Content-Disposition', `attachment; filename="orders-report-${stamp}.${EXTENSIONS[format]}"`);

  if (format === 'pdf') {
    const company = await getCompanyProfile().catch(() => ({}));
    res.send(
      await buildPdf(rows, {
        title: 'Orders Report',
        subtitle,
        company,
      }),
    );
    return;
  }

  if (format === 'excel') {
    res.send(buildExcel(rows, { title: 'Orders' }));
    return;
  }

  res.send(buildCsv(rows));
});
