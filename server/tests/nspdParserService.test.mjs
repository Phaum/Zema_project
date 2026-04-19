import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNspdParserResult,
  extractCoordinates,
} from '../services/nspdParserService.js';

test('extractCoordinates converts NSPD EPSG:3857 polygon to WGS84 centroid', () => {
  const coordinates = extractCoordinates({
    type: 'Polygon',
    coordinates: [[
      [3379392.671651727, 8380213.724222376],
      [3379380.78986957, 8380179.886105294],
      [3379481.2449328117, 8380182.591271766],
      [3379392.671651727, 8380213.724222376],
    ]],
    crs: {
      type: 'name',
      properties: { name: 'EPSG:3857' },
    },
  });

  assert.ok(Math.abs(coordinates.latitude - 59.912) < 0.01);
  assert.ok(Math.abs(coordinates.longitude - 30.357) < 0.01);
});

test('buildNspdParserResult keeps old parser response contract for buildings', () => {
  const result = buildNspdParserResult(
    '78:13:0007309:3014',
    {
      id: 427058727,
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [3379392.671651727, 8380213.724222376],
          [3379481.2449328117, 8380182.591271766],
        ]],
        crs: {
          type: 'name',
          properties: { name: 'EPSG:3857' },
        },
      },
      properties: {
        category: 36369,
        categoryName: 'Здания',
        descr: '78:13:0007309:3014',
        externalKey: '78:13:0007309:3014',
        label: '78:13:0007309:3014',
        options: {
          build_record_area: 4410,
          build_record_type_value: 'Здание',
          cad_num: '78:13:0007309:3014',
          cost_value: 266078364.3,
          cost_index: 60335.23,
          floors: '6',
          underground_floors: '1',
          ownership_type: 'Частная',
          purpose: 'Нежилое',
          quarter_cad_number: '78:13:0007309',
          readable_address: 'г. Санкт-Петербург, Днепропетровская улица, дом 57, литера А',
          year_built: '',
          year_commisioning: '2006',
        },
      },
    },
    { relatedLandCadastralNumbers: ['78:13:0007309:3003'] },
  );

  assert.equal(result.success, true);
  assert.equal(result.modeDetected, 'building');
  assert.equal(result.cadastral_number, '78:13:0007309:3014');
  assert.equal(result.object_type, 'Здание');
  assert.equal(result.year_built, null);
  assert.equal(result.year_commisioning, 2006);
  assert.equal(result.address, 'г. Санкт-Петербург, Днепропетровская улица, дом 57, литера А');
  assert.equal(result.total_area, 4410);
  assert.equal(result.cad_cost, 266078364.3);
  assert.equal(result.specific_cadastral_cost, 60335.23);
  assert.equal(result.permitted_use, 'Нежилое');
  assert.equal(result.cadastral_quarter, '78:13:0007309');
  assert.equal(result.ownership_form, 'Частная');
  assert.equal(result.floor_count, '6');
  assert.equal(result.underground_floor_count, 1);
  assert.equal(result.land_plot_cadastral_number, '78:13:0007309:3003');
  assert.equal(result.source_provider, 'nspd-js');
  assert.ok(result.raw_payload_json.nspd.feature);
  assert.deepEqual(result.raw_payload_json.nspd.related_land_plots, ['78:13:0007309:3003']);
});
