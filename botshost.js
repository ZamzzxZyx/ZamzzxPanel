// Bot Host: unggah proyek bot (zip), diekstrak otomatis, dijalankan dari panel, dengan terminal output.
// Data di data/bots.json (izin 600, berisi env), file bot di data/bots/<id>/.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const FILE = path.join(__dirname, 'data', 'bots.json');
const ROOT = path.join(__dirname, 'data', 'bots');
const MB = 1024 * 1024;
const MAX_ZIP = 50 * MB, MAX_UNZIPPED = 300 * MB, MAX_ENTRIES = 5000, MAX_BOTS = 10, MAX_LOG = 600;
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const ID_RX = /^[a-f0-9]{12}$/;

const read = () => { try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(j.bots) ? j : { bots: [] }; } catch (_) { return { bots: [] }; } };
const write = (db) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 }); fs.renameSync(FILE + '.tmp', FILE); };

/* ---------- Pembaca ZIP (tanpa dependensi): aman dari zip-slip, symlink, dan zip bomb ---------- */
function readZip(file) {
  const size = fs.statSync(file).size;
  if (size < 22) fail('File ZIP tidak valid.');
  const fd = fs.openSync(file, 'r');
  try {
    const back = Math.min(size, 65557); const tail = Buffer.alloc(back);
    fs.readSync(fd, tail, 0, back, size - back);
    const i = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (i < 0) fail('File ZIP tidak valid (bukan arsip ZIP atau rusak).');
    const total = tail.readUInt16LE(i + 10), cdSize = tail.readUInt32LE(i + 12), cdOff = tail.readUInt32LE(i + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) fail('ZIP64 tidak didukung. Kecilkan ukuran arsip.');
    if (total > MAX_ENTRIES) fail(`ZIP berisi ${total} entri, maksimal ${MAX_ENTRIES}.`);
    if (cdOff + cdSize > size) fail('File ZIP rusak.');
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = []; let p = 0;
    for (let k = 0; k < total; k++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) fail('File ZIP rusak (daftar isi tidak terbaca).');
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16);
      const csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const ext = cd.readUInt32LE(p + 38), lho = cd.readUInt32LE(p + 42);
      entries.push({ name: cd.toString('utf8', p + 46, p + 46 + nl), flags, method, crc, csize, usize, lho, ext });
      p += 46 + nl + el + cl;
    }
    return { fd, entries, close: () => fs.closeSync(fd) };
  } catch (e) { fs.closeSync(fd); throw e; }
}

// Ekstrak ke dir. Mengembalikan { files, bytes, skipped }.
function extractZip(zipFile, dir) {
  const z = readZip(zipFile);
  try {
    const items = [];
    let declared = 0;
    for (const e of z.entries) {
      const n = e.name.replace(/\\/g, '/');
      if (!n || n.endsWith('/')) continue;
      if (/^__MACOSX\//.test(n) || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(n)) continue;
      if (((e.ext >>> 16) & 0o170000) === 0o120000) continue; // symlink: dilewati
      if (e.flags & 1) fail('ZIP berpassword tidak didukung.');
      if (e.method !== 0 && e.method !== 8) fail(`Metode kompresi ZIP tidak didukung (${e.method}).`);
      if (n.startsWith('/') || /^[A-Za-z]:/.test(n)) fail(`ZIP berisi path berbahaya: ${n}`);
      const parts = n.split('/').filter((s) => s && s !== '.');
      if (parts.includes('..')) fail(`ZIP berisi path berbahaya: ${n}`);
      declared += e.usize;
      if (declared > MAX_UNZIPPED) fail(`Isi ZIP setelah diekstrak lebih dari ${MAX_UNZIPPED / MB} MB.`);
      items.push({ e, parts });
    }
    if (!items.length) fail('ZIP kosong.');
    // Satu folder induk tunggal: dibuang supaya file bot ada di akar
    const tops = new Set(items.map((x) => x.parts[0]));
    const strip = tops.size === 1 && items.every((x) => x.parts.length > 1) ? 1 : 0;
    fs.mkdirSync(dir, { recursive: true });
    const rootAbs = path.resolve(dir) + path.sep;
    let bytes = 0;
    for (const { e, parts } of items) {
      const rel = parts.slice(strip);
      const dest = path.resolve(dir, ...rel);
      if (!dest.startsWith(rootAbs)) fail(`ZIP berisi path berbahaya: ${e.name}`);
      const lh = Buffer.alloc(30);
      fs.readSync(z.fd, lh, 0, 30, e.lho);
      if (lh.readUInt32LE(0) !== 0x04034b50) fail('File ZIP rusak (header lokal).');
      const start = e.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const comp = Buffer.alloc(e.csize); fs.readSync(z.fd, comp, 0, e.csize, start);
      let data;
      try { data = e.method === 0 ? comp : zlib.inflateRawSync(comp, { maxOutputLength: e.usize + 1 }); }
      catch (_) { fail(`Gagal mengekstrak ${e.name} (rusak atau lebih besar dari yang tercatat).`); }
      if (data.length !== e.usize) fail(`Ukuran ${e.name} tidak cocok dengan isi ZIP.`);
      if (typeof zlib.crc32 === 'function' && zlib.crc32(data) !== e.crc) fail(`CRC ${e.name} salah (file rusak).`);
      bytes += data.length;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    return { files: items.length, bytes };
  } finally { z.close(); }
}

/* ---------- Deteksi proyek ---------- */
function detect(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('package.json')) {
    let pj = {}; try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch (_) {}
    let cmd = '';
    if (pj.scripts && pj.scripts.start) cmd = 'npm start';
    else { const f = [pj.main, 'index.js', 'bot.js', 'main.js', 'app.js', 'server.js'].find((x) => x && has(x)); if (f) cmd = `node ${f}`; }
    return { runtime: 'node', cmd, install: [['npm', 'install', '--omit=dev', '--no-audit', '--no-fund']] };
  }
  const py = ['main.py', 'bot.py', 'app.py', 'run.py', 'start.py', '__main__.py'].find(has);
  if (py || has('requirements.txt')) {
    const vpy = path.join(dir, '.venv', 'bin', 'python');
    // Setiap bot Python punya venv sendiri (menghindari galat "externally-managed-environment" dan bentrok antar bot)
    const install = has('requirements.txt') ? [...(fs.existsSync(vpy) ? [] : [['python3', '-m', 'venv', '.venv']]), [vpy, '-m', 'pip', 'install', '-r', 'requirements.txt']] : null;
    return { runtime: 'python', cmd: py ? `python3 ${py}` : '', install };
  }
  if (has('start.sh')) return { runtime: 'shell', cmd: 'sh start.sh', install: null };
  return { runtime: 'unknown', cmd: '', install: null };
}

// "python3 -u main.py" jadi argv (mendukung kutip), tanpa shell
function splitArgs(s) {
  const out = []; let cur = '', q = '', has = false;
  for (const ch of String(s).trim()) {
    if (q) { if (ch === q) q = ''; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) { out.push(cur); cur = ''; has = false; } }
    else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

module.exports = function createBotHost({ app, wrap, needHeader }) {
  const rts = new Map(); // id -> runtime
  const rt = (id) => { if (!rts.has(id)) rts.set(id, { proc: null, state: 'stopped', log: [], seq: 0, startedAt: 0, restarts: 0, timer: null, stopping: false, trace: false, buf: { out: '', err: '' }, task: '' }); return rts.get(id); };
  const botDir = (b) => path.join(ROOT, b.id);

  /* ----- terminal ----- */
  const classify = (r, line, stream) => {
    if (/^Traceback \(most recent call last\)/.test(line)) { r.trace = true; return 'err'; }
    if (r.trace) { if (/^\s|^File /.test(line)) return 'err'; r.trace = false; return 'err'; }
    if (/\b(error|exception|fatal|critical|traceback|failed|gagal|cannot|ENOENT|EADDRINUSE)\b/i.test(line)) return 'err';
    if (/\b(warn(ing)?|deprecated|peringatan)\b/i.test(line)) return 'warn';
    if (/\b(success|successfully|berhasil|started|ready|listening|running|connected|logged in|online|done)\b|✓|✔/i.test(line)) return 'ok';
    return stream === 'err' ? 'warn' : 'out';
  };
  const log = (r, kind, text) => { r.log.push({ n: ++r.seq, t: Date.now(), k: kind, s: String(text).slice(0, 500) }); if (r.log.length > MAX_LOG) r.log.splice(0, r.log.length - MAX_LOG); };
  const feed = (r, stream, chunk) => {
    r.buf[stream] += chunk.toString('utf8').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const lines = r.buf[stream].split(/\r?\n|\r/); r.buf[stream] = lines.pop();
    if (r.buf[stream].length > 4000) { lines.push(r.buf[stream]); r.buf[stream] = ''; }
    for (const l of lines) if (l.trim()) log(r, classify(r, l, stream), l);
  };
  const flush = (r) => { for (const s of ['out', 'err']) { if (r.buf[s].trim()) log(r, classify(r, r.buf[s], s), r.buf[s]); r.buf[s] = ''; } };

  /* ----- proses ----- */
  const childEnv = (b) => {
    const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'PREFIX', 'SHELL', 'USER', 'TZ', 'SSL_CERT_FILE'];
    const env = {}; for (const k of keep) if (process.env[k]) env[k] = process.env[k];
    env.PYTHONUNBUFFERED = '1'; env.FORCE_COLOR = '0';
    const venv = path.join(botDir(b), '.venv');
    if (fs.existsSync(path.join(venv, 'bin', 'python'))) { env.VIRTUAL_ENV = venv; env.PATH = `${path.join(venv, 'bin')}${path.delimiter}${env.PATH || ''}`; }
    return { ...env, ...(b.env || {}) };
  };
  function killTree(proc, then) {
    if (!proc || !proc.pid) return then && then();
    const sig = (s) => { try { process.kill(-proc.pid, s); } catch (_) { try { proc.kill(s); } catch (__) {} } };
    sig('SIGTERM');
    const t = setTimeout(() => sig('SIGKILL'), 4000); t.unref();
    if (then) proc.once('exit', () => { clearTimeout(t); then(); });
  }
  function spawnLogged(b, r, argv, label, onDone) {
    let proc;
    try { proc = spawn(argv[0], argv.slice(1), { cwd: botDir(b), env: childEnv(b), stdio: ['ignore', 'pipe', 'pipe'], detached: true }); }
    catch (e) { log(r, 'err', `✖ Gagal menjalankan ${label}: ${e.message}`); return onDone(1, null, e); }
    r.proc = proc;
    proc.stdout.on('data', (d) => feed(r, 'out', d)); proc.stderr.on('data', (d) => feed(r, 'err', d));
    let done = false;
    proc.once('error', (e) => { if (done) return; done = true; r.proc = null; flush(r);
      log(r, 'err', e.code === 'ENOENT' ? `✖ Gagal: perintah "${argv[0]}" tidak ditemukan. Pasang dulu (Termux: pkg install ${/python/.test(argv[0]) ? 'python' : /node|npm/.test(argv[0]) ? 'nodejs' : argv[0]}).` : `✖ Gagal: ${e.message}`);
      onDone(127, null, e); });
    proc.once('exit', (code, signal) => { if (done) return; done = true; if (r.proc === proc) r.proc = null; flush(r); onDone(code, signal); });
    return proc;
  }

  function start(id) {
    const db = read(); const b = db.bots.find((x) => x.id === id); if (!b) fail('Bot tidak ditemukan.', 404);
    const r = rt(id);
    if (r.proc) fail(r.state === 'installing' ? 'Sedang menginstal dependensi. Tunggu sampai selesai.' : 'Bot sudah berjalan.');
    if (!b.cmd || !b.cmd.trim()) fail('Perintah menjalankan belum diisi. Isi di Pengaturan, misalnya: python3 main.py');
    const argv = splitArgs(b.cmd); if (!argv.length) fail('Perintah menjalankan tidak valid.');
    clearTimeout(r.timer); r.stopping = false; r.state = 'running'; r.startedAt = Date.now();
    log(r, 'sys', `▶ Menjalankan: ${b.cmd}`);
    spawnLogged(b, r, argv, b.cmd, (code, signal, err) => {
      const ran = Date.now() - r.startedAt;
      if (r.stopping) { r.state = 'stopped'; log(r, 'sys', '■ Dihentikan.'); return; }
      if (code === 0) { r.state = 'stopped'; log(r, 'ok', '✔ Berhasil: program selesai (kode 0).'); return; }
      r.state = 'crashed';
      if (err && err.code === 'ENOENT') return;
      log(r, 'err', `✖ Gagal: keluar dengan ${signal ? `sinyal ${signal}` : `kode ${code}`} setelah ${Math.round(ran / 1000)} detik.`);
      const cur = read().bots.find((x) => x.id === id);
      if (!cur || !cur.restart) return;
      if (ran > 60000) r.restarts = 0;
      if (r.restarts >= 10) { log(r, 'err', '✖ Terlalu sering crash (10 kali beruntun). Berhenti memulai ulang otomatis.'); return; }
      const wait = Math.min(3000 * 2 ** r.restarts, 60000); r.restarts += 1;
      log(r, 'warn', `⚠ Memulai ulang otomatis dalam ${Math.round(wait / 1000)} detik (percobaan ${r.restarts}/10).`);
      r.timer = setTimeout(() => { try { start(id); } catch (e) { log(r, 'err', `✖ ${e.message}`); } }, wait); r.timer.unref();
    });
  }
  function stop(id, cb) {
    const r = rt(id); clearTimeout(r.timer); r.restarts = 0;
    if (!r.proc) { if (r.state === 'crashed') { r.state = 'stopped'; log(r, 'sys', '■ Pemulaian ulang otomatis dibatalkan.'); } return cb && cb(); }
    r.stopping = true; log(r, 'sys', '■ Menghentikan...'); killTree(r.proc, cb);
  }
  function install(id) {
    const db = read(); const b = db.bots.find((x) => x.id === id); if (!b) fail('Bot tidak ditemukan.', 404);
    const r = rt(id); if (r.proc) fail('Hentikan bot dulu sebelum menginstal dependensi.');
    const d = detect(botDir(b)); if (!d.install) fail('Tidak ada requirements.txt atau package.json untuk diinstal.');
    clearTimeout(r.timer); r.state = 'installing'; r.stopping = false;
    const dir = botDir(b); const steps = d.install;
    log(r, 'sys', '⬇ Menginstal dependensi...');
    const finish = (ok, why) => {
      const cur = read(); const bb = cur.bots.find((x) => x.id === id);
      r.state = 'stopped';
      if (ok) log(r, 'ok', '✔ Berhasil: dependensi terinstal.'); else log(r, 'err', `✖ Gagal: instalasi dependensi ${why}.`);
      if (bb) { bb.installOk = ok; write(cur); }
    };
    const run = (i) => {
      if (i >= steps.length) return finish(true);
      const argv = steps[i]; const label = argv.join(' ').split(dir).join('.');
      log(r, 'sys', `$ ${label}`);
      spawnLogged(b, r, argv, label, (code, signal) => { if (code === 0) run(i + 1); else finish(false, signal ? `dihentikan (${signal})` : `berhenti dengan kode ${code}`); });
    };
    run(0);
  }

  /* ----- tampilan ----- */
  const countFiles = (dir) => { let n = 0; const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) {} for (const e of es) { if (n > 99999) return; if (e.isDirectory()) { if (!['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(e.name) && depth < 8) walk(path.join(d, e.name), depth + 1); } else n += 1; } }; walk(dir, 0); return n; };
  const view = (b) => {
    const r = rt(b.id); const d = detect(botDir(b));
    return { id: b.id, name: b.name, runtime: b.runtime || d.runtime, cmd: b.cmd, autostart: Boolean(b.autostart), restart: b.restart !== false,
      envKeys: Object.keys(b.env || {}), state: r.state, pid: r.proc ? r.proc.pid : 0, startedAt: r.state === 'running' ? r.startedAt : 0,
      uploadedAt: b.uploadedAt, files: b.files || 0, bytes: b.bytes || 0, canInstall: Boolean(d.install), installOk: b.installOk === undefined ? null : b.installOk };
  };
  const getBot = (id) => { if (!ID_RX.test(String(id))) fail('Bot tidak ditemukan.', 404); const db = read(); const b = db.bots.find((x) => x.id === id); if (!b) fail('Bot tidak ditemukan.', 404); return { db, b }; };

  /* ----- unggah zip: dialirkan ke disk ----- */
  let uploading = false;
  async function receiveZip(req) {
    const len = Number(req.headers['content-length'] || 0);
    if (!len) fail('Ukuran file tidak diketahui.');
    if (len > MAX_ZIP) fail(`ZIP ${(len / MB).toFixed(1)} MB melebihi batas 50 MB.`, 413);
    const tmp = path.join(require('os').tmpdir(), `zzbot-${crypto.randomBytes(6).toString('hex')}.zip`);
    let got = 0;
    try {
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp, { mode: 0o600 });
        req.on('data', (c) => { got += c.length; if (got > MAX_ZIP) { req.destroy(); out.destroy(); reject(Object.assign(new Error('ZIP melebihi 50 MB.'), { status: 413 })); } });
        req.on('error', reject); req.on('aborted', () => reject(new Error('Unggahan terputus.')));
        out.on('error', reject); out.on('finish', resolve); req.pipe(out);
      });
      const head = Buffer.alloc(4); const fd = fs.openSync(tmp, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
      if (head.toString('latin1', 0, 2) !== 'PK') fail('File itu bukan ZIP.', 422);
      return tmp;
    } catch (e) { fs.rm(tmp, () => {}); throw e; }
  }

  function routes() {
    app.get('/api/bots', wrap(async (req, res) => res.json({ bots: read().bots.map(view), maxZipMb: 50 })));

    // Unggah baru (tanpa X-Bot-Id) atau perbarui file bot yang ada (dengan X-Bot-Id). Env dan pengaturan dipertahankan.
    app.post('/api/bots/upload', needHeader, wrap(async (req, res) => {
      if (uploading) fail('Masih ada unggahan yang berjalan.', 429);
      let fname = 'bot.zip'; try { fname = decodeURIComponent(req.get('x-file-name') || 'bot.zip'); } catch (_) {}
      fname = path.basename(fname).replace(/[\u0000-\u001f"\\/]/g, '_');
      if (!/\.zip$/i.test(fname)) fail('File harus berformat .zip.');
      const existingId = String(req.get('x-bot-id') || '');
      let name = ''; try { name = decodeURIComponent(req.get('x-bot-name') || ''); } catch (_) {}
      name = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
      const pre = read();
      if (existingId) getBot(existingId); else if (pre.bots.length >= MAX_BOTS) fail(`Maksimal ${MAX_BOTS} bot. Hapus yang lama dulu.`);
      uploading = true; let tmp = '';
      try {
        tmp = await receiveZip(req);
        const id = existingId || crypto.randomBytes(6).toString('hex');
        const dir = path.join(ROOT, id);
        const r = rt(id);
        if (existingId) await new Promise((ok) => { stop(id, ok); });
        const staging = `${dir}.new`; fs.rmSync(staging, { recursive: true, force: true });
        let info;
        try { info = extractZip(tmp, staging); }
        catch (e) { fs.rmSync(staging, { recursive: true, force: true }); throw e; }
        fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(staging, dir);
        const d = detect(dir);
        const db = read(); let b = db.bots.find((x) => x.id === id);
        if (!b) { b = { id, name: name || fname.replace(/\.zip$/i, '').slice(0, 60) || 'bot', env: {}, autostart: false, restart: true, createdAt: new Date().toISOString() }; db.bots.push(b); }
        else if (name) b.name = name;
        b.runtime = d.runtime; if (!b.cmdCustom || !b.cmd) { b.cmd = d.cmd; b.cmdCustom = false; }
        b.files = info.files; b.bytes = info.bytes; b.uploadedAt = new Date().toISOString(); b.installOk = undefined;
        write(db);
        r.log = []; r.state = 'stopped';
        log(r, 'sys', `📦 ${existingId ? 'Diperbarui' : 'Diunggah'}: ${fname} (${(fs.statSync(tmp).size / MB).toFixed(1)} MB)`);
        log(r, 'ok', `✔ Berhasil: diekstrak ${info.files} file (${(info.bytes / MB).toFixed(1)} MB).`);
        log(r, 'sys', `🔎 Terdeteksi: ${d.runtime}${d.cmd ? `, perintah "${d.cmd}"` : ', perintah belum ketemu (isi manual di Pengaturan)'}`);
        if (d.install) { setTimeout(() => { try { install(id); } catch (e) { log(r, 'err', `✖ ${e.message}`); } }, 100); }
        else log(r, 'sys', 'ℹ Tidak ada requirements.txt/package.json, tidak ada dependensi untuk diinstal.');
        res.status(existingId ? 200 : 201).json({ bot: view(b) });
      } finally { uploading = false; if (tmp) fs.rm(tmp, () => {}); }
    }));

    app.get('/api/bots/:id', wrap(async (req, res) => {
      const { b } = getBot(req.params.id);
      const files = []; const dir = botDir(b);
      const walk = (d, rel, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) {} es.sort((x, y) => x.name.localeCompare(y.name));
        for (const e of es) { if (files.length >= 300) return; const p = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { if (['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(e.name)) files.push({ p: p + '/', s: -1 }); else if (depth < 6) walk(path.join(d, e.name), p, depth + 1); }
          else { let s = 0; try { s = fs.statSync(path.join(d, e.name)).size; } catch (_) {} files.push({ p, s }); } } };
      walk(dir, '', 0);
      res.json({ bot: view(b), files });
    }));

    app.post('/api/bots/:id/config', needHeader, wrap(async (req, res) => {
      const { db, b } = getBot(req.params.id); const body = req.body || {};
      if (body.name !== undefined) { const n = String(body.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60); if (!n) fail('Nama tidak boleh kosong.'); b.name = n; }
      if (body.cmd !== undefined) { const c = String(body.cmd).trim().slice(0, 300); b.cmd = c; b.cmdCustom = c !== detect(botDir(b)).cmd; }
      if (body.autostart !== undefined) b.autostart = Boolean(body.autostart);
      if (body.restart !== undefined) b.restart = Boolean(body.restart);
      if (Array.isArray(body.env)) {
        const next = {}; const old = b.env || {};
        for (const it of body.env.slice(0, 50)) {
          const k = String((it && it.k) || '').trim();
          if (!k) continue;
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) fail(`Nama variabel "${k}" tidak valid (huruf, angka, garis bawah).`);
          if (/^(LD_PRELOAD|LD_LIBRARY_PATH|NODE_OPTIONS)$/i.test(k)) fail(`Variabel ${k} tidak diizinkan.`);
          if (it.v === null) { if (k in old) next[k] = old[k]; else fail(`Variabel ${k} belum punya nilai.`); }
          else next[k] = String(it.v).slice(0, 2000);
        }
        b.env = next;
      }
      write(db); res.json({ bot: view(b) });
    }));

    app.post('/api/bots/:id/start', needHeader, wrap(async (req, res) => { getBot(req.params.id); rt(req.params.id).restarts = 0; start(req.params.id); res.json({ ok: true }); }));
    app.post('/api/bots/:id/stop', needHeader, wrap(async (req, res) => { getBot(req.params.id); stop(req.params.id); res.json({ ok: true }); }));
    app.post('/api/bots/:id/restart', needHeader, wrap(async (req, res) => {
      getBot(req.params.id); const id = req.params.id;
      await new Promise((ok) => stop(id, ok)); rt(id).restarts = 0; start(id); res.json({ ok: true });
    }));
    app.post('/api/bots/:id/install', needHeader, wrap(async (req, res) => { getBot(req.params.id); install(req.params.id); res.json({ ok: true }); }));

    app.get('/api/bots/:id/log', wrap(async (req, res) => {
      const { b } = getBot(req.params.id); const r = rt(b.id); const since = Number(req.query.since || 0);
      res.json({ lines: r.log.filter((l) => l.n > since), next: r.seq, state: r.state, pid: r.proc ? r.proc.pid : 0, startedAt: r.state === 'running' ? r.startedAt : 0 });
    }));
    app.post('/api/bots/:id/log/clear', needHeader, wrap(async (req, res) => { const { b } = getBot(req.params.id); const r = rt(b.id); r.log = []; res.json({ ok: true, next: r.seq }); }));

    app.delete('/api/bots/:id', needHeader, wrap(async (req, res) => {
      const { db, b } = getBot(req.params.id);
      await new Promise((ok) => stop(b.id, ok));
      db.bots = db.bots.filter((x) => x.id !== b.id); write(db);
      fs.rmSync(botDir(b), { recursive: true, force: true }); rts.delete(b.id);
      res.json({ ok: true });
    }));
  }

  process.on('exit', () => { for (const r of rts.values()) if (r.proc && r.proc.pid) { try { process.kill(-r.proc.pid, 'SIGKILL'); } catch (_) {} } });
  setTimeout(() => { read().bots.filter((b) => b.autostart && b.cmd).forEach((b, i) => setTimeout(() => { try { const r = rt(b.id); log(r, 'sys', '⏻ Auto-start saat panel dihidupkan.'); start(b.id); } catch (_) {} }, i * 1500)); }, 4000).unref();

  return { routes };
};
