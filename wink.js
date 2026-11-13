// Wink: perbaiki dan olah foto lewat endpoint NexaDev (HD, Remini, Wink, Upscale, Hapus background).
// Foto diunggah ke Supabase (Img to URL) supaya Nexa bisa mengambilnya, lalu proses jalan sebagai job di server
// dan hasilnya disimpan lokal untuk perbandingan before/after, rantai proses, dan riwayat.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const NEXA = process.env.NEXA_API_BASE || 'https://api.nexadev.my.id';
const DIR = path.join(__dirname, 'data', 'wink');
const HIST = path.join(DIR, 'history.json');
const MAX_UPLOAD = 12 * 1024 * 1024;
const MAX_RESULT = 40 * 1024 * 1024;
const NAME_RX = /^(orig|res)-[a-f0-9]{16}\.(png|jpg|webp|gif)$/;
const TEMP_AGE_MS = 3 * 3600 * 1000;

const TOOLS = [
  { id: 'hd', label: 'HD', path: '/tools/hd/', param: 'image', desc: 'Perjelas dan pertajam foto agar lebih HD.' },
  { id: 'remini', label: 'Remini', path: '/api/remini', param: 'url', desc: 'Pulihkan detail dan wajah yang buram, gaya Remini.' },
  { id: 'wink', label: 'Wink', path: '/api/wink', param: 'url', desc: 'Peningkat kualitas foto gaya Wink.' },
  { id: 'upscale', label: 'Upscale', path: '/api/upscale', param: 'url', desc: 'Perbesar resolusi foto.' },
  { id: 'upscale1', label: 'Upscale 2x/4x', path: '/api/upscale1', param: 'url', desc: 'Perbesar dengan kelipatan yang kamu pilih.', options: { resolusi: [2, 4] } },
  { id: 'remove', label: 'Hapus BG', path: '/tools/remove/', param: 'url', desc: 'Hapus latar belakang. Hasilnya PNG transparan.' },
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Gambar ---------- */
function sniff(b) {
  if (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return ['png', 'image/png'];
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return ['gif', 'image/gif'];
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
  return null;
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/* ---------- Unduh aman (hasil dari API pihak ketiga) ---------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1' || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('fc') || l.startsWith('fd')) return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    return m ? isPrivateIp(m[1]) : false;
  }
  return true;
}
async function assertPublicHost(host) {
  if (net.isIP(host)) { if (isPrivateIp(host)) fail('Alamat hasil mengarah ke jaringan privat, ditolak.', 502); return; }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch (_) { fail('Domain hasil dari Nexa tidak bisa ditemukan.', 502); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) fail('Alamat hasil mengarah ke jaringan privat, ditolak.', 502);
}
async function safeDownload(u, hops = 0) {
  let url;
  try { url = new URL(u); } catch (_) { fail('Alamat hasil dari Nexa tidak valid.', 502); }
  if (!['http:', 'https:'].includes(url.protocol)) fail('Alamat hasil dari Nexa tidak valid.', 502);
  if (url.port && !['80', '443'].includes(url.port)) fail('Port alamat hasil tidak diizinkan.', 502);
  await assertPublicHost(url.hostname.replace(/^\[|\]$/g, ''));
  let r;
  try { r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'panel-panel' } }); }
  catch (_) { fail('Gagal mengunduh hasil dari Nexa.', 502); }
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    const loc = r.headers.get('location');
    if (!loc || hops >= 3) fail('Pengalihan hasil dari Nexa tidak valid.', 502);
    return safeDownload(new URL(loc, url).href, hops + 1);
  }
  if (!r.ok) fail(`Gagal mengunduh hasil dari Nexa (status ${r.status}).`, 502);
  if (Number(r.headers.get('content-length') || 0) > MAX_RESULT) fail('Hasil dari Nexa terlalu besar.', 502);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_RESULT) fail('Hasil dari Nexa terlalu besar.', 502);
  return buf;
}

const PRIORITY = ['result', 'url', 'image', 'imageUrl', 'output', 'hd', 'enhanced', 'data'];
function findUrl(v, d = 0) {
  if (typeof v === 'string') return /^https?:\/\/\S+$/i.test(v) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
  if (d > 4 || !v || typeof v !== 'object') return null;
  if (Array.isArray(v)) { for (const x of v) { const r = findUrl(x, d + 1); if (r) return r; } return null; }
  for (const k of PRIORITY) if (k in v) { const r = findUrl(v[k], d + 1); if (r) return r; }
  for (const x of Object.values(v)) { const r = findUrl(x, d + 1); if (r) return r; }
  return null;
}

/* ---------- Panggilan ke Nexa ---------- */
async function callNexa(tool, imageUrl, opts) {
  const u = new URL(NEXA + tool.path);
  u.searchParams.set(tool.param, imageUrl);
  if (tool.id === 'upscale1') u.searchParams.set('resolusi', String(opts.resolusi));
  let r;
  try { r = await fetch(u, { headers: { 'User-Agent': 'panel-panel', Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(170000) }); }
  catch (e) { fail(e.name === 'TimeoutError' ? 'Nexa terlalu lama memproses foto ini (lebih dari 2,5 menit). Coba foto yang lebih kecil.' : 'Tidak bisa terhubung ke layanan Nexa.', 502); }
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('json') || ct.includes('text')) {
    const j = await r.json().catch(() => null);
    if (!j) fail(`Nexa mengirim respons yang tidak bisa dibaca (status ${r.status}).`, 502);
    if (j.status === false || j.success === false || (j.statusCode && j.statusCode >= 400) || (!r.ok && !findUrl(j))) {
      const m = String(j.message || j.error || 'Nexa mengembalikan error.');
      fail(/gagal terhubung/i.test(m) ? `${m} Biasanya karena Nexa tidak bisa mengambil gambar atau layanan sumbernya sedang sibuk. Coba lagi.` : m, 502);
    }
    const found = findUrl(j);
    if (!found) fail('Nexa tidak mengirim gambar hasil. Coba lagi atau pakai alat lain.', 502);
    const m = /^data:image\/[a-z]+;base64,(.+)$/.exec(found);
    return m ? Buffer.from(m[1], 'base64') : safeDownload(found);
  }
  if (!r.ok) fail(`Nexa mengembalikan status ${r.status}.`, 502);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_RESULT) fail('Hasil dari Nexa terlalu besar.', 502);
  return buf;
}

/* ---------- Penyimpanan lokal dan riwayat ---------- */
const readHist = () => { try { const j = JSON.parse(fs.readFileSync(HIST, 'utf8')); return Array.isArray(j) ? j : []; } catch (_) { return []; } };
function writeHist(h) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(HIST + '.tmp', JSON.stringify(h)); fs.renameSync(HIST + '.tmp', HIST); }
function storeFile(prefix, buf, ext) {
  const name = `${prefix}-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`;
  fs.mkdirSync(DIR, { recursive: true });
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, buf);
  else fs.utimesSync(p, new Date(), new Date());
  return name;
}
const refs = (h) => new Set(h.flatMap((e) => [e.file, e.orig].filter(Boolean)));
function dropFiles(names, h) {
  const keep = refs(h);
  for (const n of names) if (n && NAME_RX.test(n) && !keep.has(n)) fs.rmSync(path.join(DIR, n), { force: true });
}
function addHist(entry) {
  const all = [entry, ...readHist()];
  const keep = all.slice(0, 60), drop = all.slice(60);
  writeHist(keep);
  dropFiles(drop.flatMap((e) => [e.file, e.orig]), keep);
}
function sweepLocal() {
  try {
    const keep = refs(readHist()), now = Date.now();
    for (const f of fs.readdirSync(DIR)) {
      if (!NAME_RX.test(f) || keep.has(f)) continue;
      if (now - fs.statSync(path.join(DIR, f)).mtimeMs > 24 * 3600 * 1000) fs.rmSync(path.join(DIR, f), { force: true });
    }
  } catch (_) {}
}

module.exports = function registerWink({ app, express, wrap, needHeader, img }) {
  const imgApi = () => img.api;
  const needSupabase = () => { if (!imgApi() || !imgApi().ready()) fail('Supabase belum disiapkan. Isi dulu di menu Img to URL, atau tempel link gambar yang bisa dibuka publik.', 503); };

  const jobs = new Map();
  const view = (e) => ({ id: e.id, file: e.file, tool: e.tool, label: e.label, resolusi: e.resolusi || undefined, createdAt: e.createdAt, ms: e.ms, bytes: e.bytes, src: `/api/wink/file/${e.file}`, ext: e.file.split('.').pop(), origSrc: e.orig ? `/api/wink/file/${e.orig}` : undefined, origUrl: e.origUrl || undefined, saved: e.saved || undefined });

  async function sweepRemote() {
    if (!imgApi() || !imgApi().ready()) return;
    try {
      const old = (await imgApi().listRaw()).filter((o) => o && /^wink-/.test(o.name) && Date.now() - Date.parse(o.created_at || o.updated_at || 0) > TEMP_AGE_MS).map((o) => o.name);
      if (old.length) await imgApi().remove(old);
    } catch (_) { /* pembersihan opsional */ }
  }

  app.get('/api/wink/status', (req, res) => {
    res.json({ ready: Boolean(imgApi() && imgApi().ready()), tools: TOOLS.map(({ id, label, desc, options }) => ({ id, label, desc, options })) });
  });

  app.post('/api/wink/upload', needHeader, express.raw({ type: () => true, limit: MAX_UPLOAD + 1024 }), wrap(async (req, res) => {
    needSupabase();
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) fail('Tidak ada file yang dikirim.');
    if (buf.length > MAX_UPLOAD) fail('Foto melebihi 12 MB.', 413);
    const kind = sniff(buf);
    if (!kind) fail('Format tidak didukung. Pakai PNG, JPG, GIF, atau WebP (HEIC belum didukung).', 415);
    const orig = storeFile('orig', buf, kind[0]);
    const up = await imgApi().put(buf, 'wink');
    sweepLocal();
    sweepRemote();
    res.status(201).json({ file: orig, src: `/api/wink/file/${orig}`, url: up.url, size: buf.length });
  }));

  app.post('/api/wink/run', needHeader, express.json({ limit: '20kb' }), wrap(async (req, res) => {
    const b = req.body || {};
    const tool = TOOL[String(b.tool || '')];
    if (!tool) fail('Alat tidak dikenal.');
    const opts = {};
    if (tool.options) {
      opts.resolusi = Number(b.resolusi || tool.options.resolusi[1]);
      if (!tool.options.resolusi.includes(opts.resolusi)) fail(`Pilihan ukuran harus ${tool.options.resolusi.join(' atau ')}.`);
    }
    if ([...jobs.values()].filter((j) => j.status === 'running').length >= 3) fail('Masih ada 3 proses berjalan. Tunggu salah satunya selesai.', 429);

    const src = b.source || {};
    let imageUrl, tempName = null, srcFile = null;
    if (src.file) {
      if (!NAME_RX.test(String(src.file)) || !fs.existsSync(path.join(DIR, src.file))) fail('File sumber tidak ditemukan.', 404);
      srcFile = src.file;
      needSupabase();
      const up = await imgApi().put(fs.readFileSync(path.join(DIR, src.file)), 'wink');
      imageUrl = up.url; tempName = up.name;
    } else if (typeof src.url === 'string' && /^https?:\/\/\S{3,2000}$/i.test(src.url.trim())) {
      imageUrl = src.url.trim();
    } else fail('Sumber foto tidak valid.');

    const orig = typeof b.orig === 'string' && NAME_RX.test(b.orig) && fs.existsSync(path.join(DIR, b.orig)) ? b.orig : (srcFile && /^orig-/.test(srcFile) ? srcFile : null);
    const origUrl = !orig && typeof b.origUrl === 'string' && /^https?:\/\/\S{3,2000}$/i.test(b.origUrl) ? b.origUrl : (!orig && !srcFile ? imageUrl : null);

    const id = crypto.randomBytes(6).toString('hex');
    const job = { status: 'running', startedAt: Date.now(), tool: tool.id };
    jobs.set(id, job);
    setTimeout(() => jobs.delete(id), 30 * 60 * 1000).unref();

    (async () => {
      try {
        const t0 = Date.now();
        const buf = await callNexa(tool, imageUrl, opts);
        const kind = sniff(buf);
        if (!kind) fail('Hasil dari Nexa bukan gambar yang dikenali.', 502);
        const file = storeFile('res', buf, kind[0]);
        const entry = { id, tool: tool.id, label: tool.id === 'upscale1' ? `Upscale ${opts.resolusi}x` : tool.label, resolusi: opts.resolusi, file, orig, origUrl, ms: Date.now() - t0, bytes: buf.length, createdAt: new Date().toISOString() };
        addHist(entry);
        job.result = view(entry);
        job.status = 'done';
      } catch (e) {
        job.status = 'error';
        job.error = e.message || 'Terjadi kesalahan.';
      } finally {
        if (tempName && imgApi()) imgApi().remove([tempName]).catch(() => {});
      }
    })();
    res.status(202).json({ job: id });
  }));

  app.get('/api/wink/job/:id', wrap(async (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j) fail('Proses tidak ditemukan atau sudah kedaluwarsa.', 404);
    res.json({ status: j.status, elapsed: Math.round((Date.now() - j.startedAt) / 1000), result: j.result, error: j.error });
  }));

  app.get('/api/wink/history', (req, res) => res.json({ items: readHist().map(view) }));

  app.delete('/api/wink/history/:id', needHeader, wrap(async (req, res) => {
    const h = readHist(), e = h.find((x) => x.id === req.params.id);
    if (!e) fail('Riwayat tidak ditemukan.', 404);
    const rest = h.filter((x) => x !== e);
    writeHist(rest);
    dropFiles([e.file, e.orig], rest);
    res.json({ ok: true });
  }));

  // Simpan hasil ke Supabase secara permanen (muncul di Img to URL) dan dapatkan link publik
  app.post('/api/wink/save', needHeader, express.json({ limit: '5kb' }), wrap(async (req, res) => {
    needSupabase();
    const file = String((req.body || {}).file || '');
    if (!NAME_RX.test(file) || !fs.existsSync(path.join(DIR, file))) fail('File tidak ditemukan.', 404);
    const up = await imgApi().put(fs.readFileSync(path.join(DIR, file)), 'hasil-wink');
    const h = readHist(), e = h.find((x) => x.file === file);
    if (e) { e.saved = { url: up.url, name: up.name }; writeHist(h); }
    res.json({ url: up.url, name: up.name });
  }));

  app.get('/api/wink/file/:name', (req, res) => {
    const m = /^(?:orig|res)-[a-f0-9]{16}\.(png|jpg|webp|gif)$/.exec(req.params.name);
    const file = path.join(DIR, req.params.name);
    if (!m || !fs.existsSync(file)) return res.status(404).json({ error: 'File tidak ditemukan atau sudah dihapus.' });
    res.set({ 'Content-Type': MIME[m[1]], 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': `inline; filename="wink-${req.params.name.slice(-12)}"` });
    res.sendFile(file);
  });
};
module.exports.TOOLS = TOOLS;
module.exports._t = { sniff, findUrl, isPrivateIp, safeDownload, callNexa, storeFile };
