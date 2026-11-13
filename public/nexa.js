/* Kartu Nexa: dipakai halaman Tools (tab Lainnya) dan hasil alat di chat AI. */
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  let H = null;
  let CAT = null;

  const ic = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ICON = {
    Gambar: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'),
    Video: ic('<rect x="3" y="5" width="13" height="14" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>'),
    Cari: ic('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'),
  };
  const absolute = (u) => { try { return new URL(u, location.href).href; } catch (_) { return u; } };

  /* ---------- Hasil ---------- */
  function mediaHtml(c) {
    const src = esc(c.src);
    let el;
    if (c.media === 'video') el = `<video class="nx-m" src="${src}" controls playsinline loop preload="metadata"></video>`;
    else if (c.media === 'audio') el = `<audio class="nx-m" src="${src}" controls></audio>`;
    else el = `<img class="nx-m" src="${src}" alt="${esc(c.title || 'Hasil')}" loading="lazy" referrerpolicy="no-referrer">`;
    return `<figure class="nx-fig${c.blur ? ' blur' : ''}">${el}${c.blur ? '<button type="button" class="nx-reveal" data-nx="reveal">Tampilkan</button>' : ''}</figure>
      <div class="nx-acts"><a class="btn small" href="${src}" download>Unduh</a><a class="btn small" href="${src}" target="_blank" rel="noopener noreferrer">Buka</a><button type="button" class="btn small" data-nx="copy" data-v="${esc(absolute(c.src))}">Salin link</button></div>`;
  }

  function itemHtml(it, act) {
    const parts = [];
    if (it.video) parts.push(`<video class="nx-m" src="${esc(it.video)}"${it.image ? ` poster="${esc(it.image)}"` : ''} controls playsinline preload="none"></video>`);
    else if (it.image) parts.push(`<img class="nx-th" src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`);
    const body = `<div class="nx-it-b">${it.title ? `<b>${esc(it.title)}</b>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>`;
    const btns = [];
    if (it.link) btns.push(`<a class="btn small" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Buka</a>`);
    if (act && it.link) btns.push(`<button type="button" class="btn small primary" data-nx="act" data-tool="${esc(act.tool)}" data-param="${esc(act.param)}" data-v="${esc(it.link)}">${esc(act.label)}</button>`);
    if (it.text) btns.push(`<button type="button" class="btn small" data-nx="copy" data-v="${esc(it.text)}">Salin teks</button>`);
    const audio = it.audio ? `<audio class="nx-au" src="${esc(it.audio)}" controls preload="none"></audio>` : '';
    const text = it.text ? `<details class="nx-tx"><summary>Lihat teks</summary><pre>${esc(it.text)}</pre></details>` : '';
    return `<li class="nx-it">${parts.join('')}${body}${audio}${text}${btns.length ? `<div class="nx-acts">${btns.join('')}</div>` : ''}<div class="nx-slot"></div></li>`;
  }

  function resultHtml(c, act) {
    if (!c) return '';
    if (c.kind === 'media' && c.src) return mediaHtml(c);
    if (c.kind === 'text') return `<div class="nx-text"><pre>${esc(c.text)}</pre></div><div class="nx-acts"><button type="button" class="btn small" data-nx="copy" data-v="${esc(c.text)}">Salin teks</button></div>`;
    if (c.kind === 'list') {
      if (!c.items || !c.items.length) return '<p class="muted small">Tidak ada hasil.</p>';
      return `<ul class="nx-list">${c.items.map((it) => itemHtml(it, act)).join('')}</ul>`;
    }
    return '<p class="muted small">Respons dari Nexa tidak dikenali, jadi tidak bisa ditampilkan sebagai kartu.</p>';
  }

  // Kartu hasil alat di dalam chat AI
  function cardsHtml(cards) {
    return `<div class="nx-cards">${cards.map((c) => `<section class="nx-card chat"><header class="nx-h"><b>${esc(c.title || 'Hasil')}</b>${c.args ? `<small>${esc(Object.values(c.args).join(' · ').slice(0, 80))}</small>` : ''}</header>${resultHtml(c, c.id === 'soundeffect' ? { label: 'Putar', tool: 'soundeffect_detail', param: 'url' } : null)}</section>`).join('')}</div>`;
  }

  /* ---------- Interaksi ---------- */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); H && H.toast('Disalin'); }
    catch (_) { H && H.toast('Tidak bisa menyalin otomatis.', true); }
  }

  // true kalau klik ini milik kartu Nexa
  function click(e) {
    const b = e.target.closest('[data-nx]');
    if (!b) return false;
    const a = b.dataset.nx;
    if (a === 'reveal') { b.closest('.nx-fig').classList.remove('blur'); b.remove(); }
    else if (a === 'copy') copy(b.dataset.v || '');
    else if (a === 'act') runAction(b);
    return true;
  }

  async function runAction(b) {
    const slot = b.closest('.nx-it').querySelector('.nx-slot');
    const old = b.textContent;
    b.disabled = true; b.textContent = 'Memuat…';
    try {
      const j = await H.api('/api/nexa/run', { method: 'POST', body: { id: b.dataset.tool, params: { [b.dataset.param]: b.dataset.v } } });
      const it = j.result.items && j.result.items[0];
      if (!it || !it.audio) throw new Error('Audio tidak ditemukan untuk item ini.');
      slot.innerHTML = `<audio class="nx-au" src="${esc(it.audio)}" controls autoplay></audio>`;
    } catch (ex) { H.toast(ex.message, true); }
    b.disabled = false; b.textContent = old;
  }

  // Kalau gambar gagal dimuat, coba sebagai video, dan sebaliknya
  function onMediaError(e) {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('nx-m') || t.dataset.tried) return;
    const next = document.createElement(t.tagName === 'IMG' ? 'video' : 'img');
    next.className = 'nx-m'; next.dataset.tried = '1'; next.src = t.getAttribute('src');
    if (next.tagName === 'VIDEO') { next.controls = true; next.playsInline = true; next.loop = true; }
    t.replaceWith(next);
  }

  /* ---------- Halaman Tools ---------- */
  const fieldHtml = (p, i) => {
    const id = `nx_${i}_${p.k}`;
    const input = p.long
      ? `<textarea class="field" id="${id}" name="${esc(p.k)}" rows="3" placeholder="${esc(p.ph || '')}" autocomplete="off"></textarea>`
      : `<input class="field" id="${id}" name="${esc(p.k)}" placeholder="${esc(p.ph || '')}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    return `<div><label class="lbl" for="${id}">${esc(p.label)}</label>${input}</div>`;
  };

  function cardHtml(t, i) {
    const none = !t.params.length;
    return `<article class="nx-card" data-id="${esc(t.id)}" data-g="${esc(t.group)}">
      <header class="nx-h2"><span class="nx-ico">${ICON[t.group] || ICON.Cari}</span><div><h3>${esc(t.title)}</h3><span class="tag">${esc(t.group)}</span></div></header>
      <p class="desc">${esc(t.desc)}</p>
      <form class="nx-form" autocomplete="off">
        ${t.params.map((p) => fieldHtml(p, i)).join('')}
        <div class="nx-row"><button type="submit" class="btn primary">${none ? 'Ambil sekarang' : 'Jalankan'}</button>${none ? '' : '<button type="button" class="btn small" data-nx-ex>Isi contoh</button>'}</div>
      </form>
      <div class="nx-out" aria-live="polite"></div>
    </article>`;
  }

  async function mountTools(el) {
    el.innerHTML = `<h1 class="page-title">Tools</h1>
      <p class="page-sub">Alat dari NexaDev API. Isi kolom di kartu, tekan Jalankan, dan hasilnya tampil di bawahnya.</p>
      <div class="seg nx-seg" id="nxSeg" role="tablist"></div>
      <div class="nx-grid" id="nxGrid"><div class="skel"></div><div class="skel"></div></div>`;
    let cat;
    try { cat = CAT || (CAT = await H.api('/api/nexa/catalog')); }
    catch (e) { $('#nxGrid', el).innerHTML = `<p class="muted">Katalog tidak bisa dimuat: ${esc(e.message)}</p>`; return; }
    const groups = ['Semua', ...new Set(cat.tools.map((t) => t.group))];
    const seg = $('#nxSeg', el), grid = $('#nxGrid', el);
    seg.innerHTML = groups.map((g, k) => `<button type="button" role="tab" aria-selected="${k === 0}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
    grid.innerHTML = cat.tools.map(cardHtml).join('');
    const byId = Object.fromEntries(cat.tools.map((t) => [t.id, t]));

    seg.onclick = (e) => {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      grid.querySelectorAll('.nx-card').forEach((c) => { c.hidden = b.dataset.g !== 'Semua' && c.dataset.g !== b.dataset.g; });
    };

    grid.addEventListener('click', (e) => {
      if (click(e)) return;
      const ex = e.target.closest('[data-nx-ex]');
      if (!ex) return;
      const card = ex.closest('.nx-card');
      byId[card.dataset.id].params.forEach((p) => { const f = card.querySelector(`[name="${p.k}"]`); if (f) f.value = p.ph || ''; });
    });

    grid.addEventListener('submit', async (e) => {
      e.preventDefault();
      const card = e.target.closest('.nx-card'), t = byId[card.dataset.id], out = $('.nx-out', card), btn = $('button[type=submit]', card);
      const params = {};
      t.params.forEach((p) => { params[p.k] = (card.querySelector(`[name="${p.k}"]`) || {}).value || ''; });
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = 'Menunggu Nexa…';
      out.innerHTML = '<div class="skel nx-wait"></div>';
      try {
        const j = await H.api('/api/nexa/run', { method: 'POST', body: { id: t.id, params } });
        out.innerHTML = resultHtml(j.result, t.itemAction);
      } catch (ex) { out.innerHTML = `<p class="amsg err">${esc(ex.message)}</p>`; }
      btn.disabled = false; btn.textContent = old;
    });
  }

  /* ---------- Nexa AI: fitur tanya jawab (bukan model di tab AI) ---------- */
  const NX = { engine: null, threads: {} }; // riwayat tiap mesin disimpan selama halaman terbuka
  let nxBusy = null;

  async function mountChat(el, opts = {}) {
    el.innerHTML = `${opts.embed ? '<p class="muted small">Fitur tanya jawab lewat NexaDev API. Tanpa API key. Jawaban muncul sekaligus, tidak bisa membaca gambar.</p>' : '<h1 class="page-title">Nexa AI</h1><p class="page-sub">Tanya jawab lewat NexaDev API. Tanpa API key. Jawaban muncul sekaligus, tidak bisa membaca gambar.</p>'}
      <div class="seg nx-seg" id="nxaSeg" role="tablist" aria-label="Pilih mesin"></div>
      <p class="muted small" id="nxaInfo"></p>
      <div class="nxa-thread" id="nxaThread" aria-live="polite"></div>
      <form class="nxa-form" id="nxaForm" autocomplete="off">
        <textarea class="field" id="nxaIn" rows="2" placeholder="Tulis pertanyaan…" enterkeyhint="send"></textarea>
        <div class="nx-row"><button type="submit" class="btn primary" id="nxaGo">Kirim</button><button type="button" class="btn small" id="nxaNew">Percakapan baru</button></div>
      </form>`;
    let cat;
    try { cat = CAT || (CAT = await H.api('/api/nexa/catalog')); }
    catch (e) { $('#nxaThread', el).innerHTML = `<p class="muted">Katalog tidak bisa dimuat: ${esc(e.message)}</p>`; return; }
    const models = cat.models;
    if (!NX.engine || !models.some((m) => m.id === NX.engine)) NX.engine = models[0].id;
    const seg = $('#nxaSeg', el), info = $('#nxaInfo', el), thread = $('#nxaThread', el), ta = $('#nxaIn', el), go = $('#nxaGo', el);
    const cur = () => models.find((m) => m.id === NX.engine);
    const msgs = () => (NX.threads[NX.engine] = NX.threads[NX.engine] || []);
    const render = () => {
      seg.innerHTML = models.map((m) => `<button type="button" role="tab" aria-selected="${m.id === NX.engine}" data-e="${esc(m.id)}">${esc(m.name)}</button>`).join('');
      const m = cur();
      info.innerHTML = `${esc(m.desc)}${m.tip ? ` <span class="nxa-tip">${esc(m.tip)}</span>` : ''}`;
      const list = msgs();
      thread.innerHTML = list.length ? list.map((x) => x.role === 'user'
        ? `<div class="nxa-msg me"><p>${esc(x.content)}</p></div>`
        : `<div class="nxa-msg ai${x.err ? ' err' : ''}">${x.err ? `<p>${esc(x.err)}</p>` : `<div class="md">${window.ZZMD ? window.ZZMD.render(x.content) : `<p>${esc(x.content)}</p>`}</div>
            <div class="nx-acts"><button type="button" class="btn small" data-nx="copy" data-v="${esc(x.content)}">Salin</button></div>`}</div>`).join('')
        + (nxBusy === NX.engine ? '<div class="nxa-msg ai"><div class="skel nx-wait" style="height:64px"></div></div>' : '')
        : '<p class="muted nxa-empty">Belum ada percakapan. Pilih mesin di atas lalu tulis pertanyaanmu.</p>';
      go.disabled = nxBusy === NX.engine;
      go.textContent = nxBusy === NX.engine ? 'Menunggu Nexa…' : 'Kirim';
      if (list.length && thread.lastElementChild) thread.lastElementChild.scrollIntoView({ block: 'nearest' });
    };
    seg.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) { NX.engine = b.dataset.e; render(); } };
    thread.addEventListener('click', (e) => { click(e); });
    $('#nxaNew', el).onclick = () => { NX.threads[NX.engine] = []; render(); ta.focus(); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(min-width:900px)').matches) { e.preventDefault(); $('#nxaForm', el).requestSubmit(); } });
    $('#nxaForm', el).onsubmit = async (e) => {
      e.preventDefault();
      const q = ta.value.trim(), id = NX.engine;
      if (!q || nxBusy) return;
      const list = msgs();
      list.push({ role: 'user', content: q });
      ta.value = '';
      nxBusy = id; render();
      try {
        const hist = list.filter((m) => !m.err).map((m) => ({ role: m.role, content: m.content }));
        const j = await H.api('/api/ai/nexa', { method: 'POST', body: { model: id, messages: [{ role: 'system', content: 'id' }].concat(hist) } });
        list.push({ role: 'assistant', content: j.text });
      } catch (ex) { list.push({ role: 'assistant', err: ex.message, content: '' }); }
      nxBusy = null;
      if (document.body.contains(thread)) render();
    };
    render();
  }

  function init(helpers) { H = helpers; }
  document.addEventListener('error', onMediaError, true);
  window.ZZNexa = { init, mountTools, mountChat, cardsHtml, resultHtml, click };
})();
