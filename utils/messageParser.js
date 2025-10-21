// utils/messageParser.js
export function parseMessage(msg) {
  try {
    if (!msg) return null;
    const message = msg.message || {};
    const key = msg.key || {};
    const jid = key.remoteJid || key.participant || null;

    let text = '';
    if (message.conversation) text = message.conversation;
    else if (message.extendedTextMessage && message.extendedTextMessage.text) text = message.extendedTextMessage.text;
    else if (message.imageMessage && message.imageMessage.caption) text = message.imageMessage.caption;
    else if (message.videoMessage && message.videoMessage.caption) text = message.videoMessage.caption;
    else if (message.documentMessage && message.documentMessage.caption) text = message.documentMessage.caption;
    else text = '';

    text = text?.toString?.().trim?.() || '';
    return { text, jid };
  } catch (err) {
    console.error('[messageParser] parse error', err);
    return null;
  }
}
