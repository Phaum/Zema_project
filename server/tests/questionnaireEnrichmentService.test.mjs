import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sanitizeAutoFilledLeasableArea,
    sanitizeAutoFilledTotalOksAreaOnLand,
    shouldPreferCadastralTotalOksAreaOnLand,
    validateTotalOksAreaOnLandCandidate,
} from '../services/questionnaireEnrichmentService.js';

test('validateTotalOksAreaOnLandCandidate rejects historical land total smaller than object and leasable area', () => {
    const validation = validateTotalOksAreaOnLandCandidate(9697.3, {
        totalArea: 18023.4,
        leasableArea: 12757.2,
        occupiedArea: 9697.3,
    });

    assert.equal(validation.isValid, false);
    assert.deepEqual(
        validation.violations.map((item) => item.field),
        ['totalArea', 'leasableArea']
    );
});

test('sanitizeAutoFilledTotalOksAreaOnLand clears invalid historical value for Lakhta-like case', () => {
    const result = sanitizeAutoFilledTotalOksAreaOnLand({
        totalArea: 18023.4,
        leasableArea: 12757.2,
        occupiedArea: 9697.3,
        totalOksAreaOnLand: 9697.3,
        fieldSourceHints: {
            totalOksAreaOnLand: 'historical_project_questionnaire',
        },
    });

    assert.equal(result.removed, true);
    assert.equal(result.source, 'historical_project_questionnaire');
    assert.equal(result.questionnaire.totalOksAreaOnLand, null);
    assert.equal(
        Object.prototype.hasOwnProperty.call(result.questionnaire.fieldSourceHints, 'totalOksAreaOnLand'),
        false
    );
});

test('sanitizeAutoFilledTotalOksAreaOnLand preserves manual value even when it looks inconsistent', () => {
    const result = sanitizeAutoFilledTotalOksAreaOnLand({
        totalArea: 18023.4,
        leasableArea: 12757.2,
        totalOksAreaOnLand: 9697.3,
        fieldSourceHints: {
            totalOksAreaOnLand: 'manual_input',
        },
    });

    assert.equal(result.removed, false);
    assert.equal(result.questionnaire.totalOksAreaOnLand, 9697.3);
    assert.equal(result.questionnaire.fieldSourceHints.totalOksAreaOnLand, 'manual_input');
});

test('sanitizeAutoFilledLeasableArea clears historical auto-filled value', () => {
    const result = sanitizeAutoFilledLeasableArea({
        leasableArea: 12757.2,
        fieldSourceHints: {
            leasableArea: 'historical_project_questionnaire',
        },
    });

    assert.equal(result.removed, true);
    assert.equal(result.source, 'historical_project_questionnaire');
    assert.equal(result.questionnaire.leasableArea, null);
    assert.equal(
        Object.prototype.hasOwnProperty.call(result.questionnaire.fieldSourceHints, 'leasableArea'),
        false
    );
});

test('sanitizeAutoFilledLeasableArea preserves manual value', () => {
    const result = sanitizeAutoFilledLeasableArea({
        leasableArea: 12757.2,
        fieldSourceHints: {
            leasableArea: 'manual_input',
        },
    });

    assert.equal(result.removed, false);
    assert.equal(result.questionnaire.leasableArea, 12757.2);
    assert.equal(result.questionnaire.fieldSourceHints.leasableArea, 'manual_input');
});

test('shouldPreferCadastralTotalOksAreaOnLand prefers cadastral value over historical but not over manual', () => {
    assert.equal(
        shouldPreferCadastralTotalOksAreaOnLand({
            currentValue: 9697.3,
            currentSource: 'historical_project_questionnaire',
            cadastralValue: 18023.4,
        }),
        true
    );

    assert.equal(
        shouldPreferCadastralTotalOksAreaOnLand({
            currentValue: 9697.3,
            currentSource: 'manual_input',
            cadastralValue: 18023.4,
        }),
        false
    );
});
