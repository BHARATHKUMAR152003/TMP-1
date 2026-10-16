import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import * as employeeService from '../services/employee.service.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Users fetched', data: await employeeService.listEmployees(req.query) });
});

export const getOne = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'User fetched', data: await employeeService.getEmployee(Number(req.params.id)) });
});

export const create = asyncHandler(async (req, res) => {
  sendCreated(res, { message: 'User created', data: await employeeService.createEmployee(req.body) });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'User updated', data: await employeeService.updateEmployee(Number(req.params.id), req.body) });
});

export const toggleActive = asyncHandler(async (req, res) => {
  const data = await employeeService.setActive(Number(req.params.id), req.body.isActive);
  sendSuccess(res, { message: 'User status updated', data });
});

