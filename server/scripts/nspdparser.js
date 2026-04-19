#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverRootDir = path.resolve(currentDir, '..');
dotenv.config({ path: path.join(serverRootDir, '.env'), quiet: true });
const { getCadastralInfoFromNspd } = await import('../services/nspdParserService.js');

const cadastralNumber = String(process.argv[2] || '').trim();
const mode = String(process.argv[3] || 'auto').trim().toLowerCase();

if (!cadastralNumber) {
  console.log(JSON.stringify({
    success: false,
    error: 'Не передан кадастровый номер',
  }));
  process.exit(1);
}

if (!['auto', 'building', 'land'].includes(mode)) {
  console.log(JSON.stringify({
    success: false,
    error: `Некорректный режим: ${mode}`,
  }));
  process.exit(1);
}

const result = await getCadastralInfoFromNspd(cadastralNumber, { mode });
console.log(JSON.stringify(result));
