// utils/memory.js
// Offline replies + pruning that uses db module
let db = null;
let pruneDays = 30;

export function initWithDB(dbModule, pruneDaysArg = 30) {
  db = dbModule;
  pruneDays = pruneDaysArg;
}

export async function pruneOld() {
  try {
    if (!db) return;
    // prune by lastSeen older than pruneDays
    const cutoff = Date.now() - pruneDays * 24*3600*1000;
    // using direct DB via db instance (better-sqlite3)
    const users = db.getTopUsers(1000000); // get all (cap large)
    let removed = 0;
    for (const u of users) {
      const last = new Date(u.lastSeen).getTime();
      if (last < cutoff) {
        // remove user
        db.db && db.db.prepare && db.db.prepare('DELETE FROM users WHERE jid = ?').run(u.jid); // try direct if exposed
        // fallback: if db does not expose .db, attempt via available function not present — skip
        removed++;
      }
    }
    return removed;
  } catch (err) {
    console.error('[memory] pruneOld err', err);
    return 0;
  }
}

export function generateOfflineReply(text, mood = 'calm') {
  const t = (text || '').toLowerCase();

  const tones = {
    calm: ['The void listens. Speak.','Ever watchful. Ever still.','I am Acheron — your dark companion.'],
    cold: ['Silence suits you. Speak quickly.','I watch. Do not test the dark.','I am Acheron. Consider this a warning.'],
    cryptic: ['Shadows whisper your name.','The path forks; I know one route.','Ask, and the void shall answer mildly.']
  };

  if (t.includes('hello') || t.includes('hi') || t.includes('hey')) return choose(tones[mood]||tones.calm);
  if (t.includes('how are you') || t.includes('how r you')) return choose(tones[mood]||tones.calm);
  if (t.includes('who are you') || t.includes('what are you')) return 'I am Acheron — your dark companion.';
  if (t.includes('thanks') || t.includes('thank you')) return 'Do not thank the darkness; it is simply here.';
  return choose(tones[mood]||tones.calm);
}

function choose(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
