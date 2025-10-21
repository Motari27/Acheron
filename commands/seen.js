// commands/seen.js
import { readFile } from 'fs/promises';

export default {
  name: 'seen',
  description: 'Tells when Acheron last saw a user. Usage: !seen 1234567890@s.whatsapp.net or !seen me',
  async execute({ sock, msg, jid, args, logger }) {
    try {
      const target = args[0];
      if (!target) {
        await sock.sendMessage(jid, { text: 'Usage: !seen <jid|me>' }, { quoted: msg });
        return;
      }
      const { readJSON } = await import('../utils/fileUtils.js');
      const users = await readJSON('./data/users.json');
      let lookupJid = target === 'me' ? (msg.key.participant || msg.key.remoteJid) : target;
      const info = users[lookupJid];
      if (!info) {
        await sock.sendMessage(jid, { text: `I have not seen ${lookupJid}.` }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { text: `${info.pushName || 'Unknown'} (${lookupJid}) — last seen: ${info.lastSeen}, messages: ${info.messageCount}` }, { quoted: msg });
    } catch (err) {
      logger.error('seen command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to retrieve seen info.' }, { quoted: msg });
    }
  }
};
