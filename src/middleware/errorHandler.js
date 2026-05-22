export function notFound(_req, _res, next) {
  const error = new Error("API endpoint not found");
  error.statusCode = 404;
  next(error);
}

export function apiError(error, _req, res, _next) {
  const status = error.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal server error" : error.message
  });
}
