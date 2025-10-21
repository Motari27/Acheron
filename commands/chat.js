// commands/chat.js
import { readFile, writeFile } from 'fs/promises';

export default {
  name: 'chat',
  description: 'Toggle chat mode on/off (offline)',
  adminOnly: true,
  async execute({ sock, msg, jid, args, logger, configPath }) {
    try {
      const mode = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(mode)) {
        await sock.sendMessage(jid, { text: 'Usage: !chat on | !chat off' }, { quoted: msg });
        return;
      }
      const cfg = JSON.parse(await readFile(configPath, 'utf8'));
      cfg.chatMode = (mode === 'on');
      await writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      await sock.sendMessage(jid, { text: `Chat mode set to ${cfg.chatMode}` }, { quoted: msg });
    } catch (err) {
      logger.error('chat command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to toggle chat mode.' }, { quoted: msg });
    }
  }
};
