const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { extractFiles } = require('./webfiles');

const TEMPLATE_VERSION = 1;
const REPO_NAME = 'panel-apk-builder';
const WORKFLOW = 'build-apk.yml';

module.exports = function registerApk({ app, express, wrap, needHeader, notify = () => {}, notifyFile = async () => {}, esc = (x) => x }) {
  const DB = path.join(__dirname, 'data', 'apk.json');
  const TEMPLATE_DIR = path.join(__dirname, 'apk-template');

  const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const readDb = () => {
    try { return { builds: [], ...JSON.parse(fs.readFileSync(DB, 'utf8')) }; } catch (_) { return { builds: [] }; }
  };
  const writeDb = (db) => {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(DB + '.tmp', DB);
  };

  // Baca .env setiap dipakai supaya token baru langsung terbaca
  function env() {
    const out = { ...process.env };
    try {
      const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
    return out;
  }

  /* ---------- GitHub ---------- */
  async function gh(method, p, body, opts = {}) {
    const { GITHUB_TOKEN } = env();
    if (!GITHUB_TOKEN) fail('GITHUB_TOKEN belum diisi di file .env.', 503);
    const r = await fetch('https://api.github.com' + p, {
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'panel-panel',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      if (opts.allow && opts.allow.includes(r.status)) return { _status: r.status, ...(j || {}) };
      const hint = r.status === 401 ? ' Token ditolak, cek GITHUB_TOKEN.' : r.status === 403 || r.status === 404 ? ' Pastikan token punya izin repo dan workflow.' : '';
      fail(`GitHub (${r.status}): ${(j && j.message) || 'permintaan gagal'}.${hint}`, 502);
    }
    return j;
  }

  const putFile = (repo, file, buf, message, sha) =>
    gh('PUT', `/repos/${repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}`, { message, content: buf.toString('base64'), ...(sha ? { sha } : {}) });

  function templateFiles(dir = TEMPLATE_DIR, base = '') {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...templateFiles(path.join(dir, e.name), rel));
      else out.push({ rel, buf: fs.readFileSync(path.join(dir, e.name)) });
    }
    return out;
  }

  /* ---------- Validasi konfigurasi ---------- */
  const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const flag = (v) => v === true;

  function cleanConfig(c) {
    c = c || {};
    const name = txt(c.name, 40);
    if (!/^[\p{L}\p{N} ._&!+()-]{1,40}$/u.test(name)) fail('Nama aplikasi hanya boleh huruf, angka, spasi, dan . _ & ! + ( ) -, maksimal 40 karakter.');
    const pkg = String(c.pkg || '').trim();
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,5}$/.test(pkg) || pkg.length > 100) fail('Package name tidak valid. Contoh yang benar: id.panel.toko');
    const versionName = String(c.versionName || '1.0.0').trim();
    if (!/^[0-9A-Za-z._-]{1,20}$/.test(versionName)) fail('Versi hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung.');
    const versionCode = Number(c.versionCode);
    if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) fail('Version code harus bilangan bulat antara 1 dan 2100000000.');

    const sp = c.splash || {}, ui = c.ui || {}, web = c.web || {}, pm = c.perms || {}, er = c.error || {};
    const hosts = String(web.allowedHosts || '').split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (hosts.length > 20 || hosts.some((h) => !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h))) fail('Domain yang diizinkan tidak valid. Pisahkan dengan koma, contoh: cdn.situs.com, situs.com');

    const out = {
      name, pkg, versionName, versionCode,
      splash: {
        enabled: flag(sp.enabled),
        bg: hex(sp.bg, '#0a0c11'), fg: hex(sp.fg, '#e6eaf2'),
        tagline: txt(sp.tagline, 80),
        anim: oneOf(sp.anim, ['none', 'fade', 'zoom', 'slide', 'pulse'], 'fade'),
        durationMs: Math.min(5000, Math.max(500, Math.round(Number(sp.durationMs) || 2000))),
        loader: oneOf(sp.loader, ['none', 'bar', 'spinner', 'dots'], 'bar'),
        showVersion: flag(sp.showVersion),
      },
      ui: {
        orientation: oneOf(ui.orientation, ['auto', 'portrait', 'landscape'], 'auto'),
        fullscreen: flag(ui.fullscreen),
        statusBar: hex(ui.statusBar, '#0a0c11'), navBar: hex(ui.navBar, '#0a0c11'),
        keepScreenOn: flag(ui.keepScreenOn), pullToRefresh: flag(ui.pullToRefresh),
        topProgress: flag(ui.topProgress), progressColor: hex(ui.progressColor, '#4d7cff'),
        exitConfirm: flag(ui.exitConfirm),
      },
      web: {
        js: web.js !== false, zoom: flag(web.zoom), userAgent: txt(web.userAgent, 200),
        externalLinks: oneOf(web.externalLinks, ['browser', 'inapp'], 'browser'),
        allowedHosts: hosts,
        cache: oneOf(web.cache, ['default', 'network', 'offline'], 'default'),
        fileUpload: web.fileUpload !== false, downloads: web.downloads !== false, mixedContent: flag(web.mixedContent),
      },
      perms: {
        camera: flag(pm.camera), microphone: flag(pm.microphone), location: flag(pm.location),
        storage: flag(pm.storage), notifications: flag(pm.notifications), vibrate: flag(pm.vibrate),
      },
      error: {
        title: txt(er.title, 60) || 'Tidak ada koneksi',
        message: txt(er.message, 160) || 'Periksa internet kamu lalu coba lagi.',
        button: txt(er.button, 30) || 'Coba lagi',
      },
    };
    return out;
  }

  const isPng = (b) => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  function pngFromDataUrl(v, label) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''));
    if (!m) fail(`Gambar ${label} tidak valid. Pilih file PNG atau JPG.`);
    const buf = Buffer.from(m[1], 'base64');
    if (!isPng(buf)) fail(`Gambar ${label} rusak.`);
    if (buf.length > 1600 * 1024) fail(`Gambar ${label} terlalu besar (${Math.round(buf.length / 1024)} KB). Pakai gambar yang lebih sederhana.`);
    return buf;
  }

  // Ambil APK hasil build dari artifact GitHub
  async function fetchApk(db, b) {
    const list = await gh('GET', `/repos/${db.repo}/actions/runs/${b.runId}/artifacts`);
    const art = (list.artifacts || []).find((a) => a.name === `apk-${b.id}` && !a.expired);
    if (!art) fail('File APK sudah kedaluwarsa (disimpan 14 hari). Build ulang saja.', 410);
    const { GITHUB_TOKEN } = env();
    const r = await fetch(art.archive_download_url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'panel-panel' } });
    if (!r.ok) fail(`Gagal mengunduh dari GitHub (${r.status}).`, 502);
    const entry = new AdmZip(Buffer.from(await r.arrayBuffer())).getEntries().find((e) => e.entryName.endsWith('.apk'));
    if (!entry) fail('APK tidak ditemukan di hasil build.', 502);
    const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
    return { data: entry.getData(), filename: `${slug}-${b.versionName}.apk` };
  }

  /* ---------- Rute ---------- */
  async function refreshBuilds() {
    const db = readDb();
    if (!db.repo) return db;
    const active = db.builds.filter((b) => b.status === 'queued' || b.status === 'running');
    if (!active.length) return db;
    try {
      const j = await gh('GET', `/repos/${db.repo}/actions/workflows/${WORKFLOW}/runs?per_page=30`);
      const runs = j.workflow_runs || [];
      let changed = false;
      for (const b of active) {
        const run = runs.find((r) => String(r.display_title || r.name || '').includes(b.id));
        if (!run) {
          if (Date.now() - Date.parse(b.createdAt) > 10 * 60 * 1000) { b.status = 'failed'; b.note = 'Run build tidak ditemukan di GitHub.'; changed = true; }
          continue;
        }
        const next = run.status === 'completed' ? (run.conclusion === 'success' ? 'success' : 'failed') : run.status === 'in_progress' ? 'running' : 'queued';
        if (b.status !== next || b.runId !== run.id) { b.status = next; b.runId = run.id; b.runUrl = run.html_url; changed = true; }
        if (next === 'success' || next === 'failed') {
          await cleanupPayload(db, b).catch(() => {});
          const nm = `${esc(b.name || 'APK')}${b.versionName ? ' v' + esc(b.versionName) : ''}`;
          if (next === 'success') fetchApk(db, b).then((f) => notifyFile('apk', f.data, f.filename, `✅ <b>${nm}</b>`)).catch(() => {});
          notify('apk', next === 'success'
            ? `✅ <b>APK selesai dibuat</b>\n${nm}\nUnduh dari tab APK di panel.`
            : `❌ <b>Build APK gagal</b>\n${nm}${b.runUrl ? `\n<a href="${esc(b.runUrl)}">Lihat log di GitHub</a>` : ''}`);
        }
      }
      if (changed) writeDb(db);
    } catch (_) { /* biarkan status lama, coba lagi di polling berikutnya */ }
    return db;
  }

  async function cleanupPayload(db, b) {
    const file = `builds/${b.id}.zip`;
    const f = await gh('GET', `/repos/${db.repo}/contents/${file}?ref=${db.ref || 'main'}`, null, { allow: [404] });
    if (f && f.sha) await gh('DELETE', `/repos/${db.repo}/contents/${file}`, { message: `Hapus ${file}`, sha: f.sha, branch: db.ref || 'main' });
  }

  setInterval(() => { refreshBuilds().catch(() => {}); }, 30000).unref();

  app.get('/api/apk', wrap(async (req, res) => {
    const { GITHUB_TOKEN } = env();
    const db = await refreshBuilds();
    res.json({
      tokenOk: Boolean(GITHUB_TOKEN), repo: db.repo || null,
      outdated: Boolean(db.repo) && db.templateVersion !== TEMPLATE_VERSION,
      builds: db.builds,
    });
  }));

  app.post('/api/apk/setup', needHeader, wrap(async (req, res) => {
    const user = await gh('GET', '/user');
    const repo = `${user.login}/${REPO_NAME}`;
    let info = await gh('GET', `/repos/${repo}`, null, { allow: [404] });
    if (info._status === 404) {
      info = await gh('POST', '/user/repos', { name: REPO_NAME, private: true, auto_init: true, description: 'Builder APK untuk panel' });
      await sleep(2500);
    }
    const ref = info.default_branch || 'main';
    let tree = {};
    for (let i = 0; i < 4; i++) {
      const t = await gh('GET', `/repos/${repo}/git/trees/${ref}?recursive=1`, null, { allow: [404, 409] });
      if (t.tree) { for (const n of t.tree) if (n.type === 'blob') tree[n.path] = n.sha; break; }
      await sleep(1500);
    }
    for (const f of templateFiles()) {
      await putFile(repo, f.rel, f.buf, `Perbarui ${f.rel}`, tree[f.rel]);
    }
    const db = readDb();
    db.repo = repo; db.ref = ref; db.templateVersion = TEMPLATE_VERSION;
    writeDb(db);
    res.json({ repo });
  }));

  app.post('/api/apk/build', needHeader, express.json({ limit: '30mb' }), wrap(async (req, res) => {
    const db = readDb();
    if (!db.repo) fail('Builder belum disiapkan. Tekan "Siapkan builder" dulu.');
    const b = req.body || {};
    const cfg = cleanConfig(b.config);

    // Sumber: URL atau isi web offline
    const zip = new AdmZip();
    const src = b.source || {};
    if (src.type === 'url') {
      let u;
      try { u = new URL(String(src.url || '').trim()); } catch (_) { fail('URL web tidak valid.'); }
      if (!['http:', 'https:'].includes(u.protocol) || u.href.length > 2000) fail('URL harus diawali http:// atau https://');
      cfg.url = u.href;
    } else if (src.type === 'html') {
      const html = Buffer.from(String(src.data || ''), 'utf8');
      if (!html.length || !/<[a-z!]/i.test(html.toString('utf8', 0, 4000))) fail('Kode HTML kosong atau tidak valid.');
      zip.addFile('www/index.html', html);
    } else if (src.type === 'zip') {
      const files = extractFiles(Buffer.from(String(src.data || ''), 'base64'));
      for (const f of files) zip.addFile(`www/${f.p}`, f.data);
    } else {
      fail('Pilih sumber aplikasi: URL, HTML, atau ZIP.');
    }

    const icons = b.icons || {};
    for (const size of [48, 72, 96, 144, 192, 512]) zip.addFile(`icons/${size}.png`, pngFromDataUrl(icons[size], `ikon ${size}px`));
    if (b.splash) zip.addFile('splash.png', pngFromDataUrl(b.splash, 'logo splash'));
    zip.addFile('config.json', Buffer.from(JSON.stringify(cfg), 'utf8'));
    const payload = zip.toBuffer();
    if (payload.length > 45 * 1024 * 1024) fail('Total isi build terlalu besar.');

    const id = crypto.randomBytes(6).toString('hex');
    await putFile(db.repo, `builds/${id}.zip`, payload, `Build ${cfg.name}`);

    let dispatched = false, lastErr;
    for (let i = 0; i < 4 && !dispatched; i++) {
      try {
        await gh('POST', `/repos/${db.repo}/actions/workflows/${WORKFLOW}/dispatches`, { ref: db.ref || 'main', inputs: { build_id: id } });
        dispatched = true;
      } catch (e) { lastErr = e; await sleep(2500); }
    }
    if (!dispatched) fail(`Build tidak bisa dimulai: ${lastErr.message} Coba tekan "Perbarui template", lalu ulangi.`, 502);

    const row = { id, name: cfg.name, pkg: cfg.pkg, versionName: cfg.versionName, status: 'queued', createdAt: new Date().toISOString() };
    db.builds = [row, ...db.builds].slice(0, 50);
    writeDb(db);
    res.status(201).json({ build: row });
  }));

  app.get('/api/apk/:id/download', wrap(async (req, res) => {
    const db = readDb();
    const b = db.builds.find((x) => x.id === req.params.id);
    if (!b) fail('Build tidak ditemukan.', 404);
    if (b.status !== 'success' || !b.runId) fail('Build belum selesai.');
    const { data, filename } = await fetchApk(db, b);
    res.set({ 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(data);
  }));

  app.delete('/api/apk/:id', needHeader, wrap(async (req, res) => {
    const db = readDb();
    if (!db.builds.some((x) => x.id === req.params.id)) fail('Build tidak ditemukan.', 404);
    db.builds = db.builds.filter((x) => x.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  }));
};
