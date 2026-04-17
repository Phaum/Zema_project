import { sequelize } from '../config/db.js';
import { BillingPlan, Role } from '../models/index.js';
import { DEFAULT_USER_SETTINGS } from '../constants/userSettings.js';
import { ensureDefaultBillingPlans } from '../services/billingService.js';

export async function initDatabase() {
    console.log('Проверка структуры БД...');

    await sequelize.authenticate();
    console.log('Подключение к PostgreSQL успешно установлено.');

    await ensureEnumRoleType();
    await sequelize.sync();

    console.log('Базовые таблицы проверены.');

    await ensureUsersColumns();
    await ensureBillingPlansTable();
    await ensureCadastralRecordsTable();
    await ensureValuationProjectsTable();
    await ensureProjectQuestionnairesTable();
    await ensureProjectResultsTable();
    await ensureDefaultRoles();
    await ensureAdminAuditLogsTable();
    await ensureMarketOffersTable();
    await ensureAnaloguesTable();
    await ensureSpatialZonesTable();
    await ensureEnvironmentAnalysesTable();
    await ensureProjectQuestionnaireColumns();
    await ensureDefaultBillingPlans();

    console.log('Проверка БД завершена.');
}

async function ensureEnumRoleType() {
    await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_roles_role'
          AND n.nspname = 'public'
      ) THEN
        CREATE TYPE "public"."enum_roles_role" AS ENUM ('GUEST', 'USER', 'ADMIN_ANALYST');
      END IF;
    END $$;
  `);
}

async function ensureUsersColumns() {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('users');

    if (!table.first_name) {
        await qi.addColumn('users', 'first_name', {
            type: sequelize.Sequelize.STRING(100),
            allowNull: true,
        });
    }

    if (!table.last_name) {
        await qi.addColumn('users', 'last_name', {
            type: sequelize.Sequelize.STRING(100),
            allowNull: true,
        });
    }

    if (!table.status) {
        await qi.addColumn('users', 'status', {
            type: sequelize.Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'active',
        });
    }

    if (!table.debug_mode) {
        await qi.addColumn('users', 'debug_mode', {
            type: sequelize.Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
    }

    if (!table.settings_json) {
        await qi.addColumn('users', 'settings_json', {
            type: sequelize.Sequelize.JSONB,
            allowNull: false,
            defaultValue: DEFAULT_USER_SETTINGS,
        });
    }

    if (!table.subscription_status) {
        await qi.addColumn('users', 'subscription_status', {
            type: sequelize.Sequelize.STRING(30),
            allowNull: false,
            defaultValue: 'inactive',
        });
    }

    if (!table.subscription_plan_code) {
        await qi.addColumn('users', 'subscription_plan_code', {
            type: sequelize.Sequelize.STRING(50),
            allowNull: true,
        });
    }

    if (!table.subscription_started_at) {
        await qi.addColumn('users', 'subscription_started_at', {
            type: sequelize.Sequelize.DATE,
            allowNull: true,
        });
    }

    if (!table.subscription_expires_at) {
        await qi.addColumn('users', 'subscription_expires_at', {
            type: sequelize.Sequelize.DATE,
            allowNull: true,
        });
    }

    if (!table.subscription_details_json) {
        await qi.addColumn('users', 'subscription_details_json', {
            type: sequelize.Sequelize.JSONB,
            allowNull: true,
        });
    }

    if (!table.created_at) {
        await qi.addColumn('users', 'created_at', {
            type: sequelize.Sequelize.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        });
    }

    await sequelize.query(`
        UPDATE users
        SET status = 'active'
        WHERE status IS NULL OR status = ''
    `);

    await sequelize.query(`
        UPDATE users
        SET debug_mode = false
        WHERE debug_mode IS NULL
    `);

    await sequelize.query(`
        UPDATE users
        SET subscription_status = 'inactive'
        WHERE subscription_status IS NULL OR subscription_status = ''
    `);

    await sequelize.query(`
        UPDATE users
        SET settings_json = ${sequelize.escape(JSON.stringify(DEFAULT_USER_SETTINGS))}::jsonb
        WHERE settings_json IS NULL
    `);
}

async function ensureBillingPlansTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('billing_plans');
    } catch (error) {
        console.log('Таблица billing_plans будет создана через sequelize.sync()');
        table = null;
    }

    if (!table) {
        await BillingPlan.sync();
        table = await qi.describeTable('billing_plans');
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('billing_plans', columnName, definition);
            console.log(`Добавлена колонка billing_plans.${columnName}`);
        }
    };

    await addColumnIfMissing('kind', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: false,
    });

    await addColumnIfMissing('code', {
        type: sequelize.Sequelize.STRING(60),
        allowNull: false,
    });

    await addColumnIfMissing('title', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false,
    });

    await addColumnIfMissing('price', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
    });

    await addColumnIfMissing('currency', {
        type: sequelize.Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'RUB',
    });

    await addColumnIfMissing('description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('features_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
    });

    await addColumnIfMissing('turnaround_text', {
        type: sequelize.Sequelize.STRING(120),
        allowNull: true,
    });

    await addColumnIfMissing('period_months', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('is_active', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    });

    await addColumnIfMissing('sort_order', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
    });

    await addColumnIfMissing('metadata_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS billing_plans_kind_code_uidx
        ON billing_plans (kind, code)
    `);

    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS billing_plans_kind_active_sort_idx
        ON billing_plans (kind, is_active, sort_order)
    `);
}

async function ensureCadastralRecordsTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('cadastral_records');
    } catch (error) {
        console.log('Таблица cadastral_records не найдена, будет создана через sequelize.sync()');
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('cadastral_records', columnName, definition);
            console.log(`Добавлена колонка cadastral_records.${columnName}`);
        }
    };

    await addColumnIfMissing('cadastral_number', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: false,
    });

    await addColumnIfMissing('object_type', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('cadastral_quarter', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: true,
    });

    await addColumnIfMissing('year_built', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: true,
    });

    await addColumnIfMissing('year_commisioning', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: true,
    });

    await addColumnIfMissing('total_area', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('land_area', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('cad_cost', {
        type: sequelize.Sequelize.DECIMAL(18, 2),
        allowNull: true,
    });

    await addColumnIfMissing('specific_cadastral_cost', {
        type: sequelize.Sequelize.DECIMAL(18, 6),
        allowNull: true,
    });

    await addColumnIfMissing('permitted_use', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('address', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('address_display', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('address_document', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('district', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('ownership_form', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('latitude', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: true,
    });

    await addColumnIfMissing('longitude', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: true,
    });

    await addColumnIfMissing('nearest_metro', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('metro_distance', {
        type: sequelize.Sequelize.DECIMAL(12, 2),
        allowNull: true,
    });

    await addColumnIfMissing('land_plot_cadastral_number', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: true,
    });

    await addColumnIfMissing('total_oks_area_on_land', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('floor_count', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: true,
    });

    await addColumnIfMissing('source_provider', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('source_url', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('source_note', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('source_updated_at', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: true,
    });

    await addColumnIfMissing('raw_payload_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('status', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'COMPLETED',
    });

    const indexes = await qi.showIndex('cadastral_records');
    const hasCadnumIndex = indexes.some(
        (idx) => idx.name === 'cadastral_records_cadastral_number_uq'
    );

    if (!hasCadnumIndex) {
        await qi.addIndex('cadastral_records', ['cadastral_number'], {
            unique: true,
            name: 'cadastral_records_cadastral_number_uq',
        });
        console.log('Добавлен уникальный индекс cadastral_records_cadastral_number_uq');
    }
}

async function ensureDefaultRoles() {
    const defaultRoles = [
        { role: 'GUEST', name: 'Гость' },
        { role: 'USER', name: 'Пользователь' },
        { role: 'ADMIN_ANALYST', name: 'Администратор-аналитик' },
    ];

    for (const roleData of defaultRoles) {
        await Role.findOrCreate({
            where: { role: roleData.role },
            defaults: roleData,
        });
    }
}

async function ensureAdminAuditLogsTable() {
    const queryInterface = sequelize.getQueryInterface();

    const exists = await queryInterface
        .showAllTables()
        .then((tables) => tables.map(String).includes('admin_audit_logs'));

    if (!exists) {
        await queryInterface.createTable('admin_audit_logs', {
            id: {
                type: sequelize.Sequelize.BIGINT,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            admin_user_id: {
                type: sequelize.Sequelize.BIGINT,
                allowNull: false,
            },
            entity_type: {
                type: sequelize.Sequelize.STRING,
                allowNull: false,
            },
            entity_id: {
                type: sequelize.Sequelize.STRING,
                allowNull: false,
            },
            action: {
                type: sequelize.Sequelize.STRING,
                allowNull: false,
            },
            before_data: {
                type: sequelize.Sequelize.JSONB,
                allowNull: true,
            },
            after_data: {
                type: sequelize.Sequelize.JSONB,
                allowNull: true,
            },
            meta: {
                type: sequelize.Sequelize.JSONB,
                allowNull: true,
            },
            created_at: {
                type: sequelize.Sequelize.DATE,
                allowNull: false,
                defaultValue: sequelize.Sequelize.fn('NOW'),
            },
            updated_at: {
                type: sequelize.Sequelize.DATE,
                allowNull: false,
                defaultValue: sequelize.Sequelize.fn('NOW'),
            },
        });
    }
}

async function ensureMarketOffersTable() {
    const queryInterface = sequelize.getQueryInterface();
    const tableName = 'market_offers';

    const allTables = await queryInterface.showAllTables();
    const exists = allTables.map(String).includes(tableName);

    if (!exists) {
        await queryInterface.createTable(tableName, {
            id: {
                type: sequelize.Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            external_id: {
                type: sequelize.Sequelize.STRING(120),
                allowNull: false,
                unique: true,
            },
            parent_object_type: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            model_functional: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            subgroup_2025: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            function_name: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            area_total: {
                type: sequelize.Sequelize.DECIMAL(14, 2),
                allowNull: true,
            },
            class_offer: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            metro: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            address_offer: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            building_name: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            year_built_commissioning: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            floor_location: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            above_ground_floors: {
                type: sequelize.Sequelize.INTEGER,
                allowNull: true,
            },
            total_floors: {
                type: sequelize.Sequelize.INTEGER,
                allowNull: true,
            },
            underground_floors: {
                type: sequelize.Sequelize.INTEGER,
                allowNull: true,
            },
            price_total_month: {
                type: sequelize.Sequelize.DECIMAL(16, 2),
                allowNull: true,
            },
            price_per_sqm_month: {
                type: sequelize.Sequelize.DECIMAL(14, 2),
                allowNull: true,
            },
            vat: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            vat_description: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            price_without_vat_per_sqm_month: {
                type: sequelize.Sequelize.DECIMAL(14, 2),
                allowNull: true,
            },
            description: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            utilities_included: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            utilities_description: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            opex_description: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            price_per_sqm_cleaned: {
                type: sequelize.Sequelize.DECIMAL(14, 2),
                allowNull: true,
            },
            building_cadastral_number: {
                type: sequelize.Sequelize.STRING(100),
                allowNull: true,
            },
            x: {
                type: sequelize.Sequelize.DECIMAL(16, 8),
                allowNull: true,
            },
            y: {
                type: sequelize.Sequelize.DECIMAL(16, 8),
                allowNull: true,
            },
            district: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            offer_date: {
                type: sequelize.Sequelize.DATEONLY,
                allowNull: true,
            },
            quarter: {
                type: sequelize.Sequelize.STRING(50),
                allowNull: true,
            },
            room_condition: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            offer_url: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            screenshot: {
                type: sequelize.Sequelize.TEXT,
                allowNull: true,
            },
            source_sheet_name: {
                type: sequelize.Sequelize.STRING(255),
                allowNull: true,
            },
            created_at: {
                type: sequelize.Sequelize.DATE,
                allowNull: false,
                defaultValue: sequelize.Sequelize.fn('NOW'),
            },
            updated_at: {
                type: sequelize.Sequelize.DATE,
                allowNull: false,
                defaultValue: sequelize.Sequelize.fn('NOW'),
            },
        });

        await queryInterface.addIndex(tableName, ['external_id'], {
            unique: true,
            name: 'market_offers_external_id_unique',
        });

        await queryInterface.addIndex(tableName, ['building_cadastral_number'], {
            name: 'market_offers_cadnum_idx',
        });

        await queryInterface.addIndex(tableName, ['district'], {
            name: 'market_offers_district_idx',
        });

        await queryInterface.addIndex(tableName, ['offer_date'], {
            name: 'market_offers_offer_date_idx',
        });

        return;
    }

    const table = await queryInterface.describeTable(tableName);

    async function addColumnIfMissing(columnName, definition) {
        if (!table[columnName]) {
            await queryInterface.addColumn(tableName, columnName, definition);
        }
    }

    await addColumnIfMissing('external_id', {
        type: sequelize.Sequelize.STRING(120),
        allowNull: false,
    });

    await addColumnIfMissing('parent_object_type', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('model_functional', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('subgroup_2025', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('function_name', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('area_total', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('class_offer', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('metro', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('address_offer', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('building_name', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('year_built_commissioning', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('floor_location', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('above_ground_floors', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('total_floors', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('underground_floors', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('price_total_month', {
        type: sequelize.Sequelize.DECIMAL(16, 2),
        allowNull: true,
    });

    await addColumnIfMissing('price_per_sqm_month', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('vat', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('vat_description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('price_without_vat_per_sqm_month', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('utilities_included', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('utilities_description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('opex_description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('price_per_sqm_cleaned', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('building_cadastral_number', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('x', {
        type: sequelize.Sequelize.DECIMAL(16, 8),
        allowNull: true,
    });

    await addColumnIfMissing('y', {
        type: sequelize.Sequelize.DECIMAL(16, 8),
        allowNull: true,
    });

    await addColumnIfMissing('district', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('offer_date', {
        type: sequelize.Sequelize.DATEONLY,
        allowNull: true,
    });

    await addColumnIfMissing('quarter', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: true,
    });

    await addColumnIfMissing('room_condition', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('offer_url', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('screenshot', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('source_sheet_name', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environment_historical_center', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: true,
    });

    await addColumnIfMissing('environment_category_1', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('environment_category_2', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('environment_category_3', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('environment_score_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('environment_last_calculated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
    });
    await addColumnIfMissing('market_snapshot_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });
}

async function ensureValuationProjectsTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('valuation_projects');
    } catch (error) {
        console.log('Таблица valuation_projects не найдена, будет создана через sequelize.sync()');
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('valuation_projects', columnName, definition);
            console.log(`Добавлена колонка valuation_projects.${columnName}`);
        }
    };

    await addColumnIfMissing('user_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
    });

    await addColumnIfMissing('name', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'Новый проект',
    });

    await addColumnIfMissing('object_type', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('status', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'questionnaire',
    });

    await addColumnIfMissing('payment_status', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'unpaid',
    });

    await addColumnIfMissing('payment_tariff_code', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: true,
    });

    await addColumnIfMissing('payment_amount', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('payment_currency', {
        type: sequelize.Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'RUB',
    });

    await addColumnIfMissing('payment_details_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('paid_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });
}

async function ensureProjectQuestionnairesTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('project_questionnaires');
    } catch (error) {
        console.log('Таблица project_questionnaires не найдена, будет создана через sequelize.sync()');
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('project_questionnaires', columnName, definition);
            console.log(`Добавлена колонка project_questionnaires.${columnName}`);
        }
    };

    await addColumnIfMissing('project_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        unique: true,
    });

    await addColumnIfMissing('calculationMethod', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'market',
    });

    await addColumnIfMissing('projectName', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('buildingCadastralNumber', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: true,
    });

    await addColumnIfMissing('valuationDate', {
        type: sequelize.Sequelize.DATEONLY,
        allowNull: true,
    });

    await addColumnIfMissing('objectType', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('actualUse', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('businessCenterClass', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: true,
    });

    await addColumnIfMissing('averageRentalRate', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('mapPointLat', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: true,
    });

    await addColumnIfMissing('mapPointLng', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: true,
    });

    await addColumnIfMissing('objectAddress', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('addressConfirmed', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    });

    await addColumnIfMissing('district', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('nearestMetro', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('metroDistance', {
        type: sequelize.Sequelize.DECIMAL(12, 2),
        allowNull: true,
    });

    await addColumnIfMissing('cadCost', {
        type: sequelize.Sequelize.DECIMAL(18, 2),
        allowNull: true,
    });

    await addColumnIfMissing('permittedUse', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('totalArea', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('constructionYear', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('aboveGroundFloors', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('hasBasementFloor', {
        type: sequelize.Sequelize.STRING(10),
        allowNull: true,
    });

    await addColumnIfMissing('undergroundFloors', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
    });

    await addColumnIfMissing('landCadastralNumber', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: true,
    });

    await addColumnIfMissing('landArea', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('hasPrepayment', {
        type: sequelize.Sequelize.STRING(10),
        allowNull: true,
    });

    await addColumnIfMissing('hasSecurityDeposit', {
        type: sequelize.Sequelize.STRING(10),
        allowNull: true,
    });

    await addColumnIfMissing('leasableArea', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('occupancyRate', {
        type: sequelize.Sequelize.DECIMAL(5, 2),
        allowNull: true,
    });

    await addColumnIfMissing('nspdBuildingLoaded', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    });

    await addColumnIfMissing('nspdLandLoaded', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    });

    await addColumnIfMissing('marketClassResolved', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: true,
    });

    await addColumnIfMissing('floors', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('landCadCost', {
        type: sequelize.Sequelize.DECIMAL(18, 2),
        allowNull: true,
    });

    await addColumnIfMissing('totalOksAreaOnLand', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('occupiedArea', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });
}

async function ensureProjectResultsTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('project_results');
    } catch (error) {
        console.log('Таблица project_results не найдена, будет создана через sequelize.sync()');
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('project_results', columnName, definition);
            console.log(`Добавлена колонка project_results.${columnName}`);
        }
    };

    await addColumnIfMissing('project_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        unique: true,
    });

    await addColumnIfMissing('rental_rate', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('leasable_area', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('occupancy_rate', {
        type: sequelize.Sequelize.DECIMAL(5, 2),
        allowNull: true,
    });

    await addColumnIfMissing('gross_income', {
        type: sequelize.Sequelize.DECIMAL(16, 2),
        allowNull: true,
    });

    await addColumnIfMissing('capitalization_rate', {
        type: sequelize.Sequelize.DECIMAL(8, 6),
        allowNull: false,
        defaultValue: 0.1,
    });

    await addColumnIfMissing('estimated_value', {
        type: sequelize.Sequelize.DECIMAL(18, 2),
        allowNull: true,
    });

    // Extended income flow fields
    await addColumnIfMissing('egi', {
        type: sequelize.Sequelize.DECIMAL(16, 2),
        allowNull: true,
    });

    await addColumnIfMissing('opex', {
        type: sequelize.Sequelize.DECIMAL(16, 2),
        allowNull: true,
    });

    await addColumnIfMissing('noi', {
        type: sequelize.Sequelize.DECIMAL(16, 2),
        allowNull: true,
    });

    await addColumnIfMissing('price_per_m2', {
        type: sequelize.Sequelize.DECIMAL(14, 2),
        allowNull: true,
    });

    await addColumnIfMissing('land_share', {
        type: sequelize.Sequelize.DECIMAL(18, 2),
        allowNull: true,
    });

    await addColumnIfMissing('rental_rate_source', {
        type: sequelize.Sequelize.STRING(50),
        allowNull: true,
    });

    await addColumnIfMissing('market_snapshot_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('calculation_breakdown_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });
}

async function ensureAnaloguesTable() {
    const qi = sequelize.getQueryInterface();
    const tableName = 'analogues';

    const allTables = await qi.showAllTables();
    const exists = allTables.map(String).includes(tableName);

    if (!exists) {
        await qi.createTable(tableName, {
            id: { type: sequelize.Sequelize.STRING(100), allowNull: false, primaryKey: true },
            parent_object_type: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            model_func: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            subgroup: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            func: { type: sequelize.Sequelize.TEXT, allowNull: true },
            total_area: { type: sequelize.Sequelize.DECIMAL(15, 2), allowNull: true },
            class_offer: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            station_name: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            address: { type: sequelize.Sequelize.TEXT, allowNull: true },
            building: { type: sequelize.Sequelize.TEXT, allowNull: true },
            floor: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            ground_floors: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            total_floors: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            underground_floors: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            price: { type: sequelize.Sequelize.DECIMAL(18, 2), allowNull: true },
            price_per_meter: { type: sequelize.Sequelize.DECIMAL(18, 2), allowNull: true },
            nds: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            nds_description: { type: sequelize.Sequelize.TEXT, allowNull: true },
            price_per_meter_cut_nds: { type: sequelize.Sequelize.DECIMAL(18, 2), allowNull: true },
            description: { type: sequelize.Sequelize.TEXT, allowNull: true },
            ku: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            ku_description: { type: sequelize.Sequelize.TEXT, allowNull: true },
            expl_spends: { type: sequelize.Sequelize.TEXT, allowNull: true },
            unit_price: { type: sequelize.Sequelize.DECIMAL(18, 2), allowNull: true },
            cadastral: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            y: { type: sequelize.Sequelize.DECIMAL(20, 10), allowNull: true },
            x: { type: sequelize.Sequelize.DECIMAL(20, 10), allowNull: true },
            lat: { type: sequelize.Sequelize.DECIMAL(20, 10), allowNull: true },
            lon: { type: sequelize.Sequelize.DECIMAL(20, 10), allowNull: true },
            district: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            date_offer: { type: sequelize.Sequelize.DATEONLY, allowNull: true },
            quarter: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            condition_building: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            link: { type: sequelize.Sequelize.TEXT, allowNull: true },
            screenshot: { type: sequelize.Sequelize.TEXT, allowNull: true },
            ter_zone: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            zone_code: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            type_name: { type: sequelize.Sequelize.TEXT, allowNull: true },
            zone_name: { type: sequelize.Sequelize.TEXT, allowNull: true },
            is_historical_center: { type: sequelize.Sequelize.STRING(100), allowNull: true },
            built_year: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            expl_year: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            new_life_year: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            price_offer: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            distance_to_station: { type: sequelize.Sequelize.STRING(50), allowNull: true },
            env_category_1: { type: sequelize.Sequelize.TEXT, allowNull: true },
            env_category_2: { type: sequelize.Sequelize.TEXT, allowNull: true },
            env_business_cnt: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            env_residential_high_cnt: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            env_residential_mid_cnt: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            env_industrial_cnt: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            env_osm_total_cnt: { type: sequelize.Sequelize.INTEGER, allowNull: true },
            env_analyzed_at: { type: sequelize.Sequelize.DATE, allowNull: true },
        });

        await qi.addIndex(tableName, ['cadastral'], { name: 'analogues_cadastral_idx' });
        await qi.addIndex(tableName, ['district'], { name: 'analogues_district_idx' });
        await qi.addIndex(tableName, ['date_offer'], { name: 'analogues_date_offer_idx' });
        return;
    }
}

async function ensureSpatialZonesTable() {
    const qi = sequelize.getQueryInterface();

    let table;
    try {
        table = await qi.describeTable('spatial_zones');
    } catch (error) {
        console.log('Таблица spatial_zones не найдена, будет создана через sequelize.sync()');
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn('spatial_zones', columnName, definition);
            console.log(`Добавлена колонка spatial_zones.${columnName}`);
        }
    };

    await addColumnIfMissing('name', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'Новая зона',
    });

    await addColumnIfMissing('zone_type', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'historical_center',
    });

    await addColumnIfMissing('code', {
        type: sequelize.Sequelize.STRING(120),
        allowNull: true,
    });

    await addColumnIfMissing('priority', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
    });

    await addColumnIfMissing('geojson', {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: { type: 'FeatureCollection', features: [] },
    });

    await addColumnIfMissing('color', {
        type: sequelize.Sequelize.STRING(32),
        allowNull: true,
        defaultValue: '#1890ff',
    });

    await addColumnIfMissing('description', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
    });

    await addColumnIfMissing('is_active', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });
}

async function ensureEnvironmentAnalysesTable() {
    const qi = sequelize.getQueryInterface();
    const tableName = 'environment_analyses';

    let table;
    try {
        table = await qi.describeTable(tableName);
    } catch (error) {
        console.log(`[initDatabase] Таблица ${tableName} не найдена, будет создана через sequelize.sync()`);
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn(tableName, columnName, definition);
            console.log(`[initDatabase] Добавлена колонка ${tableName}.${columnName}`);
        }
    };

    await addColumnIfMissing('cadastral_number', {
        type: sequelize.Sequelize.STRING(64),
        allowNull: false,
    });

    await addColumnIfMissing('valuation_date', {
        type: sequelize.Sequelize.DATEONLY,
        allowNull: true,
    });

    await addColumnIfMissing('latitude', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: false,
    });

    await addColumnIfMissing('longitude', {
        type: sequelize.Sequelize.DECIMAL(12, 8),
        allowNull: false,
    });

    await addColumnIfMissing('radius_used', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 600,
    });

    await addColumnIfMissing('location_type', {
        type: sequelize.Sequelize.STRING(80),
        allowNull: true,
    });

    await addColumnIfMissing('historical_center_status', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: true,
    });

    await addColumnIfMissing('historical_center_distance_meters', {
        type: sequelize.Sequelize.DECIMAL(12, 2),
        allowNull: true,
    });

    await addColumnIfMissing('historical_center_source', {
        type: sequelize.Sequelize.STRING(120),
        allowNull: true,
    });

    await addColumnIfMissing('nearest_metro', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('nearest_metro_distance', {
        type: sequelize.Sequelize.DECIMAL(12, 2),
        allowNull: true,
    });

    await addColumnIfMissing('transport_score', {
        type: sequelize.Sequelize.DECIMAL(6, 2),
        allowNull: true,
    });

    await addColumnIfMissing('business_score', {
        type: sequelize.Sequelize.DECIMAL(6, 2),
        allowNull: true,
    });

    await addColumnIfMissing('service_score', {
        type: sequelize.Sequelize.DECIMAL(6, 2),
        allowNull: true,
    });

    await addColumnIfMissing('negative_score', {
        type: sequelize.Sequelize.DECIMAL(6, 2),
        allowNull: true,
    });

    await addColumnIfMissing('total_environment_score', {
        type: sequelize.Sequelize.DECIMAL(6, 2),
        allowNull: true,
    });

    await addColumnIfMissing('quality_flag', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'partial',
    });

    await addColumnIfMissing('environment_category_1', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environment_category_2', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environment_category_3', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environment_details_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('source_meta_json', {
        type: sequelize.Sequelize.JSONB,
        allowNull: true,
    });

    await addColumnIfMissing('calculated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('created_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await addColumnIfMissing('updated_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    });

    const indexes = await qi.showIndex(tableName);

    if (!indexes.some((idx) => idx.name === 'environment_analyses_cadnum_idx')) {
        await qi.addIndex(tableName, ['cadastral_number'], {
            name: 'environment_analyses_cadnum_idx',
        });
    }

    if (!indexes.some((idx) => idx.name === 'environment_analyses_cadnum_radius_uq')) {
        await qi.addIndex(tableName, ['cadastral_number', 'radius_used'], {
            unique: true,
            name: 'environment_analyses_cadnum_radius_uq',
        });
    }
}

async function ensureProjectQuestionnaireColumns() {
    const qi = sequelize.getQueryInterface();
    const tableName = 'project_questionnaires';

    let table;
    try {
        table = await qi.describeTable(tableName);
    } catch (error) {
        console.log(`[initDatabase] Таблица ${tableName} не найдена, дополнительные колонки будут созданы после sequelize.sync()`);
        return;
    }

    const addColumnIfMissing = async (columnName, definition) => {
        if (!table[columnName]) {
            await qi.addColumn(tableName, columnName, definition);
            console.log(`[initDatabase] Добавлена колонка ${tableName}.${columnName}`);
        }
    };

    await addColumnIfMissing('referenceFloorCategory', {
        type: sequelize.Sequelize.STRING(30),
        allowNull: true,
    });

    await addColumnIfMissing('isHistoricalCenter', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: true,
    });

    await addColumnIfMissing('zoneCode', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('terZone', {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true,
    });

    await addColumnIfMissing('environmentCategory1', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environmentCategory2', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('environmentCategory3', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true,
    });

    await addColumnIfMissing('fieldSourceHints', {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
    });
}
