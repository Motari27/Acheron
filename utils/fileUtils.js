// utils/fileUtils.js
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function ensureFolder(folderPath) {
  try {
    await fs.mkdir(folderPath, { recursive: true });
  } catch (err) {
    // ignore
  }
}

export async function readJSON(filePath) {
  if (!existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJSON(filePath, obj) {
  const dir = path.dirname(filePath);
  await ensureFolder(dir);
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
}
