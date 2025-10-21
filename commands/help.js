// commands/help.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: 'help',
  description: 'Lists available commands',
  async execute({ sock, msg, jid, logger, db, configPath }) {
    try {
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const globalPrefix = db.getGlobalPrefix() || cfg.prefix || '!';
      const files = await fs.readdir(__dirname);
      const lines = [`*Acheron — Commands* (prefix for this chat: ${db.getPrefixFor(jid) || globalPrefix})`, ''];
      for (const f of files) {
        if (!f.endsWith('.js')) continue;
        const mod = await import(path.join(__dirname, f));
        const cmd = mod.default;
        if (cmd && cmd.name) {
          lines.push(`${globalPrefix}${cmd.name} - ${cmd.description || 'No description'}`);
        }
      }
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg });
    } catch (err) {
      logger.error('help command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to load help.' }, { quoted: msg });
    }
  }
};
