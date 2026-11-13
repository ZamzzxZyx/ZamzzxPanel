// Img to URL: unggah gambar ke Supabase Storage (tabel storage.objects di database Supabase) lalu beri link publik.
// Kunci service_role hanya dipakai di server dan tidak pernah dikirim ke browser.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 10 * 1024 * 1024;
const NAME_RX = /^[a-z0-9][a-z0-9._-]{0,120}\.(png|jpg|gif|webp)$/;
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

// Pengaturan dari web disimpan di data/supabase.json (izin 600). Prioritas: file web, lalu .env.
const CFG = path.join(__dirname, 'data', 'supabase.json');
const readCfg = () => { try { const j = JSON.parse(fs.readFileSync(CFG, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch (_) { return {}; } };
const writeCfg = (o) => {
  fs.mkdirSync(path.dirname(CFG), { recursive: true });
  fs.writeFileSync(CFG + '.tmp', JSON.stringify(o), { mode: 0o600 });
  fs.renameSync(CFG + '.tmp', CFG);
};

// Baca .env setiap dipakai supaya perubahan terbaca tanpa restart.
// Toleran: "SUPABASE_URLhttps://..." (lupa tanda =) tetap terbaca.
function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp('^\\s*' + name + '(?:\\s*=\\s*|(?=https?:))(.*?)\\s*$'));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
  return '';
}

// Rapikan URL: terima URL penuh, tanpa https, dengan /rest/v1 atau /storage/v1, atau cukup project ref.
function normUrl(input) {
  let u = String(input || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  if (!u) return { error: 'Project URL belum diisi.' };
  if (/^[a-z0-9]{15,30}$/i.test(u)) u = `https://${u.toLowerCase()}.supabase.co`;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let p;
  try { p = new URL(u); } catch (_) { return { error: 'Project URL tidak valid. Contoh: https://xxxx.supabase.co' }; }
  if (!/^[a-z0-9.-]+$/i.test(p.hostname) || !p.hostname.includes('.') && p.hostname !== 'localhost') return { error: 'Project URL tidak valid. Contoh: https://xxxx.supabase.co' };
  if (/\.supabase\.com$/i.test(p.hostname) && /^(app|www|supabase)\./i.test(p.hostname)) return { error: 'Itu alamat dashboard. Pakai Project URL dari Project Settings, API (https://xxxx.supabase.co).' };
  return { url: p.origin };
}
function normKey(input) {
  return String(input || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
}
function normBucket(input) {
  const b = String(input || '').trim().toLowerCase();
  if (!b) return { bucket: 'panel-img' };
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(b)) return { error: 'Nama bucket hanya boleh huruf kecil, angka, tanda hubung, atau garis bawah (2-63 karakter).' };
  return { bucket: b };
}

// Kunci publishable/anon tidak boleh membuat bucket atau mengunggah. Kenali dari awal supaya pesannya jelas.
function keyProblem(key) {
  if (/^sb_publishable_/.test(key)) return 'Ini kunci publishable (sb_publishable_...), kunci publik yang tidak punya izin membuat bucket atau mengunggah. Pakai kunci Secret (sb_secret_...) dari Project Settings, API Keys.';
  if (key.split('.').length === 3) {
    try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon') return 'Ini kunci anon. Pakai kunci service_role (atau Secret sb_secret_...) dari Project Settings, API Keys.'; } catch (_) {}
  }
  return '';
}

function conf() {
  const f = readCfg();
  const fromWeb = Boolean(f.url && f.key);
  const url = (fromWeb ? f.url : envVal('SUPABASE_URL')).replace(/\/+$/, '');
  const key = fromWeb ? f.key : normKey(envVal('SUPABASE_SERVICE_KEY'));
  const bucket = (fromWeb && f.bucket) || envVal('SUPABASE_BUCKET') || 'panel-img';
  return { url, key, bucket, ready: Boolean(url && key), source: fromWeb ? 'web' : (url || key ? 'env' : '') };
}
const maskKey = (k) => (k.length > 14 ? k.slice(0, 7) + '…' + k.slice(-4) : '••••');

// Jenis file ditentukan dari isi, bukan dari nama atau header. SVG sengaja tidak diterima (bisa memuat skrip).
function sniff(b) {
  if (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return ['png', 'image/png'];
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return ['gif', 'image/gif'];
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
  return null;
}

const slug = (s) => String(s || '').normalize('NFKD').replace(/\.[a-z0-9]{1,5}$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

module.exports = function registerImg({ app, express, wrap, needHeader }) {
  async function sb(method, p, { body, headers, json = true, cfg } = {}) {
    const c = cfg || conf();
    if (!c.ready) fail('Supabase belum disambungkan. Isi Project URL dan kunci di halaman Img to URL.', 503);
    const kp = keyProblem(c.key);
    if (kp) fail(kp, 422);
    // Kunci baru (sb_secret_) bukan JWT: kirim lewat header apikey saja
    const auth = /^sb_/.test(c.key) ? {} : { Authorization: `Bearer ${c.key}` };
    let r;
    try {
      r = await fetch(c.url + p, {
        method, body,
        headers: { ...auth, apikey: c.key, ...(json && body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      fail(e.name === 'TimeoutError' ? 'Supabase terlalu lama merespons. Coba lagi.' : 'Tidak bisa terhubung ke Supabase. Cek Project URL.', 422);
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = String((j && (j.message || j.error)) || '');
      if (r.status === 401 || r.status === 403 || /jwt|apikey|signature/i.test(msg) && r.status < 500) fail('Kunci Supabase ditolak. Pakai kunci Secret (sb_secret_...) atau service_role, dan pastikan cocok dengan Project URL.', 422);
      if (r.status === 404 || /bucket not found/i.test(msg)) fail('Bucket belum ada. Tekan "Siapkan bucket" dulu.', 404);
      if (/exceeded|too large|maximum/i.test(msg)) fail('File ditolak Supabase karena terlalu besar.', 413);
      fail(/row-level security|unauthorized|not allowed/i.test(msg) ? 'Supabase menolak: kunci ini tidak punya izin. Pakai kunci Secret (sb_secret_...) atau service_role.' : `Supabase menolak permintaan${msg ? `: ${msg}` : '.'}`, 422);
    }
    return j;
  }

  const publicUrl = (name) => { const c = conf(); return `${c.url}/storage/v1/object/public/${encodeURIComponent(c.bucket)}/${encodeURIComponent(name)}`; };
  const shape = (o) => ({
    name: o.name, url: publicUrl(o.name), size: (o.metadata && o.metadata.size) || 0,
    type: (o.metadata && o.metadata.mimetype) || '', createdAt: o.created_at || o.updated_at || null,
  });

  app.get('/api/img/status', wrap(async (req, res) => {
    const c = conf();
    if (!c.ready) return res.json({ ready: false, bucket: c.bucket, source: c.source, url: c.url });
    let bucketOk = false, note = keyProblem(c.key);
    if (!note) {
      try { await sb('GET', '/storage/v1/bucket/' + encodeURIComponent(c.bucket)); bucketOk = true; }
      catch (e) { if (e.status !== 404) note = e.message; }
    }
    let host = c.url; try { host = new URL(c.url).host; } catch (_) { note = note || 'Project URL tidak valid. Perbaiki di pengaturan.'; }
    res.json({ ready: true, bucket: c.bucket, bucketOk, note, host, url: c.url, keyMask: maskKey(c.key), source: c.source, max: MAX_BYTES });
  }));


  // Simpan koneksi dari web: divalidasi dulu ke Supabase, baru ditulis. Kunci tidak pernah dikirim balik ke browser.
  app.post('/api/img/config', needHeader, wrap(async (req, res) => {
    const b = req.body || {};
    const u = normUrl(b.url); if (u.error) fail(u.error);
    const bk = normBucket(b.bucket); if (bk.error) fail(bk.error);
    const old = readCfg();
    const key = normKey(b.key) || (old.url === u.url ? old.key : '') || '';
    if (!key) fail('Kunci (service_role atau Secret) belum diisi.');
    const kp = keyProblem(key); if (kp) fail(kp, 422);
    const cfg = { url: u.url, key, bucket: bk.bucket, ready: true };
    // Uji kunci: daftar bucket hanya bisa dengan kunci server
    const list = await sb('GET', '/storage/v1/bucket', { cfg });
    const bucketOk = Array.isArray(list) && list.some((x) => x && (x.id === cfg.bucket || x.name === cfg.bucket));
    writeCfg({ url: cfg.url, key: cfg.key, bucket: cfg.bucket });
    res.json({ ok: true, host: new URL(cfg.url).host, bucket: cfg.bucket, bucketOk });
  }));

  app.delete('/api/img/config', needHeader, wrap(async (req, res) => {
    try { fs.unlinkSync(CFG); } catch (_) {}
    res.json({ ok: true });
  }));

  app.post('/api/img/setup', needHeader, wrap(async (req, res) => {
    const c = conf();
    try {
      await sb('POST', '/storage/v1/bucket', { body: JSON.stringify({ id: c.bucket, name: c.bucket, public: true, file_size_limit: MAX_BYTES, allowed_mime_types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] }) });
    } catch (e) {
      // Bucket sudah ada: cukup pastikan publik
      if (!/already exists|duplicate/i.test(e.message)) throw e;
      await sb('PUT', '/storage/v1/bucket/' + encodeURIComponent(c.bucket), { body: JSON.stringify({ public: true, file_size_limit: MAX_BYTES, allowed_mime_types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] }) });
    }
    res.json({ ok: true, bucket: c.bucket });
  }));

  app.get('/api/img/list', wrap(async (req, res) => {
    const c = conf();
    const list = await sb('POST', '/storage/v1/object/list/' + encodeURIComponent(c.bucket), {
      body: JSON.stringify({ prefix: '', limit: 200, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
    });
    res.json({ items: (Array.isArray(list) ? list : []).filter((o) => o && o.id && NAME_RX.test(o.name) && !/^wink-/.test(o.name)).map(shape) });
  }));

  app.post('/api/img/upload', needHeader, express.raw({ type: () => true, limit: MAX_BYTES + 1024 }), wrap(async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) fail('Tidak ada file yang dikirim.');
    if (buf.length > MAX_BYTES) fail('Gambar melebihi 10 MB.', 413);
    const kind = sniff(buf);
    if (!kind) fail('Format tidak didukung. Pakai PNG, JPG, GIF, atau WebP.', 415);
    const c = conf();
    let orig = '';
    try { orig = decodeURIComponent(String(req.query.name || '')); } catch (_) {}
    const name = `${slug(orig) || 'img'}-${crypto.randomBytes(5).toString('hex')}.${kind[0]}`;
    await sb('POST', `/storage/v1/object/${encodeURIComponent(c.bucket)}/${encodeURIComponent(name)}`, {
      body: buf, headers: { 'Content-Type': kind[1], 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
    });
    res.status(201).json({ item: { name, url: publicUrl(name), size: buf.length, type: kind[1], createdAt: new Date().toISOString() } });
  }));

  // Dipakai modul Wink (tanpa lewat HTTP). File sementara Wink berawalan "wink-" dan tidak muncul di daftar Img to URL.
  registerImg.api = {
    ready: () => conf().ready,
    async put(buf, label) {
      if (!Buffer.isBuffer(buf) || !buf.length) fail('Tidak ada file yang dikirim.');
      if (buf.length > MAX_BYTES) fail('Gambar melebihi 10 MB, batas Supabase untuk Img to URL.', 413);
      const kind = sniff(buf);
      if (!kind) fail('Format tidak didukung. Pakai PNG, JPG, GIF, atau WebP.', 415);
      const c = conf();
      const name = `${slug(label) || 'img'}-${crypto.randomBytes(5).toString('hex')}.${kind[0]}`;
      await sb('POST', `/storage/v1/object/${encodeURIComponent(c.bucket)}/${encodeURIComponent(name)}`, {
        body: buf, headers: { 'Content-Type': kind[1], 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
      });
      return { name, url: publicUrl(name), size: buf.length, type: kind[1] };
    },
    async remove(names) {
      const c = conf();
      await sb('DELETE', `/storage/v1/object/${encodeURIComponent(c.bucket)}`, { body: JSON.stringify({ prefixes: names }) });
    },
    async listRaw() {
      const c = conf();
      const list = await sb('POST', '/storage/v1/object/list/' + encodeURIComponent(c.bucket), {
        body: JSON.stringify({ prefix: '', limit: 500, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
      });
      return Array.isArray(list) ? list : [];
    },
  };

  app.delete('/api/img/:name', needHeader, wrap(async (req, res) => {
    if (!NAME_RX.test(req.params.name)) fail('Nama file tidak valid.');
    const c = conf();
    await sb('DELETE', `/storage/v1/object/${encodeURIComponent(c.bucket)}`, { body: JSON.stringify({ prefixes: [req.params.name] }) });
    res.json({ ok: true });
  }));
};
