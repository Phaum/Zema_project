import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  // EXCTRACT HEADER FROM Authorization
  const authHeader = req.headers.authorization;
  
  // HEADER USUALLY LOOKS LIKE: "Bearer eyJhbGciOiJIUzI..."
  // WE NEED A STUFF AFTER THE SPACE
  const token = authHeader && authHeader.split(' ')[1];

  // NO TOKEN - GET OUT
  if (!token) {
    return res.status(401).json({ error: 'Доступ запрещен. Токен не предоставлен.' });
  }

  try {
    // CHECKING TOKEN SIGNATURE WITH OUR SECRET KEY
    // IF TOKEN IS FORGED OR EXPIRED - THROW ERROR
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // IMPORTANT: RECORDING DECRYPTED USER DATA IN REQUES OBJECT
    // THEN IN ANY CONTROLLER, WHICH HAVE THIS middleware, 
    // req.user.id AND req.user.login WILL BE AVAILIBLE
    req.user = decoded;

    // 5. GIVING CONTROL TO THE CONTROLLER
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Неверный или просроченный токен.' });
  }
};