import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import * as categoryService from '../services/category.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await categoryService.listCategories({ includeInactive: req.query.all === 'true' });
  sendSuccess(res, { message: 'Categories fetched', data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await categoryService.createCategory(req.body);
  sendCreated(res, { message: 'Category created', data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await categoryService.updateCategory(Number(req.params.id), req.body);
  sendSuccess(res, { message: 'Category updated', data });
});

export const remove = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(Number(req.params.id));
  sendSuccess(res, { message: 'Category deactivated' });
});
