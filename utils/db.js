// utils/db.js
// Simple SQLite wrapper using better-sqlite3
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFolder } from './fileUtils.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let dbPath = null;

export function initDB(dataDir) {
  dbPath = path.join(dataDir, 'acheron.db');
  ensureFolder(dataDir).catch(()=>{});
  // open database (synchronous)
  db = new Database(dbPath);
  _migrate();
}

// create tables if they don't exist
function _migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      jid TEXT PRIMARY KEY,
      pushName TEXT,
      messageCount INTEGER DEFAULT 0,
      lastSeen TEXT
    );
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS prefixes (
      jid TEXT PRIMARY KEY, -- chat or user jid; use 'global' for global default
      prefix TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  // ensure totalMessages exists
  const row = db.prepare(`SELECT value FROM stats WHERE key = 'totalMessages'`).get();
  if (!row) {
    db.prepare(`INSERT INTO stats (key, value) VALUES ('totalMessages', '0')`).run();
  }
  // ensure global prefix may be set later via config.json
}

// record a message
export function recordMessage(jid, pushName = 'Unknown') {
  if (!db) throw new Error('DB not initialized');
  const now = new Date().toISOString();

  const user = db.prepare('SELECT * FROM users WHERE jid = ?').get(jid);
  if (!user) {
    db.prepare('INSERT INTO users (jid, pushName, messageCount, lastSeen) VALUES (?, ?, ?, ?)').run(jid, pushName, 1, now);
  } else {
    db.prepare('UPDATE users SET messageCount = messageCount + 1, pushName = ?, lastSeen = ? WHERE jid = ?').run(pushName || user.pushName, now, jid);
  }
  // increment global stat
  db.prepare(`UPDATE stats SET value = CAST(value AS INTEGER) + 1 WHERE key = 'totalMessages'`).run();
}

// ensure user exists (for group participants)
export function ensureUser(jid, pushName = 'Unknown') {
  if (!db) throw new Error('DB not initialized');
  const user = db.prepare('SELECT jid FROM users WHERE jid = ?').get(jid);
  if (!user) {
    db.prepare('INSERT INTO users (jid, pushName, messageCount, lastSeen) VALUES (?, ?, ?, ?)').run(jid, pushName, 0, new Date().toISOString());
  }
}

// get user object
export function getUser(jid) {
  if (!db) return null;
  return db.prepare('SELECT * FROM users WHERE jid = ?').get(jid);
}

// get stats
export function getStats() {
  if (!db) return { totalMessages: 0, usersCount: 0 };
  const row = db.prepare('SELECT value FROM stats WHERE key = ?').get('totalMessages');
  const totalMessages = row ? parseInt(row.value || '0', 10) : 0;
  const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  return { totalMessages, usersCount };
}

// get top N users
export function getTopUsers(limit = 5) {
  if (!db) return [];
  return db.prepare('SELECT * FROM users ORDER BY messageCount DESC LIMIT ?').all(limit);
}

// prefix functions
export function setPrefixFor(jid, prefix) {
  if (!db) throw new Error('DB not initialized');
  db.prepare('INSERT INTO prefixes (jid, prefix) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET prefix = excluded.prefix').run(jid, prefix);
}

export function getPrefixFor(jid) {
  if (!db) return null;
  const row = db.prepare('SELECT prefix FROM prefixes WHERE jid = ?').get(jid);
  return row ? row.prefix : null;
}

export function setGlobalPrefix(prefix) {
  setPrefixFor('global', prefix);
}

export function getGlobalPrefix() {
  const row = db.prepare('SELECT prefix FROM prefixes WHERE jid = ?').get('global');
  return row ? row.prefix : null;
}

// migrate JSON files into DB (if present). safe: won't duplicate
export async function migrateFromJson(dataDir) {
  try {
    const usersPath = path.join(dataDir, 'users.json');
    const statsPath = path.join(dataDir, 'stats.json');
    const exists = async (p) => {
      try { await fs.access(p); return true; } catch { return false; }
    };
    if (await exists(usersPath)) {
      const content = JSON.parse(await fs.readFile(usersPath, 'utf8'));
      const insert = db.prepare('INSERT OR REPLACE INTO users (jid, pushName, messageCount, lastSeen) VALUES (?, ?, ?, ?)');
      for (const [jid, u] of Object.entries(content)) {
        insert.run(jid, u.pushName || 'Unknown', u.messageCount || 0, u.lastSeen || new Date().toISOString());
      }
    }
    if (await exists(statsPath)) {
      const content = JSON.parse(await fs.readFile(statsPath, 'utf8'));
      if (content && typeof content.totalMessages !== 'undefined') {
        db.prepare(`INSERT INTO stats (key, value) VALUES ('totalMessages', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(content.totalMessages || 0));
      }
    }
    return true;
  } catch (err) {
    console.error('[DB] migrateFromJson error', err);
    return false;
  }
}
