// utils/memory.js
// Memory & Awareness Layer for Acheron v3
import path from 'path';
import { fileURLToPath } from 'url';
import { readJSON, writeJSON, ensureFolder } from './fileUtils.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DATA_DIR = null;
let USERS_FILE = null;
let STATS_FILE = null;
let pruneDays = 30;

// internal in-memory cache to reduce I/O
let usersCache = {};
let statsCache = { totalMessages: 0 };

// initialize files
export async function init(dataDir, pruneDaysArg = 30) {
  DATA_DIR = dataDir;
  pruneDays = pruneDaysArg;
  USERS_FILE = path.join(DATA_DIR, 'users.json');
  STATS_FILE = path.join(DATA_DIR, 'stats.json');

  await ensureFolder(DATA_DIR);
  // ensure files exist
  if (!(await exists(USERS_FILE))) {
    await writeJSON(USERS_FILE, {});
  }
  if (!(await exists(STATS_FILE))) {
    await writeJSON(STATS_FILE, { totalMessages: 0 });
  }
  // load caches
  usersCache = await readJSON(USERS_FILE);
  statsCache = await readJSON(STATS_FILE);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

// ensure user object exists
export async function ensureUserExists(jid, pushName = 'Unknown') {
  if (!jid) return;
  if (!usersCache[jid]) {
    usersCache[jid] = {
      jid,
      pushName: pushName || 'Unknown',
      messageCount: 0,
      lastSeen: new Date().toISOString()
    };
    await persistUsers();
  }
}

// record a message for a user
export async function recordMessage(remoteJid, participantJid, pushName = 'Unknown', isGroup = false) {
  try {
    const jid = isGroup ? participantJid : (participantJid || remoteJid);
    if (!jid) return;
    if (!usersCache[jid]) {
      usersCache[jid] = {
        jid,
        pushName: pushName || 'Unknown',
        messageCount: 0,
        lastSeen: new Date().toISOString()
      };
    }
    const user = usersCache[jid];
    user.pushName = pushName || user.pushName;
    user.messageCount = (user.messageCount || 0) + 1;
    user.lastSeen = new Date().toISOString();

    statsCache.totalMessages = (statsCache.totalMessages || 0) + 1;

    // persist (light throttle not implemented — small bot => fine)
    await Promise.all([persistUsers(), persistStats()]);
  } catch (err) {
    console.error('[memory] recordMessage error', err);
  }
}

async function persistUsers() {
  try {
    await writeJSON(USERS_FILE, usersCache);
  } catch (err) {
    console.error('[memory] persistUsers error', err);
  }
}
async function persistStats() {
  try {
    await writeJSON(STATS_FILE, statsCache);
  } catch (err) {
    console.error('[memory] persistStats error', err);
  }
}

// get user info
export function getUser(jid) {
  return usersCache[jid] || null;
}

// get global stats
export function getStats() {
  return { ...statsCache, usersCount: Object.keys(usersCache).length };
}

// prune memory older than pruneDays (by lastSeen)
export async function pruneOld() {
  try {
    const cutoff = Date.now() - (pruneDays * 24 * 3600 * 1000);
    let removed = 0;
    for (const [jid, user] of Object.entries(usersCache)) {
      const last = new Date(user.lastSeen).getTime();
      if (last < cutoff) {
        delete usersCache[jid];
        removed++;
      }
    }
    if (removed > 0) {
      await persistUsers();
    }
    return removed;
  } catch (err) {
    console.error('[memory] pruneOld error', err);
    return 0;
  }
}

// offline reply generator with mood support
export function generateOfflineReply(text, mood = 'calm') {
  const t = (text || '').toLowerCase();

  // mood variations
  const tones = {
    calm: [
      'The void listens. Speak.',
      'Ever watchful. Ever still.',
      'I am Acheron — your dark companion.'
    ],
    cold: [
      'Silence suits you. Speak quickly.',
      'I watch. Do not test the dark.',
      'I am Acheron. Consider this a warning.'
    ],
    cryptic: [
      'Shadows whisper your name.',
      'The path forks; I know one route.',
      'Ask, and the void shall answer mildly.'
    ]
  };

  // pattern-based replies
  if (t.includes('hello') || t.includes('hi') || t.includes('hey')) {
    return choose(tones[mood] || tones.calm);
  }
  if (t.includes('how are you') || t.includes('how r you')) {
    return choose(tones[mood] || tones.calm);
  }
  if (t.includes('who are you') || t.includes('what are you')) {
    return 'I am Acheron — your dark companion.';
  }
  if (t.includes('thanks') || t.includes('thank you')) {
    return 'Do not thank the darkness; it is simply here.';
  }
  // fallback
  return choose(tones[mood] || tones.calm);
}

function choose(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
