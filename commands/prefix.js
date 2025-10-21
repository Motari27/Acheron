// commands/prefix.js
export default {
  name: 'prefix',
  description: 'Change command prefix. Usage: !prefix <new> OR !prefix global <new>',
  adminOnly: false,
  async execute({ sock, msg, jid, args, logger, configPath, db }) {
    try {
      if (!args || args.length === 0) {
        await sock.sendMessage(jid, { text: 'Usage: !prefix <new> OR !prefix global <new>' }, { quoted: msg });
        return;
      }
      if (args[0] === 'global') {
        // only owner allowed to set global
        const cfg = JSON.parse(await (await import('fs/promises')).readFile(configPath, 'utf8'));
        const actor = msg.key.participant || msg.key.remoteJid;
        if (cfg.owner !== actor) {
          await sock.sendMessage(jid, { text: 'Only owner can set global prefix.' }, { quoted: msg });
          return;
        }
        const newPref = args[1];
        if (!newPref) { await sock.sendMessage(jid, { text: 'Provide a new prefix.' }, { quoted: msg }); return; }
        db.setGlobalPrefix(newPref);
        await sock.sendMessage(jid, { text: `Global prefix set to "${newPref}"` }, { quoted: msg });
        return;
      }
      // per-chat/user prefix
      const newPrefix = args[0];
      if (!newPrefix) { await sock.sendMessage(jid, { text: 'Provide a new prefix.' }, { quoted: msg }); return; }
      const targetJid = msg.key.remoteJid; // set for this chat
      db.setPrefixFor(targetJid, newPrefix);
      await sock.sendMessage(jid, { text: `Prefix for this chat set to "${newPrefix}"` }, { quoted: msg });
    } catch (err) {
      logger.error('prefix cmd error: '+(err.stack||err));
      await sock.sendMessage(jid, { text: 'Failed to change prefix.' }, { quoted: msg });
    }
  }
};
