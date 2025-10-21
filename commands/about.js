// commands/about.js
export default {
  name: 'about',
  description: 'Short about text',
  async execute({ sock, msg, jid }) {
    await sock.sendMessage(jid, { text: 'I am Acheron — your dark companion.' }, { quoted: msg });
  }
};
