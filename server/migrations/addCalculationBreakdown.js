import { sequelize } from '../config/db.js';

async function addCalculationBreakdownColumn() {
  try {
    await sequelize.query(`
      ALTER TABLE project_results
      ADD COLUMN IF NOT EXISTS calculation_breakdown_json JSONB;
    `);
    console.log('✅ Column calculation_breakdown_json added successfully!');
  } catch (error) {
    console.error('Error adding column:', error.message);
  }
  await sequelize.close();
}

addCalculationBreakdownColumn();
