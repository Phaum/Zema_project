import { QueryInterface, DataTypes } from 'sequelize';

export async function up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    
    try {
        // Add new income flow fields to project_results table
        await queryInterface.addColumn('project_results', 'egi', {
            type: DataTypes.DECIMAL(16, 2),
            allowNull: true,
            comment: 'Effective Gross Income',
        });

        await queryInterface.addColumn('project_results', 'opex', {
            type: DataTypes.DECIMAL(16, 2),
            allowNull: true,
            comment: 'Operating Expenses',
        });

        await queryInterface.addColumn('project_results', 'noi', {
            type: DataTypes.DECIMAL(16, 2),
            allowNull: true,
            comment: 'Net Operating Income',
        });

        await queryInterface.addColumn('project_results', 'price_per_m2', {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: true,
            comment: 'Final value per square meter',
        });

        await queryInterface.addColumn('project_results', 'land_share', {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
            comment: 'Land value to deduct',
        });

        await queryInterface.addColumn('project_results', 'rental_rate_source', {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Source of rental rate: manual or market',
        });

        console.log('Migration: Added income flow fields to project_results');
    } catch (error) {
        if (error.message.includes('column') && error.message.includes('already exists')) {
            console.log('Migration: Column already exists, skipping');
        } else {
            throw error;
        }
    }
}

export async function down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    
    await queryInterface.removeColumn('project_results', 'egi');
    await queryInterface.removeColumn('project_results', 'opex');
    await queryInterface.removeColumn('project_results', 'noi');
    await queryInterface.removeColumn('project_results', 'price_per_m2');
    await queryInterface.removeColumn('project_results', 'land_share');
    await queryInterface.removeColumn('project_results', 'rental_rate_source');
    
    console.log('Migration: Removed income flow fields from project_results');
}
