import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as notificationService from '../services/notification.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await notificationService.listNotifications({
    role: req.user.role,
    unreadOnly: req.query.unread === 'true',
    limit: req.query.limit,
  });
  sendSuccess(res, { message: 'Notifications fetched', data });
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(Number(req.params.id), req.user.role);
  sendSuccess(res, { message: 'Notification marked read' });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user.role);
  sendSuccess(res, { message: 'All notifications marked read' });
});
