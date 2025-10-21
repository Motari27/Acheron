// commands/ping.js
export default {
  name: 'ping',
  description: 'Replies with Pong',
  async execute({ sock, msg, jid }) {
    try {
      await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: msg });
    } catch (err) {
      console.error('ping command error', err);
    }
  }
};
