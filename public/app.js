(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { zone: '', brand: 'Panel', pkgPrefix: 'com.example.app', ready: true, records: null, filter: '', sites: null, platforms: {}, detected: {}, apk: null, timer: null };

  const ICON = {
    overview: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5h4.5V14h3v5.5H18V10"/>',
    sites: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    apk: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    more: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    subdomains: '<path d="M6 5v8a3 3 0 0 0 3 3h9M6 9h9a3 3 0 0 1 3 3"/><circle cx="6" cy="5" r="1.6"/><circle cx="18" cy="16" r="1.6"/><circle cx="18" cy="9" r="1.6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    wink: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    tools: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    imgurl: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    nexaai: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8 10h8M8 13h5"/>',
    telegram: '<path d="M21 4L3 11l6 2.3L11 20l3-4.2 4.5 3.4z"/><path d="M9 13.3L21 4"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
  };
  // Bottom tab bar: maksimal 5 item. Halaman lain masuk ke tab "Lainnya".
  const PAGES = [
    ['overview', 'Home'],
    ['sites', 'Situs'],
    ['ai', 'AI'],
    ['apk', 'APK'],
    ['more', 'Lainnya'],
  ];
  const TAB_OF = { subdomains: 'more', settings: 'more', tools: 'more', imgurl: 'more', wink: 'more', telegram: 'more' };

  /* ---------- Util ---------- */
  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { 'X-Panel': '1' } };
    if (opts.rawBody && opts.onProgress) return xhrUpload(path, opts);
    if (opts.rawBody) { init.headers['Content-Type'] = opts.rawType || 'application/zip'; init.body = opts.rawBody; }
    else if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    const r = await fetch(path, init);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/login'; throw new Error('Sesi berakhir.'); }
    if (!r.ok) throw new Error(j.error || `Permintaan gagal (HTTP ${r.status}).`);
    return j;
  }


  function xhrUpload(path, opts) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(opts.method || 'POST', path);
      x.setRequestHeader('X-Panel', '1');
      x.setRequestHeader('Content-Type', opts.rawType || 'application/zip');
      x.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress(e.loaded / e.total); };
      x.upload.onload = () => { if (opts.onUploaded) opts.onUploaded(); };
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText); } catch (_) {}
        if (x.status === 401) { location.href = '/login'; return reject(new Error('Sesi berakhir.')); }
        if (x.status >= 200 && x.status < 300) resolve(j);
        else reject(new Error(j.error || 'Permintaan gagal.'));
      };
      x.onerror = () => reject(new Error('Koneksi terputus. Cek internet kamu.'));
      x.send(opts.rawBody);
    });
  }

  function countUp(el, to) {
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
  }

  function hostHtml(name) {
    const z = state.zone;
    if (name === z) return `<span class="host"><b>${esc(z)}</b></span>`;
    if (z && name.endsWith('.' + z)) {
      return `<span class="host"><b>${esc(name.slice(0, -(z.length + 1)))}</b><i>.${esc(z)}</i></span>`;
    }
    return `<span class="host"><b>${esc(name)}</b></span>`;
  }

  function confirmDialog(title, text, okLabel) {
    return new Promise((resolve) => {
      const d = $('#dlg');
      d.innerHTML = `<h2>${esc(title)}</h2><p class="muted">${text}</p>
        <div class="actions"><button class="btn" value="no">Batal</button><button class="btn danger" value="yes">${esc(okLabel)}</button></div>`;
      d.onclick = (e) => {
        const v = e.target.closest('button')?.value;
        if (!v) return;
        d.close();
        resolve(v === 'yes');
      };
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }

  /* ---------- Data ---------- */
  async function loadRecords(force) {
    if (state.records && !force) return state.records;
    const j = await api('/api/dns');
    state.zone = j.zone; state.brand = j.brand || 'Panel'; state.pkgPrefix = j.pkgPrefix || 'com.example.app';
    state.records = j.records;
    return state.records;
  }

  /* ---------- Tampilan ---------- */
  const views = {
    async overview(el) {
      el.innerHTML = `<header class="dash-head">
          <div><p class="eyebrow">PUSAT KONTROL</p><h1 class="page-title">Dashboard</h1>
          <p class="page-sub">Ringkasan layanan dan akses cepat ${esc(state.brand)}.</p></div>
          <span class="dash-mark" aria-hidden="true">Z</span>
        </header>
        <section class="dash-zone panel">
          <div><span class="muted dash-kicker">DOMAIN UTAMA</span><p class="hero-host host"><b>${esc(state.zone || 'Domain belum tersedia')}</b></p></div>
          <p class="status" id="st"><span class="dot"></span>Memeriksa koneksi Cloudflare</p>
        </section>
        <dl class="facts dash-facts" aria-label="Ringkasan DNS">
          <div><dd id="f1">-</dd><dt>Record DNS</dt></div>
          <div><dd id="f2">-</dd><dt>Subdomain</dt></div>
          <div><dd id="f3">-</dd><dt>Lewat proxy</dt></div>
        </dl>
        <section class="dash-section">
          <div class="section-heading"><div><h2>Akses cepat</h2><p class="muted">Buka area kerja yang sering digunakan.</p></div></div>
          <div class="dash-shortcuts">
            <a class="dash-shortcut" href="#/ai"><span class="shortcut-icon">✦</span><span><b>AI Assistant</b><small>Chat dan bantuan coding</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/wink"><span class="shortcut-icon">✧</span><span><b>Wink</b><small>Perjelas dan olah foto</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/tools"><span class="shortcut-icon">⌘</span><span><b>Nexa Tools</b><small>Tools dan pemrosesan media</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/apk"><span class="shortcut-icon">▣</span><span><b>APK Builder</b><small>Konfigurasi dan build aplikasi</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/imgurl"><span class="shortcut-icon">▧</span><span><b>Image URL</b><small>Upload dan kelola gambar</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/subdomains"><span class="shortcut-icon">⌁</span><span><b>Domain / DNS</b><small>Kelola record dan subdomain</small></span><span class="shortcut-arrow">↗</span></a>
            <a class="dash-shortcut" href="#/settings"><span class="shortcut-icon">⚙</span><span><b>Pengaturan</b><small>Tema dan konfigurasi panel</small></span><span class="shortcut-arrow">↗</span></a>
          </div>
        </section>
        <section class="panel dash-note"><div><span class="dash-kicker">${esc(state.brand).toUpperCase()}</span><h2>Semua kontrol dalam satu tempat</h2><p class="muted">Status DNS diperbarui saat dashboard dimuat. Fitur lain tetap menggunakan integrasi dan alur yang sudah ada.</p></div><a class="btn primary small" href="#/ai">Buka AI Assistant</a></section>`;
      try {
        const rec = await loadRecords();
        const subs = new Set(rec.filter((r) => r.name !== state.zone).map((r) => r.name));
        countUp($('#f1'), rec.length);
        countUp($('#f2'), subs.size);
        countUp($('#f3'), rec.filter((r) => r.proxied).length);
        $('#st').innerHTML = '<span class="dot ok"></span>Cloudflare terhubung';
      } catch (e) {
        $('#st').innerHTML = `<span class="dot err"></span>${esc(e.message)}`;
      }
    },

    async subdomains(el) {
      el.innerHTML = `<h1 class="page-title">Subdomain</h1>
        <p class="page-sub">Tambah, lihat, dan hapus record DNS untuk ${esc(state.zone)}. Perubahan langsung dikirim ke Cloudflare.</p>
        <form class="panel" id="add" autocomplete="off">
          <h2>Tambah subdomain</h2>
          <div class="form-grid">
            <div class="suffix"><label class="sr" for="lb">Nama subdomain</label>
              <input class="field mono" id="lb" placeholder="toko" inputmode="url" autocapitalize="off" spellcheck="false" required>
              <span>.${esc(state.zone)}</span></div>
            <div class="form-grid cols">
              <div><label class="sr" for="tp">Tipe</label><select class="field" id="tp"><option>CNAME</option><option>A</option><option>AAAA</option><option>TXT</option></select></div>
              <div><label class="sr" for="ct">Target</label><input class="field mono" id="ct" placeholder="cname.vercel-dns.com" autocapitalize="off" spellcheck="false" required></div>
            </div>
            <label class="switch"><input type="checkbox" id="px"><span>Lewat proxy Cloudflare</span></label>
            <p class="preview" id="pv"></p>
            <button class="btn primary" id="sv" type="submit">Tambah subdomain</button>
          </div>
        </form>
        <div class="toolbar"><label class="sr" for="q">Cari record</label><input class="field" id="q" type="search" placeholder="Cari nama atau target" value="${esc(state.filter)}"><button class="btn" id="rf" type="button">Muat ulang</button></div>
        <ul class="list" id="ls"><li class="skel"></li><li class="skel"></li><li class="skel"></li></ul>`;

      const hints = { CNAME: 'cname.vercel-dns.com', A: '203.0.113.10', AAAA: '2001:db8::1', TXT: 'v=spf1 include:_spf.example.com ~all' };
      const pv = () => {
        const l = $('#lb').value.trim().toLowerCase();
        $('#pv').innerHTML = l ? `Akan dibuat: ${hostHtml(l === '@' ? state.zone : `${l}.${state.zone}`)}` : '<span class="muted">Ketik nama untuk melihat alamat lengkapnya.</span>';
      };
      pv();
      $('#lb').oninput = pv;
      $('#tp').onchange = () => {
        const t = $('#tp').value;
        $('#ct').placeholder = hints[t];
        $('#px').disabled = t === 'TXT';
        if (t === 'TXT') $('#px').checked = false;
      };

      $('#add').onsubmit = async (e) => {
        e.preventDefault();
        const b = $('#sv');
        b.disabled = true;
        try {
          await api('/api/dns', { method: 'POST', body: { label: $('#lb').value, type: $('#tp').value, content: $('#ct').value, proxied: $('#px').checked } });
          toast('Subdomain ditambahkan');
          $('#lb').value = ''; $('#ct').value = ''; pv();
          await loadRecords(true);
          draw();
        } catch (err) { toast(err.message, true); }
        b.disabled = false;
      };

      const draw = () => {
        const ls = $('#ls');
        const f = state.filter.trim().toLowerCase();
        const rows = (state.records || []).filter((r) => !f || r.name.includes(f) || r.content.toLowerCase().includes(f));
        if (!rows.length) {
          ls.innerHTML = `<li class="empty"><h2>${f ? 'Tidak ada yang cocok' : 'Belum ada record'}</h2><p>${f ? 'Coba kata kunci lain.' : 'Isi form di atas untuk menambah subdomain pertamamu.'}</p></li>`;
          return;
        }
        const anim = !draw.done; draw.done = true;
        ls.innerHTML = rows.map((r, i) => `<li class="row${anim ? ' in' : ''}" style="--i:${Math.min(i, 12)}">${hostHtml(r.name)}
          <div class="meta"><span class="tag">${esc(r.type)}</span>${r.proxied ? '<span class="tag on">Proxy</span>' : ''}<span class="mono">${esc(r.content)}</span></div>
          <div class="act">${r.type === 'NS' ? '' : `<button class="btn small danger" data-del="${esc(r.id)}" data-name="${esc(r.name)}">Hapus</button>`}</div></li>`).join('');
      };

      $('#q').oninput = (e) => { state.filter = e.target.value; draw(); };
      $('#rf').onclick = async () => { try { await loadRecords(true); draw(); toast('Daftar diperbarui'); } catch (e) { toast(e.message, true); } };
      $('#ls').onclick = async (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        const ok = await confirmDialog('Hapus record ini?', `<b class="mono">${esc(b.dataset.name)}</b> akan dihapus dari Cloudflare dan tidak bisa dibuka lagi.`, 'Hapus record');
        if (!ok) return;
        try {
          await api('/api/dns/' + b.dataset.del, { method: 'DELETE' });
          toast('Record dihapus');
          await loadRecords(true);
          draw();
        } catch (err) { toast(err.message, true); }
      };

      try { await loadRecords(); draw(); }
      catch (err) { $('#ls').innerHTML = `<li class="empty"><h2>Daftar tidak bisa dimuat</h2><p>${esc(err.message)}</p></li>`; }
    },

    async sites(el) {
      const PLAT = { vercel: 'Vercel', netlify: 'Netlify' };
      const STARTER = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Situs baru</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e6eaf2;font-family:system-ui,sans-serif}
h1{font-size:clamp(28px,8vw,56px);margin:0 0 8px;background:linear-gradient(90deg,#4d7cff,#8b6cff,#4d7cff);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:f 6s linear infinite}
p{margin:0;color:#8b95a8;text-align:center}
@keyframes f{to{background-position:200% 0}}
</style>
</head>
<body>
<main><h1>Halo dunia</h1><p>Situs ini di-deploy dari panel.</p></main>
</body>
</html>`;

      const sourceFields = (p) => `
        <div class="form-grid">
          <label class="sr" for="${p}src">Sumber</label>
          <select class="field" id="${p}src">
            <option value="paste">Tempel kode HTML</option>
            <option value="htmlfile">Upload file HTML</option>
            <option value="zip">Upload file ZIP</option>
            <option value="github">Dari repo GitHub</option>
          </select>
          <div data-src="paste">
            <label class="sr" for="${p}code">Kode HTML</label>
            <textarea class="field code" id="${p}code" placeholder="Tempel kode HTML lengkap di sini" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
            <button class="btn small" type="button" id="${p}demo" style="margin-top:8px">Isi contoh</button>
          </div>
          <div data-src="htmlfile" hidden><label class="sr" for="${p}hfile">File HTML</label><input class="field" id="${p}hfile" type="file" accept=".html,.htm,text/html" style="padding-top:9px"></div>
          <div data-src="zip" hidden><label class="sr" for="${p}file">File ZIP</label><input class="field" id="${p}file" type="file" accept=".zip,application/zip" style="padding-top:9px"></div>
          <div data-src="github" hidden class="form-grid cols">
            <div><label class="sr" for="${p}br">Branch</label><input class="field mono" id="${p}br" placeholder="main" autocapitalize="off" spellcheck="false"></div>
            <div><label class="sr" for="${p}repo">Repo</label><input class="field mono" id="${p}repo" placeholder="pemilik/nama-repo" autocapitalize="off" spellcheck="false"></div>
          </div>
        </div>`;

      const bindSource = (p, root) => {
        const sync = () => {
          const v = $(`#${p}src`).value;
          root.querySelectorAll('[data-src]').forEach((n) => { n.hidden = n.dataset.src !== v; });
        };
        $(`#${p}src`).onchange = sync;
        $(`#${p}demo`).onclick = () => { $(`#${p}code`).value = STARTER; };
        sync();
      };

      // Mengembalikan opsi permintaan sesuai sumber yang dipilih
      const readSource = (p, extra) => {
        const v = $(`#${p}src`).value;
        const query = new URLSearchParams(extra).toString();
        if (v === 'github') {
          const repo = $(`#${p}repo`).value.trim();
          if (!repo) throw new Error('Isi nama repo GitHub dulu.');
          return { body: { source: 'github', repo, branch: $(`#${p}br`).value.trim(), ...extra } };
        }
        if (v === 'paste') {
          const code = $(`#${p}code`).value;
          if (!code.trim()) throw new Error('Tempel kode HTML dulu.');
          return { rawBody: code, rawType: 'text/html', query };
        }
        const file = $(v === 'htmlfile' ? `#${p}hfile` : `#${p}file`).files[0];
        if (!file) throw new Error(v === 'htmlfile' ? 'Pilih file HTML dulu.' : 'Pilih file ZIP dulu.');
        return { rawBody: file, rawType: v === 'htmlfile' ? 'text/html' : 'application/zip', query };
      };

      el.innerHTML = `<h1 class="page-title">Situs</h1>
        <p class="page-sub">Tempel kode HTML, upload file, atau ambil dari GitHub. Pilih platform dan subdomain, lalu panel mengurus deploy dan DNS-nya.</p>
        <div id="notice"></div>
        <form class="panel" id="addsite" autocomplete="off">
          <h2>Situs baru</h2>
          <div class="form-grid">
            <label class="sr" for="pf">Platform</label><select class="field" id="pf"></select>
            <div class="suffix"><label class="sr" for="sl">Nama subdomain</label>
              <input class="field mono" id="sl" placeholder="toko" autocapitalize="off" spellcheck="false" required><span>.${esc(state.zone)}</span></div>
            ${sourceFields('n')}
            <p class="muted" style="font-size:13px">Untuk ZIP, index.html harus ada di folder utama. Maksimal 40 MB.</p>
            <div class="progress" id="prog" hidden><div class="track"><div class="bar" id="bar"></div></div><p id="ptxt"></p></div>
            <p class="err" id="serr" role="alert"></p>
            <button class="btn primary" id="sdep" type="submit">Deploy situs</button>
          </div>
        </form>
        <ul class="list" id="sl-list"><li class="skel"></li><li class="skel"></li></ul>`;
      bindSource('n', $('#addsite'));

      const draw = () => {
        const pf = $('#pf');
        const active = Object.keys(PLAT).filter((k) => state.platforms[k]);
        pf.innerHTML = active.length ? active.map((k) => `<option value="${k}">${PLAT[k]}</option>`).join('') : '<option value="">Belum ada platform aktif</option>';
        $('#sdep').disabled = !active.length;
        const det = ['VERCEL_TOKEN', 'NETLIFY_TOKEN'].map((k) => `<li><span class="mono">${k}</span>: ${state.detected[k] ? 'terbaca' : 'belum terisi'}</li>`).join('');
        $('#notice').innerHTML = active.length ? '' : `<div class="panel"><h2>Platform belum aktif</h2><p class="muted">Isi salah satu token di file .env. Perubahan langsung terbaca, tidak perlu restart.</p><ul class="steps">${det}</ul><p class="muted" style="margin-top:10px;font-size:13px">Kalau sudah diisi tapi tetap belum terbaca, cek nama variabelnya persis sama, tanpa spasi di sekitar tanda =, dan file .env ada satu folder dengan server.js.</p></div>`;
        const ls = $('#sl-list');
        const rows = state.sites || [];
        if (!rows.length) { ls.innerHTML = '<li class="empty"><h2>Belum ada situs</h2><p>Isi form di atas untuk men-deploy situs pertamamu.</p></li>'; return; }
        const anim = !draw.done; draw.done = true;
        ls.innerHTML = rows.map((r, i) => `<li class="row${anim ? ' in' : ''}" style="--i:${Math.min(i, 12)}"><a class="host" href="${esc(r.url)}" target="_blank" rel="noopener" style="text-decoration:none">${hostHtml(r.host)}</a>
          <div class="meta"><span class="tag">${esc(PLAT[r.platform] || r.platform)}</span><span class="mono">${esc(r.source)}</span></div>
          <div class="act" style="display:flex;gap:8px"><button class="btn small" data-up="${esc(r.id)}" data-name="${esc(r.host)}">Update</button><button class="btn small danger" data-rm="${esc(r.id)}" data-name="${esc(r.host)}">Hapus</button></div></li>`).join('');
      };

      async function send(path, p, extra, ui) {
        const o = readSource(p, extra);
        const opts = { method: 'POST', body: o.body, rawBody: o.rawBody, rawType: o.rawType };
        if (ui && o.rawBody) { opts.onProgress = ui.progress; opts.onUploaded = ui.uploaded; }
        return api(path + (o.query ? '?' + o.query : ''), opts);
      }

      $('#addsite').onsubmit = async (e) => {
        e.preventDefault();
        const b = $('#sdep'), err = $('#serr'), prog = $('#prog'), bar = $('#bar'), ptxt = $('#ptxt');
        err.textContent = '';
        const wait = () => { bar.style.width = ''; bar.classList.add('indet'); ptxt.textContent = 'Server sedang deploy dan memasang domain. Ini bisa sampai satu menit.'; };
        const ui = {
          progress: (f) => { bar.classList.remove('indet'); bar.style.width = Math.round(f * 100) + '%'; ptxt.textContent = `Mengunggah ${Math.round(f * 100)}%`; },
          uploaded: wait,
        };
        b.disabled = true; b.textContent = 'Memproses...';
        prog.hidden = false; bar.className = 'bar'; bar.style.width = '0%'; ptxt.textContent = 'Menyiapkan...';
        try {
          if ($('#nsrc').value === 'github') wait();
          await send('/api/sites', 'n', { platform: $('#pf').value, label: $('#sl').value.trim().toLowerCase() }, ui);
          toast('Situs berhasil di-deploy');
          $('#sl').value = ''; $('#ncode').value = ''; $('#nfile').value = ''; $('#nhfile').value = '';
          state.sites = (await api('/api/sites')).sites;
          draw();
        } catch (ex) { err.textContent = ex.message; }
        prog.hidden = true; b.disabled = false; b.textContent = 'Deploy situs';
      };

      $('#sl-list').onclick = async (e) => {
        const up = e.target.closest('[data-up]');
        const rm = e.target.closest('[data-rm]');
        if (rm) {
          const ok = await confirmDialog('Hapus situs ini?', `<b class="mono">${esc(rm.dataset.name)}</b> akan dihapus dari platform dan record DNS-nya ikut dihapus.`, 'Hapus situs');
          if (!ok) return;
          try {
            const j = await api('/api/sites/' + rm.dataset.rm, { method: 'DELETE' });
            const bad = Boolean(j.problems && j.problems.length);
            toast(bad ? 'Dihapus, tapi ada bagian yang gagal dibersihkan' : 'Situs dihapus', bad);
            state.sites = (await api('/api/sites')).sites; draw();
          } catch (ex) { toast(ex.message, true); }
        }
        if (up) {
          const d = $('#dlg');
          d.innerHTML = `<h2>Update ${esc(up.dataset.name)}</h2><p class="muted" style="margin-bottom:12px">Pilih sumber baru. Isi situs akan diganti.</p>${sourceFields('u')}<p class="err" id="uerr" role="alert"></p>
            <div class="actions"><button class="btn" value="no">Batal</button><button class="btn primary" value="go" id="ugo">Deploy ulang</button></div>`;
          bindSource('u', d);
          d.onclick = async (ev) => {
            const v = ev.target.closest('button')?.value;
            if (!v) return;
            if (v === 'no') return d.close();
            const g = $('#ugo'); g.disabled = true; g.textContent = 'Memproses...';
            try {
              await send('/api/sites/' + up.dataset.up + '/redeploy', 'u', {});
              d.close(); toast('Situs diperbarui');
              state.sites = (await api('/api/sites')).sites; draw();
            } catch (ex) { $('#uerr').textContent = ex.message; g.disabled = false; g.textContent = 'Deploy ulang'; }
          };
          d.oncancel = () => {};
          d.showModal();
        }
      };

      try {
        const j = await api('/api/sites');
        state.sites = j.sites; state.platforms = j.platforms; state.detected = j.detected || {};
        draw();
      } catch (ex) { $('#sl-list').innerHTML = `<li class="empty"><h2>Daftar tidak bisa dimuat</h2><p>${esc(ex.message)}</p></li>`; }
    },

    async apk(el) {
      const ST = { queued: ['Antre', 'warn'], running: ['Sedang build', 'run'], success: ['Selesai', 'ok'], failed: ['Gagal', 'err'] };
      const D = (p, type, label, def, x = {}) => ({ p, type, label, def, ...x });
      const SECTIONS = [
        { t: 'Aplikasi', open: true, f: [
          D('name', 'text', 'Nama aplikasi', '', { attr: 'maxlength="40" autocomplete="off"' }),
          D('pkg', 'text', 'Package name', state.pkgPrefix + '.', { mono: true, attr: 'autocapitalize="off" spellcheck="false"' }),
          D('versionName', 'text', 'Versi', '1.0.0', { attr: 'maxlength="20"' }),
          D('versionCode', 'number', 'Version code', '1', { attr: 'min="1" inputmode="numeric"' }),
        ] },
        { t: 'Isi aplikasi', html: `<div class="form-grid">
          <div><label class="lbl" for="a-src">Jenis isi</label><select class="field" id="a-src"><option value="url">Buka URL web (online)</option><option value="paste">Tempel kode HTML (offline)</option><option value="htmlfile">Upload file HTML (offline)</option><option value="zip">Upload ZIP situs (offline)</option></select></div>
          <div data-asrc="url"><label class="lbl" for="a-url">URL web</label><input class="field mono" id="a-url" type="url" value="https://" autocapitalize="off" spellcheck="false"></div>
          <div data-asrc="paste" hidden><label class="lbl" for="a-code">Kode HTML</label><textarea class="field code" id="a-code" spellcheck="false" autocapitalize="off" placeholder="Tempel kode HTML lengkap di sini"></textarea></div>
          <div data-asrc="htmlfile" hidden><label class="lbl" for="a-hfile">File HTML</label><input class="field" id="a-hfile" type="file" accept=".html,.htm,text/html" style="padding-top:9px"></div>
          <div data-asrc="zip" hidden><label class="lbl" for="a-zfile">File ZIP</label><input class="field" id="a-zfile" type="file" accept=".zip,application/zip" style="padding-top:9px"><p class="muted" style="font-size:13px;margin-top:6px">index.html harus ada di folder utama. Maksimal 15 MB.</p></div></div>` },
        { t: 'Ikon dan logo', html: `<div class="form-grid">
          <div><label class="lbl" for="a-icon">Ikon aplikasi (PNG atau JPG)</label><input class="field" id="a-icon" type="file" accept="image/*" style="padding-top:9px"></div>
          <div><label class="lbl" for="a-slogo">Logo splash (opsional, bawaannya ikon)</label><input class="field" id="a-slogo" type="file" accept="image/*" style="padding-top:9px"></div>
          <div class="thumbs"><img class="thumb" id="a-iprev" alt="Pratinjau ikon" hidden><img class="thumb" id="a-sprev" alt="Pratinjau logo splash" hidden></div>
          <p class="muted" style="font-size:13px">Tanpa ikon, panel membuat ikon dari huruf pertama nama aplikasi.</p></div>` },
        { t: 'Splash screen', f: [
          D('splash.enabled', 'switch', 'Tampilkan splash screen', true),
          D('splash.bg', 'color', 'Warna latar', '#0a0c11'),
          D('splash.fg', 'color', 'Warna teks dan loading', '#e6eaf2'),
          D('splash.tagline', 'text', 'Tagline (opsional)', '', { attr: 'maxlength="80"' }),
          D('splash.anim', 'select', 'Animasi masuk', 'fade', { opts: [['none', 'Tanpa animasi'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['slide', 'Geser naik'], ['pulse', 'Berdenyut']] }),
          D('splash.durationMs', 'range', 'Durasi minimal', '2000', { min: 500, max: 5000, step: 100, unit: ' ms' }),
          D('splash.loader', 'select', 'Gaya loading', 'bar', { opts: [['none', 'Tanpa loading'], ['bar', 'Garis'], ['spinner', 'Lingkaran'], ['dots', 'Tiga titik']] }),
          D('splash.showVersion', 'switch', 'Tampilkan versi di splash', false),
        ] },
        { t: 'Tampilan', f: [
          D('ui.orientation', 'select', 'Orientasi layar', 'auto', { opts: [['auto', 'Otomatis'], ['portrait', 'Tegak'], ['landscape', 'Mendatar']] }),
          D('ui.fullscreen', 'switch', 'Layar penuh (sembunyikan status bar)', false),
          D('ui.statusBar', 'color', 'Warna status bar', '#0a0c11'),
          D('ui.navBar', 'color', 'Warna navigation bar', '#0a0c11'),
          D('ui.keepScreenOn', 'switch', 'Layar tetap menyala', false),
          D('ui.pullToRefresh', 'switch', 'Tarik ke bawah untuk muat ulang', true),
          D('ui.topProgress', 'switch', 'Garis progres di atas saat memuat', true),
          D('ui.progressColor', 'color', 'Warna garis progres', '#4d7cff'),
          D('ui.exitConfirm', 'switch', 'Tekan back dua kali untuk keluar', false),
        ] },
        { t: 'Webview', f: [
          D('web.js', 'switch', 'JavaScript aktif', true),
          D('web.zoom', 'switch', 'Izinkan zoom', false),
          D('web.userAgent', 'text', 'User agent (opsional)', '', { attr: 'maxlength="200" autocapitalize="off" spellcheck="false"' }),
          D('web.externalLinks', 'select', 'Tautan ke situs lain', 'browser', { opts: [['browser', 'Buka di browser'], ['inapp', 'Buka di dalam aplikasi']] }),
          D('web.allowedHosts', 'text', 'Domain tambahan yang tetap di dalam aplikasi', '', { attr: 'placeholder="cdn.situs.com, situs.com" autocapitalize="off" spellcheck="false"' }),
          D('web.cache', 'select', 'Cache', 'default', { opts: [['default', 'Bawaan'], ['network', 'Selalu ambil dari jaringan'], ['offline', 'Utamakan cache (hemat data)']] }),
          D('web.fileUpload', 'switch', 'Izinkan upload file', true),
          D('web.downloads', 'switch', 'Izinkan unduhan', true),
          D('web.mixedContent', 'switch', 'Izinkan konten campuran (http di dalam https)', false),
        ] },
        { t: 'Izin aplikasi', f: [
          D('perms.camera', 'switch', 'Kamera', false), D('perms.microphone', 'switch', 'Mikrofon', false),
          D('perms.location', 'switch', 'Lokasi', false), D('perms.storage', 'switch', 'Penyimpanan dan media', false),
          D('perms.notifications', 'switch', 'Notifikasi', false), D('perms.vibrate', 'switch', 'Getar', false),
        ] },
        { t: 'Halaman error', f: [
          D('error.title', 'text', 'Judul', 'Tidak ada koneksi', { attr: 'maxlength="60"' }),
          D('error.message', 'text', 'Pesan', 'Periksa internet kamu lalu coba lagi.', { attr: 'maxlength="160"' }),
          D('error.button', 'text', 'Teks tombol', 'Coba lagi', { attr: 'maxlength="30"' }),
        ] },
      ];
      const fid = (f) => 'a_' + f.p.replace('.', '_');
      const fieldHtml = (f) => {
        const id = fid(f);
        if (f.type === 'switch') return `<label class="switch"><input type="checkbox" id="${id}"${f.def ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
        let ctl;
        if (f.type === 'select') ctl = `<select class="field" id="${id}">${f.opts.map(([v, l]) => `<option value="${v}"${v === f.def ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        else if (f.type === 'color') ctl = `<input class="field color" type="color" id="${id}" value="${f.def}">`;
        else if (f.type === 'range') ctl = `<div class="rangeRow"><input class="range" type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.def}"><output class="mono muted" id="${id}_o">${f.def}${f.unit}</output></div>`;
        else ctl = `<input class="field${f.mono ? ' mono' : ''}" type="${f.type}" id="${id}" value="${esc(f.def)}" ${f.attr || ''}>`;
        return `<div><label class="lbl" for="${id}">${esc(f.label)}</label>${ctl}</div>`;
      };
      const collect = () => {
        const cfg = {};
        for (const s of SECTIONS) for (const f of (s.f || [])) {
          const e = $('#' + fid(f));
          const v = f.type === 'switch' ? e.checked : (f.type === 'number' || f.type === 'range') ? Number(e.value) : e.value;
          const keys = f.p.split('.');
          let o = cfg;
          keys.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
          o[keys.pop()] = v;
        }
        return cfg;
      };

      /* ---- Gambar: dibuat di browser supaya ringan ---- */
      const SIZES = [48, 72, 96, 144, 192, 512];
      // File dibaca ke memori begitu dipilih (HP Android kadang menutup akses file setelahnya),
      // jenisnya dicek dari isi file, bukan dari nama atau tipe yang dilaporkan peramban.
      const readBytes = (file) => (file.arrayBuffer ? file.arrayBuffer() : new Promise((ok, no) => {
        const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsArrayBuffer(file);
      }));
      const sniffImg = (buf) => {
        const b = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
        const at = (i, s) => [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));
        if (b[0] === 0x89 && at(1, 'PNG')) return 'image/png';
        if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
        if (at(0, 'GIF8')) return 'image/gif';
        if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
        if (at(4, 'ftyp') && /heic|heix|mif1|avif/.test(String.fromCharCode(...b.slice(8, 12)))) return 'image/heic';
        return '';
      };
      async function decodeImage(file) {
        let buf;
        try { buf = await readBytes(file); }
        catch (_) { throw new Error('File gambar tidak bisa dibuka lagi. Pilih ulang filenya.'); }
        if (!buf.byteLength) throw new Error('File gambar kosong. Pilih file lain.');
        const mime = sniffImg(buf) || (/^image\//.test(file.type) ? file.type : '');
        if (!mime) throw new Error('File ini bukan gambar. Pakai PNG atau JPG.');
        if (mime === 'image/heic') throw new Error('Format HEIC belum didukung. Ubah ke PNG atau JPG dulu.');
        const blob = new Blob([buf], { type: mime });
        if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (_) { /* lanjut ke elemen Image */ } }
        return new Promise((ok, no) => {
          const u = URL.createObjectURL(blob), i = new Image();
          i.onload = () => { setTimeout(() => URL.revokeObjectURL(u), 3000); ok(i); };
          i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Gambar rusak atau formatnya tidak didukung. Pakai PNG atau JPG.')); };
          i.src = u;
        });
      }
      const decoded = new Map(); // input -> Promise gambar yang sudah didekode
      const loadImg = (inp) => {
        const file = $(inp).files[0];
        if (!file) return Promise.resolve(null);
        let p = decoded.get(inp);
        if (!p) { p = decodeImage(file); decoded.set(inp, p); }
        return p.catch(() => { decoded.delete(inp); return decodeImage(file); });
      };
      const png = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c.toDataURL('image/png'); };
      const contain = (img) => (g, s) => { const k = Math.min(s / img.width, s / img.height), w = img.width * k, h = img.height * k; g.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); };
      const letterIcon = (letter) => (g, s) => {
        const r = s * 0.22, gr = g.createLinearGradient(0, 0, s, s);
        gr.addColorStop(0, '#4d7cff'); gr.addColorStop(1, '#8b6cff');
        g.fillStyle = gr; g.beginPath();
        g.moveTo(r, 0); g.arcTo(s, 0, s, s, r); g.arcTo(s, s, 0, s, r); g.arcTo(0, s, 0, 0, r); g.arcTo(0, 0, s, 0, r); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.font = `700 ${s * 0.56}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(letter, s / 2, s / 2 + s * 0.03);
      };
      const toB64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(new Error('File tidak bisa dibaca.')); r.readAsDataURL(file); });

      async function readSource() {
        const v = $('#a-src').value;
        if (v === 'url') return { type: 'url', url: $('#a-url').value.trim() };
        if (v === 'paste') { const c = $('#a-code').value; if (!c.trim()) throw new Error('Tempel kode HTML dulu.'); return { type: 'html', data: c }; }
        if (v === 'htmlfile') { const f = $('#a-hfile').files[0]; if (!f) throw new Error('Pilih file HTML dulu.'); return { type: 'html', data: await f.text() }; }
        const f = $('#a-zfile').files[0];
        if (!f) throw new Error('Pilih file ZIP dulu.');
        if (f.size > 15 * 1024 * 1024) throw new Error('ZIP melebihi 15 MB.');
        return { type: 'zip', data: await toB64(f) };
      }

      el.innerHTML = `<h1 class="page-title">APK</h1>
        <p class="page-sub">Ubah web atau HTML menjadi aplikasi Android berbasis webview. Build dijalankan gratis di GitHub Actions dan biasanya selesai dalam 3 sampai 6 menit.</p>
        <div id="apk-top"></div>
        <form class="panel" id="apk-form" autocomplete="off" hidden></form>
        <h2 class="sec-title" id="apk-hist-t" hidden>Riwayat build</h2>
        <ul class="list" id="bl"></ul>`;

      let formBuilt = false, pkgTouched = false;

      function drawTop() {
        const j = state.apk, top = $('#apk-top');
        if (!j.tokenOk) {
          top.innerHTML = `<div class="panel"><h2>Hubungkan GitHub</h2><p class="muted">Panel butuh token GitHub untuk menjalankan build.</p>
            <ol class="steps"><li>Buka github.com/settings/tokens, pilih <b>Generate new token (classic)</b>.</li><li>Centang izin <b>repo</b> dan <b>workflow</b>, lalu buat token.</li><li>Tempel ke file .env sebagai <span class="mono">GITHUB_TOKEN=...</span>. Tidak perlu restart.</li></ol>
            <button class="btn" id="apk-recheck" type="button" style="margin-top:14px">Cek lagi</button></div>`;
          $('#apk-recheck').onclick = () => load(true);
        } else if (!j.repo) {
          top.innerHTML = `<div class="panel"><h2>Siapkan builder</h2><p class="muted">Panel akan membuat repo private <span class="mono">panel-apk-builder</span> di akun GitHub-mu dan mengisinya dengan template aplikasi. Cukup dilakukan sekali.</p>
            <p class="err" id="apk-err" role="alert"></p><button class="btn primary" id="apk-setup" type="button">Siapkan builder</button></div>`;
          $('#apk-setup').onclick = () => setup($('#apk-setup'));
        } else {
          top.innerHTML = `<p class="status" style="margin-bottom:16px"><span class="dot ok"></span>Builder: <span class="mono">${esc(j.repo)}</span>
            <button class="btn small" id="apk-upd" type="button" style="margin-left:8px">${j.outdated ? 'Perbarui template' : 'Sinkronkan'}</button></p><p class="err" id="apk-err" role="alert"></p>`;
          $('#apk-upd').onclick = () => setup($('#apk-upd'));
          buildForm();
        }
      }

      async function setup(btn) {
        const old = btn.textContent;
        btn.disabled = true; btn.textContent = 'Menyiapkan...';
        try { await api('/api/apk/setup', { method: 'POST' }); toast('Builder siap'); await load(true); }
        catch (ex) { const e = $('#apk-err'); if (e) e.textContent = ex.message; toast(ex.message, true); }
        btn.disabled = false; btn.textContent = old;
      }

      function buildForm() {
        if (formBuilt) return;
        formBuilt = true;
        const f = $('#apk-form');
        f.hidden = false;
        f.innerHTML = '<h2>Build baru</h2>' + SECTIONS.map((s) => `<details class="sec"${s.open ? ' open' : ''}><summary>${esc(s.t)}</summary><div class="form-grid" style="padding:6px 0 14px">${s.html || s.f.map(fieldHtml).join('')}</div></details>`).join('') +
          `<div class="progress" id="apk-prog" hidden><div class="track"><div class="bar indet"></div></div><p id="apk-ptxt"></p></div><p class="err" id="apk-ferr" role="alert"></p>
          <button class="btn primary" id="apk-go" type="submit" style="width:100%">Build APK</button>`;

        const syncSrc = () => { const v = $('#a-src').value; f.querySelectorAll('[data-asrc]').forEach((n) => { n.hidden = n.dataset.asrc !== v; }); };
        $('#a-src').onchange = syncSrc;
        $('#a_name').oninput = () => {
          if (pkgTouched) return;
          const slug = $('#a_name').value.toLowerCase().replace(/[^a-z0-9]+/g, '');
          $('#a_pkg').value = state.pkgPrefix + '.' + (/^[a-z]/.test(slug) ? slug : slug ? 'app' + slug : '');
        };
        $('#a_pkg').oninput = () => { pkgTouched = true; };
        f.addEventListener('input', (e) => { if (e.target.type === 'range') $('#' + e.target.id + '_o').textContent = e.target.value + ' ms'; });
        const prev = (inp, img) => {
          $(inp).onchange = () => {
            const file = $(inp).files[0], im = $(img);
            decoded.delete(inp);
            $('#apk-ferr').textContent = '';
            if (!file) { im.hidden = true; return; }
            const p = decodeImage(file);
            decoded.set(inp, p);
            p.then(() => { im.src = URL.createObjectURL(file); im.hidden = false; }, (ex) => { im.hidden = true; $('#apk-ferr').textContent = ex.message; });
          };
        };
        prev('#a-icon', '#a-iprev'); prev('#a-slogo', '#a-sprev');

        f.onsubmit = async (e) => {
          e.preventDefault();
          const err = $('#apk-ferr'), go = $('#apk-go'), prog = $('#apk-prog'), txt = $('#apk-ptxt');
          err.textContent = '';
          go.disabled = true; go.textContent = 'Memproses...';
          prog.hidden = false; txt.textContent = 'Menyiapkan gambar dan konfigurasi...';
          try {
            const config = collect();
            const source = await readSource();
            const letter = (config.name.trim()[0] || 'A').toUpperCase();
            const iconImg = await loadImg('#a-icon'), logoImg = await loadImg('#a-slogo');
            const draw = iconImg ? contain(iconImg) : letterIcon(letter);
            const icons = {};
            SIZES.forEach((s) => { icons[s] = png(s, draw); });
            const splash = logoImg ? png(512, contain(logoImg)) : null;
            txt.textContent = 'Mengirim ke GitHub dan memulai build...';
            await api('/api/apk/build', { method: 'POST', body: { config, source, icons, splash } });
            toast('Build dimulai');
            await load(true);
            $('#apk-hist-t').scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (ex) { err.textContent = ex.message; }
          prog.hidden = true; go.disabled = false; go.textContent = 'Build APK';
        };
      }

      const fmt = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      function drawList() {
        const rows = state.apk.builds || [];
        $('#apk-hist-t').hidden = !rows.length;
        $('#bl').innerHTML = rows.map((b, i) => {
          const [label, cls] = ST[b.status] || ['?', 'warn'];
          const acts = [
            b.status === 'success' ? `<a class="btn small primary" href="/api/apk/${esc(b.id)}/download">Unduh APK</a>` : '',
            b.runUrl ? `<a class="btn small" href="${esc(b.runUrl)}" target="_blank" rel="noopener">Log</a>` : '',
            `<button class="btn small danger" data-del="${esc(b.id)}" data-name="${esc(b.name)}">Hapus</button>`,
          ].join('');
          const note = b.status === 'failed' ? (b.note || 'Buka Log di GitHub untuk melihat penyebabnya.') : b.status === 'running' || b.status === 'queued' ? 'Biasanya 3 sampai 6 menit.' : '';
          return `<li class="row" style="grid-template-columns:1fr"><div><span class="badge ${cls}"><i></i>${label}</span> <b>${esc(b.name)}</b> <span class="tag">${esc(b.versionName)}</span></div>
            <div class="meta"><span class="mono">${esc(b.pkg)}</span><span>${esc(fmt(b.createdAt))}</span>${note ? `<span>${esc(note)}</span>` : ''}</div>
            <div class="act" style="grid-column:1;grid-row:auto;display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${acts}</div></li>`;
        }).join('');
      }

      $('#bl').onclick = async (e) => {
        const d = e.target.closest('[data-del]');
        if (!d) return;
        const ok = await confirmDialog('Hapus dari riwayat?', `<b>${esc(d.dataset.name)}</b> dihapus dari daftar di panel. Aplikasi yang sudah kamu unduh tidak terpengaruh.`, 'Hapus');
        if (!ok) return;
        try { await api('/api/apk/' + d.dataset.del, { method: 'DELETE' }); await load(false); } catch (ex) { toast(ex.message, true); }
      };

      async function load(redrawTop) {
        state.apk = await api('/api/apk');
        if (redrawTop) drawTop();
        drawList();
        clearInterval(state.timer);
        if (state.apk.builds.some((b) => b.status === 'queued' || b.status === 'running')) {
          state.timer = setInterval(async () => {
            try {
              state.apk = await api('/api/apk');
              drawList();
              if (!state.apk.builds.some((b) => b.status === 'queued' || b.status === 'running')) clearInterval(state.timer);
            } catch (_) {}
          }, 8000);
        }
      }

      try { await load(true); }
      catch (ex) { $('#apk-top').innerHTML = `<div class="empty"><h2>Halaman tidak bisa dimuat</h2><p>${esc(ex.message)}</p></div>`; }
    },

    more(el) {
      const item = (k, title, sub) => `<li><a class="mrow" href="#/${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg><span><b>${title}</b><small>${sub}</small></span><svg class="go" viewBox="0 0 24 24" aria-hidden="true">${ICON.chevron}</svg></a></li>`;
      el.innerHTML = `<h1 class="page-title">Lainnya</h1>
        <p class="page-sub">Menu yang jarang dipakai.</p>
        <ul class="mlist">${item('wink', 'Wink', 'Perjelas, perbesar, dan hapus background foto')}${item('telegram', 'Telegram', 'Bot, grup, saluran, jadwal, dan notifikasi')}${item('imgurl', 'Img to URL', 'Unggah gambar, dapat link publik (Supabase)')}${item('tools', 'Tools', 'Gambar, video, dan pencarian dari NexaDev')}${item('subdomains', 'Subdomain', `Record DNS ${esc(state.zone)}`)}${item('settings', 'Setelan', 'Status konfigurasi dan keluar')}</ul>`;
    },

    ai(el) { window.PanelAI.mount(el, { api, toast, confirmDialog }); },

    tools(el) { window.ZZNexa.mountTools(el); },

    imgurl(el) { mountImgUrl(el); },

    wink(el) { window.ZZWink.mount(el, { api, toast, confirmDialog }); },

    telegram(el) { window.ZZTelegram.mount(el, { api, toast, confirmDialog }); },

    settings(el) {
      el.innerHTML = `<h1 class="page-title">Setelan</h1>
        <p class="page-sub">Personalisasi tampilan panel dan status konfigurasi server.</p>
        <section class="panel"><h2>Personalisasi tampilan</h2>
          <div class="settings-grid">
            <div class="settings-control"><label for="ui-theme">Tema panel</label><select class="field" id="ui-theme"><option value="graphite-amber">Graphite Amber + Light Blue</option><option value="graphite-blue">Graphite Blue</option><option value="graphite-slate">Graphite Slate</option></select></div>
            <div class="settings-control"><label for="ui-density">Kepadatan tampilan</label><select class="field" id="ui-density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
          </div><p class="muted" style="font-size:13px;margin-top:10px">Pilihan disimpan di perangkat/browser ini dan tidak mengubah data server.</p>
        </section>
        <div class="panel"><h2>Konfigurasi server</h2>
          <p class="status"><span class="dot ${state.ready ? 'ok' : 'warn'}"></span>${state.ready ? 'Token dan Zone ID Cloudflare terisi' : 'Token atau Zone ID Cloudflare belum diisi di file .env'}</p>
          <p class="status" style="margin-top:6px" id="gq"><span class="dot"></span>Memeriksa GROQ_API_KEY</p>
          <p class="muted" style="margin-top:8px">Password dan token diubah lewat file .env di server. GROQ_API_KEY dibaca ulang otomatis.</p></div>
        <button class="btn danger" id="out">Keluar</button>`;
      const theme = $('#ui-theme'), density = $('#ui-density');
      theme.value = document.body.dataset.theme || 'graphite-amber';
      density.value = document.body.classList.contains('compact-ui') ? 'compact' : 'comfortable';
      theme.onchange = () => { document.body.dataset.theme = theme.value; try { localStorage.setItem('zz-panel-theme', theme.value); } catch (_) {} };
      density.onchange = () => { document.body.classList.toggle('compact-ui', density.value === 'compact'); try { localStorage.setItem('zz-panel-density', density.value); } catch (_) {} };
      api('/api/ai/status').then((j) => { $('#gq').innerHTML = `<span class="dot ${j.ready ? 'ok' : 'warn'}"></span>${j.ready ? 'GROQ_API_KEY terisi' : 'GROQ_API_KEY belum diisi di file .env'}`; }).catch(() => {});
      $('#out').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (_) {} location.href = '/login'; };
    },
  };


  /* ---------- Img to URL (Supabase) ---------- */
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  async function mountImgUrl(el) {
    el.innerHTML = `<h1 class="page-title">Img to URL</h1>
      <p class="page-sub">Unggah gambar ke Supabase dan dapatkan link publik yang bisa dipakai di mana saja. PNG, JPG, GIF, atau WebP, maksimal 10 MB per file.</p>
      <div id="iu-top"></div>
      <div id="iu-main" hidden>
        <label class="iu-drop" id="iu-drop" for="iu-file"><input type="file" id="iu-file" accept="image/png,image/jpeg,image/gif,image/webp,image/*" multiple hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICON.imgurl}</svg><b>Pilih gambar</b><span>atau seret ke sini, atau tempel dengan Ctrl+V</span></label>
        <ul class="iu-queue" id="iu-queue"></ul>
        <h2 class="sec-title" id="iu-h" hidden>Gambar tersimpan</h2>
        <div class="iu-grid" id="iu-grid"></div>
      </div>`;
    const top = $('#iu-top', el), main = $('#iu-main', el), grid = $('#iu-grid', el), queue = $('#iu-queue', el);
    let items = [];

    const drawGrid = () => {
      $('#iu-h', el).hidden = !items.length;
      grid.innerHTML = items.map((it) => `<article class="iu-card" data-n="${esc(it.name)}">
        <a class="iu-th" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(it.url)}" alt="${esc(it.name)}" loading="lazy" referrerpolicy="no-referrer"></a>
        <div class="iu-b"><input class="field mono" readonly value="${esc(it.url)}" aria-label="Link gambar" onfocus="this.select()">
          <p class="muted small">${esc(it.name)} · ${esc(fmtSize(it.size))}${it.createdAt ? ' · ' + esc(fmt(it.createdAt)) : ''}</p>
          <div class="nx-acts"><button class="btn small primary" type="button" data-nx="copy" data-v="${esc(it.url)}">Salin link</button>
            <button class="btn small" type="button" data-nx="copy" data-v="${esc('![](' + it.url + ')')}">Markdown</button>
            <button class="btn small" type="button" data-nx="copy" data-v="${esc('<img src="' + it.url + '" alt="">')}">HTML</button>
            <button class="btn small danger" type="button" data-del="${esc(it.name)}">Hapus</button></div></div></article>`).join('');
    };
    const fmt = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

    async function loadList() {
      try { items = (await api('/api/img/list')).items; drawGrid(); }
      catch (ex) { grid.innerHTML = `<p class="err">${esc(ex.message)}</p>`; }
    }


    // Form koneksi Supabase: disimpan di server (data/supabase.json), tanpa edit .env
    function showConnect(st, editing) {
      main.hidden = true;
      const fromEnv = st.source === 'env';
      top.innerHTML = `<div class="panel"><h2>${editing ? 'Ubah koneksi Supabase' : 'Hubungkan Supabase'}</h2>
        <p class="muted">Gambar disimpan di Supabase Storage milik kamu. Kunci disimpan di server panel dan tidak pernah dikirim balik ke browser.</p>
        <ol class="steps"><li>Buat project di <b>supabase.com</b>, lalu buka <b>Project Settings, API</b>.</li><li>Salin <b>Project URL</b> dan kunci <b>service_role</b> atau <b>Secret</b> (bukan anon atau publishable).</li><li>Tempel di bawah, lalu tekan Simpan.</li></ol>
        ${fromEnv ? '<p class="muted small" style="margin-top:10px">Saat ini memakai nilai dari file .env. Yang kamu simpan di sini akan dipakai lebih dulu.</p>' : ''}
        <div style="display:grid;gap:10px;margin-top:14px">
          <div><label class="muted small" for="iu-url">Project URL</label><input class="field mono" id="iu-url" placeholder="https://xxxx.supabase.co" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(st.url || '')}"></div>
          <div><label class="muted small" for="iu-key">Kunci service_role / Secret</label><input class="field mono" id="iu-key" type="password" placeholder="${st.keyMask ? esc(st.keyMask) + ' (kosongkan jika tidak diganti)' : 'sb_secret_... atau eyJ...'}" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
          <div><label class="muted small" for="iu-bk">Nama bucket (opsional)</label><input class="field mono" id="iu-bk" placeholder="panel-img" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(st.bucket && st.bucket !== 'panel-img' ? st.bucket : '')}"></div>
        </div>
        <p class="err" id="iu-cerr" role="alert"></p>
        <p class="nx-acts" style="margin-top:12px"><button class="btn primary" id="iu-save" type="button">Simpan dan uji</button>
        ${editing ? '<button class="btn" id="iu-cancel" type="button">Batal</button>' : ''}
        ${st.source === 'web' ? '<button class="btn danger" id="iu-clear" type="button">Putuskan</button>' : ''}</p></div>`;
      $('#iu-save', el).onclick = async (e) => {
        const b = e.currentTarget, err = $('#iu-cerr', el);
        err.textContent = ''; b.disabled = true; b.textContent = 'Menguji...';
        try {
          await api('/api/img/config', { method: 'POST', body: { url: $('#iu-url', el).value, key: $('#iu-key', el).value, bucket: $('#iu-bk', el).value } });
          toast('Supabase tersimpan'); await begin();
        } catch (ex) { err.textContent = ex.message; b.disabled = false; b.textContent = 'Simpan dan uji'; }
      };
      const cancel = $('#iu-cancel', el); if (cancel) cancel.onclick = begin;
      const clear = $('#iu-clear', el);
      if (clear) clear.onclick = async () => {
        if (!await confirmDialog('Putuskan Supabase?', 'URL dan kunci yang tersimpan di panel dihapus. Gambar di Supabase tidak ikut terhapus.', 'Putuskan')) return;
        try { await api('/api/img/config', { method: 'DELETE' }); toast('Koneksi diputus'); await begin(); } catch (ex) { $('#iu-cerr', el).textContent = ex.message; }
      };
    }

    async function begin() {
      let st;
      try { st = await api('/api/img/status'); }
      catch (ex) { top.innerHTML = `<div class="empty"><h2>Halaman tidak bisa dimuat</h2><p>${esc(ex.message)}</p></div>`; return; }
      if (!st.ready) { showConnect(st); return; }
      if (!st.bucketOk) {
        top.innerHTML = `<div class="panel"><h2>Siapkan bucket</h2><p class="muted">Panel akan membuat bucket publik <span class="mono">${esc(st.bucket)}</span> di <span class="mono">${esc(st.host)}</span>. Cukup sekali.</p>
          ${st.note ? `<p class="err">${esc(st.note)}</p>` : ''}<p class="err" id="iu-serr" role="alert"></p><button class="btn primary" id="iu-setup" type="button">Siapkan bucket</button> <button class="btn" id="iu-edit" type="button">Ubah koneksi</button></div>`;
        $('#iu-edit', el).onclick = () => showConnect(st, true);
        $('#iu-setup', el).onclick = async (e) => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Menyiapkan...';
          try { await api('/api/img/setup', { method: 'POST' }); toast('Bucket siap'); await begin(); }
          catch (ex) { $('#iu-serr', el).textContent = ex.message; b.disabled = false; b.textContent = 'Siapkan bucket'; }
        };
        main.hidden = true;
        return;
      }
      top.innerHTML = `<p class="status iu-status"><span class="dot ok"></span><span>Supabase terhubung</span><span class="mono muted small">${esc(st.host)} / ${esc(st.bucket)}</span> <button class="btn small" id="iu-edit" type="button">Ubah</button></p>`;
      $('#iu-edit', el).onclick = () => showConnect(st, true);
      main.hidden = false;
      loadList();
    }

    function uploadOne(file) {
      const li = document.createElement('li');
      li.className = 'iu-q';
      li.innerHTML = `<span class="iu-qn">${esc(file.name || 'gambar')}</span><span class="iu-qs">Menunggu…</span><div class="track"><div class="bar"></div></div>`;
      queue.prepend(li);
      const st = $('.iu-qs', li), bar = $('.bar', li);
      const fail = (msg) => { st.textContent = msg; li.classList.add('bad'); setTimeout(() => li.remove(), 9000); };
      if (file.size > 10 * 1024 * 1024) { fail('Lebih dari 10 MB.'); return Promise.resolve(); }
      if (file.type && !/^image\//.test(file.type)) { fail('Bukan gambar.'); return Promise.resolve(); }
      st.textContent = 'Mengunggah…';
      return api('/api/img/upload?name=' + encodeURIComponent(file.name || ''), {
        method: 'POST', rawBody: file, rawType: file.type || 'application/octet-stream',
        onProgress: (f) => { bar.style.width = Math.round(f * 100) + '%'; },
        onUploaded: () => { st.textContent = 'Menyimpan…'; },
      }).then((j) => {
        bar.style.width = '100%'; st.textContent = 'Selesai'; li.classList.add('ok');
        items.unshift(j.item); drawGrid();
        setTimeout(() => li.remove(), 2500);
      }).catch((ex) => fail(ex.message));
    }
    async function uploadMany(files) {
      const list = [...files].filter(Boolean);
      for (const f of list) await uploadOne(f); // satu per satu supaya HP tidak berat
    }

    const fileIn = $('#iu-file', el), drop = $('#iu-drop', el);
    fileIn.onchange = () => { const fs = [...fileIn.files]; fileIn.value = ''; uploadMany(fs); };
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { uploadMany([...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type))); });
    const onPaste = (e) => {
      if (!document.body.contains(el) || main.hidden) return;
      const fs = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
      if (fs.length) { e.preventDefault(); uploadMany(fs); }
    };
    document.addEventListener('paste', onPaste);
    state.cleanup = () => document.removeEventListener('paste', onPaste);

    grid.addEventListener('click', async (e) => {
      if (window.ZZNexa.click(e)) return;
      const d = e.target.closest('[data-del]');
      if (!d) return;
      const ok = await confirmDialog('Hapus gambar?', `<b>${esc(d.dataset.del)}</b> dihapus dari Supabase. Link-nya langsung tidak berfungsi lagi.`, 'Hapus');
      if (!ok) return;
      try { await api('/api/img/' + encodeURIComponent(d.dataset.del), { method: 'DELETE' }); items = items.filter((x) => x.name !== d.dataset.del); drawGrid(); toast('Gambar dihapus'); }
      catch (ex) { toast(ex.message, true); }
    });

    begin();
  }

  /* ---------- Menu: indikator yang bergeser antar tab ---------- */
  let navReady = false, navTab = null;
  function buildNav() {
    const nav = $('#nav');
    nav.innerHTML = `<i class="nav-pill" aria-hidden="true"></i><div class="brand">${esc(state.brand)}<small>${esc(state.zone)}</small></div>` +
      PAGES.map(([k, label]) => `<a href="#/${k}" data-tab="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg><span>${label}</span></a>`).join('');
    navReady = true;
  }
  function placePill(animate) {
    const nav = $('#nav'), pill = $('.nav-pill', nav), a = $('a[aria-current=page]', nav);
    if (!pill || !a) return;
    if (!animate) pill.style.transition = 'none';
    pill.style.width = a.offsetWidth + 'px';
    pill.style.height = a.offsetHeight + 'px';
    pill.style.transform = `translate(${a.offsetLeft}px,${a.offsetTop}px)`;
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    pill.classList.add('on');
  }
  function setNav(tab) {
    if (!navReady) buildNav();
    const nav = $('#nav');
    nav.querySelectorAll('a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const first = navTab === null;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!first && !reduce && navTab !== tab) {
      // Indikator melar sedikit saat bergeser, lalu menyusut lagi di tab tujuan
      const pill = $('.nav-pill', nav);
      pill.classList.remove('go'); void pill.offsetWidth; pill.classList.add('go');
    }
    placePill(!first && !reduce);
    navTab = tab;
  }
  window.addEventListener('resize', () => { if (navReady) placePill(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (navReady) placePill(false); });

  /* ---------- Persistent visual preferences ---------- */
  try {
    document.body.dataset.theme = localStorage.getItem('zz-panel-theme') || 'graphite-amber';
    document.body.classList.toggle('compact-ui', localStorage.getItem('zz-panel-density') === 'compact');
  } catch (_) { document.body.dataset.theme = 'graphite-amber'; }
  const PAGE_NAMES = { overview:'Dashboard', sites:'Situs', ai:'AI Assistant', apk:'APK Builder', more:'Lainnya', subdomains:'Subdomain', settings:'Setelan', tools:'Nexa', imgurl:'Image URL', wink:'Wink', telegram:'Telegram' };

  /* ---------- Router ---------- */
  function route() {
    clearInterval(state.timer);
    if (state.cleanup) { state.cleanup(); state.cleanup = null; }
    if (window.PanelAI) window.PanelAI.unmount();
    const id = (location.hash.replace('#/', '') || 'overview');
    const page = views[id] ? id : 'overview';
    const tab = TAB_OF[page] || page;
    document.body.classList.toggle('ai-page', page === 'ai');
    setNav(tab);
    const main = $('#main');
    main.classList.remove('page-enter');
    main.innerHTML = `<div class="page-crumb" aria-label="Lokasi halaman"><span class="crumb-root">${esc(state.brand).toUpperCase()}</span><span class="crumb-sep" aria-hidden="true">/</span><span>${esc(PAGE_NAMES[page] || page)}</span></div>`;
    views[page](main);
    [...main.children].forEach((c, i) => c.style.setProperty('--i', i));
    void main.offsetWidth;
    main.classList.add('page-enter');
    window.scrollTo(0, 0);
  }

  async function start() {
    try {
      const me = await api('/api/me');
      state.zone = me.zone; state.brand = me.brand || 'Panel'; state.pkgPrefix = me.pkgPrefix || 'com.example.app';
      state.ready = me.cloudflareReady;
    } catch (_) {}
    window.ZZNexa.init({ api, toast, confirmDialog });
    window.addEventListener('hashchange', route);
    route();
  }
  start();
})();
