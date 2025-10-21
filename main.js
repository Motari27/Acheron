// main.js (Acheron v4)
// ESM entry point
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import express from 'express';

import { logger } from './utils/logger.js';
import { parseMessage } from './utils/messageParser.js';
import { ensureFolder, readJSON, writeJSON } from './utils/fileUtils.js';
import * as db from './utils/db.js';
import * as mem from './utils/memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_DIR = path.join(__dirname, 'session');
const LOGS_DIR = path.join(__dirname, 'logs');
const DATA_DIR = path.join(__dirname, 'data');
const CMD_DIR = path.join(__dirname, 'commands');
const CONFIG_PATH = path.join(__dirname, 'config.json');

let sock = null;
let commands = new Map();

async function loadConfig() {
  try {
    return await readJSON(CONFIG_PATH);
  } catch {
    const defaultConfig = {
      prefix: '!',
      owner: '1234567890@s.whatsapp.net',
      chatMode: false,
      typingDelayMs: 800,
      mood: 'calm',
      memoryPruneDays: 30,
      dashboardPort: 3000
    };
    await writeJSON(CONFIG_PATH, defaultConfig);
    return defaultConfig;
  }
}

async function loadCommands() {
  const files = await fs.readdir(CMD_DIR);
  const map = new Map();
  await Promise.all(files.map(async (f) => {
    if (!f.endsWith('.js')) return;
    const mod = await import(path.join(CMD_DIR, f));
    const cmd = mod.default;
    if (cmd && cmd.name) map.set(cmd.name, cmd);
  }));
  return map;
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

async function startDashboard(port) {
  const app = express();
  app.get('/', (req, res) => {
    try {
      const stats = db.getStats();
      const top = db.getTopUsers(10);
      // build simple HTML (self-contained)
      const html = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>Acheron Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0f0f12; color: #e6e6e6; padding: 20px; }
            h1 { color: #f6c85f; }
            .card { background: #111216; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
            table { width:100%; border-collapse: collapse; }
            th, td { padding:8px; text-align:left; border-bottom:1px solid #222; }
            a { color:#9ecbff; text-decoration:none; }
          </style>
        </head>
        <body>
          <h1>🖤 Acheron — Dashboard</h1>
          <div class="card">
            <strong>Total messages:</strong> ${stats.totalMessages} <br/>
            <strong>Known users:</strong> ${stats.usersCount}
          </div>
          <div class="card">
            <h3>Top users</h3>
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Messages</th><th>JID</th></tr></thead>
              <tbody>
                ${top.map((u,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(u.pushName||'Unknown')}</td><td>${u.messageCount||0}</td><td>${u.jid}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <footer style="opacity:0.7">Local dashboard — offline only.</footer>
        </body>
        </html>
      `.trim();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).send('Dashboard error');
    }
  });

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  app.listen(port, () => logger.info(`Dashboard running at http://localhost:${port}`));
}

async function start() {
  const cfg = await loadConfig();

  try {
    await ensureFolder(SESSION_DIR);
    await ensureFolder(DATA_DIR);
    // init db
    db.initDB(DATA_DIR);
    // optional migration from JSON data (safe)
    await db.migrateFromJson(DATA_DIR).catch(()=>{});

    // init memory engine (for replies) using db (it expects db-backed functions)
    mem.initWithDB(db, cfg.memoryPruneDays || 30);

    // load commands
    commands = await loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 2314, 3] }));

    sock = makeWASocket({ version, auth: state, printQRInTerminal: false });
    sock.ev.on('creds.update', saveCreds);

    logger.ready('⚡ Acheron is online.');

    sock.ev.on('connection.update', (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { qrcode.generate(qr, { small: true }); logger.info('QR generated — scan with WhatsApp.'); }
        if (connection === 'open') logger.connected('Connected to WhatsApp.');
        else if (connection === 'connecting') logger.info('Connecting...');
        else if (connection === 'close') {
          const reason = (lastDisconnect && lastDisconnect.error) ? lastDisconnect.error : null;
          logger.warn('Connection closed. Reason: ' + (reason ? JSON.stringify(reason) : 'unknown'));
          const isLoggedOut = reason && (reason?.output?.statusCode === DisconnectReason.loggedOut || /logged out/i.test(String(reason)));
          if (isLoggedOut) {
            logger.error('Logged out. Remove session folder and re-scan QR.');
          } else {
            logger.warn('Attempting reconnect in 3s...');
            setTimeout(()=>start().catch(e=>logger.error('Reconnect failed: '+(e.stack||e))), 3000);
          }
        }
      } catch (err) { logger.error('connection.update err: ' + (err.stack||err)); }
    });

    // messages
    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (!m || !m.messages) return;
        const msg = m.messages[0];
        if (!msg || !msg.message) return;
        if (msg.key?.fromMe) return;

        const parsed = parseMessage(msg);
        if (!parsed) return;
        const { text } = parsed;
        if (!text) return;

        const remoteJid = msg.key.remoteJid || parsed.jid;
        const participant = msg.key.participant || remoteJid;
        const pushName = msg.pushName || 'Unknown';
        const isGroup = remoteJid.endsWith('@g.us');

        // log to file
        await logMessage(`${remoteJid} -> ${text.replace(/\n/g,'\\n')}`);

        // record to DB
        db.recordMessage(isGroup ? participant : remoteJid, pushName);

        // dynamic prefix: per-chat or global fallback to config
        const perPrefix = db.getPrefixFor(remoteJid) || db.getPrefixFor(participant) || db.getGlobalPrefix();
        const prefix = perPrefix || cfg.prefix || '!';

        // handle commands
        if (text.startsWith(prefix)) {
          const body = text.slice(prefix.length).trim();
          if (!body) return;
          const [rawCmd, ...args] = body.split(/\s+/);
          const cmdName = rawCmd.toLowerCase();
          if (commands.has(cmdName)) {
            const cmd = commands.get(cmdName);
            try {
              if (cmd.adminOnly && cfg.owner !== (participant || remoteJid)) {
                await sock.sendMessage(remoteJid, { text: '⚠️ You are not authorized to use this command.' }, { quoted: msg });
                return;
              }
              await cmd.execute({ sock, msg, jid: remoteJid, args, logger, configPath: CONFIG_PATH, db });
            } catch (err) {
              logger.error(`Command ${cmdName} failed: ${err?.stack||err}`);
              await sock.sendMessage(remoteJid, { text: '⚠️ Command failed to execute.' }, { quoted: msg });
            }
          } else {
            await sock.sendMessage(remoteJid, { text: `Unknown command. Use ${prefix}help to list commands.` }, { quoted: msg });
          }
          return;
        }

        // non-command chatMode
        const freshCfg = await loadConfig();
        if (freshCfg.chatMode) {
          try {
            await sock.sendPresenceUpdate('composing', remoteJid).catch(()=>{});
            await new Promise(res => setTimeout(res, freshCfg.typingDelayMs||800));
            await sock.sendPresenceUpdate('available', remoteJid).catch(()=>{});
            const reply = mem.generateOfflineReply(text, freshCfg.mood||'calm');
            await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
          } catch (err) { logger.error('Chat reply failed: '+(err.stack||err)); }
        }

      } catch (err) {
        logger.error('messages.upsert error: '+(err.stack||err));
      }
    });

    // group participants update
    sock.ev.on('group-participants.update', async (gp) => {
      try {
        for (const p of gp.participants) {
          db.ensureUser(p);
        }
        logger.info(`Group update (${gp.action}) logged`);
      } catch (err) {
        logger.error('group update err: ' + (err.stack||err));
      }
    });

    // dashboard
    startDashboard(cfg.dashboardPort || 3000);

    // periodic prune using the memory module
    setInterval(async ()=> {
      try { await mem.pruneOld(); }
      catch(e){ logger.error('Prune error: '+(e.stack||e)); }
    }, 12*3600*1000);

    // process-level handlers
    process.on('unhandledRejection', (r,p)=> logger.error(`Unhandled Rejection: ${r}`));
    process.on('uncaughtException', (e)=> logger.error('Uncaught Exception: '+(e.stack||e)));

  } catch (err) {
    logger.error('Start fatal: ' + (err.stack || err));
    setTimeout(()=>start().catch(e=>logger.error('Retry failed: '+(e.stack||e))),3000);
  }
}

start().catch(e=>logger.error('Start failed: '+(e.stack||e)));
