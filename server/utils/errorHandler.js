export const errorHandler = (err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  console.error('Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = isDevelopment
    ? err.message
    : 'Внутренняя ошибка сервера';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Маршрут не найден',
  });
};

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}
