// main.js
// Acheron v3 - Entry point
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import { logger } from './utils/logger.js';
import { parseMessage } from './utils/messageParser.js';
import { ensureFolder, readJSON, writeJSON } from './utils/fileUtils.js';
import * as memory from './utils/memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_DIR = path.join(__dirname, 'session');
const CMD_DIR = path.join(__dirname, 'commands');
const LOGS_DIR = path.join(__dirname, 'logs');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(__dirname, 'config.json');

let sock = null;
let commands = new Map();

async function loadConfig() {
  try {
    const cfg = await readJSON(CONFIG_PATH);
    return cfg;
  } catch (err) {
    logger.warn('config.json not found — creating default config.json');
    const defaultConfig = {
      prefix: '!',
      owner: '1234567890@s.whatsapp.net',
      chatMode: false,
      typingDelayMs: 800,
      mood: 'calm',
      memoryPruneDays: 30
    };
    await writeJSON(CONFIG_PATH, defaultConfig);
    return defaultConfig;
  }
}

async function loadCommands() {
  try {
    const files = await fs.readdir(CMD_DIR);
    const map = new Map();
    await Promise.all(files.map(async (f) => {
      if (!f.endsWith('.js')) return;
      const mod = await import(path.join(CMD_DIR, f));
      const cmd = mod.default;
      if (cmd && cmd.name) {
        map.set(cmd.name, cmd);
        logger.info(`Loaded command: ${cmd.name}`);
      }
    }));
    return map;
  } catch (err) {
    logger.error('Failed to load commands: ' + (err.stack || err));
    return new Map();
  }
}

async function logMessage(line) {
  try {
    await ensureFolder(LOGS_DIR);
    const file = path.join(LOGS_DIR, 'messages.log');
    const out = `[${new Date().toISOString()}] ${line}\n`;
    await fs.appendFile(file, out, 'utf8');
  } catch (err) {
    logger.error('Failed to append message log: ' + (err.stack || err));
  }
}

async function start() {
  const config = await loadConfig();

  try {
    await ensureFolder(SESSION_DIR);
    await ensureFolder(DATA_DIR);
    await memory.init(DATA_DIR, config.memoryPruneDays || 30);

    commands = await loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 2314, 3] }));

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    logger.ready('⚡ Acheron is online.');

    sock.ev.on('connection.update', (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          qrcode.generate(qr, { small: true });
          logger.info('QR generated — scan with WhatsApp.');
        }
        if (connection === 'open') {
          logger.connected('Connected to WhatsApp.');
        } else if (connection === 'connecting') {
          logger.info('Connecting to WhatsApp...');
        } else if (connection === 'close') {
          const reason = (lastDisconnect && lastDisconnect.error) ? lastDisconnect.error : null;
          logger.warn('Connection closed. Reason: ' + (reason ? JSON.stringify(reason) : 'unknown'));
          const isLoggedOut = reason && (reason?.output?.statusCode === DisconnectReason.loggedOut || /logged out/i.test(String(reason)));
          if (isLoggedOut) {
            logger.error('Logged out. Remove session folder and re-scan QR.');
          } else {
            logger.warn('Attempting reconnect in 3s...');
            setTimeout(() => start().catch(e => logger.error('Reconnect failed: ' + (e.stack || e))), 3000);
          }
        }
      } catch (err) {
        logger.error('connection.update handler error: ' + (err.stack || err));
      }
    });

    // handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (!m || !m.messages) return;
        const msg = m.messages[0];
        if (!msg || !msg.message) return;
        if (msg.key?.fromMe) return;

        const parsed = parseMessage(msg);
        if (!parsed) return;
        const { text, jid } = parsed;
        if (!text) return;

        // log to file
        await logMessage(`${jid} -> ${text.replace(/\n/g, '\\n')}`);

        // update memory (user stats)
        const pushName = msg.pushName || 'Unknown';
        const isGroup = jid.endsWith('@g.us');
        await memory.recordMessage(msg.key.remoteJid || jid, msg.key.participant || msg.key.remoteJid, pushName, isGroup);

        // reload config each message (allows dynamic edits)
        const cfg = await loadConfig();
        const prefix = (cfg.prefix || '!').toString();

        // handle commands
        if (text.startsWith(prefix)) {
          const body = text.slice(prefix.length).trim();
          if (!body) return;
          const [rawCmd, ...args] = body.split(/\s+/);
          const cmdName = rawCmd.toLowerCase();

          if (commands.has(cmdName)) {
            const cmd = commands.get(cmdName);
            try {
              if (cmd.adminOnly && cfg.owner !== (msg.key.participant || msg.key.remoteJid)) {
                await sock.sendMessage(jid, { text: '⚠️ You are not authorized to use this command.' }, { quoted: msg });
                return;
              }
              await cmd.execute({ sock, msg, jid, args, logger, configPath: CONFIG_PATH });
            } catch (err) {
              logger.error(`Command ${cmdName} failed: ` + (err.stack || err));
              await sock.sendMessage(jid, { text: '⚠️ Command execution failed.' }, { quoted: msg });
            }
          } else {
            await sock.sendMessage(jid, { text: `Unknown command. Use ${prefix}help to list commands.` }, { quoted: msg });
          }
          return;
        }

        // Non-command messages -> auto replies if chatMode on
        if (cfg.chatMode) {
          try {
            await sock.sendPresenceUpdate('composing', jid).catch(() => {});
            await new Promise(res => setTimeout(res, cfg.typingDelayMs || 800));
            await sock.sendPresenceUpdate('available', jid).catch(() => {});
            const reply = memory.generateOfflineReply(text, cfg.mood || 'calm');
            await sock.sendMessage(jid, { text: reply }, { quoted: msg });
          } catch (err) {
            logger.error('Failed to send chat reply: ' + (err.stack || err));
          }
        }

      } catch (err) {
        logger.error('messages.upsert handler error: ' + (err.stack || err));
      }
    });

    // group participants update -> scan members on join/leave
    sock.ev.on('group-participants.update', async (gp) => {
      try {
        // gp: { id, participants, action }
        const groupId = gp.id;
        for (const p of gp.participants) {
          // p is JID
          await memory.ensureUserExists(p);
        }
        logger.info(`Group update (${gp.action}) logged for ${gp.participants.length} participant(s) in ${groupId}`);
      } catch (err) {
        logger.error('group-participants.update handler error: ' + (err.stack || err));
      }
    });

    // periodic prune (every 12 hours) to keep memory small
    setInterval(async () => {
      try {
        await memory.pruneOld();
      } catch (err) {
        logger.error('Memory prune error: ' + (err.stack || err));
      }
    }, 12 * 3600 * 1000);

    // process-level handlers
    process.on('unhandledRejection', (reason, p) => {
      logger.error(`Unhandled Rejection at: Promise ${p} reason: ${reason}`);
    });
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception: ' + (err.stack || err));
    });

  } catch (err) {
    logger.error('Fatal start error: ' + (err.stack || err));
    setTimeout(() => start().catch(e => logger.error('Retry start failed: ' + (e.stack || e))), 3000);
  }
}

start().catch(e => logger.error('Start failed: ' + (e.stack || e)));
