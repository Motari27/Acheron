// commands/restart.js
export default {
  name: 'restart',
  description: 'Restart Acheron (admin-only)',
  adminOnly: true,
  async execute({ sock, msg, jid, logger }) {
    try {
      await sock.sendMessage(jid, { text: 'Restarting Acheron...' }, { quoted: msg });
      setTimeout(() => {
        logger.info('Restarting per owner command. Exiting process.');
        process.exit(0);
      }, 1000);
    } catch (err) {
      logger.error('restart command error: ' + (err.stack || err));
      await sock.sendMessage(jid, { text: 'Failed to restart.' }, { quoted: msg });
    }
  }
};
