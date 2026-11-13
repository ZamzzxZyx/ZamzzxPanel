// Command bot Telegram: tiap command bisa dinyalakan/dimatikan, dibatasi aksesnya, dan memakai banner video (maks 50 MB).
// Data di data/tgcmd.json, video di data/banners/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const createFeatures = require('./tgfeat');

const FILE = path.join(__dirname, 'data', 'tgcmd.json');
const DIR = path.join(__dirname, 'data', 'banners');
const MB = 1024 * 1024;
const MAX_BANNER = 50 * MB;
const MAX_BANNERS = 20, MAX_TOTAL = 400 * MB, MAX_COMMANDS = 150;
const EXT = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const base = (o) => ({ kind: 'text', builtin: false, enabled: true, desc: '', text: '', parse: '', bannerId: '', buttons: '', access: 'all', scope: 'any', group: '', usage: '', feature: '', uses: 0, lastAt: '', ...o });
const featureRow = (f) => base({ id: `f-${f.cmd}`, cmd: f.cmd, kind: 'feature', feature: f.feature, builtin: true, desc: f.desc, group: f.group, usage: f.usage, access: f.access });
const defaults = () => ({
  enabled: true,
  commands: [
    base({ id: 'c-start', cmd: 'start', builtin: true, group: 'Umum', desc: 'Mulai menggunakan bot', text: 'Halo {nama}! Ini bot panel.\nKetik /help untuk melihat perintah.' }),
    base({ id: 'c-help', cmd: 'help', kind: 'help', builtin: true, group: 'Umum', desc: 'Daftar perintah', text: 'Perintah yang tersedia:' }),
    base({ id: 'c-id', cmd: 'id', kind: 'id', builtin: true, group: 'Umum', desc: 'Lihat ID chat ini' }),
    ...createFeatures.catalog.map(featureRow),
  ],
  banners: [], fileIds: {}, log: [],
});
function load() {
  let db;
  try { db = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) { return defaults(); }
  // Migrasi: command fitur yang belum ada ditambahkan, yang sudah ada tetap memakai pengaturan kamu (saklar, akses, cakupan, deskripsi)
  let added = 0;
  for (const f of createFeatures.catalog) {
    const cur = db.commands.find((x) => x.id === `f-${f.cmd}`);
    if (cur) { cur.group = f.group; cur.usage = f.usage; cur.feature = f.feature; cur.kind = 'feature'; continue; }
    if (db.commands.some((x) => x.cmd === f.cmd)) continue; // nama sudah dipakai command buatanmu
    db.commands.push(featureRow(f)); added += 1;
  }
  for (const x of db.commands) if (x.builtin && ['start', 'help', 'id'].includes(x.cmd) && !x.group) x.group = 'Umum';
  if (added) { db.needSync = true; try { save(db); } catch (_) {} }
  return db;
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}
function addLog(kind, text) {
  const db = load(); db.log.unshift({ t: new Date().toISOString(), k: kind, s: String(text).slice(0, 240) }); db.log = db.log.slice(0, 80); save(db);
}

// Tombol: satu baris "Label | https://link" per tombol
function parseButtons(str) {
  const rows = [];
  String(str || '').split(/\r?\n/).forEach((line, i) => {
    line = line.trim(); if (!line) return;
    const [label, ...rest] = line.split('|'); const url = rest.join('|').trim();
    if (!label.trim() || !url) fail(`Tombol baris ${i + 1}: tulis "Label | https://link".`);
    if (!/^(https?:\/\/|tg:\/\/)\S+$/i.test(url)) fail(`Tombol baris ${i + 1}: link harus diawali http://, https://, atau tg://.`);
    if (label.trim().length > 40) fail(`Tombol baris ${i + 1}: label maksimal 40 karakter.`);
    rows.push([{ text: label.trim(), url }]);
  });
  if (rows.length > 8) fail('Maksimal 8 tombol.');
  return rows;
}

module.exports = function createCommands({ app, wrap, needHeader, load: loadTg, tokenOf, tg, tgUpload, makeToken, baseUrl }) {
  const recent = new Map();
  const feat = createFeatures({ makeToken, tg, tgUpload, baseUrl, getCfg: () => load(), nexa: require('./nexa'), wink: require('./wink') });
  let uploading = false;

  /* ---------- Kirim jawaban ---------- */
  const vars = (text, ctx, html) => String(text || '').replace(/\{(nama|username|id|grup|bot)\}/g, (_, k) => { const v = ctx[k] == null ? '' : String(ctx[k]); return html ? esc(v) : v; });

  async function sendBanner(token, tdb, c, chatId, text, markup) {
    const cfg = load(); const b = cfg.banners.find((x) => x.id === c.bannerId);
    const file = b && path.join(DIR, b.file);
    if (!b || !fs.existsSync(file)) { addLog('warn', `/${c.cmd}: file banner hilang, dikirim tanpa video.`); return false; }
    const key = `${tdb.bot.id}:${b.id}`;
    const caption = text && text.length <= 1024 ? text : '';
    const pm = c.parse === 'HTML' ? 'HTML' : '';
    let res = null;
    if (cfg.fileIds[key]) {
      try { res = await tg(token, 'sendVideo', { chat_id: chatId, video: cfg.fileIds[key], caption: caption || undefined, parse_mode: pm || undefined, supports_streaming: true, reply_markup: markup }); }
      catch (e) { if (!/file|wrong|remote|identifier/i.test(e.tgDesc || e.message)) throw e; }
    }
    if (!res) {
      res = await tgUpload(token, 'sendVideo', { chat_id: chatId, caption, parse_mode: pm, supports_streaming: 'true', reply_markup: markup ? JSON.stringify(markup) : '' }, 'video', file, b.filename);
      const v = res && (res.video || res.document || res.animation);
      if (v && v.file_id) { const d = load(); d.fileIds[key] = v.file_id; save(d); }
    }
    if (text && !caption) await tg(token, 'sendMessage', { chat_id: chatId, text, ...(pm ? { parse_mode: pm } : {}), reply_markup: markup, link_preview_options: { is_disabled: true } });
    return true;
  }

  // Bantuan dikelompokkan per kategori dan dipecah kalau lebih dari batas Telegram
  async function sendHelp(token, tdb, c, msg, head, html) {
    const cfg = load();
    const isOwner = tdb.ownerId && msg.from && msg.from.id === tdb.ownerId;
    const list = cfg.commands.filter((x) => x.enabled && x.desc && (x.access === 'all' || isOwner) && (x.scope === 'any' || (x.scope === 'private') === (msg.chat.type === 'private')));
    const by = {};
    for (const x of list) (by[x.group || 'Lainnya'] = by[x.group || 'Lainnya'] || []).push(x);
    const order = [...createFeatures.GROUP_ORDER, ...Object.keys(by).filter((g) => !createFeatures.GROUP_ORDER.includes(g))].filter((g) => by[g]);
    const body = order.map((g) => `<b>${esc(g)}</b>\n${by[g].map((x) => `/${x.cmd} - ${esc(x.desc)}`).join('\n')}`).join('\n\n');
    const top = html ? head : esc(head);
    const markup = (() => { const r = parseButtons(c.buttons); return r.length ? { inline_keyboard: r } : undefined; })();
    if (c.bannerId) await sendBanner(token, tdb, c, msg.chat.id, '', markup).catch(() => {});
    const all = `${top}\n\n${body}\n\n<i>Detail cara pakai: ketik command-nya tanpa isi.</i>`.trim();
    const out = []; let cur = '';
    for (const block of all.split('\n\n')) { if ((cur + '\n\n' + block).length > 3800 && cur) { out.push(cur); cur = block; } else cur = cur ? cur + '\n\n' + block : block; }
    if (cur) out.push(cur);
    for (let i = 0; i < out.length; i++) await tg(token, 'sendMessage', { chat_id: msg.chat.id, text: out[i], parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(i === out.length - 1 && markup && !c.bannerId ? { reply_markup: markup } : {}) });
  }

  async function respond(token, tdb, c, msg, ctx) {
    const html = c.parse === 'HTML';
    const chatId = msg.chat.id;
    if (c.kind === 'id') {
      const kinds = { private: 'Pribadi', group: 'Grup', supergroup: 'Grup', channel: 'Saluran' };
      return tg(token, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `ID chat ini:\n<code>${chatId}</code>\nJenis: ${esc(kinds[msg.chat.type] || msg.chat.type)}${msg.chat.title ? `\nNama: ${esc(msg.chat.title)}` : ''}${msg.from ? `\nID kamu: <code>${msg.from.id}</code>` : ''}` });
    }
    let text = vars(c.text, ctx, html);
    if (c.kind === 'help') return sendHelp(token, tdb, c, msg, text, html);
    const rows = parseButtons(c.buttons);
    const markup = rows.length ? { inline_keyboard: rows } : undefined;
    if (c.bannerId && await sendBanner(token, tdb, c, chatId, text, markup)) return;
    if (!text) text = '(kosong)';
    return tg(token, 'sendMessage', { chat_id: chatId, text, ...(html ? { parse_mode: 'HTML' } : {}), reply_markup: markup, link_preview_options: { is_disabled: true } });
  }

  // Dipanggil dari poller. true = pesan ini adalah command yang dikenal (sudah ditangani atau sengaja diabaikan).
  async function handle(token, tdb, msg) {
    const cfg = load();
    const raw = String(msg.text || msg.caption || '');
    const m = /^\/([A-Za-z0-9_]{1,32})(?:@(\w+))?(?:\s|$)/.exec(raw);
    if (!m) return false;
    if (m[2] && tdb.bot && m[2].toLowerCase() !== String(tdb.bot.username).toLowerCase()) return false;
    const cmd = m[1].toLowerCase();
    const c = cfg.commands.find((x) => x.cmd === cmd);
    if (!c) return false;
    const who = msg.from ? (msg.from.first_name || msg.from.username || msg.from.id) : (msg.chat.title || msg.chat.id);
    const place = msg.chat.type === 'private' ? 'privat' : 'grup';
    const key = `${msg.chat.id}:${cmd}`, now = Date.now();
    if (now - (recent.get(key) || 0) < 1500) return true;
    recent.set(key, now); if (recent.size > 500) recent.clear();
    if (!cfg.enabled) { addLog('info', `/${cmd} dilewati: semua command dimatikan.`); return true; }
    if (!c.enabled) { addLog('info', `/${cmd} dilewati: command dimatikan (${who}, ${place}).`); return true; }
    const isPrivate = msg.chat.type === 'private';
    if ((c.scope === 'private' && !isPrivate) || (c.scope === 'group' && isPrivate)) { addLog('info', `/${cmd} dilewati: hanya untuk ${c.scope === 'private' ? 'chat privat' : 'grup'} (${place}).`); return true; }
    if (c.access === 'owner' && !(tdb.ownerId && msg.from && msg.from.id === tdb.ownerId)) {
      addLog('warn', `/${cmd} ditolak: bukan pemilik (${who}, ${place}).`);
      await tg(token, 'sendMessage', { chat_id: msg.chat.id, text: 'Perintah ini hanya untuk pemilik bot.' }).catch(() => {});
      return true;
    }
    const ctx = { nama: msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || '' : '', username: msg.from && msg.from.username ? '@' + msg.from.username : '', id: msg.from ? msg.from.id : '', grup: msg.chat.title || '', bot: tdb.bot ? tdb.bot.username : '' };
    if (c.kind === 'feature') {
      // Fitur bisa berjalan lama (gambar, video, AI): jalan di latar belakang supaya polling bot tidak tertahan
      const args = raw.replace(/^\/[A-Za-z0-9_]+(?:@\w+)?\s*/, '');
      const isOwner = Boolean(tdb.ownerId && msg.from && msg.from.id === tdb.ownerId);
      feat.run(c, token, tdb, msg, args, isOwner).then(() => {
        const d = load(); const row = d.commands.find((x) => x.id === c.id); if (row) { row.uses = (row.uses || 0) + 1; row.lastAt = new Date().toISOString(); save(d); }
        addLog('ok', `/${cmd} berhasil dibalas ke ${who} (${place}).`);
      }).catch((e) => {
        addLog('err', `/${cmd} gagal: ${e.message}`);
        tg(token, 'sendMessage', { chat_id: msg.chat.id, text: `⚠️ ${e.user ? '' : '/' + cmd + ' gagal: '}${String(e.message).slice(0, 900)}`, reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } }).catch(() => {});
      });
      return true;
    }
    try {
      await respond(token, tdb, c, msg, ctx);
      const d = load(); const row = d.commands.find((x) => x.id === c.id); if (row) { row.uses = (row.uses || 0) + 1; row.lastAt = new Date().toISOString(); save(d); }
      addLog('ok', `/${cmd} berhasil dibalas ke ${who} (${place}).`);
    } catch (e) { addLog('err', `/${cmd} gagal: ${e.message}`); }
    return true;
  }

  /* ---------- Menu command di Telegram ---------- */
  async function syncMenu() {
    const tdb = loadTg(); const token = tokenOf(tdb);
    if (!token || !tdb.bot) fail('Sambungkan bot dulu.', 503);
    const cfg = load();
    const act = cfg.enabled ? cfg.commands.filter((c) => c.enabled && c.desc) : [];
    const toList = (a) => a.slice(0, 100).map((c) => ({ command: c.cmd, description: c.desc.slice(0, 256) }));
    const pub = act.filter((c) => c.access === 'all');
    if (pub.length) await tg(token, 'setMyCommands', { commands: toList(pub) }); else await tg(token, 'deleteMyCommands', {});
    if (tdb.ownerId) {
      if (act.length) await tg(token, 'setMyCommands', { commands: toList(act), scope: { type: 'chat', chat_id: tdb.ownerId } });
      else await tg(token, 'deleteMyCommands', { scope: { type: 'chat', chat_id: tdb.ownerId } });
    }
    if (cfg.needSync) { const d = load(); delete d.needSync; save(d); }
    return { public: Math.min(100, pub.length), owner: Math.min(100, act.length) };
  }
  const autoSync = () => syncMenu().catch(() => {});
  // Setelah pembaruan yang menambah command, menu Telegram disinkronkan sekali otomatis
  setTimeout(() => { if (load().needSync && tokenOf(loadTg())) autoSync(); }, 8000).unref();

  /* ---------- Rute ---------- */
  function routes() {
    const pubBanner = (b) => ({ id: b.id, name: b.name, filename: b.filename, size: b.size, createdAt: b.createdAt });
    const view = () => { const d = load(); return { enabled: d.enabled, groups: createFeatures.GROUP_ORDER, commands: d.commands, banners: d.banners.map(pubBanner), log: d.log.slice(0, 40), maxBannerMb: 50 }; };
    app.get('/api/tg/commands', wrap(async (req, res) => res.json(view())));

    app.post('/api/tg/commands/config', needHeader, wrap(async (req, res) => {
      const d = load(); d.enabled = Boolean(req.body && req.body.enabled); save(d);
      addLog('info', d.enabled ? 'Semua command dinyalakan.' : 'Semua command dimatikan.'); autoSync();
      res.json(view());
    }));

    app.post('/api/tg/commands', needHeader, wrap(async (req, res) => {
      const b = req.body || {}; const d = load();
      const old = b.id ? d.commands.find((x) => x.id === b.id) : null;
      if (b.id && !old) fail('Command tidak ditemukan.', 404);
      const cmd = old && old.builtin ? old.cmd : String(b.cmd || '').trim().replace(/^\//, '').toLowerCase();
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(cmd)) fail('Nama command: huruf kecil, angka, atau garis bawah (mulai dengan huruf, maks 32 karakter).');
      if (d.commands.some((x) => x.cmd === cmd && x.id !== (old && old.id))) fail(`Command /${cmd} sudah ada.`);
      if (!old && d.commands.length >= MAX_COMMANDS) fail(`Maksimal ${MAX_COMMANDS} command.`);
      const kind = old ? old.kind : 'text';
      const desc = String(b.desc || '').trim().slice(0, 256);
      const text = String(b.text || '').slice(0, 4096);
      const bannerId = d.banners.some((x) => x.id === b.bannerId) ? b.bannerId : '';
      if (kind === 'text' && !text.trim() && !bannerId) fail('Isi teks balasan atau pilih banner video.');
      if (old && kind === 'feature') { /* teks, banner, dan tombol tidak dipakai oleh command fitur */ }
      const buttons = String(b.buttons || '').slice(0, 2000); parseButtons(buttons);
      const row = base({ ...(old || {}), id: old ? old.id : crypto.randomBytes(5).toString('hex'), cmd, kind, builtin: Boolean(old && old.builtin), desc, text, parse: b.parse === 'HTML' ? 'HTML' : '', bannerId, buttons,
        access: b.access === 'owner' ? 'owner' : 'all', scope: ['private', 'group'].includes(b.scope) ? b.scope : 'any', enabled: b.enabled !== false });
      if (old) d.commands[d.commands.indexOf(old)] = row; else d.commands.push(row);
      save(d); autoSync();
      res.status(old ? 200 : 201).json({ command: row });
    }));

    app.post('/api/tg/commands/:id/toggle', needHeader, wrap(async (req, res) => {
      const d = load(); const c = d.commands.find((x) => x.id === req.params.id); if (!c) fail('Command tidak ditemukan.', 404);
      c.enabled = Boolean(req.body && req.body.enabled); save(d);
      addLog('info', `/${c.cmd} ${c.enabled ? 'dinyalakan' : 'dimatikan'}.`); autoSync();
      res.json({ command: c });
    }));

    app.delete('/api/tg/commands/:id', needHeader, wrap(async (req, res) => {
      const d = load(); const c = d.commands.find((x) => x.id === req.params.id); if (!c) fail('Command tidak ditemukan.', 404);
      if (c.builtin) fail('Command bawaan tidak bisa dihapus, tapi bisa dimatikan.');
      d.commands = d.commands.filter((x) => x.id !== c.id); save(d); autoSync();
      res.json({ ok: true });
    }));

    app.post('/api/tg/commands/sync', needHeader, wrap(async (req, res) => {
      const r = await syncMenu(); addLog('ok', `Menu Telegram diperbarui (${r.public} publik, ${r.owner} untuk pemilik).`);
      res.json({ ok: true, ...r });
    }));
    app.post('/api/tg/commands/log/clear', needHeader, wrap(async (req, res) => { const d = load(); d.log = []; save(d); res.json({ ok: true }); }));

    /* ----- Banner video: maksimal 50 MB, dialirkan ke disk ----- */
    app.post('/api/tg/banners', needHeader, wrap(async (req, res) => {
      if (uploading) fail('Masih ada unggahan banner yang berjalan.', 429);
      const d0 = load();
      if (d0.banners.length >= MAX_BANNERS) fail(`Maksimal ${MAX_BANNERS} banner. Hapus yang lama dulu.`);
      let name = 'banner'; try { name = decodeURIComponent(req.get('x-file-name') || 'banner'); } catch (_) {}
      name = path.basename(name).replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 100) || 'banner';
      const ext = path.extname(name).toLowerCase();
      if (!EXT[ext]) fail('Format harus video MP4 (disarankan), MOV, M4V, atau WebM.');
      const len = Number(req.headers['content-length'] || 0);
      if (!len) fail('Ukuran file tidak diketahui.');
      if (len > MAX_BANNER) fail(`Video ${(len / MB).toFixed(1)} MB melebihi batas 50 MB.`, 413);
      if (d0.banners.reduce((s, x) => s + x.size, 0) + len > MAX_TOTAL) fail('Total banner melebihi 400 MB. Hapus yang lama dulu.');
      fs.mkdirSync(DIR, { recursive: true });
      const id = crypto.randomBytes(6).toString('hex'); const fileName = `${id}${ext}`; const dest = path.join(DIR, fileName);
      uploading = true;
      try {
        let got = 0;
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(dest, { mode: 0o600 });
          req.on('data', (c) => { got += c.length; if (got > MAX_BANNER) { req.destroy(); out.destroy(); reject(Object.assign(new Error('Video melebihi 50 MB.'), { status: 413 })); } });
          req.on('error', reject); req.on('aborted', () => reject(new Error('Unggahan terputus.')));
          out.on('error', reject); out.on('finish', resolve); req.pipe(out);
        });
        const fd = fs.openSync(dest, 'r'); const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
        const isMp4 = head.toString('latin1', 4, 8) === 'ftyp', isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
        if (!(ext === '.webm' ? isWebm : isMp4)) fail('Isi file bukan video yang valid untuk format itu.', 422);
        const d = load();
        const b = { id, name: name.replace(/\.[^.]+$/, ''), filename: name, file: fileName, size: got, createdAt: new Date().toISOString() };
        d.banners.push(b); save(d); addLog('ok', `Banner "${b.name}" diunggah (${(got / MB).toFixed(1)} MB).`);
        res.status(201).json({ banner: pubBanner(b) });
      } catch (e) { fs.rm(dest, () => {}); throw e; }
      finally { uploading = false; }
    }));

    app.get('/api/tg/banners/:id/file', wrap(async (req, res) => {
      const b = load().banners.find((x) => x.id === req.params.id); if (!b) fail('Banner tidak ditemukan.', 404);
      res.sendFile(b.file, { root: DIR, dotfiles: 'allow', headers: { 'Content-Type': EXT[path.extname(b.file)] || 'video/mp4', 'Cache-Control': 'private, max-age=3600' } });
    }));

    app.delete('/api/tg/banners/:id', needHeader, wrap(async (req, res) => {
      const d = load(); const b = d.banners.find((x) => x.id === req.params.id); if (!b) fail('Banner tidak ditemukan.', 404);
      d.banners = d.banners.filter((x) => x.id !== b.id);
      d.commands.forEach((c) => { if (c.bannerId === b.id) c.bannerId = ''; });
      for (const k of Object.keys(d.fileIds)) if (k.endsWith(`:${b.id}`)) delete d.fileIds[k];
      save(d); fs.rm(path.join(DIR, b.file), () => {}); addLog('info', `Banner "${b.name}" dihapus.`);
      res.json({ ok: true });
    }));
  }

  return { handle, routes };
};
