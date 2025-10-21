// commands/mood.js
import { readFile, writeFile } from 'fs/promises';

export default {
  name: 'mood',
  description: 'Set or view Acheron mood. Usage: !mood [calm|cold|cryptic]',
  adminOnly: true,
  async execute({ sock, msg, jid, args, logger, configPath }) {
    try {
      const arg = (args[0] || '').toLowerCase();
      const cfg = JSON.parse(await readFile(configPath, 'utf8'));
      if (!arg) {
        await sock.sendMessage(jid, { text: `Current mood: ${cfg.mood || 'calm'}` }, { quoted: msg });
        return;
      }
      if (!['calm', 'cold', 'cryptic'].includes(arg)) {
        await sock.sendMessage(jid, { text: 'Invalid mood. Options: calm, cold, cryptic' }, { quoted: msg });
        return;
      }
      cfg.mood = arg;
      await writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      await sock.sendMessage(jid, { text: `Mood set to ${arg}` }, { quoted: msg });
    } catch (err) {
      logger.error('mood command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to change mood.' }, { quoted: msg });
    }
  }
};
