import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateValuation } from '../services/calculationService.js';

const TEST_FILE_PATH = path.resolve('server/tests/calculationService.test.mjs');

function extractBalanced(text, startIndex) {
    const openChar = text[startIndex];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let quote = '';

    for (let i = startIndex; i < text.length; i += 1) {
        const ch = text[i];
        const prev = text[i - 1];

        if (inString) {
            if (ch === quote && prev !== '\\') {
                inString = false;
                quote = '';
            }
            continue;
        }

        if (ch === '"' || ch === '\'' || ch === '`') {
            inString = true;
            quote = ch;
            continue;
        }

        if (ch === openChar) depth += 1;
        if (ch === closeChar) {
            depth -= 1;
            if (depth === 0) {
                return text.slice(startIndex, i + 1);
            }
        }
    }

    throw new Error('Unclosed literal while extracting control case fixture');
}

function loadControlCase(testName) {
    const source = fs.readFileSync(TEST_FILE_PATH, 'utf8');
    const testPos = source.indexOf(testName);

    if (testPos === -1) {
        throw new Error(`Control case not found in calculationService.test.mjs: ${testName}`);
    }

    const questionnairePos = source.indexOf('const questionnaire =', testPos);
    const questionnaireStart = source.indexOf('{', questionnairePos);
    const questionnaireLiteral = extractBalanced(source, questionnaireStart);

    const analogsPos = source.indexOf('const selectedAnalogs =', questionnairePos);
    const analogsStart = source.indexOf('[', analogsPos);
    const analogsLiteral = extractBalanced(source, analogsStart);

    return {
        questionnaire: vm.runInNewContext(`(${questionnaireLiteral})`),
        selectedAnalogs: vm.runInNewContext(`(${analogsLiteral})`),
    };
}

function relativeDelta(actual, expected) {
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected === 0) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.abs(actual - expected) / Math.abs(expected);
}

test('Lakhta workbook control case stays within diagnostic corridor against Excel reference', async (t) => {
    const workbookPath = 'c:\\files\\Система\\Загрузки\\Adobe Photoshop 2025 26.6.0 Multi x64\\Telegram Desktop\\28.03.26_Пример расчета_БЦ_Лахта.xlsx';
    const expected = {
        finalValue: 1255969014.67,
        pricePerM2: 69685.47,
    };
    const { questionnaire, selectedAnalogs } = loadControlCase('calculateValuation builds stable market-driven result for Lakhta-like case');
    const valuation = await calculateValuation(questionnaire, selectedAnalogs, 0);
    const finalValueDelta = relativeDelta(valuation.finalValue, expected.finalValue);
    const priceDelta = relativeDelta(valuation.pricePerM2, expected.pricePerM2);

    t.diagnostic(`Workbook: ${workbookPath}`);
    t.diagnostic(`Lakhta Excel finalValue=${expected.finalValue}, model=${valuation.finalValue}, delta=${(finalValueDelta * 100).toFixed(2)}%`);
    t.diagnostic(`Lakhta Excel pricePerM2=${expected.pricePerM2}, model=${valuation.pricePerM2}, delta=${(priceDelta * 100).toFixed(2)}%`);

    assert.ok(finalValueDelta < 0.25, `Lakhta final value deviates too much from Excel reference: ${(finalValueDelta * 100).toFixed(2)}%`);
    assert.ok(priceDelta < 0.25, `Lakhta price/m² deviates too much from Excel reference: ${(priceDelta * 100).toFixed(2)}%`);
});

test('Premier Liga workbook control case stays within diagnostic corridor against Excel reference', async (t) => {
    const workbookPath = 'c:\\files\\Система\\Загрузки\\Adobe Photoshop 2025 26.6.0 Multi x64\\Telegram Desktop\\01_03_26_Пример_расчета_БЦ_Премьер_Лига_3_очередь.xlsx';
    const expected = {
        finalValue: 1437946750.9973345,
        pricePerM2: 76281.21921834502,
    };
    const { questionnaire, selectedAnalogs } = loadControlCase('calculateValuation keeps explainable output for Premier Liga-like case');
    const valuation = await calculateValuation(questionnaire, selectedAnalogs, 0);
    const finalValueDelta = relativeDelta(valuation.finalValue, expected.finalValue);
    const priceDelta = relativeDelta(valuation.pricePerM2, expected.pricePerM2);

    t.diagnostic(`Workbook: ${workbookPath}`);
    t.diagnostic(`Premier Liga Excel finalValue=${expected.finalValue}, model=${valuation.finalValue}, delta=${(finalValueDelta * 100).toFixed(2)}%`);
    t.diagnostic(`Premier Liga Excel pricePerM2=${expected.pricePerM2}, model=${valuation.pricePerM2}, delta=${(priceDelta * 100).toFixed(2)}%`);

    assert.ok(finalValueDelta < 0.25, `Premier Liga final value deviates too much from Excel reference: ${(finalValueDelta * 100).toFixed(2)}%`);
    assert.ok(priceDelta < 0.25, `Premier Liga price/m² deviates too much from Excel reference: ${(priceDelta * 100).toFixed(2)}%`);
});
