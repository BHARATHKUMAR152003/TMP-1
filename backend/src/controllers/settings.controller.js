import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { toStoredPath } from '../middleware/upload.middleware.js';
import * as settingsService from '../services/settings.service.js';

export const get = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Settings fetched', data: await settingsService.getSettings() });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Settings updated', data: await settingsService.updateSettings(req.body) });
});

/**
 * Company payment accounts + note, visible to any signed-in user so customers
 * know where to pay (and can choose which bank/UPI to use).
 */
export const paymentSettings = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Payment details fetched', data: await settingsService.getPaymentConfig() });
});

export const updatePaymentAccounts = asyncHandler(async (req, res) => {
  const data = await settingsService.updatePaymentAccounts(req.body);
  sendSuccess(res, { message: 'Payment accounts updated', data });
});

/** Admin uploads a QR image; returns its stored path to attach to an account. */
export const uploadPaymentQr = asyncHandler(async (req, res) => {
  const file = req.files?.qr?.[0] ?? req.files?.file?.[0];
  if (!file) throw ApiError.badRequest('Please attach a QR image');
  sendSuccess(res, { message: 'QR uploaded', data: { path: toStoredPath(file) } });
});

export const sizeRates = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Size rates fetched', data: await settingsService.getSizeRates() });
});

export const updateSizeRates = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Size rates updated', data: await settingsService.updateSizeRates(req.body) });
});
