import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateNearestMetro } from '../services/geoService.js';
import { detectMetroDatasetKey } from '../services/metroFallbackService.js';

test('detectMetroDatasetKey resolves Saint Petersburg by city name', () => {
  assert.equal(
    detectMetroDatasetKey({ city: 'Санкт-Петербург' }),
    'saint_petersburg'
  );
});

test('calculateNearestMetro rejects invalid coordinates before loading datasets', async () => {
  await assert.rejects(
    () => calculateNearestMetro({ lat: 120, lon: 30, city: 'Санкт-Петербург' }),
    /Некорректные координаты/
  );
});
