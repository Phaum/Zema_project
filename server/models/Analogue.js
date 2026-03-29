import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const Analogue = sequelize.define('Analogue', {
    id: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false,
    },

    parent_object_type: { type: DataTypes.STRING(100), allowNull: true },
    model_func: { type: DataTypes.STRING(100), allowNull: true },
    subgroup: { type: DataTypes.STRING(100), allowNull: true },
    func: { type: DataTypes.TEXT, allowNull: true },

    total_area: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    class_offer: { type: DataTypes.STRING(50), allowNull: true },
    station_name: { type: DataTypes.STRING(100), allowNull: true },

    address: { type: DataTypes.TEXT, allowNull: true },
    building: { type: DataTypes.TEXT, allowNull: true },
    floor: { type: DataTypes.STRING(50), allowNull: true },

    ground_floors: { type: DataTypes.INTEGER, allowNull: true },
    total_floors: { type: DataTypes.INTEGER, allowNull: true },
    underground_floors: { type: DataTypes.INTEGER, allowNull: true },

    price: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    price_per_meter: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    nds: { type: DataTypes.STRING(100), allowNull: true },
    nds_description: { type: DataTypes.TEXT, allowNull: true },
    price_per_meter_cut_nds: { type: DataTypes.DECIMAL(18, 2), allowNull: true },

    description: { type: DataTypes.TEXT, allowNull: true },
    ku: { type: DataTypes.STRING(100), allowNull: true },
    ku_description: { type: DataTypes.TEXT, allowNull: true },
    expl_spends: { type: DataTypes.TEXT, allowNull: true },

    unit_price: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    cadastral: { type: DataTypes.STRING(100), allowNull: true },

    y: { type: DataTypes.DECIMAL(20, 10), allowNull: true },
    x: { type: DataTypes.DECIMAL(20, 10), allowNull: true },
    lat: { type: DataTypes.DECIMAL(20, 10), allowNull: true },
    lon: { type: DataTypes.DECIMAL(20, 10), allowNull: true },

    district: { type: DataTypes.STRING(100), allowNull: true },
    date_offer: { type: DataTypes.DATEONLY, allowNull: true },
    quarter: { type: DataTypes.STRING(100), allowNull: true },
    condition_building: { type: DataTypes.STRING(100), allowNull: true },

    link: { type: DataTypes.TEXT, allowNull: true },
    screenshot: { type: DataTypes.TEXT, allowNull: true },

    ter_zone: { type: DataTypes.STRING(100), allowNull: true },
    zone_code: { type: DataTypes.STRING(100), allowNull: true },
    type_name: { type: DataTypes.TEXT, allowNull: true },
    zone_name: { type: DataTypes.TEXT, allowNull: true },

    is_historical_center: { type: DataTypes.STRING(100), allowNull: true },

    built_year: { type: DataTypes.STRING(50), allowNull: true },
    expl_year: { type: DataTypes.STRING(50), allowNull: true },
    new_life_year: { type: DataTypes.STRING(50), allowNull: true },

    price_offer: { type: DataTypes.STRING(50), allowNull: true },
    distance_to_station: { type: DataTypes.STRING(50), allowNull: true },

    env_category_1: { type: DataTypes.TEXT, allowNull: true },
    env_category_2: { type: DataTypes.TEXT, allowNull: true },
    env_business_cnt: { type: DataTypes.INTEGER, allowNull: true },
    env_residential_high_cnt: { type: DataTypes.INTEGER, allowNull: true },
    env_residential_mid_cnt: { type: DataTypes.INTEGER, allowNull: true },
    env_industrial_cnt: { type: DataTypes.INTEGER, allowNull: true },
    env_osm_total_cnt: { type: DataTypes.INTEGER, allowNull: true },
    env_analyzed_at: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'analogues',
    timestamps: false,
    underscored: true,
});

export default Analogue;