import { sequelize } from '../config/db.js';
import { execFile } from 'child_process';
import util from 'util';
import axios from 'axios';

const execFilePromise = util.promisify(execFile);

/**
 * Основной метод: Получение данных НСПД + Расчет метро + Сохранение
 */
export const getFullObjectInfo = async (req, res) => {
  const { cadastral_number } = req.body;

  if (!cadastral_number) {
    return res.status(400).json({ error: 'Кадастровый номер не указан' });
  }

  try {
    // --- ШАГ 1: ВЫЗОВ ПАРСЕРА (Вне транзакции) ---
    const { stdout } = await execFilePromise('python3', ['./python/nspdparser.py', cadastral_number]);
    const nspdResult = JSON.parse(stdout.trim());

    if (nspdResult.error) {
      // Одиночный запрос для фиксации ошибки не требует транзакции
      await sequelize.query(
        `INSERT INTO cadastral_records (cadastral_number, status, updated_at, created_at) 
         VALUES (?, 'ERROR', NOW(), NOW())
         ON CONFLICT (cadastral_number) DO UPDATE SET status = 'ERROR', updated_at = NOW()`,
        { replacements: [cadastral_number] }
      );
      return res.status(422).json({ error: nspdResult.error });
    }

    // --- ШАГ 2: ГЕО-СЕРВИС (Вне транзакции) ---
    let metroData = { station: 'Не определено', distance: 0 };
    if (nspdResult.coordinates && nspdResult.coordinates.latitude !== 'не указано') {
      try {
        const geoResponse = await axios.get('http://127.0.0.1:8000/calculate', {
          params: { lat: nspdResult.coordinates.latitude, lon: nspdResult.coordinates.longitude },
          timeout: 5000 
        });
        if (geoResponse.data.status === 'success') metroData = geoResponse.data;
      } catch (e) {
        console.error('Geo-service error:', e.message);
      }
    }

    // --- ШАГ 3: ЗАПИСЬ В БД (Транзакция только здесь!) ---
    // Теперь транзакция длится миллисекунды, а не секунды
    await sequelize.transaction(async (t) => {
      await sequelize.query(
        `INSERT INTO cadastral_records 
         (cadastral_number, object_type, year_built, year_commisioning, address, district, 
          latitude, longitude, nearest_metro, metro_distance, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', NOW(), NOW())
         ON CONFLICT (cadastral_number) DO UPDATE SET 
           object_type = EXCLUDED.object_type,
           address = EXCLUDED.address,
           nearest_metro = EXCLUDED.nearest_metro,
           metro_distance = EXCLUDED.metro_distance,
           status = 'COMPLETED', 
           updated_at = NOW()`,
        { 
          replacements: [
            nspdResult.cadastral_number,
            nspdResult.object_type,
            nspdResult.year_built,
            nspdResult.year_commisioning,
            nspdResult.address,
            nspdResult.district,
            nspdResult.coordinates.latitude === 'не указано' ? null : nspdResult.coordinates.latitude,
            nspdResult.coordinates.longitude === 'не указано' ? null : nspdResult.coordinates.longitude,
            metroData.station,
            metroData.distance
          ], 
          transaction: t 
        }
      );
    });

    res.status(200).json({
      success: true,
      data: {
        cadastral_number: nspdResult.cadastral_number,
        address: nspdResult.address,
        metro: { name: metroData.station, distance: metroData.distance }
      }
    });

  } catch (error) {
    console.error('Критическая ошибка:', error.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};