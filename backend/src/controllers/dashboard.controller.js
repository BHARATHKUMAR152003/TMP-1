import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

const rangeOf = (req) => (String(req.query?.range).toLowerCase() === 'all' ? 'all' : 'today');

export const admin = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Admin dashboard', data: await dashboardService.adminDashboard({ range: rangeOf(req) }) });
});

export const accountant = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    message: 'Accountant dashboard',
    data: await dashboardService.accountantDashboard({ range: rangeOf(req) }),
  });
});

