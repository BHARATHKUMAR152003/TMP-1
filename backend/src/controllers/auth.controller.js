import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as authService from '../services/auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  sendSuccess(res, { message: 'Logged in successfully', data: result });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { message: 'Profile fetched', data: user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  sendSuccess(res, { message: 'Profile updated', data: user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  sendSuccess(res, { message: 'Password updated successfully' });
});
