/* Halaman AI: chat coding agent berbasis Groq. Dimuat sebelum app.js. */
(() => {
  'use strict';
  const { esc, hl, render: mdRender } = window.ZZMD;
  const $ = (s, el = document) => el.querySelector(s);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const ic = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    menu: ic('<path d="M4 7h16M4 12h10M4 17h16"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    send: ic('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    stop: ic('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'),
    attach: ic('<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7"/>'),
    mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    sliders: ic('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    chev: ic('<path d="M6 9l6 6 6-6"/>'),
    copy: ic('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    redo: ic('<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/>'),
    pencil: ic('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>'),
    trash: ic('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
    pin: ic('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>'),
    dl: ic('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
    play: ic('<path d="M8 5l11 7-11 7z"/>'),
    speak: ic('<path d="M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6"/>'),
    x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: ic('<path d="M5 12l5 5 9-10"/>'),
    down: ic('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    file: ic('<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>'),
    more: ic('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
    search: ic('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'),
    eye: ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),
  };

  let H = null; // pembantu dari app.js: api, toast, confirmDialog

  /* ---------- Mode agent ---------- */
  const BASE = `Kamu adalah asisten coding tingkat senior yang bekerja seperti agent coding di dalam panel pribadi pengguna.
Aturan kerja:
1. Balas dalam bahasa yang dipakai pengguna (default bahasa Indonesia). Istilah teknis boleh tetap Inggris.
2. Langsung ke solusi. Penjelasan singkat dan padat, bukan esai.
3. Kode harus lengkap dan bisa dijalankan. Jangan memotong dengan "..." kecuali pengguna meminta ringkasan.
4. Selalu beri label bahasa pada blok kode. Untuk setiap file, tulis path file dengan huruf tebal di baris tepat sebelum blok kodenya, contoh: **src/app.js**.
5. Untuk mengubah file yang sudah ada, tampilkan bagian yang berubah beserta konteks secukupnya, kecuali pengguna minta file penuh.
6. Kalau permintaan ambigu dan jawabannya akan sangat berbeda, ajukan satu pertanyaan singkat. Selain itu pilih asumsi yang wajar dan sebutkan asumsinya.
7. Sebut risiko yang relevan (keamanan, data hilang, breaking change) secara singkat.
8. Jangan mengarang API, library, atau versi. Kalau tidak yakin, katakan.`;

  const MODES = [
    { id: 'coder', name: 'Coder', desc: 'Menulis fitur dan kode lengkap', temp: 0.3,
      p: 'Mode: Coder. Tulis kode produksi yang bersih, aman, dan mudah dirawat. Setelah kode, beri cara menjalankan atau mengujinya dalam beberapa baris.' },
    { id: 'debug', name: 'Debugger', desc: 'Cari akar masalah dari error', temp: 0.2,
      p: 'Mode: Debugger. Mulai dengan dugaan penyebab paling mungkin berdasarkan error dan kode yang diberikan, lalu langkah memastikannya, lalu perbaikan. Kalau informasi kurang, minta log atau potongan kode yang spesifik. Jelaskan kenapa bug itu terjadi, bukan hanya cara memperbaikinya.' },
    { id: 'review', name: 'Code reviewer', desc: 'Review bug, keamanan, performa', temp: 0.2,
      p: 'Mode: Code reviewer. Periksa kode dan urutkan temuan dari yang paling parah: bug, celah keamanan, performa, keterbacaan. Untuk tiap temuan tulis lokasinya, masalahnya, dan perbaikannya. Akhiri dengan ringkasan singkat. Jangan memuji berlebihan.' },
    { id: 'architect', name: 'Arsitek', desc: 'Desain sistem dan struktur proyek', temp: 0.4,
      p: 'Mode: Arsitek. Bandingkan 2 sampai 3 pendekatan dengan trade-off yang konkret, lalu rekomendasikan satu dan alasannya. Sertakan struktur folder, alur data, dan langkah implementasi bertahap. Hindari over-engineering.' },
    { id: 'refactor', name: 'Refactor', desc: 'Rapikan kode tanpa ubah perilaku', temp: 0.2,
      p: 'Mode: Refactor. Rapikan kode tanpa mengubah perilakunya. Jelaskan perubahan utama dalam daftar pendek dan tandai kalau ada perubahan perilaku yang tidak bisa dihindari.' },
    { id: 'test', name: 'Penulis tes', desc: 'Unit test dan kasus tepi', temp: 0.2,
      p: 'Mode: Penulis tes. Tulis tes yang meliputi jalur normal, kasus tepi, dan kegagalan. Pakai framework yang sudah dipakai pengguna; kalau tidak diketahui, tanyakan atau pilih yang paling umum untuk bahasanya.' },
    { id: 'tutor', name: 'Pengajar', desc: 'Jelaskan konsep dengan contoh', temp: 0.5,
      p: 'Mode: Pengajar. Jelaskan dari dasar dengan contoh kecil yang bisa dijalankan. Pakai analogi hanya kalau memang membantu. Akhiri dengan satu latihan singkat.' },
    { id: 'devops', name: 'DevOps & shell', desc: 'Shell, Docker, CI, server', temp: 0.2,
      p: 'Mode: DevOps. Beri perintah yang siap dipakai dan jelaskan efeknya. Beri peringatan jelas sebelum perintah yang menghapus data atau mengubah sistem. Pertimbangkan lingkungan pengguna (Termux/Android, Linux, atau VPS) bila disebut.' },
    { id: 'sql', name: 'SQL & data', desc: 'Query, skema, dan optimasi', temp: 0.2,
      p: 'Mode: SQL dan data. Tulis query yang benar dan efisien, sebutkan dialek yang dipakai, dan jelaskan index atau skema yang dibutuhkan. Tandai query yang berisiko (UPDATE/DELETE tanpa WHERE).' },
    { id: 'chat', name: 'Umum', desc: 'Obrolan biasa, tanpa gaya coding', temp: 0.7,
      p: 'Mode: Umum. Jawab seperti asisten serba guna yang ramah dan to the point. Format kode hanya dipakai kalau memang ada kode.' },
  ];

  const STARTERS = [
    ['Buat REST API', 'Buat REST API Express dengan login JWT, validasi input, dan struktur folder yang rapi.'],
    ['Perbaiki error', 'Jelaskan error ini dan perbaiki kodenya:\n\n'],
    ['Review kode', 'Review kode ini. Cari bug, celah keamanan, dan saran refactor:\n\n'],
    ['Cari di web', 'Cari di web: versi terbaru Node.js LTS dan fitur barunya.'],
    ['Kirim gambar', 'Buatkan gambar brat dengan teks "halo nexa".'],
    ['Landing page', 'Buat landing page satu file HTML dengan CSS biasa, tema gelap, responsif, dan siap dipratinjau.'],
  ];

  /* ---------- State ---------- */
  const defaults = { model: '', mode: 'coder', temp: null, maxTok: 0, effort: '', custom: '' };
  const S = {
    set: { ...defaults, ...LS.get('zz.ai.set', {}) },
    models: null, ready: true, groq: true, live: false, note: '',
    chats: null, cur: null, att: [], rec: null,
  };
  let ui = null;
  const layers = new Set();

  const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  const newChat = () => ({ id: newId(), title: 'Chat baru', messages: [], pinned: false, saved: false });
  const saveSet = () => LS.set('zz.ai.set', S.set);
  const mode = () => MODES.find((m) => m.id === S.set.mode) || MODES[0];
  const chatModels = () => (S.models || []).filter((m) => m.kind === 'chat');
  const usable = (m) => m.available !== false;

  function curModel() {
    const list = chatModels();
    let m = list.find((x) => x.id === S.set.model && usable(x));
    if (!m) m = list.find(usable) || list[0];
    return m || null;
  }

  const EFFORTS = {
    gptoss: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
    qwen: [['none', 'None'], ['default', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
    muse: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'XHigh']],
  };
  const EFFORT_DEFAULT = { gptoss: 'medium', qwen: 'default', muse: 'medium' };
  function effortFor(m) {
    if (!m || !m.reasoning) return null;
    const ok = EFFORTS[m.reasoning].map((e) => e[0]);
    return ok.includes(S.set.effort) ? S.set.effort : EFFORT_DEFAULT[m.reasoning];
  }
  const temperature = () => (typeof S.set.temp === 'number' ? S.set.temp : mode().temp);
  function maxTokens(m) {
    const want = S.set.maxTok || 8192;
    const cap = (m && m.out) || 131072;
    return Math.min(want, cap);
  }

  const fmtK = (n) => (!n ? '-' : n >= 1024 && n % 1024 === 0 ? `${n / 1024}K` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
  const short = (id) => (S.models || []).find((m) => m.id === id)?.name || String(id || '').split('/').pop();

  /* ---------- Lapisan (sheet dan drawer) ---------- */
  function openLayer(kind, title, bodyHtml, onMount) {
    const w = document.createElement('div');
    w.className = `layer ${kind}`;
    w.innerHTML = `<div class="layer-back" data-x></div>
      <section class="layer-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="layer-h"><h2>${esc(title)}</h2><button type="button" class="ico" data-x aria-label="Tutup">${I.x}</button></header>
        <div class="layer-b">${bodyHtml}</div>
      </section>`;
    document.body.appendChild(w);
    const prev = document.activeElement;
    const close = () => { w.classList.add('out'); setTimeout(() => w.remove(), 180); layers.delete(w); if (prev && prev.focus) prev.focus(); };
    w.close = close;
    w.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) close(); });
    layers.add(w);
    if (onMount) onMount(w, close);
    requestAnimationFrame(() => { w.classList.add('in'); const b = $('.layer-h button', w); if (b) b.focus({ preventScroll: true }); });
    return w;
  }
  const closeLayers = () => { layers.forEach((w) => w.remove()); layers.clear(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layers.size) { [...layers].pop().close(); }
  });

  /* ---------- Render pesan ---------- */
  const EXT = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', shell: 'sh', yaml: 'yml', rust: 'rs', markdown: 'md', kotlin: 'kt', csharp: 'cs', 'c++': 'cpp', text: 'txt', '': 'txt' };
  const RUN = /^(html|htm|svg|js|javascript)$/;

  function codeBlock(f) {
    const lang = f.lang || '';
    return `<div class="code"><div class="code-h"><span class="lang">${esc(lang || 'teks')}</span><span class="grow"></span>${
      RUN.test(lang) ? `<button type="button" data-a="run">${I.play}<span>Pratinjau</span></button>` : ''
    }<button type="button" data-a="copy">${I.copy}<span>Salin</span></button><button type="button" data-a="dl">${I.dl}<span>Unduh</span></button></div><pre><code>${hl(f.code, lang)}</code></pre></div>`;
  }

  function splitThink(m) {
    let think = m.reasoning || '';
    let ans = m.content || '';
    let open = false;
    const mm = ans.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
    if (mm) { think += mm[1]; ans = ans.slice(mm[0].length); open = !mm[2]; }
    return { think: think.trim(), ans, open };
  }

  const plain = (md) => md.replace(/```[\s\S]*?(```|$)/g, ' (blok kode) ').replace(/[`*#>_~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  function userHtml(m, i) {
    const text = m.display != null ? m.display : m.content;
    const files = (m.files || []).map((n) => `<span class="fchip">${I.file}${esc(n)}</span>`).join('');
    const imgs = (m.images || []).map((u) => `<img class="uimg" src="${u}" alt="Lampiran gambar">`).join('') ||
      (m.imgs ? `<span class="fchip">${m.imgs} gambar</span>` : '');
    return `<article class="msg user" data-i="${i}">
      <div class="bubble">${files || imgs ? `<div class="u-att">${imgs}${files}</div>` : ''}${text ? `<div class="u-text">${esc(text)}</div>` : ''}</div>
      <div class="acts"><button type="button" data-a="umcopy" aria-label="Salin pesan">${I.copy}</button><button type="button" data-a="edit" aria-label="Edit pesan">${I.pencil}</button></div></article>`;
  }

  function asstHtml(m, i, chat) {
    const last = i === chat.messages.length - 1;
    const streaming = last && chat.busy;
    const { think, ans, open } = splitThink(m);
    let html = '';
    if (think) {
      const secs = m.usage && m.usage.think ? ` · ${(m.usage.think / 1000).toFixed(1)} dtk` : '';
      html += `<details class="think"${streaming && !ans || open ? ' open' : ''}><summary>${streaming && !ans ? 'Sedang berpikir…' : 'Proses berpikir'}${secs}</summary><div class="think-b">${mdRender(think, { fence: codeBlock })}</div></details>`;
    }
    if (ans) html += `<div class="md">${mdRender(ans, { fence: codeBlock })}</div>`;
    else if (streaming && !think && !m.status) html += '<div class="dots" aria-label="Menunggu jawaban"><i></i><i></i><i></i></div>';
    if (m.cards && m.cards.length && window.ZZNexa) html += window.ZZNexa.cardsHtml(m.cards);
    if (streaming && m.status) html += `<p class="amsg muted nx-status"><span class="dots"><i></i><i></i><i></i></span>${esc(m.status)}</p>`;
    if (m.err) html += `<p class="amsg err">${esc(m.err)}</p>`;
    else if (!streaming && !ans && !think && !(m.cards && m.cards.length)) html += '<p class="amsg muted">Model tidak mengirim jawaban. Coba ulangi atau pilih model lain.</p>';
    if (m.finish === 'length') html += `<p class="amsg warn">Jawaban terpotong karena mencapai batas token. <button type="button" class="lnk" data-a="cont">Lanjutkan</button></p>`;
    if (m.finish === 'stopped') html += '<p class="amsg muted">Dihentikan.</p>';
    let foot = '';
    if (!streaming) {
      const u = m.usage;
      const meta = [m.model ? short(m.model) : '', u && u.c ? `${u.c} token` : '', u && u.c && u.ms ? `${(u.c / (u.ms / 1000)).toFixed(0)} tok/dtk` : ''].filter(Boolean).join(' · ');
      foot = `<div class="afoot"><div class="acts"><button type="button" data-a="copy-all" aria-label="Salin jawaban">${I.copy}</button>
        <button type="button" data-a="speak" aria-label="Bacakan">${I.speak}</button>${last ? `<button type="button" data-a="regen" aria-label="Buat ulang jawaban">${I.redo}</button>` : ''}</div>
        <span class="ameta">${esc(meta)}</span></div>`;
    }
    return `<article class="msg asst${streaming ? ' live' : ''}" data-i="${i}">${html}${foot}</article>`;
  }

  function emptyHtml() {
    const m = curModel();
    if (!S.ready) {
      return `<div class="empty-ai"><h2>Hubungkan Groq dulu</h2>
        <p class="muted">Isi <code>GROQ_API_KEY</code> di file <code>.env</code> server. Panel membacanya ulang otomatis, tidak perlu restart.</p>
        <ol class="steps"><li>Buka <b>console.groq.com/keys</b> lalu buat API key.</li><li>Tambahkan baris <code>GROQ_API_KEY=gsk_...</code> ke <code>.env</code>.</li><li>Kembali ke sini dan muat ulang halaman.</li></ol>
        <button type="button" class="btn small" data-a="models">Lihat daftar model</button></div>`;
    }
    return `<div class="empty-ai"><h2>Mau bangun apa hari ini?</h2>
      <p class="muted">${m ? `${esc(m.name)} · mode ${esc(mode().name)}` : 'Memuat model…'}</p>
      <ul class="starters">${STARTERS.map((s, k) => `<li><button type="button" data-start="${k}"><b>${esc(s[0])}</b><span>${esc(s[1].trim().slice(0, 70))}${s[1].trim().length > 70 ? '…' : ''}</span></button></li>`).join('')}</ul></div>`;
  }

  function renderAll() {
    if (!ui || !ui.root.isConnected) return;
    const chat = S.cur;
    ui.msgs.innerHTML = chat.messages.length
      ? chat.messages.map((m, i) => (m.role === 'user' ? userHtml(m, i) : asstHtml(m, i, chat))).join('')
      : emptyHtml();
    syncChrome();
    stick(true);
  }

  let raf = 0;
  function renderLast() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!ui || !ui.root.isConnected) return;
      const chat = S.cur;
      const i = chat.messages.length - 1;
      const el = $(`.msg[data-i="${i}"]`, ui.msgs);
      if (!el || chat.messages[i].role !== 'assistant') return renderAll();
      const tmp = document.createElement('div');
      tmp.innerHTML = asstHtml(chat.messages[i], i, chat);
      el.replaceWith(tmp.firstElementChild);
      stick(false);
    });
  }

  function stick(force) {
    const s = ui.scroll;
    const near = s.scrollHeight - s.scrollTop - s.clientHeight < 140;
    if (force || (near && !ui.userScrolled)) s.scrollTop = s.scrollHeight;
    ui.jump.hidden = s.scrollHeight - s.scrollTop - s.clientHeight < 200;
  }

  function syncChrome() {
    if (!ui || !ui.root.isConnected) return;
    const m = curModel();
    const chat = S.cur;
    $('.mc-name', ui.root).textContent = m ? m.name : 'Pilih model';
    $('.mc-sub', ui.root).textContent = m ? [m.tier === 'preview' ? 'Preview' : m.tier === 'legacy' ? 'Lama' : '', fmtK(m.ctx) !== '-' ? `${fmtK(m.ctx)} konteks` : ''].filter(Boolean).join(' · ') : '';
    $('#aiMode', ui.root).textContent = mode().name;
    const send = $('#aiSend', ui.root);
    send.innerHTML = chat.busy ? I.stop : I.send;
    send.classList.toggle('stop', Boolean(chat.busy));
    send.setAttribute('aria-label', chat.busy ? 'Hentikan' : 'Kirim');
    ui.title.textContent = chat.messages.length ? chat.title : '';
    renderChips();
  }

  /* ---------- Lampiran ---------- */
  const TEXT_EXT = /\.(txt|md|markdown|js|mjs|cjs|jsx|ts|tsx|json|jsonc|py|html?|css|scss|sass|less|sh|bash|zsh|sql|ya?ml|toml|ini|env|java|kt|kts|go|rs|php|rb|c|h|cpp|hpp|cs|swift|xml|csv|log|vue|svelte|gradle|properties|dockerfile|gitignore|lock|conf|diff|patch|r|lua|dart)$/i;
  const MAX_TEXT = 200 * 1024;

  function readText(file) {
    return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsText(file); });
  }
  async function imageData(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
  }

  async function addFiles(list) {
    for (const f of [...list]) {
      if (S.att.length >= 8) { H.toast('Maksimal 8 lampiran per pesan.', true); break; }
      try {
        if (f.type.startsWith('image/')) {
          if (S.att.filter((a) => a.kind === 'image').length >= 4) { H.toast('Maksimal 4 gambar per pesan.', true); continue; }
          S.att.push({ kind: 'image', name: f.name || 'gambar', url: await imageData(f) });
        } else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name) || /^(Dockerfile|Makefile)$/i.test(f.name)) {
          if (f.size > MAX_TEXT) { H.toast(`${f.name} lebih dari 200 KB. Tempel bagian yang penting saja.`, true); continue; }
          const text = await readText(f);
          if (text.includes('\u0000')) { H.toast(`${f.name} bukan file teks.`, true); continue; }
          S.att.push({ kind: 'text', name: f.name, text });
        } else H.toast(`${f.name}: jenis file belum didukung. Pakai file teks, kode, atau gambar.`, true);
      } catch (_) { H.toast(`Gagal membaca ${f.name}.`, true); }
    }
    renderChips();
  }

  function renderChips() {
    if (!ui || !ui.root.isConnected) return;
    const box = $('#aiChips', ui.root);
    box.hidden = !S.att.length;
    box.innerHTML = S.att.map((a, i) => `<span class="fchip">${a.kind === 'image' ? `<img src="${a.url}" alt="">` : I.file}<span>${esc(a.name)}</span><button type="button" data-rm="${i}" aria-label="Hapus lampiran">${I.x}</button></span>`).join('');
  }

  /* ---------- Kirim dan stream ---------- */
  function systemPrompt() {
    let s = `${BASE}\n\n${mode().p}`;
    if (S.set.custom.trim()) s += `\n\nInstruksi tambahan dari pengguna:\n${S.set.custom.trim()}`;
    s += `\n\nTanggal hari ini: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}.`;
    return s;
  }

  function buildMessages(chat, model) {
    const hist = chat.messages.filter((m) => m.content || m.images);
    const budget = Math.floor(((model && model.ctx) || 32768) * 0.7 * 3.2) - maxTokens(model) * 3 - systemPrompt().length;
    let used = 0, from = hist.length;
    for (let i = hist.length - 1; i >= 0; i--) {
      used += (hist[i].content || '').length + (hist[i].images ? hist[i].images.length * 1500 : 0);
      if (used > budget && i < hist.length - 1) break;
      from = i;
    }
    if (from > 0) ui && ui.trimmed !== chat.id && (ui.trimmed = chat.id, H.toast('Chat panjang: pesan paling lama tidak ikut dikirim ke model.'));
    return [{ role: 'system', content: systemPrompt() }].concat(hist.slice(from).map((m) => {
      if (m.role === 'user' && m.images && m.images.length) {
        return { role: 'user', content: [{ type: 'text', text: m.content || 'Lihat gambar ini.' }].concat(m.images.map((u) => ({ type: 'image_url', image_url: { url: u } }))) };
      }
      return { role: m.role, content: m.content };
    }));
  }

  async function run(chat) {
    const model = curModel();
    if (!model) return H.toast('Belum ada model yang bisa dipakai.', true);
    const payload = {
      model: model.id,
      messages: buildMessages(chat, model),
      temperature: temperature(),
      max_tokens: maxTokens(model),
    };
    const eff = effortFor(model);
    if (eff) payload.effort = eff;
    if (S.set.tools !== false && model.tools !== false) payload.tools = true;

    const am = { role: 'assistant', content: '', reasoning: '', model: model.id };
    chat.messages.push(am);
    chat.busy = true;
    chat.ctrl = new AbortController();
    if (S.cur === chat) { ui.userScrolled = false; renderAll(); }
    const t0 = performance.now();
    let tAns = 0, usage = null;
    try {
      const r = await fetch('/api/ai/chat', { method: 'POST', headers: { 'X-Panel': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: chat.ctrl.signal });
      if (r.status === 401) { location.href = '/login'; return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Permintaan gagal.'); }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let ix;
        while ((ix = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, ix);
          buf = buf.slice(ix + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            let j;
            try { j = JSON.parse(d); } catch (_) { continue; }
            if (j.error) throw new Error(j.error.message || 'Groq mengirim error.');
            if (j.zz) {
              if (j.zz.type === 'card' && j.zz.card) (am.cards = am.cards || []).push(j.zz.card);
              else if (j.zz.type === 'status') am.status = j.zz.text;
              if (S.cur === chat) renderLast();
              continue;
            }
            const ch = j.choices && j.choices[0];
            const dl = (ch && ch.delta) || {};
            const rs = dl.reasoning != null ? dl.reasoning : dl.reasoning_content;
            if (rs) am.reasoning += rs;
            if (dl.content) { if (!tAns) tAns = performance.now(); am.content += dl.content; am.status = ''; }
            if (ch && ch.finish_reason) am.finish = ch.finish_reason;
            const u = (j.x_groq && j.x_groq.usage) || j.usage;
            if (u) usage = u;
          }
        }
        if (S.cur === chat) renderLast();
      }
    } catch (e) {
      if (e.name === 'AbortError') am.finish = 'stopped';
      else am.err = e.message || 'Terjadi kesalahan.';
    } finally {
      delete am.status;
      const ms = performance.now() - t0;
      const genMs = tAns ? performance.now() - tAns : ms;
      am.usage = {
        p: (usage && usage.prompt_tokens) || 0,
        c: (usage && usage.completion_tokens) || Math.round((am.content.length + am.reasoning.length) / 3.5),
        ms: Math.round(usage && usage.completion_time ? usage.completion_time * 1000 : genMs),
        think: am.reasoning && tAns ? Math.round(tAns - t0) : 0,
      };
      if (am.finish === 'stop') delete am.finish;
      chat.busy = false;
      chat.ctrl = null;
      if (!am.content && !am.reasoning && am.err) { /* tetap simpan pesan error agar bisa diulang */ }
      if (S.cur === chat) renderAll();
      await persist(chat);
      if (!chat.titled && chat.messages.length >= 2 && !am.err) refineTitle(chat);
    }
  }

  async function persist(chat) {
    if (!chat.messages.length) return;
    const body = {
      title: chat.title, model: S.set.model, mode: S.set.mode, pinned: chat.pinned,
      messages: chat.messages.filter((m) => m.content || m.reasoning || m.err || (m.cards && m.cards.length)).map((m) => ({
        role: m.role, content: m.content, display: m.display, reasoning: m.reasoning || undefined, files: m.files, cards: m.cards,
        imgs: m.images ? m.images.length : m.imgs, model: m.model, usage: m.usage, finish: m.finish, err: m.err,
      })),
    };
    try {
      await H.api('/api/ai/chats/' + chat.id, { method: 'PUT', body });
      chat.saved = true;
      const meta = { id: chat.id, title: chat.title, pinned: chat.pinned, updatedAt: Date.now(), count: body.messages.length, model: body.model };
      S.chats = [meta].concat((S.chats || []).filter((c) => c.id !== chat.id));
    } catch (e) { H.toast('Chat belum tersimpan: ' + e.message, true); }
  }

  async function refineTitle(chat) {
    chat.titled = true;
    const first = chat.messages.find((m) => m.role === 'user');
    if (!first) return;
    try {
      const j = await H.api('/api/ai/title', { method: 'POST', body: { text: first.display != null ? first.display : first.content } });
      if (j.title) { chat.title = j.title; syncChrome(); persist(chat); }
    } catch (_) { /* judul sementara tetap dipakai */ }
  }

  function submit() {
    const chat = S.cur;
    if (chat.busy) return;
    const ta = $('#aiIn', ui.root);
    const text = ta.value.trim();
    if (!text && !S.att.length) return;
    const model = curModel();
    if (model && !S.groq) return H.toast('GROQ_API_KEY belum diisi di file .env.', true);
    const imgs = S.att.filter((a) => a.kind === 'image');
    if (imgs.length && model && model.vision === false) {
      return H.toast(`${model.name} tidak bisa membaca gambar. Hapus gambarnya atau ganti model.`, true);
    }
    const texts = S.att.filter((a) => a.kind === 'text');
    let content = text;
    for (const f of texts) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      content += `${content ? '\n\n' : ''}File: ${f.name}\n\`\`\`${ext}\n${f.text}\n\`\`\``;
    }
    const um = { role: 'user', content, display: text };
    if (texts.length) um.files = texts.map((f) => f.name);
    if (imgs.length) um.images = imgs.map((a) => a.url);
    chat.messages.push(um);
    if (chat.messages.length === 1) chat.title = (text || texts[0]?.name || 'Chat baru').replace(/\s+/g, ' ').slice(0, 48);
    ta.value = ''; ta.style.height = 'auto';
    S.att = [];
    run(chat);
  }

  function stop() { const c = S.cur; if (c.ctrl) c.ctrl.abort(); }

  function regenerate() {
    const chat = S.cur;
    if (chat.busy) return;
    while (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'assistant') chat.messages.pop();
    if (!chat.messages.length) return renderAll();
    run(chat);
  }

  function editMessage(i) {
    const chat = S.cur;
    if (chat.busy) return;
    const m = chat.messages[i];
    if (!m || m.role !== 'user') return;
    const hadAtt = (m.files && m.files.length) || (m.images && m.images.length) || m.imgs;
    const ta = $('#aiIn', ui.root);
    ta.value = m.display != null ? m.display : m.content;
    chat.messages = chat.messages.slice(0, i);
    if (!chat.messages.length) chat.title = 'Chat baru';
    renderAll();
    grow(ta);
    ta.focus();
    if (hadAtt) H.toast('Lampiran pesan ini perlu ditambahkan lagi.');
  }

  function continueReply() {
    const chat = S.cur;
    if (chat.busy) return;
    chat.messages.push({ role: 'user', content: 'Lanjutkan persis dari kata terakhir yang terpotong, tanpa mengulang bagian sebelumnya.', display: 'Lanjutkan' });
    run(chat);
  }

  /* ---------- Aksi pada pesan dan kode ---------- */
  async function copyText(t, ok) {
    try { await navigator.clipboard.writeText(t); H.toast(ok || 'Disalin'); }
    catch (_) {
      const a = document.createElement('textarea');
      a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); H.toast(ok || 'Disalin'); } catch (__) { H.toast('Tidak bisa menyalin.', true); }
      a.remove();
    }
  }
  function saveFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function guessName(codeEl) {
    const lang = ($('.lang', codeEl).textContent || '').toLowerCase();
    const prev = codeEl.previousElementSibling;
    const t = prev ? prev.textContent.trim() : '';
    const m = t.match(/([\w@.\-/]+\.[A-Za-z0-9]{1,8})\s*:?\s*$/);
    if (m && !/\s/.test(m[1])) return m[1].split('/').pop();
    return `kode.${EXT[lang] || lang || 'txt'}`;
  }

  function preview(code, lang) {
    let doc = code;
    if (/^(js|javascript)$/.test(lang)) {
      const js = JSON.stringify(code).replace(/</g, '\\u003c');
      doc = `<!doctype html><meta charset="utf-8"><body style="margin:12px;font:13px/1.5 ui-monospace,monospace;background:#0b0d12;color:#e6eaf2"><pre id="o" style="white-space:pre-wrap;margin:0"></pre><script>
const o=document.getElementById('o');const w=(...a)=>{o.textContent+=a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')+'\\n'};
console.log=console.info=console.warn=console.error=w;addEventListener('error',e=>w('Error: '+e.message));addEventListener('unhandledrejection',e=>w('Error: '+(e.reason&&e.reason.message||e.reason)));
(async()=>{try{await new (Object.getPrototypeOf(async function(){}).constructor)(${js})()}catch(e){w('Error: '+e.message)}})();
<\/script>`;
    } else if (/^svg$/.test(lang)) doc = `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}`;
    openLayer('sheet wide', 'Pratinjau', `<p class="muted small">Berjalan di kotak terisolasi tanpa akses ke panel atau cookie.</p>
      <iframe class="pv" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Pratinjau kode"></iframe>`, (w) => { $('.pv', w).srcdoc = doc; });
  }

  function onMsgClick(e) {
    if (window.ZZNexa && window.ZZNexa.click(e)) return;
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const msg = b.closest('.msg');
    const i = msg ? +msg.dataset.i : -1;
    const chat = S.cur;
    if (a === 'copy' || a === 'dl' || a === 'run') {
      const box = b.closest('.code');
      const code = $('pre', box).textContent;
      const lang = ($('.lang', box).textContent || '').toLowerCase();
      if (a === 'copy') copyText(code, 'Kode disalin');
      else if (a === 'dl') saveFile(guessName(box), code);
      else preview(code, lang);
    } else if (a === 'copy-all') copyText(chat.messages[i].content, 'Jawaban disalin');
    else if (a === 'umcopy') copyText(chat.messages[i].display != null ? chat.messages[i].display : chat.messages[i].content, 'Pesan disalin');
    else if (a === 'edit') editMessage(i);
    else if (a === 'regen') regenerate();
    else if (a === 'cont') continueReply();
    else if (a === 'models') openModels();
    else if (a === 'speak') {
      if (!('speechSynthesis' in window)) return H.toast('Browser ini tidak bisa membacakan teks.', true);
      if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
      const u = new SpeechSynthesisUtterance(plain(splitThink(chat.messages[i]).ans));
      u.lang = 'id-ID';
      speechSynthesis.speak(u);
    }
  }

  /* ---------- Mic (Whisper) ---------- */
  async function toggleMic() {
    const btn = $('#aiMic', ui.root);
    if (S.rec) { S.rec.stop(); return; }
    if (!S.ready) return H.toast('GROQ_API_KEY belum diisi di file .env.', true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return H.toast('Rekam suara butuh browser modern dan alamat HTTPS.', true);
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { return H.toast('Izin mikrofon ditolak. Aktifkan lewat pengaturan situs di browser.', true); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      S.rec = null;
      btn.classList.remove('rec');
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 1500) return H.toast('Rekaman terlalu pendek.');
      btn.disabled = true;
      H.toast('Mengubah suara jadi teks…');
      try {
        const j = await H.api('/api/ai/transcribe', { method: 'POST', rawBody: blob, rawType: blob.type });
        if (ui && ui.root.isConnected) {
          const ta = $('#aiIn', ui.root);
          ta.value = (ta.value ? ta.value + ' ' : '') + j.text;
          grow(ta); ta.focus();
        }
      } catch (e) { H.toast(e.message, true); }
      btn.disabled = false;
    };
    rec.start();
    S.rec = rec;
    btn.classList.add('rec');
    H.toast('Merekam… tekan mic lagi untuk selesai.');
  }

  /* ---------- Model ---------- */
  const meter = (n) => `<span class="meter" style="--n:${n || 0}" role="img" aria-label="${n || 0} dari 5"><i></i><i></i><i></i><i></i><i></i></span>`;
  const TIER = { production: ['Production', 'ok'], preview: ['Preview', 'warn'], legacy: ['Lama', 'err'] };
  const KIND_TABS = [['chat', 'Chat & kode'], ['stt', 'Suara ke teks'], ['tts', 'Teks ke suara'], ['safety', 'Keamanan'], ['nexa', 'Nexa']];
  const GUIDE = [
    ['Bug sulit atau arsitektur', 'openai/gpt-oss-120b'],
    ['Kode harian yang cepat', 'llama-3.3-70b-versatile'],
    ['Pekerjaan kecil berulang', 'llama-3.1-8b-instant'],
    ['Banyak file dalam satu chat', 'minimaxai/minimax-m2.7'],
  ];

  function modelCard(m) {
    const t = TIER[m.tier] || TIER.preview;
    const sel = m.kind === 'chat' && curModel() && curModel().id === m.id;
    const caps = [];
    if (m.reasoning) caps.push('Reasoning');
    if (m.vision === true) caps.push('Gambar');
    else if (m.vision === null && m.kind === 'chat') caps.push('Gambar: belum pasti');
    if (m.tools) caps.push('Tool use');
    if (m.search) caps.push('Cari web');
    const off = m.available === false;
    return `<article class="mcard${sel ? ' sel' : ''}${off ? ' off' : ''}" id="m-${esc(m.id.replace(/[^\w-]/g, '_'))}">
      <header><div><h3>${esc(m.name)}</h3><p class="mono id">${esc(m.id)}</p></div><span class="badge ${t[1]}"><i></i>${t[0]}</span></header>
      <p class="desc">${esc(m.desc)}</p>
      ${m.use && m.use.length ? `<h4>Cocok untuk</h4><ul class="use">${m.use.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
      <dl class="stats">
        <div><dt>Konteks</dt><dd class="mono">${fmtK(m.ctx)}</dd></div>
        <div><dt>Output maks</dt><dd class="mono">${fmtK(m.out)}</dd></div>
        <div><dt>Kecepatan</dt><dd>${meter(m.speed)}</dd></div>
        <div><dt>Kualitas</dt><dd>${meter(m.quality)}</dd></div>
      </dl>
      ${caps.length ? `<p class="caps">${caps.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</p>` : ''}
      ${m.tip ? `<p class="tip">${esc(m.tip)}</p>` : ''}
      ${off ? '<p class="amsg warn">Tidak muncul di API untuk key ini, jadi belum bisa dipakai.</p>' : ''}
      ${m.kind === 'chat' && !off ? `<button type="button" class="btn ${sel ? '' : 'primary'} small" data-use="${esc(m.id)}"${sel ? ' disabled' : ''}>${sel ? 'Sedang dipakai' : 'Pakai model ini'}</button>` : ''}
    </article>`;
  }

  function openModels(tab) {
    if (!S.models) return H.toast('Daftar model belum dimuat.', true);
    let cur = tab || 'chat';
    const body = () => {
      if (cur === 'nexa') return `<div class="seg" role="tablist">${KIND_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === cur}" data-tab="${k}">${l}</button>`).join('')}</div><div id="nexaHost" class="nxa-embed"></div>`;
      const list = S.models.filter((m) => (cur === 'tts' ? m.kind === 'tts' : m.kind === cur));
      const tabs = `<div class="seg" role="tablist">${KIND_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === cur}" data-tab="${k}">${l}</button>`).join('')}</div>`;
      const note = !S.ready ? '<p class="amsg warn">GROQ_API_KEY belum diisi, jadi model belum bisa dipakai. Tab Nexa tetap bisa dipakai tanpa key.</p>'
        : S.live ? '<p class="muted small">Daftar diambil langsung dari API Groq untuk key kamu.</p>'
          : `<p class="amsg warn">Tidak bisa mengambil daftar langsung dari Groq${S.note ? ` (${esc(S.note)})` : ''}. Menampilkan daftar bawaan panel.</p>`;
      const guide = cur === 'chat' ? `<div class="guide"><h4>Bingung pilih?</h4><ul>${GUIDE.map(([l, id]) => {
        const m = S.models.find((x) => x.id === id);
        return m && usable(m) ? `<li><span>${esc(l)}</span><button type="button" class="lnk" data-use="${esc(id)}">${esc(m.name)}</button></li>` : '';
      }).join('')}</ul></div>` : '';
      const hint = cur === 'chat' ? '' : `<p class="muted small">${cur === 'stt' ? 'Model suara dipakai tombol mic di kolom chat, tidak dipilih di sini.' : 'Model ini dipakai lewat API Groq dari aplikasimu, bukan dari halaman chat.'}</p>`;
      return `${tabs}${note}${hint}${guide}${list.length ? list.map(modelCard).join('') : '<p class="muted">Tidak ada model di kategori ini.</p>'}`;
    };
    openLayer('sheet wide', 'Model AI', body(), (w, close) => {
      const bodyEl = $('.layer-b', w);
      bodyEl.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) {
          cur = t.dataset.tab; bodyEl.innerHTML = body(); bodyEl.scrollTop = 0;
          if (cur === 'nexa' && window.ZZNexa) window.ZZNexa.mountChat($('#nexaHost', bodyEl), { embed: true });
          return;
        }
        const u = e.target.closest('[data-use]');
        if (u) {
          S.set.model = u.dataset.use;
          S.set.effort = '';
          saveSet(); syncChrome();
          const m = curModel();
          H.toast(`Model: ${m.name}`);
          close();
        }
      });
    });
  }

  /* ---------- Pengaturan ---------- */
  function openSettings() {
    const m = curModel();
    const eff = effortFor(m);
    const mt = [1024, 2048, 4096, 8192, 16384, 32768, 65536].filter((n) => !m || !m.out || n <= m.out);
    const body = `
      <h3 class="sh">Mode agent</h3>
      <div class="modes" role="radiogroup" aria-label="Mode agent">${MODES.map((x) => `<label class="mode"><input type="radio" name="md" value="${x.id}"${x.id === S.set.mode ? ' checked' : ''}><span><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></span></label>`).join('')}</div>
      <h3 class="sh">Instruksi tambahan</h3>
      <textarea class="field" id="sCustom" rows="3" maxlength="2000" placeholder="Contoh: Pakai TypeScript dan gaya fungsional. Proyekku jalan di Termux dengan Node 22.">${esc(S.set.custom)}</textarea>
      <h3 class="sh">Parameter</h3>
      <div class="rowf"><label for="sTemp">Kreativitas (temperature)</label><output id="oTemp" class="mono">${temperature()}</output></div>
      <input type="range" class="range" id="sTemp" min="0" max="2" step="0.1" value="${temperature()}">
      <p class="muted small">Rendah untuk kode yang tepat, tinggi untuk ide. Bawaan mode ${esc(mode().name)}: ${mode().temp}.</p>
      <div class="rowf"><label for="sMax">Panjang jawaban maksimal</label>
        <select class="field narrow" id="sMax">${mt.map((n) => `<option value="${n}"${maxTokens(m) === n ? ' selected' : ''}>${n.toLocaleString('id-ID')} token</option>`).join('')}</select></div>
      ${eff ? `<div class="rowf"><label for="sEff">Reasoning (seberapa lama berpikir)</label>
        <select class="field narrow" id="sEff">${EFFORTS[m.reasoning].map(([v, l]) => `<option value="${v}"${v === eff ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <p class="muted small">Makin tinggi makin teliti tapi makin lambat dan makin boros kuota.</p>` : `<p class="muted small">${m ? esc(m.name) : 'Model ini'} tidak punya pengaturan reasoning.</p>`}
      <h3 class="sh">Alat Nexa</h3>
      <label class="switch"><input type="checkbox" id="sTools"${S.set.tools !== false ? ' checked' : ''}><span>Izinkan AI mencari web dan mengirim gambar</span></label>
      <p class="muted small">Berlaku untuk model Groq yang mendukung tool use. Gambar, video, dan hasil pencarian tampil sebagai kartu di chat.</p>
      <h3 class="sh">Chat ini</h3>
      <div class="btnrow"><button type="button" class="btn small" id="sExp">${I.dl}Ekspor .md</button><button type="button" class="btn small danger" id="sClr">${I.trash}Kosongkan</button></div>`;
    openLayer('sheet', 'Pengaturan AI', body, (w, close) => {
      $('#sCustom', w).oninput = (e) => { S.set.custom = e.target.value; saveSet(); };
      w.querySelectorAll('input[name=md]').forEach((r) => { r.onchange = () => { S.set.mode = r.value; S.set.temp = null; saveSet(); syncChrome(); if (!S.cur.messages.length) renderAll(); $('#sTemp', w).value = temperature(); $('#oTemp', w).textContent = temperature(); }; });
      $('#sTemp', w).oninput = (e) => { S.set.temp = +e.target.value; $('#oTemp', w).textContent = e.target.value; saveSet(); };
      $('#sMax', w).onchange = (e) => { S.set.maxTok = +e.target.value; saveSet(); };
      $('#sTools', w).onchange = (e) => { S.set.tools = e.target.checked; saveSet(); };
      if ($('#sEff', w)) $('#sEff', w).onchange = (e) => { S.set.effort = e.target.value; saveSet(); };
      $('#sExp', w).onclick = () => exportChat();
      $('#sClr', w).onclick = async () => {
        close();
        if (!S.cur.messages.length) return;
        if (await H.confirmDialog('Kosongkan chat ini?', 'Semua pesan di chat ini dihapus dari riwayat.', 'Kosongkan')) {
          const id = S.cur.id;
          try { await H.api('/api/ai/chats/' + id, { method: 'DELETE' }); } catch (_) {}
          S.chats = (S.chats || []).filter((c) => c.id !== id);
          S.cur = newChat(); renderAll();
        }
      };
    });
  }

  function openModes() {
    openLayer('sheet', 'Mode agent', `<div class="modes" role="radiogroup">${MODES.map((x) => `<label class="mode"><input type="radio" name="md" value="${x.id}"${x.id === S.set.mode ? ' checked' : ''}><span><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></span></label>`).join('')}</div>`, (w, close) => {
      w.querySelectorAll('input[name=md]').forEach((r) => { r.onchange = () => { S.set.mode = r.value; S.set.temp = null; saveSet(); syncChrome(); if (!S.cur.messages.length) renderAll(); close(); }; });
    });
  }

  function exportChat() {
    const c = S.cur;
    if (!c.messages.length) return H.toast('Belum ada pesan untuk diekspor.');
    const md = `# ${c.title}\n\n` + c.messages.map((m) => (m.role === 'user' ? `## Kamu\n\n${m.display != null ? m.display : m.content}` : `## AI${m.model ? ` (${short(m.model)})` : ''}\n\n${m.content}`)).join('\n\n');
    saveFile(`${c.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'chat'}.md`, md, 'text/markdown');
  }

  /* ---------- Riwayat ---------- */
  function groupChats(list) {
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const g = { 'Disematkan': [], 'Hari ini': [], 'Kemarin': [], '7 hari terakhir': [], 'Lebih lama': [] };
    for (const c of list) {
      if (c.pinned) g['Disematkan'].push(c);
      else if (c.updatedAt >= day) g['Hari ini'].push(c);
      else if (c.updatedAt >= day - 86400000) g['Kemarin'].push(c);
      else if (c.updatedAt >= day - 7 * 86400000) g['7 hari terakhir'].push(c);
      else g['Lebih lama'].push(c);
    }
    return g;
  }

  function openHistory() {
    const drawList = (q) => {
      const f = (q || '').trim().toLowerCase();
      const list = (S.chats || []).filter((c) => !f || c.title.toLowerCase().includes(f));
      if (!list.length) return `<p class="muted pad">${f ? 'Tidak ada chat yang cocok.' : 'Belum ada riwayat. Chat yang kamu mulai akan tersimpan di sini.'}</p>`;
      const g = groupChats(list);
      return Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => `<h3 class="grp">${k}</h3><ul class="hl">${v.map((c) => `<li class="${c.id === S.cur.id ? 'cur' : ''}"><button type="button" class="hrow" data-open="${esc(c.id)}"><span>${esc(c.title)}</span></button><button type="button" class="ico sm" data-more="${esc(c.id)}" aria-label="Opsi chat">${I.more}</button></li>`).join('')}</ul>`).join('');
    };
    openLayer('drawer', 'Riwayat chat', `<button type="button" class="btn primary" id="hNew">${I.plus}Chat baru</button>
      <div class="sbox">${I.search}<input class="field" id="hQ" type="search" placeholder="Cari chat" aria-label="Cari chat"></div><div id="hList">${drawList('')}</div>`, (w, close) => {
      $('#hNew', w).onclick = () => { close(); startNew(); };
      $('#hQ', w).oninput = (e) => { $('#hList', w).innerHTML = drawList(e.target.value); };
      $('#hList', w).onclick = async (e) => {
        const o = e.target.closest('[data-open]');
        if (o) { close(); return loadChat(o.dataset.open); }
        const mo = e.target.closest('[data-more]');
        if (mo) chatMenu(mo.dataset.more, () => { $('#hList', w).innerHTML = drawList($('#hQ', w).value); });
      };
    });
  }

  function chatMenu(id, refresh) {
    const c = (S.chats || []).find((x) => x.id === id);
    if (!c) return;
    openLayer('sheet', c.title.slice(0, 40), `<div class="menu">
      <button type="button" data-m="pin">${I.pin}${c.pinned ? 'Lepas sematan' : 'Sematkan'}</button>
      <button type="button" data-m="ren">${I.pencil}Ganti nama</button>
      <button type="button" data-m="del" class="danger">${I.trash}Hapus</button></div>`, (w, close) => {
      w.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        close();
        if (b.dataset.m === 'pin') {
          const full = await fullChat(id); if (!full) return;
          full.pinned = !c.pinned; c.pinned = full.pinned;
          await persist(full); refresh();
        } else if (b.dataset.m === 'ren') {
          openLayer('sheet', 'Ganti nama chat', `<form id="rf" class="form-grid"><input class="field" id="rn" value="${esc(c.title)}" maxlength="80" aria-label="Nama chat"><button class="btn primary" type="submit">Simpan</button></form>`, (w2, close2) => {
            $('#rn', w2).select();
            $('#rf', w2).onsubmit = async (ev) => {
              ev.preventDefault();
              const t = $('#rn', w2).value.trim(); if (!t) return;
              close2();
              const full = await fullChat(id); if (!full) return;
              full.title = t; full.titled = true; c.title = t;
              if (S.cur.id === id) { S.cur.title = t; syncChrome(); }
              await persist(full); refresh();
            };
          });
        } else {
          if (!(await H.confirmDialog('Hapus chat ini?', `<b>${esc(c.title)}</b> dihapus permanen dari riwayat.`, 'Hapus'))) return;
          try { await H.api('/api/ai/chats/' + id, { method: 'DELETE' }); } catch (er) { return H.toast(er.message, true); }
          S.chats = S.chats.filter((x) => x.id !== id);
          if (S.cur.id === id) { S.cur = newChat(); renderAll(); }
          refresh();
        }
      });
    });
  }

  async function fullChat(id) {
    if (S.cur.id === id) return S.cur;
    try {
      const j = await H.api('/api/ai/chats/' + id);
      return { id, title: j.title, messages: j.messages || [], pinned: j.pinned, saved: true, titled: true };
    } catch (e) { H.toast(e.message, true); return null; }
  }

  async function loadChat(id) {
    if (S.cur.id === id) return;
    const c = await fullChat(id);
    if (!c) return;
    const j = (S.chats || []).find((x) => x.id === id);
    if (j) c.pinned = j.pinned;
    S.cur = c;
    ui.userScrolled = false;
    renderAll();
  }

  function startNew() {
    if (!S.cur.messages.length && !S.cur.busy) { renderAll(); $('#aiIn', ui.root).focus(); return; }
    S.cur = newChat();
    S.att = [];
    ui.userScrolled = false;
    renderAll();
    $('#aiIn', ui.root).focus();
  }

  /* ---------- Komposer ---------- */
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; }
  const coarse = () => window.matchMedia && matchMedia('(pointer:coarse)').matches;

  /* ---------- Mount ---------- */
  function mount(el, helpers) {
    H = helpers;
    el.innerHTML = `<section class="ai" id="ai">
      <header class="ai-top">
        <button type="button" class="ico" id="aiHist" aria-label="Riwayat chat">${I.menu}</button>
        <button type="button" class="modelchip" id="aiModel" aria-label="Pilih model"><span class="mc-name">Memuat…</span><span class="mc-sub"></span>${I.chev}</button>
        <button type="button" class="ico" id="aiNew" aria-label="Chat baru">${I.plus}</button>
      </header>
      <p class="ai-title" id="aiTitle"></p>
      <div class="ai-scroll" id="aiScroll"><div class="ai-msgs" id="aiMsgs"></div></div>
      <button type="button" class="jump" id="aiJump" hidden aria-label="Ke pesan terbaru">${I.down}</button>
      <form class="composer" id="aiForm">
        <div class="chips" id="aiChips" hidden></div>
        <label class="sr" for="aiIn">Pesan untuk AI</label>
        <textarea id="aiIn" rows="1" placeholder="Tanya, minta kode, atau tempel error" autocomplete="off" autocapitalize="sentences" spellcheck="false"></textarea>
        <div class="c-row">
          <button type="button" class="ico" id="aiAtt" aria-label="Lampirkan file atau gambar">${I.attach}</button>
          <button type="button" class="pill" id="aiMode" aria-label="Ganti mode agent">Coder</button>
          <button type="button" class="ico" id="aiSet" aria-label="Pengaturan AI">${I.sliders}</button>
          <span class="grow"></span>
          <button type="button" class="ico" id="aiMic" aria-label="Dikte dengan suara">${I.mic}</button>
          <button type="submit" class="send" id="aiSend" aria-label="Kirim">${I.send}</button>
        </div>
        <input type="file" id="aiFile" multiple hidden accept="image/*,text/*,.js,.mjs,.ts,.tsx,.jsx,.json,.py,.html,.css,.md,.sh,.sql,.yml,.yaml,.toml,.env,.java,.kt,.go,.rs,.php,.rb,.c,.h,.cpp,.cs,.swift,.xml,.csv,.log,.vue,.svelte,.gradle,.properties,.dart">
      </form></section>`;
    const root = $('#ai', el);
    ui = { root, msgs: $('#aiMsgs', el), scroll: $('#aiScroll', el), jump: $('#aiJump', el), title: $('#aiTitle', el), userScrolled: false, trimmed: null };
    if (!S.cur) S.cur = newChat();
    const ta = $('#aiIn', el);

    $('#aiHist', el).onclick = openHistory;
    $('#aiModel', el).onclick = () => openModels();
    $('#aiNew', el).onclick = startNew;
    $('#aiSet', el).onclick = openSettings;
    $('#aiMode', el).onclick = openModes;
    $('#aiAtt', el).onclick = () => $('#aiFile', el).click();
    $('#aiFile', el).onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
    $('#aiMic', el).onclick = toggleMic;
    $('#aiChips', el).onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) { S.att.splice(+r.dataset.rm, 1); renderChips(); } };
    $('#aiForm', el).onsubmit = (e) => { e.preventDefault(); if (S.cur.busy) stop(); else submit(); };
    ta.oninput = () => grow(ta);
    ta.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse()) { e.preventDefault(); if (!S.cur.busy) submit(); }
    };
    ta.onpaste = (e) => {
      const files = [...(e.clipboardData ? e.clipboardData.files : [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    // Sembunyikan navbar saat mengetik di HP supaya ruang ketik lega
    ta.onfocus = () => document.body.classList.add('kb-open');
    ta.onblur = () => setTimeout(() => document.body.classList.remove('kb-open'), 120);
    ['dragover', 'drop'].forEach((ev) => root.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }));
    ui.msgs.addEventListener('click', onMsgClick);
    ui.msgs.addEventListener('click', (e) => {
      const s = e.target.closest('[data-start]');
      if (s) { ta.value = STARTERS[+s.dataset.start][1]; grow(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    });
    ui.scroll.addEventListener('scroll', () => {
      const gap = ui.scroll.scrollHeight - ui.scroll.scrollTop - ui.scroll.clientHeight;
      ui.userScrolled = gap > 140;
      ui.jump.hidden = gap < 200;
    }, { passive: true });
    ui.jump.onclick = () => { ui.userScrolled = false; ui.scroll.scrollTo({ top: ui.scroll.scrollHeight, behavior: 'smooth' }); };

    renderAll();
    renderChips();
    if (!S.models) load();
    else if (!S.chats) loadChats();
  }

  async function load() {
    try {
      const j = await H.api('/api/ai/models');
      S.models = j.models; S.ready = j.ready; S.groq = j.groq !== undefined ? j.groq : j.ready; S.live = j.live; S.note = j.note || '';
    } catch (e) { S.models = []; S.ready = true; H.toast(e.message, true); }
    const m = curModel();
    if (m && m.id !== S.set.model) { S.set.model = m.id; saveSet(); }
    renderAll();
    loadChats();
  }

  async function loadChats() {
    try { S.chats = (await H.api('/api/ai/chats')).chats; } catch (_) { S.chats = []; }
  }

  function unmount() {
    closeLayers();
    document.body.classList.remove('kb-open');
    if (S.rec) { try { S.rec.stop(); } catch (_) {} }
    if (window.speechSynthesis) speechSynthesis.cancel();
    ui = null;
  }

  window.PanelAI = { mount, unmount, status: () => S.ready };
})();
