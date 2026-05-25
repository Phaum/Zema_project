import { sequelize } from '../config/db.js';
import {
    buildMarketOfferZemaId,
    deriveMarketOfferSegment,
} from '../utils/marketOfferEncoding.js';

async function describeMarketOffers(queryInterface) {
    return queryInterface.describeTable('market_offers');
}

async function ensureColumnRename(queryInterface, table, oldName, newName) {
    if (table[oldName] && !table[newName]) {
        await queryInterface.renameColumn('market_offers', oldName, newName);
        return describeMarketOffers(queryInterface);
    }

    if (table[oldName] && table[newName]) {
        await sequelize.query(
            `update market_offers set "${newName}" = "${oldName}" where "${newName}" is null and "${oldName}" is not null`
        );
        await queryInterface.removeColumn('market_offers', oldName);
        return describeMarketOffers(queryInterface);
    }

    return table;
}

async function run() {
    const queryInterface = sequelize.getQueryInterface();
    const tables = (await queryInterface.showAllTables()).map(String);

    if (!tables.includes('market_offers')) {
        console.log('market_offers table not found, nothing to recode');
        return;
    }

    let table = await describeMarketOffers(queryInterface);
    table = await ensureColumnRename(queryInterface, table, 'model_functional', 'functional');
    table = await ensureColumnRename(queryInterface, table, 'subgroup_2025', 'segment');

    const [rows] = await sequelize.query(`
        select id, external_id, quarter, segment
        from market_offers
        order by id
    `);

    let idsUpdated = 0;
    let segmentsUpdated = 0;

    for (const row of rows) {
        const nextExternalId = buildMarketOfferZemaId({
            id: row.id,
            externalId: row.external_id,
            quarter: row.quarter,
        });
        const nextSegment = deriveMarketOfferSegment(row.segment);

        if (nextExternalId !== row.external_id || nextSegment !== row.segment) {
            await sequelize.query(
                `
                    update market_offers
                    set external_id = :externalId,
                        segment = :segment
                    where id = :id
                `,
                {
                    replacements: {
                        id: row.id,
                        externalId: nextExternalId,
                        segment: nextSegment,
                    },
                }
            );

            if (nextExternalId !== row.external_id) idsUpdated += 1;
            if (nextSegment !== row.segment) segmentsUpdated += 1;
        }
    }

    table = await describeMarketOffers(queryInterface);
    if (table.offer_date) {
        await queryInterface.removeColumn('market_offers', 'offer_date');
    }

    console.log(`market_offers recoded: ids=${idsUpdated}, segments=${segmentsUpdated}, offer_date=removed`);
}

run()
    .catch((error) => {
        console.error('recodeMarketOffers2025 failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await sequelize.close();
    });
