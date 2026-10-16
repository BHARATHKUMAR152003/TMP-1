import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import * as inventoryService from '../services/inventory.service.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Inventory fetched', data: await inventoryService.listInventory(req.query) });
});

export const create = asyncHandler(async (req, res) => {
  sendCreated(res, { message: 'Item added', data: await inventoryService.createItem(req.body) });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Item updated', data: await inventoryService.updateItem(Number(req.params.id), req.body) });
});

export const remove = asyncHandler(async (req, res) => {
  await inventoryService.deleteItem(Number(req.params.id));
  sendSuccess(res, { message: 'Item removed' });
});

export const consume = asyncHandler(async (req, res) => {
  const item = await inventoryService.consumeItem(Number(req.params.id), req.user, req.body);
  sendCreated(res, { message: 'Stock updated', data: item });
});

export const adjust = asyncHandler(async (req, res) => {
  const item = await inventoryService.adjustItem(Number(req.params.id), req.user, req.body);
  sendSuccess(res, { message: 'Stock updated', data: item });
});

export const usage = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Inventory usage fetched', data: await inventoryService.listUsage() });
});

// ── Taxonomy: groups → categories → types ────────────────────────
export const taxonomy = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Inventory taxonomy fetched', data: await inventoryService.getTaxonomy() });
});

export const createGroup = asyncHandler(async (req, res) => {
  sendCreated(res, { message: 'Group added', data: await inventoryService.createGroup(req.body) });
});

export const updateGroup = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Group updated', data: await inventoryService.updateGroup(Number(req.params.id), req.body) });
});

export const removeGroup = asyncHandler(async (req, res) => {
  await inventoryService.deleteGroup(Number(req.params.id));
  sendSuccess(res, { message: 'Group removed' });
});

export const createCategory = asyncHandler(async (req, res) => {
  sendCreated(res, { message: 'Category added', data: await inventoryService.createCategory(req.body) });
});

export const updateCategory = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    message: 'Category updated',
    data: await inventoryService.updateCategory(Number(req.params.id), req.body),
  });
});

export const removeCategory = asyncHandler(async (req, res) => {
  await inventoryService.deleteCategory(Number(req.params.id));
  sendSuccess(res, { message: 'Category removed' });
});

export const createType = asyncHandler(async (req, res) => {
  sendCreated(res, { message: 'Type added', data: await inventoryService.createType(req.body) });
});

export const updateType = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Type updated', data: await inventoryService.updateType(Number(req.params.id), req.body) });
});

export const removeType = asyncHandler(async (req, res) => {
  await inventoryService.deleteType(Number(req.params.id));
  sendSuccess(res, { message: 'Type removed' });
});
