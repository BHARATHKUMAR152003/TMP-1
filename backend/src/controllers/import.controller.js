import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as importService from '../services/import.service.js';

export const template = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    message: 'Import template fetched',
    data: importService.getImportTemplate(req.params.entity),
  });
});

export const batches = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Import history fetched', data: await importService.listImportBatches(req.query.limit) });
});

/**
 * Runs an import. Defaults to a dry run: the caller must send
 * `dryRun: false` explicitly to commit, which keeps an accidental request from
 * writing thousands of historical rows.
 */
export const run = asyncHandler(async (req, res) => {
  const { entity, rows, mapping, sourceName } = req.body ?? {};
  if (!Array.isArray(rows)) throw ApiError.badRequest('rows must be an array of objects');

  const report = await importService.runImport({
    user: req.user,
    entity,
    rows,
    mapping: mapping ?? {},
    dryRun: req.body?.dryRun !== false,
    sourceName,
  });
  sendSuccess(res, {
    message: report.dryRun ? 'Validation complete (nothing written)' : 'Import complete',
    data: report,
  });
});
