/**
 * Standard success envelope so every endpoint returns a predictable shape:
 * { success, message, data }. Optional pagination metadata is merged in.
 */
export function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated(res, { message = 'Created', data } = {}) {
  return sendSuccess(res, { statusCode: 201, message, data });
}

/** Builds pagination metadata for list endpoints. */
export function buildPageMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
