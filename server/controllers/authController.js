import { sequelize } from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Role } from '../models/index.js';

//REGISTER METHOD
export const registerUser = async (req, res) => {
  
  const t = await sequelize.transaction();

  try {
    const { email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email,
      password_hash: hashedPassword 
    }, { transaction: t });

    
    const defaultRole = await Role.findOne({ where: { role: 'USER' } });

    if (!defaultRole) {
      throw new Error('Роль "USER" не найдена в базе данных. Сначала добавьте её в таблицу roles!');
    }

    await sequelize.query(
      'INSERT INTO user_roles (user_id, role_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      { replacements: [newUser.id, defaultRole.id], transaction: t }
    );

    await t.commit();

    res.status(201).json({ id: newUser.id, email: newUser.email });
    // TRANSACTION
  } catch (error) {
    await t.rollback(); // ROLLBACK IN ERROR CASE
    res.status(500).json({ error: error.message });
  }
};

//LOGIN METHOD
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // SEARCH BY EMAIL
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: "Неверная почта или пароль" });
    }

    //PASSWORD CAMPARE
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Неверная пароль" });
    }

    // STATUS CHECKING
    if (user.status !== 'active') {
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

  res.json({ token, message: "Успешный вход" });

  } catch (error) {
    res.status(500).json({ error: "Ошибка при входе" });
  }
};

//GET PROFILE METHOD
export const getProfile = async (req, res) => {
  try {
    // EXTRACT ID FROM req.user (authMiddleware PUT IT THERE)
    const userId = req.user.id;

    // REQUEST TO DB
    const user = await User.findByPk(userId, {
      // EXCLUDING PASSWORD
      attributes: { exclude: ['password_hash'] },
      
      // ADDING ROLES
      include: [{
        model: Role,
        attributes: ['role', 'name'], // Берем только нужные поля из таблицы roles
        through: { attributes: [] }   // Убираем служебные поля из таблицы user_roles
      }]
    });

    // IF USER IS NOT EXISTS
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // SENDING PROFILE DATA
    res.json(user);

  } catch (error) {
    console.error('Ошибка профиля:', error);
    res.status(500).json({ error: 'Не удалось получить данные профиля' });
  }
};

