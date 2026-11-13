/* Wink: perbaiki dan olah foto (HD, Remini, Wink, Upscale, Hapus BG) lewat endpoint NexaDev. */
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MB = 1048576;
  const fmtSize = (n) => (n >= MB ? (n / MB).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB');
  const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const ic = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ICON = {
    hd: ic('<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 10v4M8 12h3M11 10v4M14.5 10v4h1.5a2 2 0 0 0 0-4z"/>'),
    remini: ic('<circle cx="12" cy="12" r="8"/><path d="M9 10v.01M15 10v.01M8.8 14.2c1.5 1.8 4.9 1.8 6.4 0"/>'),
    wink: ic('<circle cx="12" cy="12" r="8"/><path d="M8.5 10.5h2M14 10.5h2M9 14.5c2 1.6 4.4 1.6 6 0"/>'),
    upscale: ic('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
    upscale1: ic('<path d="M14 4h6v6M20 4l-7 7"/><rect x="4" y="12" width="8" height="8" rx="1.5"/>'),
    remove: ic('<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="2.5"/><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3"/>'),
    photo: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'),
  };
  const SHORT = { hd: 'Perjelas', remini: 'Pulihkan', wink: 'Tingkatkan', upscale: 'Perbesar', upscale1: '2x atau 4x', remove: 'Tanpa latar' };
  const STATE = { wait: 'Menunggu', run: 'Memproses', done: 'Selesai', err: 'Gagal' };
  let H = null;

  /* ---------- Render murni (diuji terpisah) ---------- */
  function toolsHtml(S) {
    return S.tools.map((t) => {
      const i = S.sel.indexOf(t.id), on = i >= 0;
      return `<button type="button" class="wk-tool${on ? ' on' : ''}" data-wk="tool" data-id="${esc(t.id)}" aria-pressed="${on}">${ICON[t.id] || ICON.photo}<b>${esc(t.label)}</b><small>${esc(SHORT[t.id] || '')}</small>${on ? `<span class="wk-order" aria-label="Urutan ${i + 1}">${i + 1}</span>` : ''}</button>`;
    }).join('');
  }

  function optionsHtml(S) {
    let h = '';
    if (S.sel.includes('upscale1')) {
      h += `<div class="wk-opt"><span class="lbl">Ukuran Upscale</span><div class="seg" role="tablist">${[2, 4].map((n) => `<button type="button" role="tab" data-wk="res" data-v="${n}" aria-selected="${S.res === n}">${n}x</button>`).join('')}</div></div>`;
    }
    if (S.sel.length >= 2) {
      h += `<div class="wk-opt"><span class="lbl">Cara memproses ${S.sel.length} alat</span><div class="seg" role="tablist">
        <button type="button" role="tab" data-wk="mode" data-v="chain" aria-selected="${S.mode === 'chain'}">Berantai</button>
        <button type="button" role="tab" data-wk="mode" data-v="compare" aria-selected="${S.mode === 'compare'}">Bandingkan</button></div>
        <p class="muted small">${S.mode === 'chain' ? 'Hasil tiap langkah jadi bahan langkah berikutnya, sesuai nomor urut.' : 'Semua alat memproses foto asli, lalu hasilnya bisa dibandingkan.'}</p></div>`;
    }
    return h;
  }

  function runLabel(S) {
    if (!S.sel.length) return 'Pilih alat dulu';
    if (S.sel.length === 1) return 'Proses foto';
    return `Proses ${S.sel.length} alat (${S.mode === 'chain' ? 'berantai' : 'bandingkan'})`;
  }

  function stepsHtml(S) {
    if (!S.steps.length) return '';
    return `<ul class="wk-steps">${S.steps.map((s, i) => `<li class="wk-step ${s.state}"><span class="wk-st-i">${s.state === 'run' ? '<i class="wk-spin"></i>' : s.state === 'done' ? '✓' : s.state === 'err' ? '!' : i + 1}</span>
      <div><b>${esc(s.label)}</b><small>${esc(STATE[s.state])}${s.state === 'run' ? ` · ${s.elapsed || 0} dtk` : ''}${s.state === 'done' && s.result ? ` · ${esc(fmtSize(s.result.bytes))}` : ''}</small>
      ${s.error ? `<p class="wk-err">${esc(s.error)}</p>` : ''}</div>
      ${s.state === 'err' && !S.busy ? `<button type="button" class="btn small" data-wk="retry" data-i="${i}">${S.mode === 'chain' && S.steps.length > 1 ? 'Lanjutkan' : 'Coba lagi'}</button>` : ''}</li>`).join('')}</ul>`;
  }

  function viewHtml(S) {
    const v = S.view;
    if (!v) return '';
    const tabs = S.results.length > 1
      ? `<div class="seg" role="tablist">${S.results.map((r, i) => `<button type="button" role="tab" data-wk="tab" data-i="${i}" aria-selected="${r.file === v.file}">${esc(r.label)}</button>`).join('')}</div>` : '';
    const noBefore = !v.before;
    return `<h2>${esc(v.label)} <span class="tag">${esc((v.ext || '').toUpperCase())}</span></h2>${tabs}
      <div class="wk-cmp" style="--p:${noBefore ? 0 : 50}%">
        ${noBefore ? '' : `<img class="wk-before" src="${esc(v.before)}" alt="Foto asli" referrerpolicy="no-referrer">`}
        <div class="wk-afterwrap"><img class="wk-after" src="${esc(v.after)}" alt="Hasil ${esc(v.label)}"></div>
        ${noBefore ? '' : '<span class="wk-line"></span><span class="wk-knob" aria-hidden="true">◂▸</span><span class="wk-tag l">Asli</span><span class="wk-tag r">Hasil</span><input type="range" class="wk-range" min="0" max="100" value="50" aria-label="Geser untuk membandingkan foto asli dan hasil">'}
      </div>
      <p class="muted small wk-meta">${esc(fmtSize(v.bytes))}${v.ms ? ` · ${Math.round(v.ms / 1000)} dtk` : ''}${v.when ? ` · ${esc(v.when)}` : ''}</p>
      <div class="nx-acts"><a class="btn small primary" href="${esc(v.after)}" download="wink-${esc(String(v.label).toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.${esc(v.ext || 'png')}">Unduh</a>
        <a class="btn small" href="${esc(v.after)}" target="_blank" rel="noopener noreferrer">Buka</a>
        ${v.file ? '<button type="button" class="btn small" data-wk="use">Jadikan foto utama</button>' : ''}
        ${v.file ? `<button type="button" class="btn small" data-wk="save">${v.saved ? 'Salin link' : 'Simpan dan salin link'}</button>` : ''}
        ${v.id ? '<button type="button" class="btn small danger" data-wk="del">Hapus</button>' : ''}</div>
      ${v.saved ? `<input class="field mono wk-link" readonly value="${esc(v.saved.url)}" aria-label="Link gambar" onfocus="this.select()">` : ''}`;
  }

  function histHtml(list) {
    if (!list.length) return '<p class="muted small">Belum ada riwayat. Hasil proses akan tersimpan di sini.</p>';
    return list.map((h) => `<article class="wk-h" data-id="${esc(h.id)}"><button type="button" class="wk-h-th" data-wk="open" data-id="${esc(h.id)}" aria-label="Buka hasil ${esc(h.label)}"><img src="${esc(h.src)}" alt="" loading="lazy"><span class="tag">${esc(h.label)}</span></button>
      <small class="muted">${esc(fmtSize(h.bytes))} · ${esc(fmtTime(h.createdAt))}</small></article>`).join('');
  }

  function stageHtml(S, up) {
    if (up) return `<div class="wk-up"><p>Mengunggah foto…</p><div class="track"><div class="bar" style="width:${up.pct || 0}%"></div></div><small class="muted">${esc(up.note || '')}</small></div>`;
    if (S.src) return `<div class="wk-pre"><img src="${esc(S.src.src)}" alt="Foto yang dipilih" referrerpolicy="no-referrer"><div class="wk-pre-b"><span class="muted small">${esc(S.src.info || (S.src.link ? 'Dari link' : 'Foto dipilih'))}</span>
      <span class="nx-acts"><button type="button" class="btn small" data-wk="pick">Ganti foto</button><button type="button" class="btn small" data-wk="clear">Lepas</button></span></div></div>`;
    return `<div class="wk-drop" id="wk-drop"><span class="wk-drop-ic">${ICON.photo}</span><p><b>Pilih foto</b> atau seret ke sini</p><small class="muted">JPG, PNG, WebP. Bisa juga tempel dengan Ctrl+V. Foto besar dikecilkan otomatis.</small>
      <button type="button" class="btn primary" data-wk="pick">Pilih foto</button>
      <form class="wk-url" data-wk="url"><label class="sr" for="wk-link">Link gambar</label><input class="field mono" id="wk-link" type="url" placeholder="atau tempel link gambar https://…" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Pakai</button></form></div>`;
  }

  /* ---------- Persiapan foto di browser ---------- */
  async function prepare(file) {
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '')) throw new Error('Format HEIC belum didukung. Ubah ke JPG atau PNG dulu.');
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name || '')) throw new Error('File ini bukan gambar.');
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('Foto tidak bisa dibaca. Pakai JPG, PNG, atau WebP.'); }
    const k = Math.min(1, 3840 / Math.max(bmp.width, bmp.height));
    const isPng = file.type === 'image/png';
    if (isPng && k === 1 && file.size <= 9 * MB) return { blob: file, w: bmp.width, h: bmp.height };
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const toBlob = (type, q) => new Promise((ok) => c.toBlob(ok, type, q));
    if (isPng) { g.drawImage(bmp, 0, 0, w, h); const b = await toBlob('image/png'); if (b && b.size <= 9 * MB) return { blob: b, w, h }; }
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.92, 0.85, 0.75, 0.65]) { const b = await toBlob('image/jpeg', q); if (b && b.size <= 9 * MB) return { blob: b, w, h }; }
    throw new Error('Foto terlalu besar bahkan setelah dikecilkan.');
  }

  /* ---------- Halaman ---------- */
  async function mount(el, helpers) {
    H = helpers;
    const S = { ready: null, tools: [], src: null, sel: [], res: 4, mode: 'chain', steps: [], results: [], view: null, busy: false, hist: [] };
    let up = null, tipId = null;

    el.innerHTML = `<h1 class="page-title">Wink</h1>
      <p class="page-sub">Perjelas, perbesar, dan hapus background foto. Pilih foto dan alat, lalu geser untuk membandingkan dengan aslinya.</p>
      <div id="wk-top"></div>
      <section class="panel wk-stage" id="wk-stage"></section>
      <section class="wk-tools-wrap"><h2 class="sec-title">Alat</h2><div class="wk-tools" id="wk-tools" role="group" aria-label="Pilih alat"></div><p class="muted small" id="wk-tip">Pilih satu alat, atau beberapa untuk diproses berurutan atau dibandingkan.</p><div id="wk-opts"></div></section>
      <div class="wk-run"><button type="button" class="btn primary" id="wk-go" data-wk="go">Pilih alat dulu</button></div>
      <section id="wk-steps" aria-live="polite"></section>
      <section class="panel wk-view" id="wk-view" hidden></section>
      <h2 class="sec-title">Riwayat</h2><div class="wk-hist" id="wk-hist"></div>
      <input type="file" id="wk-file" accept="image/*" hidden>`;

    const drawTop = () => {
      $('#wk-top', el).innerHTML = S.ready === false
        ? `<div class="panel wk-note"><h2>Supabase belum siap</h2><p class="muted">Foto perlu diunggah ke Supabase agar Nexa bisa mengambilnya. Siapkan di Img to URL, atau pakai link gambar yang bisa dibuka publik.</p><p class="nx-acts"><a class="btn small primary" href="#/imgurl">Buka Img to URL</a><button type="button" class="btn small" data-wk="recheck">Cek lagi</button></p></div>` : '';
    };
    const drawStage = () => { $('#wk-stage', el).innerHTML = stageHtml(S, up); };
    const drawTools = () => {
      $('#wk-tools', el).innerHTML = toolsHtml(S);
      $('#wk-opts', el).innerHTML = optionsHtml(S);
      const tool = S.tools.find((t) => t.id === tipId);
      $('#wk-tip', el).textContent = tool ? tool.desc : 'Pilih satu alat, atau beberapa untuk diproses berurutan atau dibandingkan.';
      const go = $('#wk-go', el);
      go.textContent = S.busy ? 'Memproses…' : runLabel(S);
      go.disabled = S.busy || !S.src || !S.sel.length;
    };
    const drawSteps = () => { $('#wk-steps', el).innerHTML = stepsHtml(S); };
    const drawHist = () => { $('#wk-hist', el).innerHTML = histHtml(S.hist); };
    const drawView = () => {
      const box = $('#wk-view', el);
      box.hidden = !S.view;
      box.innerHTML = viewHtml(S);
      const cmp = $('.wk-cmp', box);
      if (!cmp) return;
      const before = $('.wk-before', cmp), range = $('.wk-range', cmp);
      const fit = () => { if (before && before.naturalWidth) cmp.style.aspectRatio = `${before.naturalWidth} / ${before.naturalHeight}`; };
      if (before) {
        before.addEventListener('load', fit);
        if (before.complete) fit();
        before.addEventListener('error', () => { cmp.style.setProperty('--p', '0%'); cmp.querySelectorAll('.wk-line,.wk-knob,.wk-tag,.wk-range').forEach((n) => n.remove()); before.remove(); H.toast('Foto asli tidak bisa dimuat untuk perbandingan.', true); });
      } else $('.wk-after', cmp).addEventListener('load', (e) => { cmp.style.aspectRatio = `${e.target.naturalWidth} / ${e.target.naturalHeight}`; });
      if (range) range.addEventListener('input', () => cmp.style.setProperty('--p', range.value + '%'));
    };
    const drawAll = () => { drawTop(); drawStage(); drawTools(); drawSteps(); drawView(); drawHist(); };

    async function loadStatus() {
      try { const j = await H.api('/api/wink/status'); S.ready = j.ready; S.tools = j.tools; }
      catch (e) { S.ready = false; H.toast(e.message, true); }
      drawTop(); drawTools();
    }
    async function loadHist() {
      try { S.hist = (await H.api('/api/wink/history')).items; } catch (_) { /* biarkan */ }
      drawHist();
    }

    /* ----- memilih foto ----- */
    async function pickFile(file) {
      if (!file || S.busy) return;
      try {
        up = { pct: 0, note: 'Menyiapkan foto…' }; drawStage();
        const { blob, w, h } = await prepare(file);
        up = { pct: 0, note: `${w} x ${h} · ${fmtSize(blob.size)}` }; drawStage();
        const j = await H.api('/api/wink/upload', {
          method: 'POST', rawBody: blob, rawType: blob.type || 'image/jpeg',
          onProgress: (f) => { up.pct = Math.round(f * 100); const b = $('.wk-up .bar', el); if (b) b.style.width = up.pct + '%'; },
          onUploaded: () => { up.note = 'Menyimpan ke Supabase…'; const n = $('.wk-up small', el); if (n) n.textContent = up.note; },
        });
        S.src = { file: j.file, src: j.src, url: j.url, info: `${w} x ${h} · ${fmtSize(blob.size)}` };
        S.steps = []; S.results = []; S.view = null;
      } catch (e) { H.toast(e.message, true); }
      up = null;
      drawAll();
    }
    function useLink(raw) {
      const u = String(raw || '').trim();
      if (!/^https?:\/\/\S{3,2000}$/i.test(u)) return H.toast('Link harus diawali http:// atau https://', true);
      S.src = { url: u, src: u, link: true, info: u.length > 60 ? u.slice(0, 57) + '…' : u };
      S.steps = []; S.results = []; S.view = null;
      drawAll();
    }

    /* ----- menjalankan alat ----- */
    const firstSource = () => (S.src.url ? { url: S.src.url } : { file: S.src.file });
    const labelOf = (id) => { const t = S.tools.find((x) => x.id === id) || { label: id }; return id === 'upscale1' ? `Upscale ${S.res}x` : t.label; };

    async function execStep(i, source) {
      const st = S.steps[i];
      st.state = 'run'; st.elapsed = 0; st.error = ''; drawSteps();
      try {
        const body = { tool: st.id, source, orig: S.src.file || undefined, origUrl: S.src.link ? S.src.url : undefined };
        if (st.id === 'upscale1') body.resolusi = S.res;
        const { job } = await H.api('/api/wink/run', { method: 'POST', body });
        const t0 = Date.now();
        let fails = 0;
        for (;;) {
          await sleep(2000);
          if (Date.now() - t0 > 240000) throw new Error('Terlalu lama. Coba lagi atau pakai foto yang lebih kecil.');
          let j;
          try { j = await H.api('/api/wink/job/' + job); fails = 0; } catch (e) { if (++fails >= 5) throw e; continue; }
          st.elapsed = j.elapsed; drawSteps();
          if (j.status === 'running') continue;
          if (j.status === 'done') { st.result = j.result; st.state = 'done'; drawSteps(); return j.result; }
          throw new Error(j.error || 'Proses gagal.');
        }
      } catch (e) { st.state = 'err'; st.error = e.message; drawSteps(); throw e; }
    }

    async function runChain(from) {
      for (let i = from; i < S.steps.length; i++) {
        const prev = i === 0 ? null : S.steps[i - 1].result;
        if (i > 0 && !prev) throw new Error('Langkah sebelumnya belum selesai.');
        await execStep(i, i === 0 ? firstSource() : { file: prev.file });
      }
    }
    async function runPool(indexes) {
      const q = [...indexes];
      const worker = async () => { while (q.length) { const i = q.shift(); try { await execStep(i, firstSource()); } catch (_) { /* tampil di langkahnya */ } } };
      await Promise.all([worker(), worker()]);
    }

    function openResults() {
      S.results = S.steps.filter((s) => s.result).map((s) => s.result);
      if (!S.results.length) { S.view = null; return drawView(); }
      showResult(S.results[S.results.length - 1]);
    }
    function showResult(r, hist) {
      S.view = { id: r.id, file: r.file, label: r.label, ext: r.ext, bytes: r.bytes, ms: r.ms, saved: r.saved, after: r.src, before: hist ? (r.origSrc || r.origUrl || '') : (S.src && S.src.src) || '', when: hist ? fmtTime(r.createdAt) : '' };
      drawView();
      $('#wk-view', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function start(from) {
      if (S.busy || !S.src || !S.sel.length) return;
      S.busy = true;
      if (from == null) { S.steps = S.sel.map((id) => ({ id, label: labelOf(id), state: 'wait' })); S.results = []; S.view = null; drawView(); }
      drawTools(); drawSteps();
      try {
        if (from != null) { if (S.steps.length > 1 && S.mode === 'chain') await runChain(from); else await runPool([from]); }
        else if (S.steps.length > 1 && S.mode === 'chain') await runChain(0);
        else await runPool(S.steps.map((_, i) => i));
      } catch (_) { /* pesan ada di langkah yang gagal */ }
      S.busy = false;
      drawTools(); drawSteps();
      openResults();
      loadHist();
    }

    /* ----- aksi ----- */
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-wk]');
      if (!b) return;
      const a = b.dataset.wk;
      if (a === 'pick') $('#wk-file', el).click();
      else if (a === 'clear') { S.src = null; S.steps = []; S.results = []; S.view = null; drawAll(); }
      else if (a === 'tool') {
        const id = b.dataset.id, i = S.sel.indexOf(id);
        if (i >= 0) S.sel.splice(i, 1);
        else { if (S.sel.length >= 4) return H.toast('Maksimal 4 alat sekaligus.', true); S.sel.push(id); }
        tipId = id; drawTools();
      } else if (a === 'res') { S.res = Number(b.dataset.v); drawTools(); }
      else if (a === 'mode') { S.mode = b.dataset.v; drawTools(); }
      else if (a === 'go') start();
      else if (a === 'retry') start(Number(b.dataset.i));
      else if (a === 'tab') { const r = S.results[Number(b.dataset.i)]; if (r) showResult(r); }
      else if (a === 'recheck') loadStatus();
      else if (a === 'open') { const h = S.hist.find((x) => x.id === b.dataset.id); if (h) showResult(h, true); }
      else if (a === 'use') {
        const v = S.view;
        S.src = { file: v.file, src: v.after, url: null, info: `Hasil ${v.label} · ${fmtSize(v.bytes)}` };
        S.steps = []; S.results = []; S.view = null;
        drawAll();
        H.toast('Hasil ini sekarang jadi foto utama. Pilih alat berikutnya.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (a === 'save') {
        const v = S.view;
        if (v.saved) return copy(v.saved.url);
        b.disabled = true; b.textContent = 'Menyimpan…';
        try {
          const j = await H.api('/api/wink/save', { method: 'POST', body: { file: v.file } });
          v.saved = { url: j.url, name: j.name };
          const h = S.hist.find((x) => x.file === v.file); if (h) h.saved = v.saved;
          drawView(); copy(j.url);
        } catch (ex) { H.toast(ex.message, true); b.disabled = false; b.textContent = 'Simpan dan salin link'; }
      } else if (a === 'del') {
        const v = S.view;
        if (!await H.confirmDialog('Hapus dari riwayat?', 'Hasil ini dihapus dari panel. File yang sudah disimpan ke Supabase tidak ikut terhapus.', 'Hapus')) return;
        try { await H.api('/api/wink/history/' + encodeURIComponent(v.id), { method: 'DELETE' }); S.hist = S.hist.filter((x) => x.id !== v.id); S.results = S.results.filter((r) => r.id !== v.id); S.view = null; drawView(); drawHist(); }
        catch (ex) { H.toast(ex.message, true); }
      }
    });
    async function copy(t) { try { await navigator.clipboard.writeText(t); H.toast('Link disalin'); } catch (_) { H.toast('Tidak bisa menyalin otomatis. Salin dari kolom link.', true); } }

    el.addEventListener('submit', (e) => { const f = e.target.closest('[data-wk=url]'); if (f) { e.preventDefault(); useLink($('input', f).value); } });
    $('#wk-file', el).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; pickFile(f); });
    const stage = $('#wk-stage', el);
    stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
    stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
    stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); pickFile(e.dataTransfer.files[0]); });
    const onPaste = (e) => {
      if (!el.isConnected) return document.removeEventListener('paste', onPaste);
      const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type));
      if (f) { e.preventDefault(); pickFile(f); }
    };
    document.addEventListener('paste', onPaste);

    drawAll();
    await Promise.all([loadStatus(), loadHist()]);
  }

  window.ZZWink = { mount, _r: { toolsHtml, optionsHtml, runLabel, stepsHtml, viewHtml, histHtml, stageHtml } };
})();
