export const sendOk = (res, data, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    data,
  });
};

export const sendError = (res, error, statusCode = 500) => {
  res.status(statusCode).json({
    success: false,
    error,
  });
};

export const sendNotFound = (res, entityName = 'Сущность') => {
  res.status(404).json({
    success: false,
    error: `${entityName} не найдена`,
  });
};

export const sendServerError = (res, operationName = 'операции') => {
  res.status(500).json({
    success: false,
    error: `Не удалось выполнить ${operationName}`,
  });
};
