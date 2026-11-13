const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

// Muat .env tanpa dependensi tambahan
try {
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const {
  PANEL_PASSWORD, SESSION_SECRET, CF_API_TOKEN, CF_ZONE_ID,
  CF_ZONE_NAME = '', BRAND_NAME = '', APK_PACKAGE_PREFIX = '', PORT = 3000, BIND_HOST = '0.0.0.0', NODE_ENV,
} = process.env;

const BRAND = BRAND_NAME || 'Panel';
const PKG_PREFIX = APK_PACKAGE_PREFIX || 'com.example.app';

if (!PANEL_PASSWORD || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('PANEL_PASSWORD wajib diisi dan SESSION_SECRET minimal 32 karakter (cek file .env).');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const jsonSmall = express.json({ limit: '50kb' });
// Rute besar (upload APK dan AI) memasang parser sendiri dengan batas masing-masing.
app.use((req, res, next) => (req.path === '/api/apk/build' || req.path.startsWith('/api/ai/') ? next() : jsonSmall(req, res, next)));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
});

/* ---------- Sesi ---------- */
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const sign = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('base64url');
const makeToken = () => { const exp = String(Date.now() + SESSION_TTL); return `${exp}.${sign(exp)}`; };
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(exp) > Date.now();
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const isAuthed = (req) => validToken(cookies(req).zs);
function setSession(res, token, maxAge) {
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`];
  if (NODE_ENV === 'production') flags.push('Secure');
  res.set('Set-Cookie', `zs=${token}; ${flags.join('; ')}`);
}

/* Batas percobaan login: 5 kali per 10 menit per IP */
const attempts = new Map();
const recent = (ip) => {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 600000);
  attempts.set(ip, list);
  return list;
};
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/* ---------- Halaman ---------- */
const view = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', name));
app.get('/login', (req, res) => (isAuthed(req) ? res.redirect('/') : view('login.html')(req, res)));
app.get('/', (req, res) => (isAuthed(req) ? view('app.html')(req, res) : res.redirect('/login')));
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/assets', express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

/* ---------- API: sesi ---------- */
const needHeader = (req, res, next) => {
  if (req.get('X-Panel') !== '1') return res.status(400).json({ error: 'Permintaan tidak valid.' });
  next();
};

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message || 'Terjadi kesalahan.' }));

app.post('/api/login', needHeader, (req, res) => {
  const ip = req.ip;
  if (recent(ip).length >= 5) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' });
  }
  if (!safeEqual(req.body && req.body.password, PANEL_PASSWORD)) {
    recent(ip).push(Date.now());
    return res.status(401).json({ error: 'Password salah.' });
  }
  setSession(res, makeToken(), SESSION_TTL / 1000);
  res.json({ ok: true });
});

app.post('/api/logout', needHeader, (req, res) => {
  setSession(res, '', 0);
  res.json({ ok: true });
});

// Telegram: rute login lewat bot harus terdaftar sebelum requireAuth
const telegram = require('./telegram')({ app, express, wrap, needHeader, makeToken, setSession, sessionTtl: SESSION_TTL });
telegram.publicRoutes();

const requireAuth = (req, res, next) =>
  isAuthed(req) ? next() : res.status(401).json({ error: 'Sesi berakhir. Masuk lagi.' });
app.use('/api', requireAuth);

app.get('/api/me', (req, res) => {
  res.json({ zone: CF_ZONE_NAME, brand: BRAND, pkgPrefix: PKG_PREFIX, cloudflareReady: Boolean(CF_API_TOKEN && CF_ZONE_ID) });
});

/* ---------- Cloudflare ---------- */
async function cf(method, p, body) {
  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    throw Object.assign(new Error('Token atau Zone ID Cloudflare belum diisi di file .env.'), { status: 503 });
  }
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}${p}`, {
    method,
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.success) {
    const msg = j && j.errors && j.errors[0] ? j.errors[0].message : 'Cloudflare menolak permintaan.';
    throw Object.assign(new Error(msg), { status: 502 });
  }
  return j;
}
const slim = (r) => ({ id: r.id, type: r.type, name: r.name, content: r.content, proxied: !!r.proxied, ttl: r.ttl });

async function listRecords() {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const j = await cf('GET', `/dns_records?per_page=100&page=${page}`);
    all.push(...j.result.map(slim));
    if (page >= (j.result_info?.total_pages || 1)) break;
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

app.get('/api/dns', wrap(async (req, res) => res.json({ zone: CF_ZONE_NAME, records: await listRecords() })));

const LABEL = /^(@|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$/;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

app.post('/api/dns', needHeader, wrap(async (req, res) => {
  const { label, type, content, proxied } = req.body || {};
  const l = String(label || '').trim().toLowerCase();
  const t = String(type || '').toUpperCase();
  const c = String(content || '').trim();
  if (!LABEL.test(l)) return bad('Nama subdomain hanya boleh huruf kecil, angka, dan tanda hubung.');
  if (!['A', 'AAAA', 'CNAME', 'TXT'].includes(t)) return bad('Tipe record tidak didukung.');
  if (!c) return bad('Isi target tidak boleh kosong.');
  if (t === 'A' && !IPV4.test(c)) return bad('Target tipe A harus berupa alamat IPv4, contoh 203.0.113.10.');
  if (t === 'AAAA' && !(IPV6.test(c) && c.includes(':'))) return bad('Target tipe AAAA harus berupa alamat IPv6.');
  if (t === 'CNAME' && !HOST.test(c)) return bad('Target tipe CNAME harus berupa nama host, contoh cname.vercel-dns.com.');
  if (t === 'TXT' && c.length > 2000) return bad('Isi TXT terlalu panjang.');
  const name = l === '@' ? CF_ZONE_NAME : `${l}.${CF_ZONE_NAME}`;
  const canProxy = ['A', 'AAAA', 'CNAME'].includes(t);
  const j = await cf('POST', '/dns_records', { type: t, name, content: c, proxied: canProxy && !!proxied, ttl: 1 });
  res.status(201).json({ record: slim(j.result) });

  function bad(msg) { throw Object.assign(new Error(msg), { status: 400 }); }
}));

app.delete('/api/dns/:id', needHeader, wrap(async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) throw Object.assign(new Error('ID record tidak valid.'), { status: 400 });
  const cur = await cf('GET', `/dns_records/${req.params.id}`);
  if (cur.result.type === 'NS') throw Object.assign(new Error('Record NS tidak boleh dihapus dari panel.'), { status: 400 });
  await cf('DELETE', `/dns_records/${req.params.id}`);
  res.json({ ok: true });
}));

require('./sites')({ app, express, cf, wrap, needHeader, zone: CF_ZONE_NAME });

telegram.routes();
require('./botshost')({ app, wrap, needHeader }).routes();
require('./apk')({ app, express, wrap, needHeader, notify: telegram.notify, notifyFile: telegram.notifyFile, esc: telegram.esc });

require('./nexa').register({ app, express, wrap, needHeader });
require('./ai')({ app, express, wrap, needHeader });
const imgurl = require('./imgurl');
imgurl({ app, express, wrap, needHeader });
require('./wink')({ app, express, wrap, needHeader, img: imgurl });

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

const server = app.listen(PORT, BIND_HOST, () => console.log(`Panel berjalan di port ${PORT}`));
// Unggahan file besar ke Telegram bisa lebih dari 5 menit; batas waktu bawaan Node memutus koneksi.
server.requestTimeout = 0;
