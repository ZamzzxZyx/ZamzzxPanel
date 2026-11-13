const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { extractFiles } = require('./webfiles');

module.exports = function registerSites({ app, express, cf, wrap, needHeader, zone }) {
  // Baca .env setiap dipakai supaya token baru langsung terbaca tanpa restart.
  // Nilai di file .env menang atas variabel dari platform.
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
  const NAMES = ['VERCEL_TOKEN', 'NETLIFY_TOKEN', 'GITHUB_TOKEN'];
  const platforms = () => { const E = env(); return { vercel: Boolean(E.VERCEL_TOKEN), netlify: Boolean(E.NETLIFY_TOKEN) }; };
  const detected = () => { const E = env(); return Object.fromEntries(NAMES.map((k) => [k, Boolean(E[k])])); };
  const DB = path.join(__dirname, 'data', 'sites.json');
  const MAX_FILES = 2000;
  const MAX_BYTES = 40 * 1024 * 1024;

  const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
  const readDb = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) { return []; } };
  const writeDb = (rows) => {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB + '.tmp', JSON.stringify(rows, null, 2));
    fs.renameSync(DB + '.tmp', DB);
  };

  /* ---------- ZIP ---------- */
  function zipFrom(files) {
    const z = new AdmZip();
    for (const f of files) z.addFile(f.p, f.data);
    return z.toBuffer();
  }

  async function fromGithub(repo, branch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) fail('Format repo harus pemilik/nama, contoh panel/webku.');
    if (branch && !/^[\w./-]+$/.test(branch)) fail('Nama branch tidak valid.');
    const headers = { 'User-Agent': 'panel-panel', Accept: 'application/vnd.github+json' };
    const { GITHUB_TOKEN } = env();
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${repo}/zipball${branch ? '/' + branch : ''}`, { headers });
    if (!r.ok) fail('Repo tidak ditemukan atau private. Untuk repo private, isi GITHUB_TOKEN di .env.', 400);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 60 * 1024 * 1024) fail('Repo terlalu besar (lebih dari 60 MB).');
    return buf;
  }

  /* ---------- Vercel ---------- */
  async function vercel(method, p, body, opts = {}) {
    const { VERCEL_TOKEN, VERCEL_TEAM_ID } = env();
    const team = VERCEL_TEAM_ID ? `${p.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : '';
    const r = await fetch('https://api.vercel.com' + p + team, {
      method,
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, ...(body && !opts.raw ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
      body: opts.raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) fail('Vercel: ' + (j && j.error && j.error.message ? j.error.message : `status ${r.status}`), 502);
    return j;
  }

  async function vercelDeploy(name, files) {
    const list = files.map((f) => ({ file: f.p, sha: crypto.createHash('sha1').update(f.data).digest('hex'), size: f.data.length, data: f.data }));
    const seen = new Set();
    const queue = list.filter((f) => !seen.has(f.sha) && seen.add(f.sha));
    let i = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (i < queue.length) {
        const f = queue[i++];
        await vercel('POST', '/v2/files', f.data, { raw: true, headers: { 'Content-Type': 'application/octet-stream', 'x-vercel-digest': f.sha } });
      }
    }));
    const d = await vercel('POST', '/v13/deployments?skipAutoDetectionConfirmation=1', {
      name, target: 'production', projectSettings: { framework: null },
      files: list.map(({ file, sha, size }) => ({ file, sha, size })),
    });
    return { projectId: d.projectId, deploymentUrl: d.url };
  }

  async function vercelDomain(projectId, domain) {
    await vercel('POST', `/v10/projects/${projectId}/domains`, { name: domain });
    let target = 'cname.vercel-dns.com';
    try {
      const c = await vercel('GET', `/v6/domains/${domain}/config?projectIdOrName=${projectId}`);
      const v = c && c.recommendedCNAME && c.recommendedCNAME[0] && c.recommendedCNAME[0].value;
      if (v) target = v.replace(/\.$/, '');
    } catch (_) {}
    return target;
  }

  /* ---------- Netlify ---------- */
  async function netlify(method, p, body, headers = {}, raw = false) {
    const { NETLIFY_TOKEN } = env();
    const r = await fetch('https://api.netlify.com/api/v1' + p, {
      method,
      headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) fail('Netlify: ' + ((j && (j.message || j.error)) || `status ${r.status}`), 502);
    return j;
  }

  /* ---------- Inti ---------- */
  const hostOf = (label) => `${label}.${zone}`;
  const LABEL = /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/;

  async function readInput(req) {
    if (Buffer.isBuffer(req.body)) {
      if (req.is('text/html')) {
        if (!req.body.length) fail('Kode HTML kosong.');
        if (!/<[a-z!]/i.test(req.body.toString('utf8', 0, 4000))) fail('Isinya tidak terlihat seperti kode HTML.');
        return { files: [{ p: 'index.html', data: req.body }], params: req.query, source: 'html' };
      }
      return { files: extractFiles(req.body), params: req.query, source: 'zip' };
    }
    const b = req.body || {};
    if (b.source === 'github') {
      const repo = String(b.repo || '').trim();
      return { files: extractFiles(await fromGithub(repo, String(b.branch || '').trim())), params: b, source: `github:${repo}` };
    }
    return fail('Pilih sumber situs: HTML, ZIP, atau repo GitHub.');
  }

  async function createSite(platform, label, files, source) {
    if (!platforms()[platform]) fail(`Platform ${platform} belum aktif. Isi token-nya di file .env.`);
    if (!LABEL.test(label)) fail('Nama subdomain hanya boleh huruf kecil, angka, dan tanda hubung.');
    const host = hostOf(label);
    if (readDb().some((s) => s.label === label)) fail('Subdomain itu sudah dipakai situs lain di panel.');
    const existing = await cf('GET', `/dns_records?name=${encodeURIComponent(host)}`);
    if (existing.result.length) fail(`Sudah ada record DNS untuk ${host}. Hapus dulu di menu Subdomain.`);

    const row = { id: crypto.randomUUID(), label, host, platform, source, url: `https://${host}`, createdAt: new Date().toISOString() };
    let target;
    try {
      if (platform === 'vercel') {
        row.projectName = `zx-${label}`;
        const d = await vercelDeploy(row.projectName, files);
        row.platformId = d.projectId;
        target = await vercelDomain(d.projectId, host);
      } else {
        const rand = crypto.randomBytes(2).toString('hex');
        const site = await netlify('POST', '/sites', { name: `zx-${label}-${rand}`, custom_domain: host });
        row.platformId = site.id;
        await netlify('POST', `/sites/${site.id}/deploys`, zipFrom(files), { 'Content-Type': 'application/zip' }, true);
        target = `${site.name}.netlify.app`;
      }
      const dns = await cf('POST', '/dns_records', { type: 'CNAME', name: host, content: target, proxied: false, ttl: 1 });
      row.dnsId = dns.result.id;
      row.target = target;
      row.deployedAt = row.createdAt;
    } catch (e) {
      await removePlatform(row).catch(() => {});
      throw e;
    }
    writeDb([row, ...readDb()]);
    return row;
  }

  async function removePlatform(row) {
    if (!row.platformId) return;
    if (row.platform === 'vercel') await vercel('DELETE', `/v9/projects/${row.platformId}`);
    else await netlify('DELETE', `/sites/${row.platformId}`);
  }

  /* ---------- Rute ---------- */
  app.get('/api/sites', (req, res) => res.json({ sites: readDb(), platforms: platforms(), detected: detected(), zone }));

  const rawZip = express.raw({ type: 'application/zip', limit: '60mb' });
  const rawHtml = express.raw({ type: 'text/html', limit: '12mb' });

  app.post('/api/sites', needHeader, rawZip, rawHtml, wrap(async (req, res) => {
    const { files, params, source } = await readInput(req);
    const row = await createSite(String(params.platform || ''), String(params.label || '').trim().toLowerCase(), files, source);
    res.status(201).json({ site: row });
  }));

  app.post('/api/sites/:id/redeploy', needHeader, rawZip, rawHtml, wrap(async (req, res) => {
    const rows = readDb();
    const row = rows.find((s) => s.id === req.params.id);
    if (!row) fail('Situs tidak ditemukan.', 404);
    const { files, source } = await readInput(req);
    if (row.platform === 'vercel') await vercelDeploy(row.projectName, files);
    else await netlify('POST', `/sites/${row.platformId}/deploys`, zipFrom(files), { 'Content-Type': 'application/zip' }, true);
    row.source = source;
    row.deployedAt = new Date().toISOString();
    writeDb(rows);
    res.json({ site: row });
  }));

  app.delete('/api/sites/:id', needHeader, wrap(async (req, res) => {
    const rows = readDb();
    const row = rows.find((s) => s.id === req.params.id);
    if (!row) fail('Situs tidak ditemukan.', 404);
    const problems = [];
    await removePlatform(row).catch((e) => problems.push(e.message));
    if (row.dnsId) await cf('DELETE', `/dns_records/${row.dnsId}`).catch((e) => problems.push(e.message));
    writeDb(rows.filter((s) => s.id !== row.id));
    res.json({ ok: true, problems });
  }));
};
