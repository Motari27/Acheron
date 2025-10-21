// commands/stats.js
import { readFile } from 'fs/promises';

export default {
  name: 'stats',
  description: 'Shows bot stats and top active users',
  async execute({ sock, msg, jid, logger }) {
    try {
      const { readJSON } = await import('../utils/fileUtils.js');
      const stats = await readJSON('./data/stats.json');
      const users = await readJSON('./data/users.json');
      // get top 5 users by messageCount
      const arr = Object.values(users || {}).sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 5);
      const top = arr.map((u, i) => `${i + 1}. ${u.pushName || 'Unknown'} — ${u.messageCount || 0} messages (${u.jid})`).join('\n') || 'No users yet.';
      const text = [
        '*Acheron Stats*',
        `Total messages seen: ${stats.totalMessages || 0}`,
        `Known users: ${Object.keys(users || {}).length}`,
        '',
        '*Top users*',
        top
      ].join('\n');
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (err) {
      logger.error('stats command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to load stats.' }, { quoted: msg });
    }
  }
};
