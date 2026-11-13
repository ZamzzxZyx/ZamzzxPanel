// Semua fitur panel sebagai command bot Telegram (Nexa tools, AI, Wink, Img to URL, Situs, APK, Bot Host, DNS, Telegram, status panel).
// Fitur yang butuh data atau aksi panel dipanggil lewat API panel sendiri (127.0.0.1) dengan sesi internal, jadi aturannya sama persis dengan di web.
// Command dibuat otomatis di tab Command (lihat tgcmd.js) dan bisa dimatikan, dibatasi akses, atau dibatasi cakupannya seperti command lain.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, 'data', 'tgfeat.json');
const NEXA_DIR = path.join(__dirname, 'data', 'nexa');
const WINK_DIR = path.join(__dirname, 'data', 'wink');
const MB = 1024 * 1024;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status, user: true }); };

/* ---------- Katalog command ---------- */
const G = { umum: 'Umum', gambar: 'Gambar & video', cari: 'Cari', ai: 'AI', foto: 'Foto', situs: 'Situs', apk: 'APK', bots: 'Bot Host', dns: 'DNS', tg: 'Telegram', panel: 'Panel' };
const GROUP_ORDER = [G.umum, G.gambar, G.cari, G.ai, G.foto, G.situs, G.apk, G.bots, G.dns, G.tg, G.panel];

// [cmd, tool Nexa, grup, deskripsi, cara pakai, akses]
const NEXA = [
  ['anime', 'anime', G.gambar, 'Gambar anime acak', '/anime'],
  ['pap', 'pap', G.gambar, 'Foto acak dari Nexa (disamarkan)', '/pap', 'owner'],
  ['brat', 'brat', G.gambar, 'Gambar teks gaya Brat', '/brat teks'],
  ['bratvid', 'bratvid', G.gambar, 'Video Brat kata demi kata', '/bratvid teks'],
  ['bratvid2', 'bratvid2', G.gambar, 'Video Brat varian 2', '/bratvid2 teks'],
  ['bratpatrick', 'bratpatrick', G.gambar, 'Brat dengan Patrick Star', '/bratpatrick teks'],
  ['bratpatrickvid', 'bratpatrick_video', G.gambar, 'Video Brat Patrick', '/bratpatrickvid teks'],
  ['iqc', 'iqc', G.gambar, 'Kartu kutipan gaya chat iPhone', '/iqc teks'],
  ['wmp1', 'wmp1', G.gambar, 'Teks lirik gaya pemutar musik 1', '/wmp1 baris1|baris2|baris3'],
  ['wmp2', 'wmp2', G.gambar, 'Teks lirik gaya pemutar musik 2', '/wmp2 baris1|baris2|baris3'],
  ['nokia', 'nokia', G.gambar, 'SMS ala ponsel Nokia', '/nokia pesan | pengirim | tanggal | jam | judul (selain pesan boleh dikosongkan)'],
  ['ttqc', 'ttqc', G.gambar, 'Kartu komentar ala TikTok', '/ttqc url_foto | nama | komentar'],
  ['fakeffduo', 'fakeffduo', G.gambar, 'Kartu lobi duo gaya Free Fire', '/fakeffduo nick1 | nick2'],
  ['fakeff', 'fakeff', G.gambar, 'Kartu profil gaya Free Fire', '/fakeff username'],
  ['youtube', 'ytsearch', G.cari, 'Cari video YouTube', '/youtube kata kunci'],
  ['lirik', 'lyric', G.cari, 'Cari lirik lagu', '/lirik judul lagu'],
  ['lahelu', 'lahelu', G.cari, 'Cari meme Lahelu', '/lahelu kata kunci'],
  ['sfx', 'soundeffect', G.cari, 'Cari efek suara MyInstants', '/sfx kata kunci'],
  ['pinterest', 'pin', G.cari, 'Cari gambar Pinterest', '/pinterest kata kunci'],
  ['mcpdl', 'mcpdl', G.cari, 'Cari addon dan map Minecraft PE', '/mcpdl kata kunci'],
  ['stiker', 'stickerget', G.cari, 'Ambil isi paket stiker Sticker.ly', '/stiker https://sticker.ly/s/XXXX'],
];
// [cmd, id model Nexa, nama]
const NEXA_AI = [['felo', 'felo', 'Felo (cari web)'], ['gpt4', 'gpt4', 'GPT-4'], ['chatgptpro', 'chatgptpro', 'ChatGPT Pro'], ['deepseek', 'deepsek', 'DeepSeek'], ['llama', 'llama', 'Llama (Nexa)'], ['cai', 'cai', 'CAI (Nexa)']];
// [cmd, id alat Wink, resolusi, deskripsi]
const WINK = [
  ['hd', 'hd', 0, 'Perjelas foto jadi HD (kirim atau balas foto)'], ['remini', 'remini', 0, 'Pulihkan wajah dan detail ala Remini'], ['wink', 'wink', 0, 'Peningkat kualitas foto gaya Wink'],
  ['upscale', 'upscale', 0, 'Perbesar resolusi foto'], ['upscale2', 'upscale1', 2, 'Perbesar foto 2x'], ['upscale4', 'upscale1', 4, 'Perbesar foto 4x'], ['removebg', 'remove', 0, 'Hapus latar belakang foto (PNG transparan)'],
];

const catalog = [];
const add = (cmd, feature, group, desc, usage, access) => catalog.push({ cmd, feature, group, desc, usage, access: access || 'owner' });
NEXA.forEach(([cmd, tool, group, desc, usage, access]) => add(cmd, `nexa:${tool}`, group, desc, usage, access || 'all'));
add('ai', 'ai:groq', G.ai, 'Tanya AI (Groq). Balas pesan atau tulis pertanyaan', '/ai pertanyaan  (/ai reset untuk mulai baru)', 'owner');
add('aimodel', 'ai:model', G.ai, 'Lihat atau pilih model AI Groq', '/aimodel  atau  /aimodel nomor', 'owner');
NEXA_AI.forEach(([cmd, id, name]) => add(cmd, `ainexa:${id}`, G.ai, `Tanya ${name} lewat Nexa`, `/${cmd} pertanyaan  (/${cmd} reset untuk mulai baru)`, 'all'));
WINK.forEach(([cmd, id, res, desc]) => add(cmd, `wink:${id}:${res}`, G.foto, desc, `Kirim foto dengan caption /${cmd}, atau balas foto dengan /${cmd}, atau /${cmd} link_gambar`, 'owner'));
add('imgurl', 'img:upload', G.foto, 'Foto jadi link publik (Img to URL)', 'Kirim foto dengan caption /imgurl, atau balas foto dengan /imgurl', 'owner');
add('imglist', 'img:list', G.foto, 'Daftar link foto Img to URL terakhir', '/imglist');
add('situs', 'sites:list', G.situs, 'Daftar situs dan statusnya', '/situs');
add('situsdeploy', 'sites:deploy', G.situs, 'Deploy situs dari file ZIP atau HTML', 'Kirim .zip/.html dengan caption /situsdeploy vercel|netlify subdomain  atau  /situsdeploy nomor (deploy ulang)');
add('situshapus', 'sites:remove', G.situs, 'Hapus situs', '/situshapus nomor ya');
add('apk', 'apk:list', G.apk, 'Daftar build APK', '/apk');
add('apkbuild', 'apk:build', G.apk, 'Buat APK dari URL web', '/apkbuild https://situs.com | Nama App | id.paket.opsional');
add('apkunduh', 'apk:get', G.apk, 'Kirim file APK hasil build', '/apkunduh nomor');
add('apkhapus', 'apk:remove', G.apk, 'Hapus riwayat build APK', '/apkhapus nomor ya');
add('bots', 'bots:list', G.bots, 'Daftar Bot Host dan statusnya', '/bots');
add('botstart', 'bots:start', G.bots, 'Jalankan bot', '/botstart nomor atau nama');
add('botstop', 'bots:stop', G.bots, 'Hentikan bot', '/botstop nomor atau nama');
add('botrestart', 'bots:restart', G.bots, 'Mulai ulang bot', '/botrestart nomor atau nama');
add('botlog', 'bots:log', G.bots, 'Lihat output terminal bot', '/botlog nomor atau nama [jumlah baris]');
add('dns', 'dns:list', G.dns, 'Daftar record DNS zona panel', '/dns');
add('dnsadd', 'dns:add', G.dns, 'Tambah record DNS', '/dnsadd label tipe isi [proxy]  contoh: /dnsadd app A 1.2.3.4 proxy');
add('dnsdel', 'dns:del', G.dns, 'Hapus record DNS', '/dnsdel nomor ya');
add('targets', 'tg:targets', G.tg, 'Daftar grup dan saluran target', '/targets');
add('kirim', 'tg:send', G.tg, 'Kirim pesan ke target', '/kirim nomor|semua teks pesan');
add('jadwal', 'tg:schedules', G.tg, 'Daftar pesan terjadwal', '/jadwal');
add('notif', 'tg:notify', G.tg, 'Lihat atau atur notifikasi otomatis', '/notif  atau  /notif on|off  atau  /notif apk|situs on|off');
add('panel', 'panel:status', G.panel, 'Status panel dan semua layanan', '/panel');
add('perintah', 'panel:commands', G.panel, 'Daftar command dan statusnya', '/perintah');
add('cmdon', 'panel:cmdon', G.panel, 'Nyalakan satu command', '/cmdon nama_command');
add('cmdoff', 'panel:cmdoff', G.panel, 'Matikan satu command', '/cmdoff nama_command');

/* ---------- PNG polos untuk ikon APK (tanpa dependensi) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function iconPng(size, bg, fg) {
  const row = 1 + size * 3, raw = Buffer.alloc(row * size), c = (size - 1) / 2, r = size * 0.27;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - c) * (x - c) + (y - c) * (y - c) <= r * r, col = inside ? fg : bg, o = y * row + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
const ICON_COLORS = [[77, 124, 255], [34, 160, 107], [224, 108, 60], [150, 90, 220], [210, 70, 110], [30, 150, 190]];

/* ---------- Modul ---------- */
function create({ makeToken, tg, tgUpload, baseUrl, getCfg, nexa, wink }) {
  const readState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {}; } catch (_) { return {}; } };
  const writeState = (o) => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(o), { mode: 0o600 }); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); };

  /* --- API panel sendiri --- */
  async function api(method, p, body, opt = {}) {
    const headers = { Cookie: `zs=${makeToken()}`, 'X-Panel': '1' };
    let b;
    if (Buffer.isBuffer(body)) { headers['Content-Type'] = opt.type || 'application/octet-stream'; b = body; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    let r;
    try { r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}${p}`, { method, headers, body: b, signal: AbortSignal.timeout(opt.timeout || 60000) }); }
    catch (e) { fail(e.name === 'TimeoutError' ? 'Panel terlalu lama merespons.' : 'Panel tidak bisa dihubungi dari bot.', 502); }
    if (opt.binary) {
      if (!r.ok) { const j = await r.json().catch(() => null); fail((j && j.error) || `Panel menolak permintaan (${r.status}).`, r.status); }
      return Buffer.from(await r.arrayBuffer());
    }
    if (opt.text) {
      if (!r.ok) { const j = await r.json().catch(() => null); fail((j && j.error) || `Panel menolak permintaan (${r.status}).`, r.status); }
      return r.text();
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) fail((j && j.error) || `Panel menolak permintaan (${r.status}).`, r.status);
    return j || {};
  }

  /* --- Kirim ke Telegram --- */
  const baseFields = (c) => ({ chat_id: c.chatId, ...(c.msg.is_topic_message && c.msg.message_thread_id ? { message_thread_id: c.msg.message_thread_id } : {}), reply_parameters: { message_id: c.msg.message_id, allow_sending_without_reply: true } });
  const upFields = (c, extra) => { const f = { ...baseFields(c), ...extra }; f.reply_parameters = JSON.stringify(f.reply_parameters); if (f.message_thread_id != null) f.message_thread_id = String(f.message_thread_id); return f; };
  const chunks = (text, n = 3900) => {
    const out = []; let rest = String(text);
    while (rest.length > n) { let i = rest.lastIndexOf('\n', n); if (i < n * 0.5) i = n; out.push(rest.slice(0, i)); rest = rest.slice(i).replace(/^\n/, ''); }
    if (rest.trim()) out.push(rest);
    return out;
  };
  const say = async (c, html) => { for (const part of chunks(html)) await tg(c.token, 'sendMessage', { ...baseFields(c), text: part, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); };
  const plain = async (c, text) => { for (const part of chunks(text)) await tg(c.token, 'sendMessage', { ...baseFields(c), text: part, link_preview_options: { is_disabled: true } }); };

  async function sendPath(c, method, field, file, name, extra) {
    return tgUpload(c.token, method, upFields(c, extra), field, file, name);
  }
  async function sendBuf(c, method, field, buf, name, extra) {
    const tmp = path.join(os.tmpdir(), `zz-feat-${crypto.randomBytes(5).toString('hex')}-${name.replace(/[^\w.-]/g, '_')}`);
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    try { return await sendPath(c, method, field, tmp, name, extra); } finally { fs.rm(tmp, () => {}); }
  }
  // Foto dulu, kalau Telegram menolak (ukuran/dimensi) kirim sebagai dokumen
  async function sendImage(c, file, name, extra = {}) {
    try { return await sendPath(c, 'sendPhoto', 'photo', file, name, extra); }
    catch (e) { if (!/IMAGE|PHOTO|dimension|too big|file/i.test(e.tgDesc || e.message)) throw e; return sendPath(c, 'sendDocument', 'document', file, name, extra.caption ? { caption: extra.caption } : {}); }
  }

  /* --- Gambar dari pesan --- */
  function imageRef(c) {
    for (const m of [c.msg, c.msg.reply_to_message]) {
      if (!m) continue;
      if (m.photo && m.photo.length) { const p = m.photo[m.photo.length - 1]; return { fileId: p.file_id, size: p.file_size || 0 }; }
      if (m.document && /^image\//.test(m.document.mime_type || '')) return { fileId: m.document.file_id, size: m.document.file_size || 0 };
      if (m.sticker && !m.sticker.is_animated && !m.sticker.is_video) return { fileId: m.sticker.file_id, size: m.sticker.file_size || 0 };
    }
    const hit = /https?:\/\/\S+/i.exec(c.args || '') || (c.msg.reply_to_message && /https?:\/\/\S+/i.exec(c.msg.reply_to_message.text || c.msg.reply_to_message.caption || ''));
    return hit ? { url: hit[0] } : null;
  }
  async function download(c, ref, max) {
    if (ref.size && ref.size > max) fail(`Foto ${(ref.size / MB).toFixed(1)} MB melebihi batas ${Math.round(max / MB)} MB. Kirim yang lebih kecil.`);
    const f = await tg(c.token, 'getFile', { file_id: ref.fileId });
    if (!f.file_path) fail('Telegram tidak memberi file itu. Kirim ulang fotonya.');
    let buf;
    if (path.isAbsolute(f.file_path)) { try { buf = fs.readFileSync(f.file_path); } catch (_) { fail('File dari server Bot API lokal tidak bisa dibaca panel.'); } }
    else {
      let r; try { r = await fetch(`${baseUrl()}/file/bot${c.token}/${f.file_path}`, { signal: AbortSignal.timeout(60000) }); } catch (_) { fail('Gagal mengunduh foto dari Telegram.', 502); }
      if (!r.ok) fail('Gagal mengunduh foto dari Telegram.', 502);
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (buf.length > max) fail(`Foto melebihi batas ${Math.round(max / MB)} MB.`);
    return buf;
  }
  const needImage = (c, usage) => { const ref = imageRef(c); if (!ref) fail(`Foto tidak ditemukan.\n${usage}`); return ref; };

  /* --- Hasil Nexa --- */
  const localNexa = (src) => { const m = /^\/api\/nexa\/file\/([a-f0-9]{40}\.[a-z0-9]{2,4})$/.exec(src || ''); return m ? path.join(NEXA_DIR, m[1]) : null; };
  async function sendMedia(c, res) {
    const spoiler = res.blur ? { has_spoiler: true } : {};
    const kind = res.media;
    const meta = { image: ['sendPhoto', 'photo'], video: ['sendVideo', 'video'], audio: ['sendAudio', 'audio'] }[kind] || ['sendDocument', 'document'];
    const local = localNexa(res.src);
    if (local) {
      if (!fs.existsSync(local)) fail('Hasil sudah dihapus dari cache server. Coba lagi.');
      const ext = path.extname(local).slice(1);
      if (ext === 'gif') return sendPath(c, 'sendAnimation', 'animation', local, `hasil.${ext}`, spoiler);
      const extra = kind === 'video' ? { ...spoiler, supports_streaming: 'true' } : spoiler;
      if (kind === 'image') return sendImage(c, local, `hasil.${ext}`, extra);
      return sendPath(c, meta[0], meta[1], local, `hasil.${ext}`, extra);
    }
    // URL luar: coba kirim langsung, kalau Telegram gagal mengambil, unduh lalu unggah
    try { return await tg(c.token, meta[0], { ...baseFields(c), [meta[1]]: res.src, ...(kind === 'video' ? { supports_streaming: true } : {}), ...spoiler }, 60000); }
    catch (e) {
      let r; try { r = await fetch(res.src, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'panel-panel' } }); } catch (_) { throw e; }
      if (!r.ok) throw e;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 49 * MB) throw e;
      const ext = (/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3)(\?|#|$)/i.exec(res.src) || [0, kind === 'video' ? 'mp4' : 'jpg'])[1].toLowerCase();
      const tmp = path.join(os.tmpdir(), `zz-feat-${crypto.randomBytes(5).toString('hex')}.${ext}`);
      fs.writeFileSync(tmp, buf);
      try { return kind === 'image' ? await sendImage(c, tmp, `hasil.${ext}`, spoiler) : await sendPath(c, meta[0], meta[1], tmp, `hasil.${ext}`, spoiler); } finally { fs.rm(tmp, () => {}); }
    }
  }
  async function sendList(c, tool, res) {
    const items = res.items || [];
    if (!items.length) return plain(c, 'Tidak ada hasil.');
    const withText = items.find((i) => i.text);
    if (withText) {
      const head = [items[0].title, items[0].sub].filter(Boolean).join(' - ');
      return plain(c, `${head ? head + '\n\n' : ''}${withText.text}`);
    }
    const lines = items.slice(0, 8).map((it, i) => `<b>${i + 1}. ${esc(it.title || it.link || 'Tanpa judul')}</b>${it.sub ? `\n${esc(it.sub)}` : ''}${it.link ? `\n${esc(it.link)}` : ''}`);
    const imgs = items.filter((i) => i.image).slice(0, 5);
    if (imgs.length && ['pin', 'lahelu', 'stickerget'].includes(tool)) {
      try {
        if (imgs.length === 1) await tg(c.token, 'sendPhoto', { ...baseFields(c), photo: imgs[0].image }, 60000);
        else await tg(c.token, 'sendMediaGroup', { ...baseFields(c), media: imgs.map((i) => ({ type: 'photo', media: i.image })) }, 60000);
      } catch (_) { /* tautan gambar kadang ditolak Telegram, daftar teks tetap dikirim */ }
    }
    if (tool === 'pin' && items.every((i) => !i.title && !i.link)) return;
    await say(c, lines.join('\n\n'));
    if (tool === 'soundeffect') {
      const first = items.find((i) => i.link);
      if (first) {
        try {
          const d = await nexa.runTool('soundeffect_detail', { url: first.link });
          const au = (d.items || []).map((i) => i.audio).find(Boolean);
          if (au) await tg(c.token, 'sendAudio', { ...baseFields(c), audio: au, title: first.title || 'Sound effect' }, 60000);
        } catch (_) {}
      }
    }
  }

  /* --- Alat Nexa --- */
  const nowWib = () => ({
    date: new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
  });
  const parts = (s) => String(s || '').split('|').map((x) => x.trim());
  const replyText = (c) => { const r = c.msg.reply_to_message; return r ? String(r.text || r.caption || '') : ''; };
  const textArg = (c) => (c.args || replyText(c)).trim();
  const INPUT = {
    anime: () => ({}), pap: () => ({}),
    nokia: (c) => { const [text, from, date, time, title] = parts(textArg(c)); if (!text) fail(`Isi pesannya dulu.\n${c.row.usage}`); const n = nowWib(); const who = from || (c.msg.from && c.msg.from.first_name) || 'nexa'; return { text, from: who, date: date || n.date, time: time || n.time, title: title || who }; },
    ttqc: (c) => { const [url, name, ...rest] = parts(c.args); const text = rest.join('|').trim() || replyText(c); if (!/^https?:\/\/\S+$/i.test(url || '') || !name || !text) fail(`Formatnya: ${c.row.usage}`); return { url, name, text }; },
    fakeffduo: (c) => { const [a, b] = parts(textArg(c)); if (!a || !b) fail(`Formatnya: ${c.row.usage}`); return { nickname1: a, nickname2: b }; },
    fakeff: (c) => ({ usn: need(c) }),
    ytsearch: (c) => ({ q: need(c) }), lyric: (c) => ({ q: need(c) }), lahelu: (c) => ({ query: need(c) }), soundeffect: (c) => ({ q: need(c) }), pin: (c) => ({ q: need(c) }), mcpdl: (c) => ({ q: need(c) }),
    stickerget: (c) => { const u = need(c); if (!/^https?:\/\/\S+$/i.test(u)) fail(`Isi link Sticker.ly.\n${c.row.usage}`); return { url: u }; },
  };
  function need(c) { const t = textArg(c); if (!t) fail(`Teksnya belum diisi.\nCara pakai: ${c.row.usage}`); return t; }
  async function nexaTool(c, tool) {
    const input = (INPUT[tool] || ((x) => ({ text: need(x) })))(c);
    c.action(['bratvid', 'bratvid2', 'bratpatrick_video'].includes(tool) ? 'upload_video' : 'upload_photo');
    const res = await nexa.runTool(tool, input);
    if (res.kind === 'media') return sendMedia(c, res);
    if (res.kind === 'text') return plain(c, res.text);
    if (res.kind === 'list') return sendList(c, tool, res);
    return plain(c, 'Hasil dari Nexa tidak bisa ditampilkan.');
  }

  /* --- AI --- */
  const hist = new Map();
  const histGet = (key) => { const h = hist.get(key); if (!h || Date.now() - h.t > 20 * 60000) { hist.delete(key); return []; } return h.msgs; };
  const histPush = (key, q, a) => { const msgs = [...histGet(key), { role: 'user', content: clip(q, 1500) }, { role: 'assistant', content: clip(a, 1500) }].slice(-8); hist.set(key, { t: Date.now(), msgs }); if (hist.size > 200) hist.delete(hist.keys().next().value); };
  const SYS = 'Kamu asisten yang membantu lewat chat Telegram. Jawab ringkas dalam bahasa Indonesia kecuali pengguna memakai bahasa lain. Hindari tabel Markdown karena tidak tampil di Telegram.';

  let modelCache = { at: 0, list: null };
  async function groqModels() {
    if (modelCache.list && Date.now() - modelCache.at < 10 * 60000) return modelCache.list;
    const j = await api('GET', '/api/ai/models');
    if (!j.ready) fail('GROQ_API_KEY belum diisi di file .env.', 503);
    const list = (j.models || []).filter((m) => m.kind === 'chat' && m.available !== false);
    if (!list.length) fail('Tidak ada model Groq yang tersedia untuk key ini.', 503);
    modelCache = { at: Date.now(), list };
    return list;
  }
  async function groqModel() {
    const list = await groqModels(); const saved = readState().aiModel;
    return (list.find((m) => m.id === saved) || list.find((m) => /llama-3\.3-70b/.test(m.id)) || list[0]).id;
  }
  async function askGroq(c) {
    if (/^reset$/i.test(c.args)) { hist.delete(`${c.chatId}:groq`); return plain(c, 'Percakapan AI direset.'); }
    const q = textArg(c); if (!q) fail(`Pertanyaannya belum diisi.\nCara pakai: ${c.row.usage}`);
    const key = `${c.chatId}:groq`, model = await groqModel();
    c.action('typing');
    const raw = await api('POST', '/api/ai/chat', { model, messages: [{ role: 'system', content: SYS }, ...histGet(key), { role: 'user', content: clip(q, 6000) }] }, { text: true, timeout: 120000 });
    let out = '', err = '';
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
      try { const j = JSON.parse(d); if (j.error) err = (j.error.message || 'Groq mengirim error.'); const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (t) out += t; } catch (_) {}
    }
    out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!out) fail(err || 'AI tidak mengirim jawaban. Coba lagi.', 502);
    histPush(key, q, out);
    return plain(c, out);
  }
  async function aiModel(c) {
    const list = await groqModels(); const cur = await groqModel();
    const arg = c.args.trim();
    if (arg) {
      const pick = /^\d+$/.test(arg) ? list[Number(arg) - 1] : list.find((m) => m.id === arg);
      if (!pick) fail('Model tidak ditemukan. Lihat nomor di /aimodel.');
      const s = readState(); s.aiModel = pick.id; writeState(s);
      for (const k of [...hist.keys()]) if (k.endsWith(':groq')) hist.delete(k);
      return say(c, `Model AI sekarang: <b>${esc(pick.name || pick.id)}</b> (<code>${esc(pick.id)}</code>).`);
    }
    return say(c, `<b>Model AI Groq</b> (pilih dengan /aimodel nomor)\n\n${list.slice(0, 25).map((m, i) => `${i + 1}. ${m.id === cur ? '✅ ' : ''}${esc(m.name || m.id)}\n<code>${esc(m.id)}</code>`).join('\n')}`);
  }
  async function askNexa(c, id) {
    if (/^reset$/i.test(c.args)) { hist.delete(`${c.chatId}:${id}`); return plain(c, 'Percakapan direset.'); }
    const q = textArg(c); if (!q) fail(`Pertanyaannya belum diisi.\nCara pakai: ${c.row.usage}`);
    const key = `${c.chatId}:${id}`;
    c.action('typing');
    const prompt = nexa.promptFrom([...histGet(key), { role: 'user', content: clip(q, 1500) }]);
    const a = await nexa.askModel(id, prompt);
    histPush(key, q, a.text);
    return plain(c, a.text);
  }

  /* --- Foto: Wink dan Img to URL --- */
  async function runWink(c, toolId, res) {
    const ref = needImage(c, `Cara pakai: ${c.row.usage}`);
    c.action('upload_photo');
    let source;
    if (ref.url) source = { url: ref.url };
    else { const buf = await download(c, ref, 12 * MB); source = { file: (await api('POST', '/api/wink/upload', buf)).file }; }
    const started = await api('POST', '/api/wink/run', { tool: toolId, ...(res ? { resolusi: res } : {}), source });
    const t0 = Date.now(); let job;
    while (Date.now() - t0 < 175000) {
      await sleep(2500);
      job = await api('GET', `/api/wink/job/${started.job}`);
      if (job.status !== 'running') break;
    }
    if (!job || job.status === 'running') fail('Proses terlalu lama. Coba lagi nanti.', 504);
    if (job.status === 'error') fail(job.error || 'Proses gagal.', 502);
    const r = job.result, file = path.join(WINK_DIR, r.file);
    if (!fs.existsSync(file)) fail('Hasil tidak ditemukan di server.', 500);
    const caption = `${r.label} · ${(r.ms / 1000).toFixed(1)} dtk`;
    if (toolId === 'remove' || r.bytes > 9.5 * MB) return sendPath(c, 'sendDocument', 'document', file, `hasil-${r.tool}.${r.ext}`, { caption });
    return sendImage(c, file, `hasil-${r.tool}.${r.ext}`, { caption });
  }
  async function imgUpload(c) {
    const ref = needImage(c, `Cara pakai: ${c.row.usage}`);
    if (ref.url) fail('Kirim atau balas fotonya langsung (bukan link).');
    c.action('upload_photo');
    const buf = await download(c, ref, 10 * MB);
    const j = await api('POST', `/api/img/upload?name=${encodeURIComponent('telegram')}`, buf);
    const it = j.item;
    return tg(c.token, 'sendMessage', { ...baseFields(c), parse_mode: 'HTML', text: `✅ Foto tersimpan.\n<code>${esc(it.url)}</code>\n${(it.size / 1024).toFixed(0)} KB`, reply_markup: { inline_keyboard: [[{ text: 'Buka gambar', url: it.url }]] }, link_preview_options: { is_disabled: true } });
  }
  async function imgList(c) {
    const j = await api('GET', '/api/img/list');
    if (!j.items.length) return plain(c, 'Belum ada foto di Img to URL.');
    return say(c, `<b>Img to URL</b> (${j.items.length} terakhir)\n\n${j.items.slice(0, 10).map((x, i) => `${i + 1}. ${esc(x.name)}\n${esc(x.url)}`).join('\n\n')}`);
  }

  /* --- Situs --- */
  const upTest = async (host) => { try { const r = await fetch(`https://${host}`, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'panel-panel-bot' } }); return r.status < 500; } catch (_) { return false; } };
  async function siteList(c) {
    const j = await api('GET', '/api/sites'); const rows = j.sites || [];
    if (!rows.length) return plain(c, 'Belum ada situs. Kirim file .zip atau .html dengan caption /situsdeploy vercel subdomain.');
    c.action('typing');
    const st = await Promise.all(rows.map((s) => upTest(s.host)));
    return say(c, `<b>Situs (${rows.length})</b>\n\n${rows.map((s, i) => `${st[i] ? '🟢' : '🔴'} <b>${i + 1}. ${esc(s.host)}</b>\n${esc(s.platform)} · ${esc(s.source || '-')}${s.deployedAt ? ` · deploy ${esc(new Date(s.deployedAt).toLocaleDateString('id-ID'))}` : ''}`).join('\n\n')}`);
  }
  const pickRow = (rows, arg, label) => {
    const n = Number(arg); if (Number.isInteger(n) && n >= 1 && n <= rows.length) return rows[n - 1];
    fail(`Nomor ${label} tidak valid. Lihat daftar dulu.`);
  };
  async function siteDeploy(c) {
    const doc = [c.msg, c.msg.reply_to_message].map((m) => m && m.document).find(Boolean);
    const a = c.args.trim().split(/\s+/).filter(Boolean);
    if (!doc || !a.length) fail(`Kirim file .zip atau .html dengan caption, atau balas file itu.\nCara pakai: ${c.row.usage}`);
    const name = String(doc.file_name || ''); const isHtml = /\.html?$/i.test(name) || doc.mime_type === 'text/html', isZip = /\.zip$/i.test(name) || /zip/.test(doc.mime_type || '');
    if (!isHtml && !isZip) fail('File harus .zip atau .html.');
    c.action('upload_document');
    const buf = await download(c, { fileId: doc.file_id, size: doc.file_size }, 20 * MB);
    const type = isHtml ? 'text/html' : 'application/zip';
    if (/^\d+$/.test(a[0])) {
      const rows = (await api('GET', '/api/sites')).sites; const row = pickRow(rows, a[0], 'situs');
      await api('POST', `/api/sites/${row.id}/redeploy`, buf, { type, timeout: 170000 });
      return say(c, `✅ <b>${esc(row.host)}</b> sudah di-deploy ulang.\nSertifikat dan DNS tidak berubah.`);
    }
    if (a.length < 2) fail(`Isi platform dan subdomain.\nCara pakai: ${c.row.usage}`);
    const j = await api('POST', `/api/sites?platform=${encodeURIComponent(a[0].toLowerCase())}&label=${encodeURIComponent(a[1].toLowerCase())}`, buf, { type, timeout: 170000 });
    return say(c, `✅ Situs dibuat: <b>${esc(j.site.host)}</b>\n${esc(j.site.url)}\nHTTPS biasanya aktif beberapa menit setelah DNS terbaca.`);
  }
  async function siteRemove(c) {
    const a = c.args.trim().split(/\s+/);
    const rows = (await api('GET', '/api/sites')).sites; const row = pickRow(rows, a[0], 'situs');
    if (a[1] !== 'ya') return say(c, `Hapus <b>${esc(row.host)}</b> dari ${esc(row.platform)} dan DNS-nya?\nKetik <code>/situshapus ${esc(a[0])} ya</code> untuk melanjutkan.`);
    const j = await api('DELETE', `/api/sites/${row.id}`);
    return say(c, `🗑 <b>${esc(row.host)}</b> dihapus.${j.problems && j.problems.length ? `\nCatatan: ${esc(j.problems.join('; '))}` : ''}`);
  }

  /* --- APK --- */
  const apkIcon = { done: '✅', success: '✅', failed: '❌', failure: '❌', queued: '⏳', running: '🔨', building: '🔨' };
  async function apkList(c) {
    const j = await api('GET', '/api/apk');
    if (!j.tokenOk) fail('GITHUB_TOKEN belum diisi di file .env.', 503);
    if (!j.repo) fail('Builder belum disiapkan. Buka menu APK di panel dan tekan "Siapkan builder".', 503);
    if (!j.builds.length) return plain(c, 'Belum ada build. Mulai dengan /apkbuild https://situs.com | Nama App');
    return say(c, `<b>Build APK</b> (${Math.min(10, j.builds.length)} terakhir)\n\n${j.builds.slice(0, 10).map((b, i) => `${apkIcon[b.status] || '•'} <b>${i + 1}. ${esc(b.name)}</b> v${esc(b.versionName)}\n${esc(b.status)} · ${esc(new Date(b.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }))}`).join('\n\n')}\n\nUnduh: /apkunduh nomor`);
  }
  async function apkBuild(c) {
    const [url, nameIn, pkgIn] = parts(c.args);
    if (!/^https?:\/\/\S+$/i.test(url || '')) fail(`Isi URL web yang diawali http:// atau https://\nCara pakai: ${c.row.usage}`);
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = (nameIn || host.split('.')[0]).replace(/[^\p{L}\p{N} ._&!+()-]/gu, '').slice(0, 40) || 'App';
    const slug = (host.split('.')[0] || 'app').toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
    const pkg = (pkgIn || `${process.env.APK_PACKAGE_PREFIX || 'com.example.app'}.${/^[a-z]/.test(slug) ? slug : 'app' + slug}`).toLowerCase();
    const list = await api('GET', '/api/apk');
    if (!list.repo) fail('Builder belum disiapkan. Buka menu APK di panel dan tekan "Siapkan builder".', 503);
    const versionCode = list.builds.filter((b) => b.pkg === pkg).length + 1;
    const bg = ICON_COLORS[crypto.createHash('md5').update(pkg).digest()[0] % ICON_COLORS.length];
    const icons = {}; for (const s of [48, 72, 96, 144, 192, 512]) icons[s] = `data:image/png;base64,${iconPng(s, bg, [255, 255, 255]).toString('base64')}`;
    const j = await api('POST', '/api/apk/build', { config: { name, pkg, versionName: '1.0.0', versionCode, splash: { enabled: true, tagline: '' }, ui: { pullToRefresh: true, topProgress: true } }, source: { type: 'url', url }, icons }, { timeout: 120000 });
    return say(c, `🔨 Build dimulai: <b>${esc(j.build.name)}</b> (<code>${esc(j.build.pkg)}</code>, kode ${versionCode})\nButuh sekitar 3 sampai 6 menit. Cek dengan /apk, lalu /apkunduh nomor.\nIkon memakai warna polos; untuk ikon sendiri pakai menu APK di panel.`);
  }
  async function apkGet(c) {
    const j = await api('GET', '/api/apk'); const b = pickRow(j.builds, c.args.trim(), 'build');
    if (b.status !== 'success') fail(`Build "${b.name}" berstatus ${b.status}, belum bisa diunduh.`);
    c.action('upload_document');
    const buf = await api('GET', `/api/apk/${b.id}/download`, undefined, { binary: true, timeout: 120000 });
    if (buf.length > 49 * MB && !c.bigOk) fail(`APK ${(buf.length / MB).toFixed(0)} MB melebihi batas kirim bot. Unduh dari tab APK di panel.`);
    return sendBuf(c, 'sendDocument', 'document', buf, `${b.name.replace(/[^\w.-]+/g, '_')}-${b.versionName}.apk`, { caption: `${b.name} v${b.versionName}` });
  }
  async function apkRemove(c) {
    const a = c.args.trim().split(/\s+/);
    const j = await api('GET', '/api/apk'); const b = pickRow(j.builds, a[0], 'build');
    if (a[1] !== 'ya') return say(c, `Hapus riwayat build <b>${esc(b.name)}</b> v${esc(b.versionName)}?\nKetik <code>/apkhapus ${esc(a[0])} ya</code> untuk melanjutkan.`);
    await api('DELETE', `/api/apk/${b.id}`);
    return say(c, `🗑 Riwayat build <b>${esc(b.name)}</b> dihapus.`);
  }

  /* --- Bot Host --- */
  const botIcon = { running: '🟢', installing: '🟡', crashed: '🔴', stopped: '⚪' };
  async function botPick(c) {
    const arg = c.args.trim().split(/\s+/)[0]; const rows = (await api('GET', '/api/bots')).bots;
    if (!rows.length) fail('Belum ada bot. Unggah ZIP di tab Bot Host pada panel.');
    if (!arg) fail(`Isi nomor atau nama bot.\nCara pakai: ${c.row.usage}`);
    const n = Number(arg);
    const b = Number.isInteger(n) ? rows[n - 1] : rows.find((x) => x.name.toLowerCase() === arg.toLowerCase()) || rows.find((x) => x.name.toLowerCase().includes(arg.toLowerCase()) || x.id.startsWith(arg));
    if (!b) fail('Bot tidak ditemukan. Lihat daftar di /bots.');
    return b;
  }
  async function botsList(c) {
    const rows = (await api('GET', '/api/bots')).bots;
    if (!rows.length) return plain(c, 'Belum ada bot. Unggah ZIP di tab Bot Host pada panel.');
    return say(c, `<b>Bot Host (${rows.length})</b>\n\n${rows.map((b, i) => `${botIcon[b.state] || '⚪'} <b>${i + 1}. ${esc(b.name)}</b>\n${esc(b.runtime)} · ${esc(b.state)}${b.autostart ? ' · auto-start' : ''}`).join('\n\n')}`);
  }
  async function botAct(c, act) {
    const b = await botPick(c);
    await api('POST', `/api/bots/${b.id}/${act}`);
    await sleep(1200);
    const lg = await api('GET', `/api/bots/${b.id}/log?since=0`);
    const word = { start: 'dijalankan', stop: 'dihentikan', restart: 'dimulai ulang' }[act];
    return say(c, `${botIcon[lg.state] || '⚪'} <b>${esc(b.name)}</b> ${word}. Status: ${esc(lg.state)}.`);
  }
  async function botLog(c) {
    const b = await botPick(c); const n = Math.min(60, Math.max(5, Number(c.args.trim().split(/\s+/)[1]) || 25));
    const lg = await api('GET', `/api/bots/${b.id}/log?since=0`);
    const lines = lg.lines.slice(-n).map((l) => l.s);
    return say(c, `<b>${esc(b.name)}</b> · ${esc(lg.state)}\n<pre>${esc(lines.join('\n') || '(belum ada output)').slice(-3500)}</pre>`);
  }

  /* --- DNS --- */
  async function dnsRecords() { return (await api('GET', '/api/dns')); }
  async function dnsList(c) {
    const j = await dnsRecords();
    return say(c, `<b>DNS ${esc(j.zone)}</b> (${j.records.length} record)\n\n${j.records.slice(0, 60).map((r, i) => `${i + 1}. ${r.proxied ? '☁️' : '▫️'} <b>${esc(r.type)}</b> ${esc(r.name)}\n   → ${esc(clip(r.content, 70))}`).join('\n')}${j.records.length > 60 ? '\n\n(60 pertama)' : ''}`);
  }
  async function dnsAdd(c) {
    const a = c.args.trim().split(/\s+/).filter(Boolean);
    if (a.length < 3) fail(`Formatnya: ${c.row.usage}`);
    const proxied = /^(proxy|proxied|on|ya)$/i.test(a[a.length - 1]); const content = (proxied ? a.slice(2, -1) : a.slice(2)).join(' ');
    const j = await api('POST', '/api/dns', { label: a[0], type: a[1], content, proxied });
    return say(c, `✅ Record dibuat: <b>${esc(j.record.type)}</b> ${esc(j.record.name)} → ${esc(j.record.content)}${j.record.proxied ? ' ☁️' : ''}`);
  }
  async function dnsDel(c) {
    const a = c.args.trim().split(/\s+/); const j = await dnsRecords();
    const r = /^\d+$/.test(a[0] || '') ? j.records[Number(a[0]) - 1] : j.records.find((x) => x.name === a[0]);
    if (!r) fail('Record tidak ditemukan. Lihat nomor di /dns.');
    if (a[1] !== 'ya') return say(c, `Hapus record <b>${esc(r.type)}</b> ${esc(r.name)} → ${esc(clip(r.content, 60))}?\nKetik <code>/dnsdel ${esc(a[0])} ya</code> untuk melanjutkan.`);
    await api('DELETE', `/api/dns/${r.id}`);
    return say(c, `🗑 Record ${esc(r.name)} dihapus.`);
  }

  /* --- Telegram: target, kirim, jadwal, notifikasi --- */
  const tgStatus = () => api('GET', '/api/tg/status');
  async function targetList(c) {
    const s = await tgStatus();
    if (!s.targets.length) return plain(c, 'Belum ada target. Tambahkan grup atau saluran di tab Grup & Saluran pada panel.');
    return say(c, `<b>Target (${s.targets.length})</b>\n\n${s.targets.map((t, i) => `${t.canPost ? '✅' : '⚠️'} <b>${i + 1}. ${esc(t.title)}</b>\n${esc(t.type === 'channel' ? 'Saluran' : t.type === 'private' ? 'Pribadi' : 'Grup')}${t.username ? ' · @' + esc(t.username) : ''}`).join('\n\n')}`);
  }
  async function tgSend(c) {
    const m = /^(\S+)\s+([\s\S]+)$/.exec(c.args.trim());
    if (!m) fail(`Formatnya: ${c.row.usage}`);
    const s = await tgStatus(); if (!s.targets.length) fail('Belum ada target.');
    let ids;
    if (/^semua$/i.test(m[1])) ids = s.targets.map((t) => t.id);
    else { ids = m[1].split(',').map((n) => (s.targets[Number(n) - 1] || {}).id).filter(Boolean); if (!ids.length) fail('Nomor target tidak valid. Lihat /targets.'); }
    const j = await api('POST', '/api/tg/send', { text: m[2], targets: ids });
    const ok = j.results.filter((r) => r.ok).length;
    return say(c, `📨 Terkirim ke ${ok}/${j.results.length} target.${j.results.filter((r) => !r.ok).map((r) => `\n⚠️ ${esc(r.title)}: ${esc(r.error)}`).join('')}`);
  }
  async function scheduleList(c) {
    const s = await tgStatus();
    if (!s.schedules.length) return plain(c, 'Belum ada jadwal. Buat di tab Jadwal pada panel.');
    const rep = { none: 'sekali', daily: 'tiap hari', weekly: 'tiap minggu' };
    return say(c, `<b>Jadwal (${s.schedules.length})</b>\n\n${s.schedules.map((x, i) => `${x.active ? '⏰' : '⏹'} <b>${i + 1}.</b> ${esc(clip(x.text || '(foto)', 60))}\n${esc(new Date(x.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }))} WIB · ${rep[x.repeat] || x.repeat} · ${x.targets.length} target${x.lastResult ? ` · terakhir ${esc(x.lastResult)}` : ''}`).join('\n\n')}`);
  }
  async function notifyCmd(c) {
    const s = await tgStatus(); const n = { ...s.notify };
    const a = c.args.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const flag = (w) => (w === 'on' || w === 'nyala' ? true : w === 'off' || w === 'mati' ? false : null);
    if (a.length) {
      if (['apk', 'situs'].includes(a[0])) { const f = flag(a[1]); if (f === null) fail(`Formatnya: ${c.row.usage}`); n[a[0] === 'apk' ? 'apk' : 'site'] = f; }
      else { const f = flag(a[0]); if (f === null) fail(`Formatnya: ${c.row.usage}`); n.enabled = f; }
      await api('POST', '/api/tg/notify', n);
    }
    const tick = (v) => (v ? '✅ aktif' : '⛔ mati');
    return say(c, `<b>Notifikasi otomatis</b>\nSemua: ${tick(n.enabled)}\nBuild APK: ${tick(n.apk)}\nSitus mati/pulih: ${tick(n.site)}\nKirim file APK: ${tick(n.apkFile)}\nTarget: ${(n.targets || []).length}`);
  }

  /* --- Panel --- */
  const up = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + ' hari ' : ''}${h ? h + ' jam ' : ''}${m} mnt`; };
  async function panelStatus(c) {
    const get = (p) => api('GET', p).catch((e) => ({ _err: e.message }));
    const [me, ai, wk, img, sites, apk, bots, tgs] = await Promise.all(['/api/me', '/api/ai/status', '/api/wink/status', '/api/img/status', '/api/sites', '/api/apk', '/api/bots', '/api/tg/status'].map(get));
    const ok = (v) => (v ? '✅' : '⛔');
    const L = [
      `<b>${process.env.BRAND_NAME || 'Panel'}</b> · aktif ${up(process.uptime())}`,
      `${ok(me.cloudflareReady)} Cloudflare${me.zone ? ' (' + esc(me.zone) + ')' : ''}`,
      `${ok(ai.ready)} AI Groq${ai.ready ? ' · model ' + esc(readState().aiModel || 'otomatis') : ' · GROQ_API_KEY belum diisi'}`,
      `${ok(img.ready)} Img to URL (Supabase)${img.ready && img.bucketOk === false ? ' · bucket belum disiapkan' : ''}`,
      `${ok(wk.ready)} Wink${wk.ready ? '' : ' · butuh Supabase'}`,
      sites._err ? `⚠️ Situs: ${esc(sites._err)}` : `🌐 Situs: ${sites.sites.length}${['vercel', 'netlify'].map((p) => ` · ${p} ${ok(sites.platforms && sites.platforms[p])}`).join('')}`,
      apk._err ? `⚠️ APK: ${esc(apk._err)}` : `📱 APK: ${apk.repo ? apk.builds.length + ' build' : 'builder belum disiapkan'}${apk.tokenOk ? '' : ' · GITHUB_TOKEN kosong'}`,
      bots._err ? `⚠️ Bot Host: ${esc(bots._err)}` : `🤖 Bot Host: ${bots.bots.filter((b) => b.state === 'running').length}/${bots.bots.length} berjalan`,
      tgs._err ? `⚠️ Telegram: ${esc(tgs._err)}` : `✈️ Telegram: ${tgs.targets.length} target, ${tgs.schedules.filter((s) => s.active).length} jadwal aktif, notifikasi ${tgs.notify.enabled ? 'aktif' : 'mati'}`,
    ];
    return say(c, L.join('\n'));
  }
  function commandList(c) {
    const cfg = getCfg(); const by = {};
    for (const x of cfg.commands) (by[x.group || 'Lainnya'] = by[x.group || 'Lainnya'] || []).push(x);
    const order = [...GROUP_ORDER, ...Object.keys(by).filter((g) => !GROUP_ORDER.includes(g))].filter((g) => by[g]);
    return say(c, `<b>Command</b> · ${cfg.enabled ? 'semua aktif' : '⛔ saklar utama mati'}\n\n${order.map((g) => `<b>${esc(g)}</b>\n${by[g].map((x) => `${x.enabled ? '✅' : '⛔'} /${esc(x.cmd)}${x.access === 'owner' ? ' 🔒' : ''}`).join('  ')}`).join('\n\n')}\n\n🔒 = hanya pemilik. Atur dengan /cmdon dan /cmdoff.`);
  }
  async function cmdToggle(c, on) {
    const name = c.args.trim().replace(/^\//, '').toLowerCase(); if (!name) fail(`Isi nama command.\nCara pakai: ${c.row.usage}`);
    const row = getCfg().commands.find((x) => x.cmd === name); if (!row) fail(`Command /${name} tidak ada. Lihat /perintah.`);
    if (!on && ['cmdon', 'cmdoff', 'perintah'].includes(name)) fail(`/${name} tidak boleh dimatikan lewat bot supaya kamu tidak terkunci. Matikan dari panel kalau memang perlu.`);
    await api('POST', `/api/tg/commands/${row.id}/toggle`, { enabled: on });
    return say(c, `/${esc(name)} ${on ? '✅ dinyalakan' : '⛔ dimatikan'}. Menu Telegram diperbarui otomatis.`);
  }

  /* ---------- Penjadwal eksekusi ---------- */
  const busy = new Set(); let active = 0;
  async function run(row, token, tdb, msg, args, isOwner) {
    const chatId = msg.chat.id;
    if (busy.has(chatId)) fail('Masih memproses permintaan sebelumnya di chat ini. Tunggu sebentar.');
    if (active >= 4) fail('Bot sedang sibuk memproses banyak permintaan. Coba lagi sebentar lagi.');
    busy.add(chatId); active += 1;
    let timer = null;
    const c = { token, tdb, msg, chatId, args: String(args || '').trim(), isOwner, row, action: (a) => { clearInterval(timer); const send = () => tg(token, 'sendChatAction', { chat_id: chatId, action: a, ...(msg.is_topic_message && msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}) }).catch(() => {}); send(); timer = setInterval(send, 4000); } };
    try {
      const f = row.feature, [kind, a, b] = f.split(':');
      if (kind === 'nexa') return await nexaTool(c, f.slice(5));
      if (f === 'ai:groq') return await askGroq(c);
      if (f === 'ai:model') return await aiModel(c);
      if (kind === 'ainexa') return await askNexa(c, a);
      if (kind === 'wink') return await runWink(c, a, Number(b) || 0);
      const map = {
        'img:upload': imgUpload, 'img:list': imgList, 'sites:list': siteList, 'sites:deploy': siteDeploy, 'sites:remove': siteRemove,
        'apk:list': apkList, 'apk:build': apkBuild, 'apk:get': apkGet, 'apk:remove': apkRemove,
        'bots:list': botsList, 'bots:start': (x) => botAct(x, 'start'), 'bots:stop': (x) => botAct(x, 'stop'), 'bots:restart': (x) => botAct(x, 'restart'), 'bots:log': botLog,
        'dns:list': dnsList, 'dns:add': dnsAdd, 'dns:del': dnsDel, 'tg:targets': targetList, 'tg:send': tgSend, 'tg:schedules': scheduleList, 'tg:notify': notifyCmd,
        'panel:status': panelStatus, 'panel:commands': commandList, 'panel:cmdon': (x) => cmdToggle(x, true), 'panel:cmdoff': (x) => cmdToggle(x, false),
      };
      if (!map[f]) fail('Fitur ini belum tersedia.');
      return await map[f](c);
    } finally { clearInterval(timer); busy.delete(chatId); active -= 1; }
  }

  return { run, catalog, GROUP_ORDER };
}

module.exports = create;
module.exports.catalog = catalog;
module.exports.GROUP_ORDER = GROUP_ORDER;
module.exports.iconPng = iconPng;
