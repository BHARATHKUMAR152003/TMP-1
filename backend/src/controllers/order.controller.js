import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, buildPageMeta } from '../utils/ApiResponse.js';
import * as orderService from '../services/order.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await orderService.listOrders({ filters: req.query });
  sendSuccess(res, { message: 'Orders fetched', data: items, meta: buildPageMeta({ page, limit, total }) });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(Number(req.params.id));
  sendSuccess(res, { message: 'Order fetched', data: order });
});

export const create = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder({
    user: req.user,
    data: req.body,
    files: req.files ?? {},
  });
  sendCreated(res, { message: 'Order created', data: order });
});

export const update = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrder({
    id: Number(req.params.id),
    user: req.user,
    data: req.body,
  });
  sendSuccess(res, { message: 'Order updated', data: order });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateStatus({
    id: Number(req.params.id),
    toStatus: req.body.status,
    note: req.body.note,
    user: req.user,
  });
  sendSuccess(res, { message: 'Order status updated', data: order });
});

export const comment = asyncHandler(async (req, res) => {
  const order = await orderService.addComment({
    id: Number(req.params.id),
    user: req.user,
    comment: req.body.comment,
  });
  sendCreated(res, { message: 'Comment added', data: order });
});

export const uploadFiles = asyncHandler(async (req, res) => {
  const order = await orderService.addFiles({
    id: Number(req.params.id),
    user: req.user,
    files: req.files?.designFiles ?? req.files ?? [],
  });
  sendCreated(res, { message: 'Files uploaded', data: order });
});

export const remove = asyncHandler(async (req, res) => {
  const data = await orderService.deleteOrder({ id: Number(req.params.id) });
  sendSuccess(res, { message: 'Order deleted', data });
});

