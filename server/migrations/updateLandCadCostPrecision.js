import { sequelize } from '../config/db.js';

async function updateLandCadCostPrecision() {
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'project_questionnaires' AND column_name = 'cadCost'
        ) THEN
          ALTER TABLE project_questionnaires ALTER COLUMN "cadCost" TYPE DECIMAL(20,6);
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'project_questionnaires' AND column_name = 'landCadCost'
        ) THEN
          ALTER TABLE project_questionnaires ALTER COLUMN "landCadCost" TYPE DECIMAL(20,6);
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'project_questionnaires' AND column_name = 'land_cad_cost'
        ) THEN
          ALTER TABLE project_questionnaires ALTER COLUMN land_cad_cost TYPE DECIMAL(20,6);
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'cadastral_records' AND column_name = 'cad_cost'
        ) THEN
          ALTER TABLE cadastral_records ALTER COLUMN cad_cost TYPE DECIMAL(20,6);
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'project_results' AND column_name = 'land_share'
        ) THEN
          ALTER TABLE project_results ALTER COLUMN land_share TYPE DECIMAL(20,6);
        END IF;
      END $$;
    `);
    console.log('✅ Cadastral cost precision updated to DECIMAL(20,6) successfully!');
  } catch (error) {
    console.error('Error updating column precision:', error.message);
  }
  await sequelize.close();
}

updateLandCadCostPrecision();
