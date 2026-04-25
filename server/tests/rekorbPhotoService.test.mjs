import test from 'node:test';
import assert from 'node:assert/strict';

import {
    findRekorbObjectPhotoByAddress,
    scoreRekorbAddressMatch,
} from '../services/rekorbPhotoService.js';

test('scoreRekorbAddressMatch rejects different litera at the same house number', () => {
    const score = scoreRekorbAddressMatch(
        'Россия, Санкт-Петербург, Санкт-Петербург, Лиговский проспект, 266 литИ',
        'Лиговский пр. д. 266, лит. Е'
    );

    assert.equal(score, 0);
});

test('scoreRekorbAddressMatch accepts matching building number at the same house number', () => {
    const score = scoreRekorbAddressMatch(
        'проспект Лиговский, дом 266 строение 1',
        'Лиговский пр. д. 266, стр. 1'
    );

    assert.equal(score, 1);
});

test('scoreRekorbAddressMatch accepts missing candidate litera when corpus matches', () => {
    const score = scoreRekorbAddressMatch(
        'улица Оптиков, дом 4, корпус 2, литера А',
        'ул. Оптиков д. 4, к. 2'
    );

    assert.equal(score, 1);
});

test('scoreRekorbAddressMatch rejects same house number on a different street', () => {
    const score = scoreRekorbAddressMatch(
        'ул. Оптиков д. 4',
        'ул. Красуцкого д. 4'
    );

    assert.equal(score, 0);
});

test('findRekorbObjectPhotoByAddress does not pick a specific litera for ambiguous house-only address', async () => {
    const photo = await findRekorbObjectPhotoByAddress('Лиговский проспект, 266');

    assert.equal(photo, null);
});
