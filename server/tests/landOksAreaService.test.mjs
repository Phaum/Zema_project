import test from 'node:test';
import assert from 'node:assert/strict';

import { isCountableRegisteredOksObject } from '../services/landOksAreaService.js';

test('isCountableRegisteredOksObject counts buildings and unfinished construction but excludes structures', () => {
    assert.equal(isCountableRegisteredOksObject('Здание'), true);
    assert.equal(isCountableRegisteredOksObject('Объект незавершенного строительства'), true);
    assert.equal(isCountableRegisteredOksObject('Сооружение'), false);
    assert.equal(isCountableRegisteredOksObject('Земельный участок'), false);
});
