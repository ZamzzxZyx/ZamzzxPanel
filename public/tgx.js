/* Telegram tambahan: Command (on/off, akses, banner video) dan Bot Host (zip otomatis diekstrak, terminal output) */
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const clock = (t) => new Date(t).toLocaleTimeString('id-ID', { hour12: false });
  const KCLS = { ok: 'k-ok', err: 'k-err', warn: 'k-warn', info: 'k-sys', sys: 'k-sys', out: 'k-out' };
  const termLine = (l) => `<div class="${KCLS[l.k] || 'k-out'}"><i>${clock(l.t)}</i>${esc(l.s)}</div>`;
  const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + ' dtk'; if (s < 3600) return Math.floor(s / 60) + ' mnt'; if (s < 86400) return Math.floor(s / 3600) + ' jam ' + Math.floor((s % 3600) / 60) + ' mnt'; return Math.floor(s / 86400) + ' hari'; };

  // Unggah berkas dengan progres (XHR). onProg(persen)
  function sendFile(url, file, headers, onProg) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', url);
      x.setRequestHeader('X-Panel', '1'); x.setRequestHeader('Content-Type', 'application/octet-stream'); x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProg) onProg(Math.round((e.loaded / e.total) * 100)); };
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (_) {} if (x.status >= 200 && x.status < 300) resolve(j); else reject(new Error(j.error || (x.status === 413 ? 'File terlalu besar untuk diterima server (cek batas upload proxy/Cloudflare).' : `Gagal mengunggah (${x.status}).`))); };
      x.onerror = () => reject(new Error('Unggahan terputus. Cek koneksi, atau batas ukuran upload di proxy server.'));
      x.send(file);
    });
  }
  const progUI = (root, id) => { const w = $(`#${id}-prog`, root), bar = $(`#${id}-bar`, root), pct = $(`#${id}-pct`, root); return { show: () => { w.hidden = false; bar.style.width = '0'; pct.textContent = 'Mengunggah...'; }, set: (p) => { bar.style.width = p + '%'; pct.textContent = p < 100 ? `Mengunggah ${p}%` : 'Diproses di server...'; }, hide: () => { w.hidden = true; } }; };
  const progHtml = (id) => `<div id="${id}-prog" hidden style="margin-top:10px"><div style="height:8px;border-radius:99px;background:var(--line);overflow:hidden"><div id="${id}-bar" style="height:100%;width:0;background:var(--accent);transition:width .2s"></div></div><p class="muted small" id="${id}-pct" style="margin-top:6px"></p></div>`;

  /* ================= Tab Command ================= */
  function commands(root, H) {
    const { api, toast, confirmDialog } = H;
    let D = null, editing = null, timer = null, alive = true, query = '';
    const openG = new Set(['Umum']);
    const BADGE = (c) => [c.kind === 'feature' ? 'Fitur panel' : c.builtin ? 'Bawaan' : '', c.access === 'owner' ? 'Hanya pemilik' : '', c.scope === 'private' ? 'Chat privat' : c.scope === 'group' ? 'Grup' : '', c.bannerId ? '🎬 Banner' : '', c.uses ? `dipakai ${c.uses}×` : ''].filter(Boolean).join(' · ');

    async function load() {
      try { D = await api('/api/tg/commands'); } catch (ex) { root.innerHTML = `<div class="empty"><h2>Tidak bisa dimuat</h2><p>${esc(ex.message)}</p></div>`; return; }
      draw();
    }
    function draw() {
      root.innerHTML = `<section class="panel"><h2>Command bot</h2>
        <label class="tg-toggle"><span><b>Command aktif</b><small class="muted" style="display:block">Matikan untuk membuat bot diam terhadap semua command.</small></span><input class="tg-sw" type="checkbox" id="cm-on" ${D.enabled ? 'checked' : ''}></label>
        <p class="muted small" style="margin-top:10px">Tiap command punya saklar on/off sendiri. Menu command di Telegram ikut diperbarui otomatis.</p>
        <p class="err" id="cm-err" role="alert"></p><p class="nx-acts"><button class="btn small" id="cm-sync" type="button">Sinkron menu Telegram</button></p></section>
        <h2 class="sec-title">Daftar command (${D.commands.length})</h2>
        <input class="field" id="cm-q" type="search" placeholder="Cari command atau fitur..." value="${esc(query)}" autocomplete="off" spellcheck="false" style="margin-bottom:10px">
        <div id="cm-list">${listHtml()}</div>
        <p class="nx-acts"><button class="btn primary" id="cm-new" type="button">+ Tambah command</button></p>
        <div id="cm-form"></div>
        <section class="panel"><h2>Banner video</h2>
          <p class="muted small">Video yang tampil di atas balasan command. Format MP4 (disarankan), MOV, M4V, atau WebM, maksimal <b>${D.maxBannerMb} MB</b> per file.</p>
          <div id="cm-bans">${D.banners.length ? D.banners.map((b) => `<div class="tg-ban"><video src="/api/tg/banners/${esc(b.id)}/file" controls preload="metadata" playsinline></video><div class="tg-row"><span><b>${esc(b.name)}</b><small>${mb(b.size)}${D.commands.filter((c) => c.bannerId === b.id).length ? ' · dipakai ' + D.commands.filter((c) => c.bannerId === b.id).map((c) => '/' + esc(c.cmd)).join(', ') : ''}</small></span><button class="btn small danger" data-bd="${esc(b.id)}" type="button">Hapus</button></div></div>`).join('') : '<p class="muted" style="margin-top:8px">Belum ada banner.</p>'}</div>
          <div class="tg-grid" style="margin-top:12px"><div><label class="tg-lbl" for="cm-file">Tambah video</label><input class="field" id="cm-file" type="file" accept=".mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/webm"></div></div>
          ${progHtml('cb')}<p class="err" id="cb-err" role="alert"></p><p class="nx-acts"><button class="btn primary small" id="cb-up" type="button">Unggah banner</button></p></section>
        <section class="panel"><h2>Terminal command</h2><div class="tg-term" id="cm-term" role="log"></div>
          <p class="nx-acts"><button class="btn small" id="cm-clr" type="button">Bersihkan</button></p></section>`;
      termDraw(); bind();
      if (editing) form(editing === 'new' ? null : D.commands.find((c) => c.id === editing));
    }
    const rowHtml = (c) => `<li class="tg-row" data-id="${esc(c.id)}"><span><b class="mono">/${esc(c.cmd)}</b><small>${esc(c.desc || (c.kind === 'id' ? 'Menampilkan ID chat' : c.text || '').slice(0, 80))}</small>${c.usage ? `<small class="mono" style="opacity:.8">${esc(c.usage)}</small>` : ''}<small>${esc(BADGE(c))}</small></span>
          <input class="tg-sw" type="checkbox" data-tg="${esc(c.id)}" ${c.enabled ? 'checked' : ''} aria-label="Nyalakan /${esc(c.cmd)}"><button class="btn small" data-ed="${esc(c.id)}" type="button">Edit</button></li>`;
    function listHtml() {
      const q = query.trim().toLowerCase();
      const hit = (c) => !q || [c.cmd, c.desc, c.usage, c.group].some((v) => String(v || '').toLowerCase().includes(q));
      const by = {};
      for (const c of D.commands) if (hit(c)) (by[c.group || 'Lainnya'] = by[c.group || 'Lainnya'] || []).push(c);
      const order = [...(D.groups || []), ...Object.keys(by).filter((g) => !(D.groups || []).includes(g))].filter((g) => by[g]);
      if (!order.length) return '<p class="muted">Tidak ada command yang cocok.</p>';
      return order.map((g) => `<details class="tg-grp" data-g="${esc(g)}" ${q || openG.has(g) ? 'open' : ''} style="margin-bottom:8px"><summary style="cursor:pointer;padding:10px 2px;font-weight:600">${esc(g)} <span class="muted small">· ${by[g].filter((c) => c.enabled).length}/${by[g].length} aktif</span></summary>
        <p class="nx-acts" style="margin:0 0 6px"><button class="btn small" data-grp-on="${esc(g)}" type="button">Nyalakan semua</button><button class="btn small" data-grp-off="${esc(g)}" type="button">Matikan semua</button></p>
        <ul class="mlist">${by[g].map(rowHtml).join('')}</ul></details>`).join('');
    }
    function termDraw() {
      const t = $('#cm-term', root); if (!t) return;
      const near = t.scrollHeight - t.scrollTop - t.clientHeight < 40;
      t.innerHTML = D.log.length ? D.log.slice().reverse().map((l) => termLine({ k: l.k, t: Date.parse(l.t), s: l.s })).join('') : '<div class="k-sys">Belum ada aktivitas command. Kirim /start ke botmu.</div>';
      if (near || !t.dataset.init) { t.scrollTop = t.scrollHeight; t.dataset.init = '1'; }
    }
    function form(c) {
      const f = $('#cm-form', root); if (!f) return;
      const isId = c && (c.kind === 'id' || c.kind === 'feature'), builtin = c && c.builtin;
      f.innerHTML = `<section class="panel"><h2>${c ? 'Edit /' + esc(c.cmd) : 'Command baru'}</h2><div class="tg-grid">
        <div><label class="tg-lbl" for="f-cmd">Nama command</label><input class="field mono" id="f-cmd" value="${esc(c ? c.cmd : '')}" ${builtin ? 'disabled' : ''} placeholder="promo" autocapitalize="off" autocomplete="off" spellcheck="false"><small class="muted">Huruf kecil, angka, garis bawah. Dipanggil sebagai /nama.</small></div>
        <div><label class="tg-lbl" for="f-desc">Deskripsi (tampil di menu Telegram)</label><input class="field" id="f-desc" maxlength="256" value="${esc(c ? c.desc : '')}" placeholder="Lihat promo terbaru"></div>
        ${isId ? `<p class="muted small">${c && c.kind === 'feature' ? `Command fitur panel. Cara pakai: <span class="mono">${esc(c.usage)}</span>.` : 'Command ini otomatis membalas ID chat.'} Hanya deskripsi, saklar, akses, dan cakupan yang bisa diubah.</p>` : `<div><label class="tg-lbl" for="f-text">Teks balasan</label><textarea class="field" id="f-text" rows="5" maxlength="4096" placeholder="Halo {nama}!">${esc(c ? c.text : '')}</textarea><small class="muted">Variabel: {nama} {username} {id} {grup} {bot}</small></div>
        <label class="tg-toggle" style="border:0"><span>Format HTML (b, i, a, code)</span><input class="tg-sw" type="checkbox" id="f-html" ${c && c.parse === 'HTML' ? 'checked' : ''}></label>
        <div><label class="tg-lbl" for="f-ban">Banner video</label><select class="field" id="f-ban"><option value="">Tanpa banner</option>${D.banners.map((b) => `<option value="${esc(b.id)}" ${c && c.bannerId === b.id ? 'selected' : ''}>${esc(b.name)} (${mb(b.size)})</option>`).join('')}</select></div>
        <div><label class="tg-lbl" for="f-btn">Tombol link (satu per baris)</label><textarea class="field mono" id="f-btn" rows="3" placeholder="Buka web | https://domain-kamu.com">${esc(c ? c.buttons : '')}</textarea></div>`}
        <div><label class="tg-lbl" for="f-acc">Siapa yang boleh memakai</label><select class="field" id="f-acc"><option value="all" ${!c || c.access === 'all' ? 'selected' : ''}>Semua orang</option><option value="owner" ${c && c.access === 'owner' ? 'selected' : ''}>Hanya pemilik (akun yang tertaut)</option></select></div>
        <div><label class="tg-lbl" for="f-scope">Dipakai di</label><select class="field" id="f-scope"><option value="any" ${!c || c.scope === 'any' ? 'selected' : ''}>Semua chat</option><option value="private" ${c && c.scope === 'private' ? 'selected' : ''}>Hanya chat privat</option><option value="group" ${c && c.scope === 'group' ? 'selected' : ''}>Hanya grup</option></select></div>
        <label class="tg-toggle" style="border:0"><span><b>Aktif</b></span><input class="tg-sw" type="checkbox" id="f-en" ${!c || c.enabled ? 'checked' : ''}></label></div>
        <p class="err" id="f-err" role="alert"></p>
        <p class="nx-acts"><button class="btn primary" id="f-save" type="button">Simpan</button><button class="btn" id="f-cancel" type="button">Batal</button>${c && !c.builtin ? '<button class="btn danger" id="f-del" type="button">Hapus</button>' : ''}</p></section>`;
      f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('#f-cancel', f).onclick = () => { editing = null; f.innerHTML = ''; };
      $('#f-save', f).onclick = async (e) => {
        const b = e.currentTarget, er = $('#f-err', f); er.textContent = ''; b.disabled = true;
        const g = (id) => { const x = $('#' + id, f); return x ? x.value : ''; };
        try {
          await api('/api/tg/commands', { method: 'POST', body: { id: c ? c.id : undefined, cmd: g('f-cmd'), desc: g('f-desc'), text: g('f-text'), parse: $('#f-html', f) && $('#f-html', f).checked ? 'HTML' : '', bannerId: g('f-ban'), buttons: g('f-btn'), access: g('f-acc'), scope: g('f-scope'), enabled: $('#f-en', f).checked } });
          toast('Command tersimpan'); editing = null; await load();
        } catch (ex) { er.textContent = ex.message; b.disabled = false; }
      };
      const del = $('#f-del', f);
      if (del) del.onclick = async () => { if (!await confirmDialog('Hapus command?', `/${esc(c.cmd)} dihapus dari bot.`, 'Hapus')) return; try { await api(`/api/tg/commands/${c.id}`, { method: 'DELETE' }); toast('Command dihapus'); editing = null; await load(); } catch (ex) { $('#f-err', f).textContent = ex.message; } };
    }
    function bindList() {
      $$('details.tg-grp', root).forEach((d) => (d.ontoggle = () => { if (d.open) openG.add(d.dataset.g); else openG.delete(d.dataset.g); }));
      $$('[data-tg]', root).forEach((i) => (i.onchange = async () => { try { await api(`/api/tg/commands/${i.dataset.tg}/toggle`, { method: 'POST', body: { enabled: i.checked } }); const c = D.commands.find((x) => x.id === i.dataset.tg); if (c) c.enabled = i.checked; const l = $('#cm-list', root); l.innerHTML = listHtml(); bindList(); } catch (ex) { i.checked = !i.checked; toast(ex.message, true); } }));
      $$('[data-ed]', root).forEach((b) => (b.onclick = () => { editing = b.dataset.ed; form(D.commands.find((c) => c.id === editing)); }));
      const bulk = (on) => async (e) => {
        const g = e.currentTarget.dataset[on ? 'grpOn' : 'grpOff']; const b = e.currentTarget; b.disabled = true;
        try { for (const c of D.commands.filter((x) => (x.group || 'Lainnya') === g && x.enabled !== on)) await api(`/api/tg/commands/${c.id}/toggle`, { method: 'POST', body: { enabled: on } }); toast(on ? `${g}: semua dinyalakan` : `${g}: semua dimatikan`); await load(); }
        catch (ex) { toast(ex.message, true); b.disabled = false; }
      };
      $$('[data-grp-on]', root).forEach((b) => (b.onclick = bulk(true)));
      $$('[data-grp-off]', root).forEach((b) => (b.onclick = bulk(false)));
    }
    function bind() {
      $('#cm-on', root).onchange = async (e) => { try { await api('/api/tg/commands/config', { method: 'POST', body: { enabled: e.target.checked } }); toast(e.target.checked ? 'Command dinyalakan' : 'Semua command dimatikan'); await load(); } catch (ex) { e.target.checked = !e.target.checked; $('#cm-err', root).textContent = ex.message; } };
      $('#cm-sync', root).onclick = async (e) => { const b = e.currentTarget, er = $('#cm-err', root); er.textContent = ''; b.disabled = true; try { const r = await api('/api/tg/commands/sync', { method: 'POST' }); toast(`Menu diperbarui (${r.public} publik)`); await load(); } catch (ex) { er.textContent = ex.message; b.disabled = false; } };
      bindList();
      $('#cm-q', root).oninput = (e) => { query = e.target.value; const l = $('#cm-list', root); l.innerHTML = listHtml(); bindList(); };
      $('#cm-new', root).onclick = () => { editing = 'new'; form(null); };
      $$('[data-bd]', root).forEach((b) => (b.onclick = async () => { if (!await confirmDialog('Hapus banner?', 'Command yang memakai banner ini akan membalas tanpa video.', 'Hapus')) return; try { await api(`/api/tg/banners/${b.dataset.bd}`, { method: 'DELETE' }); toast('Banner dihapus'); await load(); } catch (ex) { toast(ex.message, true); } }));
      $('#cm-clr', root).onclick = async () => { try { await api('/api/tg/commands/log/clear', { method: 'POST' }); D.log = []; termDraw(); } catch (ex) { toast(ex.message, true); } };
      const up = $('#cb-up', root), pr = progUI(root, 'cb');
      up.onclick = async () => {
        const er = $('#cb-err', root); er.textContent = ''; const file = $('#cm-file', root).files[0];
        if (!file) { er.textContent = 'Pilih file video dulu.'; return; }
        if (file.size > D.maxBannerMb * 1048576) { er.textContent = `Video ${mb(file.size)} melebihi batas ${D.maxBannerMb} MB.`; return; }
        up.disabled = true; pr.show();
        try { await sendFile('/api/tg/banners', file, {}, pr.set); toast('Banner diunggah'); await load(); }
        catch (ex) { er.textContent = ex.message; pr.hide(); up.disabled = false; }
      };
    }
    timer = setInterval(async () => {
      if (!alive || !document.body.contains(root)) { clearInterval(timer); return; }
      if (document.hidden) return;
      try { const d = await api('/api/tg/commands'); D.log = d.log; termDraw(); } catch (_) {}
    }, 4000);
    load();
    return () => { alive = false; clearInterval(timer); };
  }

  /* ================= Tab Bot Host ================= */
  function host(root, H) {
    const { api, toast, confirmDialog } = H;
    let bots = [], sel = '', since = 0, alive = true, tPoll = null, tList = null, auto = true;
    const STATE = { running: ['ok', 'Berjalan'], installing: ['warn', 'Menginstal'], crashed: ['err', 'Gagal'], stopped: ['', 'Berhenti'] };
    const dot = (s) => `<span class="dot ${(STATE[s] || STATE.stopped)[0]}"></span>`;

    async function loadList() { try { bots = (await api('/api/bots')).bots; } catch (ex) { root.innerHTML = `<div class="empty"><h2>Tidak bisa dimuat</h2><p>${esc(ex.message)}</p></div>`; return false; } return true; }
    function draw() {
      root.innerHTML = `<section class="panel"><h2>Bot Host</h2>
        <p class="muted small">Unggah proyek bot dalam <b>.zip</b> (maks 50 MB). Panel mengekstrak otomatis, mendeteksi Python atau Node.js, menginstal dependensi, lalu kamu tinggal menekan Jalankan. Hasilnya tampil di terminal.</p>
        <div class="tg-grid" style="margin-top:12px"><div><label class="tg-lbl" for="bh-name">Nama bot (opsional)</label><input class="field" id="bh-name" maxlength="60" placeholder="Bot Promo"></div>
        <div><label class="tg-lbl" for="bh-file">File ZIP</label><input class="field" id="bh-file" type="file" accept=".zip,application/zip"></div></div>
        ${progHtml('bh')}<p class="err" id="bh-err" role="alert"></p><p class="nx-acts"><button class="btn primary" id="bh-up" type="button">Unggah dan ekstrak</button></p>
        <p class="muted small">Pakai token bot yang <b>berbeda</b> dari bot panel, karena dua program yang membaca update dari token yang sama saling bentrok.</p></section>
        <h2 class="sec-title">Bot (${bots.length})</h2>
        <div id="bh-list">${listHtml()}</div><div id="bh-detail"></div>`;
      const up = $('#bh-up', root), pr = progUI(root, 'bh');
      up.onclick = async () => {
        const er = $('#bh-err', root); er.textContent = ''; const file = $('#bh-file', root).files[0];
        if (!file) { er.textContent = 'Pilih file ZIP dulu.'; return; }
        if (!/\.zip$/i.test(file.name)) { er.textContent = 'File harus berformat .zip.'; return; }
        if (file.size > 50 * 1048576) { er.textContent = `ZIP ${mb(file.size)} melebihi batas 50 MB.`; return; }
        up.disabled = true; pr.show();
        try { const j = await sendFile('/api/bots/upload', file, { 'X-Bot-Name': encodeURIComponent($('#bh-name', root).value) }, pr.set); toast('ZIP diekstrak'); sel = j.bot.id; since = 0; await loadList(); draw(); openBot(sel); }
        catch (ex) { er.textContent = ex.message; pr.hide(); up.disabled = false; }
      };
      bindList(); if (sel) openBot(sel, true);
    }
    const listHtml = () => bots.length ? `<ul class="mlist">${bots.map((b) => `<li class="tg-row ${b.id === sel ? 'tg-sel' : ''}" data-open="${esc(b.id)}" role="button" tabindex="0"><span><b>${esc(b.name)}</b><small>${esc(b.runtime)} · ${b.files} file · ${esc((STATE[b.state] || STATE.stopped)[1])}</small></span>${dot(b.state)}<button class="btn small" type="button">Buka</button></li>`).join('')}</ul>` : '<p class="muted">Belum ada bot. Unggah ZIP pertamamu di atas.</p>';
    function bindList() { $$('[data-open]', root).forEach((li) => (li.onclick = () => { if (sel !== li.dataset.open) { sel = li.dataset.open; since = 0; } $$('[data-open]', root).forEach((x) => x.classList.toggle('tg-sel', x === li)); openBot(sel); })); }

    async function openBot(id, keep) {
      const box = $('#bh-detail', root); if (!box) return;
      let d; try { d = await api(`/api/bots/${id}`); } catch (ex) { box.innerHTML = `<p class="err">${esc(ex.message)}</p>`; return; }
      const b = d.bot; if (!keep) since = 0;
      const envRows = (b.envKeys || []).map((k) => envRow(k, true)).join('');
      box.innerHTML = `<section class="panel" id="bh-card"><h2>${esc(b.name)}</h2>
        <p class="status"><span id="bh-dot">${dot(b.state)}</span><span id="bh-st">${esc((STATE[b.state] || STATE.stopped)[1])}</span><span class="muted small" id="bh-up2"></span></p>
        <p class="nx-acts" id="bh-acts"><button class="btn primary small" data-a="start" type="button">Jalankan</button><button class="btn small" data-a="stop" type="button">Berhenti</button><button class="btn small" data-a="restart" type="button">Restart</button>${b.canInstall ? '<button class="btn small" data-a="install" type="button">Install dependensi</button>' : ''}<button class="btn small" data-a="upd" type="button">Perbarui ZIP</button><button class="btn small danger" data-a="del" type="button">Hapus</button></p>
        <input type="file" id="bh-upd" accept=".zip,application/zip" hidden>
        <h2 style="margin-top:14px">Terminal</h2><div class="tg-term tall" id="bh-term" role="log" aria-live="off"></div>
        <p class="nx-acts"><button class="btn small" id="bh-clr" type="button">Bersihkan</button><label class="muted small" style="display:flex;align-items:center;gap:8px;min-height:38px"><input type="checkbox" id="bh-auto" ${auto ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px"> Gulir otomatis</label></p>
        <p class="err" id="bh-aerr" role="alert"></p>
        <h2 style="margin-top:14px">Pengaturan</h2><div class="tg-grid">
          <div><label class="tg-lbl" for="bs-name">Nama</label><input class="field" id="bs-name" maxlength="60" value="${esc(b.name)}"></div>
          <div><label class="tg-lbl" for="bs-cmd">Perintah menjalankan</label><input class="field mono" id="bs-cmd" value="${esc(b.cmd)}" placeholder="python3 main.py" autocapitalize="off" spellcheck="false"><small class="muted">Terdeteksi: ${esc(b.runtime)}. Contoh: python3 main.py, node index.js, npm start.</small></div>
          <label class="tg-toggle" style="border:0"><span><b>Auto-start</b><small class="muted" style="display:block">Jalan sendiri saat panel dihidupkan.</small></span><input class="tg-sw" type="checkbox" id="bs-auto" ${b.autostart ? 'checked' : ''}></label>
          <label class="tg-toggle" style="border:0"><span><b>Mulai ulang otomatis</b><small class="muted" style="display:block">Kalau crash, dicoba lagi (maksimal 10 kali).</small></span><input class="tg-sw" type="checkbox" id="bs-rst" ${b.restart ? 'checked' : ''}></label>
          <div><label class="tg-lbl">Variabel lingkungan (token, dll)</label><div id="bs-env" class="tg-grid">${envRows}</div><p class="nx-acts"><button class="btn small" id="bs-addenv" type="button">+ Variabel</button></p><small class="muted">Nilai tersimpan di server dan tidak ditampilkan lagi. Kosongkan kolom nilai untuk mempertahankan yang lama.</small></div></div>
        <p class="err" id="bs-err" role="alert"></p><p class="nx-acts"><button class="btn primary" id="bs-save" type="button">Simpan pengaturan</button></p>
        <details style="margin-top:12px"><summary class="muted small" style="cursor:pointer">Daftar file (${d.files.length}${d.files.length >= 300 ? '+' : ''})</summary><pre class="mono small" style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px">${esc(d.files.map((f) => (f.s < 0 ? f.p + ' (dilewati)' : `${f.p}  ${mb(f.s)}`)).join('\n'))}</pre></details></section>`;
      bindDetail(b); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      applyState(b.state, b.startedAt); poll(true);
    }
    const envRow = (k, keep) => `<div class="tg-envrow" ${keep ? 'data-keep="1"' : ''}><input class="field mono" data-k placeholder="NAMA" value="${esc(k || '')}" autocapitalize="off" spellcheck="false"><input class="field mono" data-v type="password" autocomplete="off" placeholder="${keep ? '•••• tersimpan' : 'nilai'}"><button class="btn small danger" data-rm type="button" aria-label="Hapus variabel">✕</button></div>`;
    function applyState(state, startedAt) {
      const st = $('#bh-st', root); if (!st) return;
      st.textContent = (STATE[state] || STATE.stopped)[1]; $('#bh-dot', root).innerHTML = dot(state);
      $('#bh-up2', root).textContent = state === 'running' && startedAt ? `· aktif ${ago(Date.now() - startedAt)}` : '';
      const busy = state === 'running' || state === 'installing';
      const set = (a, dis) => { const b = $(`[data-a="${a}"]`, root); if (b) b.disabled = dis; };
      set('start', busy); set('install', busy); set('upd', state === 'installing'); set('stop', state === 'stopped'); set('restart', state === 'installing');
    }
    async function poll(first) {
      if (!alive || !sel || !$('#bh-term', root)) return;
      try {
        const j = await api(`/api/bots/${sel}/log?since=${since}`);
        const t = $('#bh-term', root); if (!t) return;
        if (first) t.innerHTML = '';
        if (j.lines.length) { t.insertAdjacentHTML('beforeend', j.lines.map(termLine).join('')); while (t.childElementCount > 700) t.firstElementChild.remove(); }
        else if (first && !t.childElementCount) t.innerHTML = '<div class="k-sys">Belum ada output. Tekan Jalankan.</div>';
        if (j.lines.length && $('#bh-auto', root) && $('#bh-auto', root).checked) t.scrollTop = t.scrollHeight;
        since = j.next; applyState(j.state, j.startedAt);
        const cur = bots.find((x) => x.id === sel); if (cur && cur.state !== j.state) { cur.state = j.state; const l = $('#bh-list', root); if (l) { l.innerHTML = listHtml(); bindList(); } }
      } catch (_) {}
    }
    function bindDetail(b) {
      const act = async (a) => {
        const er = $('#bh-aerr', root); er.textContent = '';
        try {
          if (a === 'del') { if (!await confirmDialog('Hapus bot?', `${esc(b.name)} dihentikan dan semua filenya dihapus dari server.`, 'Hapus')) return; await api(`/api/bots/${b.id}`, { method: 'DELETE' }); toast('Bot dihapus'); sel = ''; await loadList(); draw(); return; }
          if (a === 'upd') { $('#bh-upd', root).click(); return; }
          await api(`/api/bots/${b.id}/${a}`, { method: 'POST' }); await poll(); setTimeout(poll, 400);
        } catch (ex) { er.textContent = ex.message; }
      };
      $$('[data-a]', root).forEach((x) => (x.onclick = () => act(x.dataset.a)));
      $('#bh-upd', root).onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return; const er = $('#bh-aerr', root); er.textContent = '';
        if (f.size > 50 * 1048576) { er.textContent = `ZIP ${mb(f.size)} melebihi batas 50 MB.`; return; }
        try { toast('Mengunggah pembaruan...'); await sendFile('/api/bots/upload', f, { 'X-Bot-Id': b.id }, () => {}); toast('Bot diperbarui'); since = 0; await loadList(); openBot(b.id); } catch (ex) { er.textContent = ex.message; }
      };
      $('#bh-clr', root).onclick = async () => { try { const j = await api(`/api/bots/${b.id}/log/clear`, { method: 'POST' }); $('#bh-term', root).innerHTML = ''; since = j.next; } catch (ex) { toast(ex.message, true); } };
      $('#bh-auto', root).onchange = (e) => { auto = e.target.checked; };
      $('#bs-addenv', root).onclick = () => $('#bs-env', root).insertAdjacentHTML('beforeend', envRow('', false));
      $('#bs-env', root).onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) r.closest('.tg-envrow').remove(); };
      $('#bs-save', root).onclick = async (e) => {
        const btn = e.currentTarget, er = $('#bs-err', root); er.textContent = ''; btn.disabled = true;
        const env = $$('.tg-envrow', root).map((r) => { const k = $('[data-k]', r).value.trim(), v = $('[data-v]', r).value; return k ? { k, v: !v && r.dataset.keep && k === ($('[data-k]', r).defaultValue || k) ? null : v } : null; }).filter(Boolean);
        try { await api(`/api/bots/${b.id}/config`, { method: 'POST', body: { name: $('#bs-name', root).value, cmd: $('#bs-cmd', root).value, autostart: $('#bs-auto', root).checked, restart: $('#bs-rst', root).checked, env } }); toast('Pengaturan tersimpan'); await loadList(); const l = $('#bh-list', root); if (l) { l.innerHTML = listHtml(); bindList(); } openBot(b.id, true); }
        catch (ex) { er.textContent = ex.message; btn.disabled = false; }
      };
    }

    tPoll = setInterval(() => { if (!alive || !document.body.contains(root)) { clearInterval(tPoll); clearInterval(tList); return; } if (!document.hidden) poll(false); }, 1500);
    tList = setInterval(async () => { if (!alive || document.hidden || !$('#bh-list', root)) return; try { bots = (await api('/api/bots')).bots; const l = $('#bh-list', root); if (l) { l.innerHTML = listHtml(); bindList(); } } catch (_) {} }, 8000);
    loadList().then((ok) => { if (ok) { if (!sel && bots.length === 1) sel = bots[0].id; draw(); } });
    return () => { alive = false; clearInterval(tPoll); clearInterval(tList); };
  }

  window.ZZTgx = { commands, host };
})();
