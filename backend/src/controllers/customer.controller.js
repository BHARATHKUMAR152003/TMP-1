import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, buildPageMeta } from '../utils/ApiResponse.js';
import * as customerService from '../services/customer.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await customerService.listCustomers(req.query);
  sendSuccess(res, { message: 'Customers fetched', data: items, meta: buildPageMeta({ page, limit, total }) });
});

export const getOne = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Customer fetched', data: await customerService.getCustomer(Number(req.params.id)) });
});

export const search = asyncHandler(async (req, res) => {
  const data = await customerService.searchCustomers(req.query.q ?? req.query.search, req.query.limit);
  sendSuccess(res, { message: 'Customers fetched', data });
});

export const create = asyncHandler(async (req, res) => {
  // allowDuplicate lets the user confirm an intentional second record after
  // the 409 that duplicate detection raises.
  const allowDuplicate = String(req.query.allowDuplicate ?? req.body?.allowDuplicate ?? '') === 'true';
  const data = await customerService.createCustomer(req.body, { allowDuplicate });
  sendCreated(res, { message: 'Customer created', data });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Customer updated', data: await customerService.updateCustomer(Number(req.params.id), req.body) });
});

export const remove = asyncHandler(async (req, res) => {
  // `force` is the user's confirmation that the customer's orders go too.
  const force = String(req.query.force ?? '') === 'true';
  const data = await customerService.deleteCustomer(Number(req.params.id), { force });
  sendSuccess(res, { message: 'Customer deleted', data });
});
