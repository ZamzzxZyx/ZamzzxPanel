// Telegram: bot, grup, saluran. Kirim pesan/foto, jadwal, notifikasi otomatis, dan login lewat persetujuan di bot.
// Token bot disimpan di data/telegram.json (izin 600) dan tidak pernah dikirim ke browser.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');

const FILE = path.join(__dirname, 'data', 'telegram.json');
const API = process.env.TG_API_BASE || 'https://api.telegram.org';
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const TYPE_LABEL = { private: 'Pribadi', group: 'Grup', supergroup: 'Grup', channel: 'Saluran' };

const blank = () => ({ token: '', apiBase: '', uploader: null, uploaderCfg: null, bot: null, ownerId: 0, ownerName: '', targets: [], notify: { enabled: true, apk: true, apkFile: false, site: true, targets: [] }, schedules: [], seen: [], log: [] });
function load() {
  try { return { ...blank(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) { return blank(); }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}
function tokenOf(db) {
  if (db.token) return db.token;
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  try {
    const m = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  } catch (_) {}
  return '';
}
const normToken = (t) => String(t || '').trim().replace(/^["']|["']$/g, '').replace(/^bot/i, '').replace(/\s+/g, '');
const TOKEN_RX = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;

const MB = 1024 * 1024;
const LIMIT_CLOUD = 50 * MB, LIMIT_LOCAL = 2000 * MB;
const baseUrl = () => load().apiBase || process.env.TG_API_BASE || API;
const uploaderOf = () => { const u = load().uploader; return u && u.url ? u : null; };
const maxBytes = () => (load().apiBase || uploaderOf() ? LIMIT_LOCAL : LIMIT_CLOUD);

// Rapikan galat Telegram jadi pesan yang jelas
function tgFail(r, j) {
  const d = String((j && j.description) || '');
  const retry = j && j.parameters && j.parameters.retry_after;
  let msg = d ? `Telegram: ${d}` : `Telegram menolak permintaan (HTTP ${r.status}).`;
  if (r.status === 401) msg = 'Token bot ditolak Telegram. Salin ulang dari @BotFather.';
  else if (/chat not found/i.test(d)) msg = 'Chat tidak ditemukan. Pastikan bot sudah ditambahkan ke grup/saluran itu (atau pengguna sudah menekan Start).';
  else if (/kicked|was blocked|bot is not a member|not a member of the (channel|supergroup)/i.test(d)) msg = 'Bot dikeluarkan atau diblokir di chat itu. Tambahkan lagi bot-nya.';
  else if (/not enough rights|have no rights|administrator rights|CHAT_WRITE_FORBIDDEN|need administrator/i.test(d)) msg = 'Bot tidak punya izin mengirim di sana. Jadikan bot admin (untuk saluran, izinkan "Post messages").';
  else if (/can't parse entities/i.test(d)) msg = 'Format HTML pesan tidak valid. Tutup semua tag atau pakai teks biasa.';
  else if (/wrong file identifier|failed to get http url content|wrong type of the web page content|IMAGE_PROCESS_FAILED/i.test(d)) msg = 'Telegram tidak bisa mengambil gambar dari link itu. Pakai link gambar publik (PNG/JPG/WebP).';
  else if (r.status === 413 || /file is too big|request entity too large/i.test(d)) msg = 'File terlalu besar untuk server Bot API ini (cloud maksimal 50 MB). Pakai Bot API lokal untuk sampai 2 GB.';
  else if (r.status === 429) msg = `Terlalu banyak pesan, Telegram minta tunggu ${retry || 'beberapa'} detik.`;
  return Object.assign(new Error(msg), { status: r.status === 429 ? 429 : 422, retry, tgStatus: r.status, tgDesc: d });
}
const netFail = (e) => Object.assign(new Error(e.name === 'TimeoutError' ? 'Telegram terlalu lama merespons. Coba lagi.' : 'Tidak bisa terhubung ke server Bot API. Cek koneksi atau alamat server.'), { status: 502 });

// Panggil Bot API (base bisa ditimpa untuk uji server lokal atau logout cloud).
async function tg(token, method, params = {}, timeoutMs = 20000, base) {
  if (!token) fail('Bot belum disambungkan. Isi token bot di tab Bot.', 503);
  let r;
  try {
    r = await fetch(`${base || baseUrl()}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { throw netFail(e); }
  const j = await r.json().catch(() => null);
  if (j && j.ok) return j.result;
  throw tgFail(r, j);
}

// Unggah file (multipart, dialirkan dari disk supaya file besar tidak memenuhi RAM)
async function tgUpload(token, method, fields, field, filePath, fileName) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== '' && v != null) fd.append(k, String(v));
  fd.append(field, typeof fs.openAsBlob === 'function' ? await fs.openAsBlob(filePath) : new Blob([fs.readFileSync(filePath)]), fileName);
  let r;
  try { r = await fetch(`${baseUrl()}/bot${token}/${method}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(45 * 60 * 1000) }); }
  catch (e) { throw netFail(e); }
  const j = await r.json().catch(() => null);
  if (j && j.ok) return j.result;
  throw tgFail(r, j);
}

function parseChat(s) {
  s = String(s || '').trim().replace(/^https?:\/\/(t|telegram)\.me\//i, '').replace(/[/?].*$/, '');
  if (/^-?\d{5,}$/.test(s)) return s;
  s = s.replace(/^@/, '');
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)) return '@' + s;
  return null;
}

// Cek status bot di sebuah chat: bisa kirim atau tidak
async function inspect(token, bot, chatRef) {
  const chat = await tg(token, 'getChat', { chat_id: chatRef });
  let role = '', canPost = false, note = '', members = 0;
  if (chat.type === 'private') { role = 'pribadi'; canPost = true; }
  else {
    try {
      const m = await tg(token, 'getChatMember', { chat_id: chat.id, user_id: bot.id });
      role = m.status;
      if (m.status === 'creator') canPost = true;
      else if (m.status === 'administrator') canPost = chat.type === 'channel' ? m.can_post_messages !== false : true;
      else if (m.status === 'member') canPost = chat.type !== 'channel';
      else if (m.status === 'restricted') canPost = m.can_send_messages !== false && chat.type !== 'channel';
      if (!canPost) {
        note = role === 'left' || role === 'kicked' ? 'Bot tidak ada di chat ini.'
          : chat.type === 'channel' ? 'Jadikan bot admin saluran dengan izin "Post messages".' : 'Bot dibatasi, tidak bisa mengirim.';
      }
    } catch (e) { note = e.message; }
    try { members = await tg(token, 'getChatMemberCount', { chat_id: chat.id }); } catch (_) {}
  }
  return { chatId: String(chat.id), type: chat.type, title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id), username: chat.username || '', role, canPost, note, members, checkedAt: new Date().toISOString() };
}

module.exports = function createTelegram({ app, express, wrap, needHeader, makeToken, setSession, sessionTtl }) {
  const state = { gen: 0, pollNote: '', pollOk: false, pending: new Map(), linkCodes: new Map(), loginHits: new Map(), siteFail: new Map(), siteDown: new Map() };
  const T = () => tokenOf(load());
  const cmds = require('./tgcmd')({ app, wrap, needHeader, load, tokenOf, tg, tgUpload, makeToken, baseUrl });
  let uploading = false;

  const addLog = (ok, text) => {
    const db = load(); db.log.unshift({ t: new Date().toISOString(), ok, text: String(text).slice(0, 200) }); db.log = db.log.slice(0, 40); save(db);
  };


  /* ---------- Uploader Python: dijalankan panel sendiri (api_id dan api_hash dari web) ---------- */
  const mgr = { proc: null, state: 'stopped', note: '', log: [], timer: null, backoff: 5000, starting: null };
  const redact = (line) => {
    const db = load(); let t = String(line);
    for (const v of [tokenOf(db), db.uploaderCfg && db.uploaderCfg.apiHash, db.uploader && db.uploader.secret]) if (v && String(v).length > 6) t = t.split(String(v)).join('***');
    return t;
  };
  const pushLog = (chunk) => { for (const l of String(chunk).split(/\r?\n/)) if (l.trim()) mgr.log.push(redact(l).slice(0, 300)); mgr.log = mgr.log.slice(-30); };
  const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const FATAL = [
    [/No module named 'telethon'/, 'Telethon belum terpasang. Di Termux jalankan: pip install telethon'],
    [/ApiIdInvalid|api_id\/api_hash combination is invalid/i, 'api_id dan api_hash tidak cocok. Salin ulang dari my.telegram.org (API development tools).'],
    [/AccessTokenInvalid|access token.*invalid/i, 'Token bot ditolak Telegram. Ganti token di bagian Bot.'],
  ];
  function noteFromLog() {
    const t = mgr.log.join('\n');
    for (const [rx, msg] of FATAL) if (rx.test(t)) return { msg, fatal: true };
    return { msg: mgr.log.length ? mgr.log[mgr.log.length - 1] : 'Skrip uploader berhenti tanpa pesan.', fatal: false };
  }
  function stopProc() {
    const p = mgr.proc; if (!p) return; mgr.proc = null;
    try { p.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} }, 3000).unref();
  }
  function stopManaged(wipe) {
    clearTimeout(mgr.timer); stopProc(); mgr.state = 'stopped'; mgr.note = ''; mgr.backoff = 5000;
    const db = load();
    if (db.uploader && db.uploader.managed) db.uploader = null;
    if (db.uploaderCfg) { if (wipe) db.uploaderCfg = null; else db.uploaderCfg.auto = false; }
    save(db);
  }
  async function spawnPy(env) {
    const script = path.join(__dirname, 'tools', 'tg_uploader.py');
    for (const c of process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python']) {
      try { return await new Promise((res, rej) => { const p = spawn(c, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] }); p.once('error', rej); p.once('spawn', () => res(p)); }); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    throw new Error('Python tidak ditemukan. Di Termux jalankan: pkg install python');
  }
  function startManaged() {
    if (mgr.starting) return mgr.starting;
    mgr.starting = (async () => {
      const db = load(); const cfg = db.uploaderCfg; const token = tokenOf(db);
      if (!cfg || !cfg.apiId || !cfg.apiHash) fail('Isi api_id dan api_hash dulu.');
      if (!token || !db.bot) fail('Sambungkan bot dulu.');
      clearTimeout(mgr.timer); stopProc();
      mgr.state = 'starting'; mgr.note = ''; mgr.log = [];
      cfg.auto = true;
      const secret = (db.uploader && db.uploader.managed && db.uploader.secret) || crypto.randomBytes(24).toString('hex');
      db.uploaderCfg = cfg; save(db);
      const port = await freePort();
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
      let p;
      try {
        p = await spawnPy({ ...process.env, PYTHONUNBUFFERED: '1', TG_API_ID: String(cfg.apiId), TG_API_HASH: cfg.apiHash, TG_BOT_TOKEN: token, UPLOADER_SECRET: secret,
          UPLOADER_PORT: String(port), UPLOADER_HOST: '127.0.0.1', UPLOADER_DIR: require('os').tmpdir(), UPLOADER_SESSION: path.join(__dirname, 'data', `uploader-${db.bot.id}-${cfg.apiId}`) });
      } catch (e) { mgr.state = 'error'; mgr.note = e.message; fail(e.message, 422); }
      mgr.proc = p;
      p.stdout.on('data', pushLog); p.stderr.on('data', pushLog);
      p.once('exit', () => {
        if (mgr.proc !== p) return;
        mgr.proc = null;
        const n = noteFromLog(); mgr.state = 'error'; mgr.note = n.msg;
        if (!n.fatal && load().uploaderCfg && load().uploaderCfg.auto) { mgr.timer = setTimeout(() => startManaged().catch(() => {}), mgr.backoff); mgr.timer.unref(); mgr.backoff = Math.min(mgr.backoff * 2, 60000); }
      });
      const t0 = Date.now();
      while (Date.now() - t0 < 45000 && mgr.proc === p) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Secret': secret }, signal: AbortSignal.timeout(2000) });
          const j = r.ok ? await r.json() : null;
          if (j && j.ok && j.id === db.bot.id) {
            const d2 = load(); d2.uploader = { url: `http://127.0.0.1:${port}`, secret, managed: true }; save(d2);
            mgr.state = 'running'; mgr.note = ''; mgr.backoff = 5000; return;
          }
        } catch (_) {}
        await sleep(700);
      }
      if (mgr.proc === p) { stopProc(); mgr.state = 'error'; mgr.note = noteFromLog().msg; }
      await sleep(50);
      fail(mgr.note || 'Uploader belum siap setelah 45 detik.', 422);
    })().finally(() => { mgr.starting = null; });
    return mgr.starting;
  }
  process.on('exit', () => { if (mgr.proc) { try { mgr.proc.kill(); } catch (_) {} } });

  /* ---------- Kirim ---------- */
  async function sendOne(token, chatId, { text, photoUrl, parse }) {
    const pm = parse === 'HTML' ? { parse_mode: 'HTML' } : {};
    const call = async (method, params) => {
      try { return await tg(token, method, params); }
      catch (e) { if (e.tgStatus === 429 && e.retry && e.retry <= 30) { await sleep(e.retry * 1000 + 300); return tg(token, method, params); } throw e; }
    };
    if (photoUrl) {
      const cap = text && text.length <= 1024 ? text : '';
      await call('sendPhoto', { chat_id: chatId, photo: photoUrl, ...(cap ? { caption: cap, ...pm } : {}) });
      if (text && !cap) await call('sendMessage', { chat_id: chatId, text, ...pm, link_preview_options: { is_disabled: true } });
    } else {
      await call('sendMessage', { chat_id: chatId, text, ...pm });
    }
  }
  function checkPayload(b) {
    const text = String(b.text || '').trim();
    const photoUrl = String(b.photoUrl || '').trim();
    if (!text && !photoUrl) fail('Isi pesan atau link foto minimal salah satu.');
    if (text.length > 4096) fail('Pesan terlalu panjang (maksimal 4096 karakter).');
    if (photoUrl && !/^https?:\/\/\S+$/i.test(photoUrl)) fail('Link foto harus diawali http:// atau https://.');
    return { text, photoUrl, parse: b.parse === 'HTML' ? 'HTML' : '' };
  }
  async function broadcast(ids, payload) {
    const db = load(); const token = tokenOf(db);
    const rows = ids.map((id) => db.targets.find((t) => t.id === id)).filter(Boolean);
    if (!rows.length) fail('Pilih minimal satu target.');
    const results = [];
    for (const t of rows) {
      try { await sendOne(token, t.chatId, payload); results.push({ id: t.id, title: t.title, ok: true }); }
      catch (e) { results.push({ id: t.id, title: t.title, ok: false, error: e.message }); }
      await sleep(80);
    }
    return results;
  }

  // File di atas 50 MB lewat uploader Python (MTProto) kalau Bot API lokal tidak dipakai
  async function viaUploader(u, t, file) {
    let r;
    try {
      r = await fetch(`${u.url}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Secret': u.secret },
        body: JSON.stringify({ chat_id: t.chatId, username: t.username, path: file.path, name: file.name, caption: file.caption, parse: file.parse }),
        signal: AbortSignal.timeout(45 * 60 * 1000),
      });
    } catch (e) { throw Object.assign(new Error('Skrip uploader Python tidak terjangkau. Pastikan tg_uploader.py masih berjalan.'), { status: 502 }); }
    const j = await r.json().catch(() => null);
    if (r.ok && j && j.ok) return j;
    throw Object.assign(new Error((j && j.error) || `Uploader menolak permintaan (HTTP ${r.status}).`), { status: 422 });
  }
  async function sendFileOne(token, t, file) {
    const u = uploaderOf();
    if (u && !load().apiBase && fs.statSync(file.path).size > LIMIT_CLOUD) return viaUploader(u, t, file);
    const run = () => tgUpload(token, 'sendDocument', { chat_id: t.chatId, caption: file.caption, parse_mode: file.parse }, 'document', file.path, file.name);
    try { return await run(); }
    catch (e) { if (e.tgStatus === 429 && e.retry && e.retry <= 30) { await sleep(e.retry * 1000 + 300); return run(); } throw e; }
  }
  async function broadcastFile(ids, file) {
    const db = load(); const token = tokenOf(db);
    const rows = ids.map((id) => db.targets.find((t) => t.id === id)).filter(Boolean);
    if (!rows.length) fail('Pilih minimal satu target.');
    const results = [];
    for (const t of rows) {
      try { await sendFileOne(token, t, file); results.push({ id: t.id, title: t.title, ok: true }); }
      catch (e) { results.push({ id: t.id, title: t.title, ok: false, error: e.message }); }
      await sleep(150);
    }
    return results;
  }
  // Dipakai build APK: kirim file ke target notifikasi kalau opsinya aktif
  async function notifyFile(kind, buf, name, captionHtml) {
    let tmp = '';
    try {
      const db = load(); const n = db.notify;
      if (!tokenOf(db) || !n.enabled || !n[kind] || !n.apkFile || !n.targets.length) return;
      if (buf.length > maxBytes()) {
        return notify(kind, `⚠️ File <b>${esc(name)}</b> (${Math.round(buf.length / MB)} MB) melebihi batas ${Math.round(maxBytes() / MB)} MB, jadi tidak dikirim. Unduh dari tab APK di panel.`);
      }
      tmp = path.join(require('os').tmpdir(), `zz-${crypto.randomBytes(6).toString('hex')}-${name}`);
      fs.writeFileSync(tmp, buf);
      await broadcastFile(n.targets, { path: tmp, name, caption: captionHtml, parse: 'HTML' });
    } catch (_) {} finally { if (tmp) fs.rm(tmp, () => {}); }
  }

  /* ---------- Notifikasi otomatis ---------- */
  async function notify(kind, html) {
    try {
      const db = load(); const token = tokenOf(db); const n = db.notify;
      if (!token || !n.enabled || !n[kind] || !n.targets.length) return;
      const rows = n.targets.map((id) => db.targets.find((t) => t.id === id)).filter(Boolean);
      for (const t of rows) { await sendOne(token, t.chatId, { text: html, parse: 'HTML' }).catch(() => {}); await sleep(80); }
    } catch (_) {}
  }

  /* ---------- Bot: polling (/id, tautkan akun, persetujuan login) ---------- */
  function seenChat(db, chat) {
    if (!chat || !chat.id) return;
    const row = { chatId: String(chat.id), type: chat.type, title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id), username: chat.username || '', t: new Date().toISOString() };
    db.seen = [row, ...db.seen.filter((x) => x.chatId !== row.chatId)].slice(0, 40);
  }
  const reply = (token, chatId, text, extra = {}) => tg(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }).catch(() => {});

  async function onUpdate(token, u) {
    const db = load();
    const mc = u.my_chat_member, msg = u.message || u.channel_post;
    if (mc) seenChat(db, mc.chat);
    if (msg) seenChat(db, msg.chat);
    if (mc || msg) save(db);

    if (u.callback_query) {
      const cq = u.callback_query, [, act, nonce] = String(cq.data || '').split(':');
      const p = state.pending.get(nonce);
      const isOwner = db.ownerId && cq.from && cq.from.id === db.ownerId;
      let label = 'Permintaan sudah kedaluwarsa.';
      if (isOwner && p && p.status === 'wait' && Date.now() - p.at < 180000) {
        p.status = act === 'ok' ? 'ok' : 'no';
        label = act === 'ok' ? 'Login diizinkan.' : 'Login ditolak.';
        addLog(act === 'ok', `Login panel ${act === 'ok' ? 'diizinkan' : 'ditolak'} (${p.ip})`);
      }
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: label }).catch(() => {});
      if (cq.message) await tg(token, 'editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: label }).catch(() => {});
      return;
    }

    if (!msg || !(msg.text || msg.caption)) return;
    const text = String(msg.text || msg.caption).trim();
    const cmd = (text.split(/\s+/)[0] || '').replace(/@.*$/, '').toLowerCase();
    const arg = text.split(/\s+/)[1] || '';
    // Tautan akun lewat /start link_... selalu aktif (bagian dari login), tidak bergantung pada pengaturan command
    if (cmd === '/start' && msg.chat.type === 'private') {
      const m = /^link_([a-f0-9]{16,64})$/.exec(arg);
      if (m) {
        const lc = state.linkCodes.get(m[1]);
        if (!lc || Date.now() > lc.exp) return reply(token, msg.chat.id, 'Kode tautan kedaluwarsa. Buat lagi dari panel.');
        state.linkCodes.delete(m[1]);
        const d2 = load(); d2.ownerId = msg.from.id; d2.ownerName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || String(msg.from.id); save(d2);
        addLog(true, `Akun Telegram ditautkan: ${d2.ownerName}`);
        return reply(token, msg.chat.id, 'Akun ini sekarang tertaut ke panel. Kamu bisa masuk ke panel lewat persetujuan di bot ini.');
      }
    }
    // Command lain: diatur dari tab Command (on/off, akses, banner video)
    await cmds.handle(token, db, msg).catch((e) => addLog(false, `Command gagal: ${e.message}`));
  }

  async function pollLoop(gen) {
    let offset = 0, wait = 0;
    while (gen === state.gen) {
      const token = T();
      if (!token) { state.pollOk = false; await sleep(5000); continue; }
      try {
        const ups = await tg(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'channel_post', 'my_chat_member', 'callback_query'] }, 40000);
        if (gen === state.gen) state.pollOk = true;
        if (gen === state.gen) state.pollNote = '';
        wait = 0;
        for (const u of ups) { offset = u.update_id + 1; await onUpdate(token, u).catch(() => {}); }
      } catch (e) {
        state.pollOk = false;
        state.pollNote = e.tgStatus === 409 ? 'Bot ini sedang dipakai layanan lain (webhook atau program lain). Persetujuan login dan deteksi grup tidak jalan, tapi kirim pesan tetap bisa.' : e.message;
        wait = e.tgStatus === 401 ? 60000 : e.tgStatus === 409 ? 30000 : Math.min(30000, (wait || 2000) * 2);
        await sleep(wait);
      }
    }
  }
  const restartPoll = () => { state.gen += 1; state.pollOk = false; state.pollNote = ''; pollLoop(state.gen).catch(() => {}); };

  /* ---------- Penjadwal ---------- */
  let ticking = false;
  async function tick() {
    if (ticking) return; ticking = true;
    try {
      const db0 = load();
      const due = db0.schedules.filter((s) => s.active && Date.parse(s.at) <= Date.now());
      for (const s of due) {
        const res = await broadcast(s.targets, { text: s.text, photoUrl: s.photoUrl, parse: s.parse }).catch((e) => [{ ok: false, title: '-', error: e.message }]);
        const okN = res.filter((r) => r.ok).length;
        const db = load(); const row = db.schedules.find((x) => x.id === s.id);
        if (row) {
          row.lastRun = new Date().toISOString(); row.lastResult = `${okN}/${res.length} terkirim`;
          if (row.repeat === 'none') row.active = false;
          else { const step = row.repeat === 'weekly' ? 7 : 1; let t = Date.parse(row.at); while (t <= Date.now()) t += step * 86400000; row.at = new Date(t).toISOString(); }
          save(db);
        }
        addLog(okN === res.length, `Jadwal "${(s.text || 'foto').slice(0, 30)}": ${okN}/${res.length} terkirim`);
      }
    } catch (_) {} finally { ticking = false; }
  }

  /* ---------- Pantau situs: kabari kalau mati ---------- */
  async function checkSites() {
    try {
      const db = load();
      if (!tokenOf(db) || !db.notify.enabled || !db.notify.site || !db.notify.targets.length) return;
      let sites = []; try { sites = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sites.json'), 'utf8')); } catch (_) {}
      for (const s of sites) {
        if (!s.host) continue;
        let up = false;
        try { const r = await fetch(`https://${s.host}`, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'panel-panel-monitor' } }); up = r.status < 500; } catch (_) {}
        const fails = up ? 0 : (state.siteFail.get(s.host) || 0) + 1;
        state.siteFail.set(s.host, fails);
        const wasDown = state.siteDown.get(s.host) === true;
        if (!up && fails >= 2 && !wasDown) { state.siteDown.set(s.host, true); await notify('site', `🔴 <b>Situs mati</b>\n<code>${esc(s.host)}</code> tidak bisa dibuka.`); }
        else if (up && wasDown) { state.siteDown.set(s.host, false); await notify('site', `🟢 <b>Situs pulih</b>\n<code>${esc(s.host)}</code> sudah bisa dibuka lagi.`); }
      }
    } catch (_) {}
  }

  /* ---------- Rute publik (login lewat bot) ---------- */
  function publicRoutes() {
    const hit = (ip) => { const now = Date.now(); const l = (state.loginHits.get(ip) || []).filter((t) => now - t < 600000); state.loginHits.set(ip, l); return l; };
    const globalHits = [];
    const enabled = () => { const db = load(); return Boolean(tokenOf(db) && db.bot && db.ownerId && state.pollOk); };

    app.get('/api/login/telegram-config', (req, res) => { const db = load(); res.json({ enabled: enabled(), bot: enabled() && db.bot ? db.bot.username : '' }); });

    app.post('/api/login/telegram/start', needHeader, wrap(async (req, res) => {
      if (!enabled()) fail('Login Telegram belum aktif.', 503);
      const ip = req.ip;
      const now = Date.now();
      while (globalHits.length && now - globalHits[0] > 3600000) globalHits.shift();
      if (hit(ip).length >= 5 || globalHits.length >= 12) fail('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', 429);
      hit(ip).push(now); globalHits.push(now);
      for (const [k, v] of state.pending) if (now - v.at > 300000) state.pending.delete(k);
      const nonce = crypto.randomBytes(18).toString('hex');
      state.pending.set(nonce, { at: now, status: 'wait', ip, ua: String(req.get('user-agent') || '').slice(0, 80) });
      const db = load(); const token = tokenOf(db);
      const when = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
      try {
        await tg(token, 'sendMessage', {
          chat_id: db.ownerId, parse_mode: 'HTML',
          text: `🔐 <b>Permintaan masuk ke panel</b>\nIP: <code>${esc(ip)}</code>\nPerangkat: ${esc(state.pending.get(nonce).ua || '-')}\nWaktu: ${esc(when)} WIB\n\nHanya izinkan kalau ini kamu.`,
          reply_markup: { inline_keyboard: [[{ text: '✅ Izinkan', callback_data: `lg:ok:${nonce}` }, { text: '❌ Tolak', callback_data: `lg:no:${nonce}` }]] },
        });
      } catch (e) { state.pending.delete(nonce); fail('Bot tidak bisa mengirim pesan ke akun Telegram kamu. Buka bot-nya dan tekan Start dulu.', 422); }
      res.json({ nonce, bot: db.bot.username });
    }));

    app.get('/api/login/telegram/poll', wrap(async (req, res) => {
      const nonce = String(req.query.nonce || '');
      const p = state.pending.get(nonce);
      if (!p || Date.now() - p.at > 180000) { state.pending.delete(nonce); return res.json({ status: 'expired' }); }
      if (p.status === 'ok') { state.pending.delete(nonce); setSession(res, makeToken(), sessionTtl / 1000); return res.json({ status: 'ok' }); }
      if (p.status === 'no') { state.pending.delete(nonce); return res.json({ status: 'no' }); }
      res.json({ status: 'wait' });
    }));
  }

  /* ---------- Rute panel (setelah login) ---------- */
  function routes() {
    cmds.routes();
    const view = () => {
      const db = load(); const token = tokenOf(db);
      return {
        apiBase: db.apiBase || '', uploader: db.uploader ? db.uploader.url : '', uploaderManaged: Boolean(db.uploader && db.uploader.managed),
        uploaderAuto: db.uploaderCfg ? { apiId: db.uploaderCfg.apiId, hasHash: Boolean(db.uploaderCfg.apiHash), auto: Boolean(db.uploaderCfg.auto), state: mgr.state, note: mgr.note, log: mgr.log.slice(-12) } : null,
        maxMb: Math.round(maxBytes() / MB), uploading,
        hasToken: Boolean(token), tokenSource: db.token ? 'web' : token ? 'env' : '', bot: db.bot, ownerId: db.ownerId || 0, ownerName: db.ownerName,
        pollOk: state.pollOk, pollNote: state.pollNote, loginReady: Boolean(token && db.bot && db.ownerId && state.pollOk),
        targets: db.targets, notify: db.notify, schedules: db.schedules, seen: db.seen.filter((s) => !db.targets.some((t) => t.chatId === s.chatId)), log: db.log,
      };
    };
    app.get('/api/tg/status', wrap(async (req, res) => res.json(view())));

    app.post('/api/tg/bot', needHeader, wrap(async (req, res) => {
      const token = normToken(req.body && req.body.token);
      if (!TOKEN_RX.test(token)) fail('Format token salah. Contoh: 123456789:AAH... (dari @BotFather).');
      const me = await tg(token, 'getMe');
      const db = load(); const same = db.bot && db.bot.id === me.id;
      db.token = token; db.bot = { id: me.id, username: me.username, name: me.first_name };
      if (!same) { stopManaged(true); Object.assign(db, { uploader: null, uploaderCfg: null }); db.ownerId = 0; db.ownerName = ''; db.targets = []; db.seen = []; db.notify.targets = []; db.schedules = []; }
      save(db); restartPoll();
      if (same && db.uploaderCfg && db.uploaderCfg.auto) startManaged().catch(() => {});
      res.json({ ok: true, bot: db.bot });
    }));

    app.delete('/api/tg/bot', needHeader, wrap(async (req, res) => {
      stopManaged(true); const db = blank(); save(db); state.gen += 1; state.pollOk = false; state.pending.clear();
      res.json({ ok: true });
    }));

    app.post('/api/tg/owner/code', needHeader, wrap(async (req, res) => {
      const db = load(); if (!db.bot) fail('Sambungkan bot dulu.');
      for (const [k, v] of state.linkCodes) if (Date.now() > v.exp) state.linkCodes.delete(k);
      const code = crypto.randomBytes(12).toString('hex');
      state.linkCodes.set(code, { exp: Date.now() + 600000 });
      res.json({ link: `https://t.me/${db.bot.username}?start=link_${code}`, bot: db.bot.username });
    }));
    app.delete('/api/tg/owner', needHeader, wrap(async (req, res) => { const db = load(); db.ownerId = 0; db.ownerName = ''; save(db); res.json({ ok: true }); }));

    app.post('/api/tg/targets', needHeader, wrap(async (req, res) => {
      const db = load(); const token = tokenOf(db); if (!db.bot) fail('Sambungkan bot dulu.');
      const ref = parseChat(req.body && req.body.chat);
      if (!ref) fail('Isi @username saluran/grup publik, atau ID angka (contoh -1001234567890). Untuk grup privat, ketik /id di grupnya dan pilih dari daftar terdeteksi.');
      const info = await inspect(token, db.bot, ref);
      if (db.targets.some((t) => t.chatId === info.chatId)) fail('Target itu sudah ada di daftar.');
      if (db.targets.length >= 100) fail('Maksimal 100 target.');
      const row = { id: crypto.randomUUID(), ...info, addedAt: new Date().toISOString() };
      db.targets.push(row); db.seen = db.seen.filter((s) => s.chatId !== info.chatId); save(db);
      res.status(201).json({ target: row });
    }));
    app.post('/api/tg/targets/:id/check', needHeader, wrap(async (req, res) => {
      const db = load(); const t = db.targets.find((x) => x.id === req.params.id); if (!t) fail('Target tidak ditemukan.', 404);
      try { Object.assign(t, await inspect(tokenOf(db), db.bot, t.chatId)); }
      catch (e) { t.canPost = false; t.note = e.message; t.checkedAt = new Date().toISOString(); }
      save(db); res.json({ target: t });
    }));
    app.delete('/api/tg/targets/:id', needHeader, wrap(async (req, res) => {
      const db = load(); db.targets = db.targets.filter((t) => t.id !== req.params.id);
      db.notify.targets = db.notify.targets.filter((i) => i !== req.params.id);
      db.schedules.forEach((s) => { s.targets = s.targets.filter((i) => i !== req.params.id); if (!s.targets.length) s.active = false; });
      save(db); res.json({ ok: true });
    }));

    app.post('/api/tg/send', needHeader, wrap(async (req, res) => {
      const b = req.body || {}; const payload = checkPayload(b);
      const ids = Array.isArray(b.targets) ? b.targets.map(String) : [];
      const results = await broadcast(ids, payload);
      const okN = results.filter((r) => r.ok).length;
      addLog(okN === results.length, `Kirim manual: ${okN}/${results.length} terkirim`);
      res.json({ results });
    }));


    // Bot API lokal (batas file 2 GB). Bot harus logout dari cloud dulu sebelum pindah.
    const normBase = (u) => {
      u = String(u || '').trim().replace(/\/+$/, '').replace(/\/bot[^/]*$/i, '');
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      let p; try { p = new URL(u); } catch (_) { fail('Alamat server tidak valid. Contoh: http://localhost:8081'); }
      if (/(^|\.)api\.telegram\.org$/i.test(p.hostname)) fail('Itu server cloud Telegram. Isi alamat Bot API lokal milikmu.');
      return p.origin;
    };
    app.post('/api/tg/apibase', needHeader, wrap(async (req, res) => {
      const db = load(); const token = tokenOf(db); if (!db.bot) fail('Sambungkan bot dulu.');
      const base = normBase(req.body && req.body.url);
      let me;
      try { me = await tg(token, 'getMe', {}, 10000, base); }
      catch (e) { fail(`${e.message} Kalau bot masih terdaftar di cloud Telegram, tekan "Logout dari cloud" dulu, tunggu sebentar, lalu coba lagi.`, 422); }
      if (me.id !== db.bot.id) fail('Token di server lokal itu milik bot lain.', 422);
      db.apiBase = base; save(db); restartPoll();
      res.json({ ok: true, maxMb: Math.round(LIMIT_LOCAL / MB) });
    }));
    app.post('/api/tg/apibase/logout-cloud', needHeader, wrap(async (req, res) => {
      const db = load(); const token = tokenOf(db); if (!db.bot) fail('Sambungkan bot dulu.');
      if (db.apiBase) fail('Panel sedang memakai server lokal. Kembali ke cloud dulu kalau mau logout dari cloud.');
      await tg(token, 'logOut', {}, 20000, API);
      state.gen += 1; state.pollOk = false;
      res.json({ ok: true });
    }));
    app.delete('/api/tg/apibase', needHeader, wrap(async (req, res) => {
      const db = load(); const token = tokenOf(db);
      if (db.apiBase && token) await tg(token, 'logOut', {}, 20000, db.apiBase).catch(() => {});
      db.apiBase = ''; save(db); state.gen += 1; state.pollOk = false;
      res.json({ ok: true });
    }));



    app.post('/api/tg/uploader/auto', needHeader, wrap(async (req, res) => {
      const db = load(); if (!db.bot) fail('Sambungkan bot dulu.');
      const apiId = String((req.body && req.body.apiId) || '').trim();
      let apiHash = String((req.body && req.body.apiHash) || '').trim();
      if (!/^\d{5,10}$/.test(apiId)) fail('api_id harus angka (5 sampai 10 digit), dari my.telegram.org.');
      if (!apiHash && db.uploaderCfg && db.uploaderCfg.apiId === apiId) apiHash = db.uploaderCfg.apiHash;
      if (!/^[a-f0-9]{32}$/i.test(apiHash)) fail('api_hash harus 32 karakter huruf/angka (bukan angka yang sama dengan api_id). Salin dari my.telegram.org, menu API development tools.');
      db.uploaderCfg = { apiId, apiHash: apiHash.toLowerCase(), auto: true }; save(db);
      mgr.backoff = 5000;
      await startManaged();
      res.json({ ok: true, maxMb: Math.round(LIMIT_LOCAL / MB) });
    }));
    app.delete('/api/tg/uploader/auto', needHeader, wrap(async (req, res) => { stopManaged(true); res.json({ ok: true }); }));

    // Uploader Python (Telethon/MTProto) untuk file di atas 50 MB tanpa server Bot API lokal
    app.post('/api/tg/uploader', needHeader, wrap(async (req, res) => {
      if (!load().bot) fail('Sambungkan bot dulu.');
      stopManaged(false);
      const db = load();
      let u = String((req.body && req.body.url) || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      let p; try { p = new URL(u); } catch (_) { fail('Alamat uploader tidak valid. Contoh: http://127.0.0.1:8090'); }
      const url = p.origin;
      const secret = String((req.body && req.body.secret) || '').trim() || (db.uploader && db.uploader.url === url ? db.uploader.secret : '');
      if (secret.length < 8) fail('Kunci rahasia minimal 8 karakter (sama dengan UPLOADER_SECRET di skrip).');
      let r;
      try { r = await fetch(`${url}/health`, { headers: { 'X-Secret': secret }, signal: AbortSignal.timeout(8000) }); }
      catch (_) { fail('Skrip uploader tidak terjangkau. Pastikan tg_uploader.py berjalan dan alamatnya benar.', 422); }
      const j = await r.json().catch(() => null);
      if (r.status === 401) fail('Kunci rahasia salah. Samakan dengan UPLOADER_SECRET di skrip.', 422);
      if (!r.ok || !j || !j.ok) fail('Alamat itu bukan skrip uploader panel.', 422);
      if (j.id !== db.bot.id) fail('Uploader memakai bot yang berbeda dari bot di panel.', 422);
      db.uploader = { url, secret }; save(db);
      res.json({ ok: true, maxMb: Math.round(LIMIT_LOCAL / MB) });
    }));
    app.delete('/api/tg/uploader', needHeader, wrap(async (req, res) => { stopManaged(false); const db = load(); db.uploader = null; save(db); res.json({ ok: true }); }));

    // Kirim file: badan permintaan dialirkan ke disk (satu unggahan dalam satu waktu), lalu diteruskan ke Telegram
    app.post('/api/tg/send-file', needHeader, wrap(async (req, res) => {
      if (uploading) fail('Masih ada unggahan yang berjalan. Tunggu sampai selesai.', 429);
      const db = load(); if (!tokenOf(db)) fail('Bot belum tersambung.', 503);
      const ids = String(req.get('x-targets') || '').split(',').map((x) => x.trim()).filter((id) => db.targets.some((t) => t.id === id));
      if (!ids.length) fail('Pilih minimal satu target.');
      let name = 'file'; let caption = '';
      try { name = decodeURIComponent(req.get('x-file-name') || 'file'); caption = decodeURIComponent(req.get('x-caption') || ''); } catch (_) {}
      name = path.basename(name).replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 120) || 'file';
      caption = caption.slice(0, 1024);
      const max = maxBytes(); const len = Number(req.headers['content-length'] || 0);
      if (!len) fail('Ukuran file tidak diketahui.');
      if (len > max) fail(`File ${Math.round(len / MB)} MB melebihi batas ${Math.round(max / MB)} MB.` + (db.apiBase || db.uploader ? '' : ' Pasang uploader Python atau Bot API lokal untuk sampai 2 GB.'), 413);
      uploading = true;
      const tmp = path.join(require('os').tmpdir(), `zz-${crypto.randomBytes(6).toString('hex')}`);
      try {
        let got = 0;
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(tmp, { mode: 0o600 });
          req.on('data', (c) => { got += c.length; if (got > max) { req.destroy(); out.destroy(); reject(Object.assign(new Error('File melebihi batas.'), { status: 413 })); } });
          req.on('error', reject); req.on('aborted', () => reject(new Error('Unggahan terputus.')));
          out.on('error', reject); out.on('finish', resolve);
          req.pipe(out);
        });
        const results = await broadcastFile(ids, { path: tmp, name, caption, parse: '' });
        const okN = results.filter((r) => r.ok).length;
        addLog(okN === results.length, `Kirim file ${name} (${Math.round(got / MB) || '<1'} MB): ${okN}/${results.length} terkirim`);
        res.json({ results });
      } finally { uploading = false; fs.rm(tmp, () => {}); }
    }));

    app.post('/api/tg/schedules', needHeader, wrap(async (req, res) => {
      const b = req.body || {}; const payload = checkPayload(b);
      const db = load();
      const ids = (Array.isArray(b.targets) ? b.targets.map(String) : []).filter((id) => db.targets.some((t) => t.id === id));
      if (!ids.length) fail('Pilih minimal satu target.');
      const at = Date.parse(b.at);
      if (!isFinite(at)) fail('Waktu kirim tidak valid.');
      if (at < Date.now() - 60000) fail('Waktu kirim sudah lewat.');
      if (db.schedules.length >= 50) fail('Maksimal 50 jadwal. Hapus yang lama dulu.');
      const repeat = ['daily', 'weekly'].includes(b.repeat) ? b.repeat : 'none';
      const row = { id: crypto.randomUUID(), ...payload, targets: ids, at: new Date(at).toISOString(), repeat, active: true, createdAt: new Date().toISOString() };
      db.schedules.push(row); save(db);
      res.status(201).json({ schedule: row });
    }));
    app.delete('/api/tg/schedules/:id', needHeader, wrap(async (req, res) => {
      const db = load(); db.schedules = db.schedules.filter((s) => s.id !== req.params.id); save(db); res.json({ ok: true });
    }));

    app.post('/api/tg/notify', needHeader, wrap(async (req, res) => {
      const b = req.body || {}; const db = load();
      db.notify = { enabled: Boolean(b.enabled), apk: Boolean(b.apk), apkFile: Boolean(b.apkFile), site: Boolean(b.site), targets: (Array.isArray(b.targets) ? b.targets.map(String) : []).filter((id) => db.targets.some((t) => t.id === id)) };
      save(db); res.json({ notify: db.notify });
    }));
    app.post('/api/tg/notify/test', needHeader, wrap(async (req, res) => {
      const db = load(); if (!db.notify.targets.length) fail('Pilih target notifikasi dulu lalu simpan.');
      const results = await broadcast(db.notify.targets, { text: '✅ <b>Tes notifikasi panel</b>\nKalau pesan ini masuk, notifikasi otomatis sudah siap.', parse: 'HTML' });
      res.json({ results });
    }));
  }

  setInterval(tick, 20000).unref();
  setInterval(checkSites, 5 * 60000).unref();
  setTimeout(() => { if (!state.gen) restartPoll(); }, 500).unref();
  setTimeout(() => { const c = load().uploaderCfg; if (c && c.auto) startManaged().catch(() => {}); }, 3000).unref();
  return { publicRoutes, routes, notify, notifyFile, esc };
};
