import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildGeocodeQueryVariants,
    extractDistrictFromCadastralRecord,
    isPlausibleMetroDistanceMeters,
    normalizeDistrictLabel,
} from '../utils/locationNormalization.js';

test('normalizeDistrictLabel keeps cadastral district and rejects noisy municipal address fragments', () => {
    assert.equal(normalizeDistrictLabel('Приморский кадастровый район'), 'Приморский');
    assert.equal(normalizeDistrictLabel('№ 65 улица Оптиков'), null);
    assert.equal(normalizeDistrictLabel('Московский район'), 'Московский');
});

test('extractDistrictFromCadastralRecord prefers cadastral payload district over broken cached district', () => {
    const record = {
        district: '№ 65 улица Оптиков',
        raw_payload_json: {
            match: {
                data: {
                    cadastral_district: 'Приморский кадастровый район',
                },
            },
        },
    };

    assert.equal(extractDistrictFromCadastralRecord(record), 'Приморский');
});

test('buildGeocodeQueryVariants produces progressively simplified address queries', () => {
    const variants = buildGeocodeQueryVariants(
        'Российская Федерация, Санкт-Петербург, внутригородское муниципальное образование города федерального значения Санкт-Петербурга муниципальный округ № 65, улица Оптиков, дом 4 корпус 2 строение А'
    );

    assert.ok(variants.includes('Санкт-Петербург, улица Оптиков, дом 4 корпус 2 строение А'));
    assert.ok(variants.includes('Санкт-Петербург, улица Оптиков, 4 к2 сА'));
    assert.ok(variants.includes('Санкт-Петербург, улица Оптиков, 4 к2'));
});

test('buildGeocodeQueryVariants strips leading poi names when address anchor exists later', () => {
    const variants = buildGeocodeQueryVariants(
        'Уралсиб, улица Оптиков, дом 4 корпус 2, Санкт-Петербург'
    );

    assert.ok(
        variants.some((value) => (
            /улица Оптиков/iu.test(value)
            && /4 к2/iu.test(value)
            && !/Уралсиб/iu.test(value)
        ))
    );
});

test('isPlausibleMetroDistanceMeters rejects absurd values', () => {
    assert.equal(isPlausibleMetroDistanceMeters(596), true);
    assert.equal(isPlausibleMetroDistanceMeters(7147600), false);
    assert.equal(isPlausibleMetroDistanceMeters(-1), false);
});
