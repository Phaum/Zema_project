import { User, Role } from '../models/index.js';

//GET ALL USERS METHOD (ONLY FOR ADMINS)
export const getAllUsers = async (req, res) => {
  try {
    // GETTING ALL USERS FROM DB
    const users = await User.findAll({
      // EXCLUDING PASSWORD
      attributes: { exclude: ['password_hash'] },
      // ADDING THEIR ROLES, SO ADMINS WOULD SEE WHAT ROLE USER HAVE
      include: [{
        model: Role,
        attributes: ['role'],
        through: { attributes: [] }
      }]
    });

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
  }
};