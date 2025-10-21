// commands/prefix.js
import { readFile, writeFile } from 'fs/promises';

export default {
  name: 'prefix',
  description: 'Change command prefix (admin-only)',
  adminOnly: true,
  async execute({ sock, msg, jid, args, logger, configPath }) {
    try {
      const newPrefix = args[0];
      if (!newPrefix) {
        await sock.sendMessage(jid, { text: 'Usage: !prefix <newPrefix>' }, { quoted: msg });
        return;
      }
      const cfg = JSON.parse(await readFile(configPath, 'utf8'));
      cfg.prefix = newPrefix;
      await writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      await sock.sendMessage(jid, { text: `Prefix updated to "${newPrefix}"` }, { quoted: msg });
    } catch (err) {
      logger.error('prefix command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to update prefix.' }, { quoted: msg });
    }
  }
};
