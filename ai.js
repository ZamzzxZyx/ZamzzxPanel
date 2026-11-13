const fs = require('fs');
const path = require('path');
const { CATALOG, BY_ID, inferred, inferKind } = require('./ai-models');
const nexa = require('./nexa');

const GROQ = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'; // GROQ_BASE_URL hanya untuk pengujian

module.exports = function registerAI({ app, express, wrap, needHeader }) {
  // Baca .env setiap dipakai supaya GROQ_API_KEY baru langsung terbaca tanpa restart.
  function key() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
    try {
      const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*GROQ_API_KEY\s*=\s*(.*?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
    return '';
  }
  const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
  const needKey = () => { const k = key(); if (!k) fail('GROQ_API_KEY belum diisi di file .env.', 503); return k; };

  function groqError(status, j, headers) {
    const raw = (j && j.error && j.error.message) || 'Groq menolak permintaan.';
    if (status === 401) return 'API key Groq ditolak. Cek GROQ_API_KEY di file .env.';
    if (status === 429) {
      const wait = headers && headers.get && headers.get('retry-after');
      return `Batas penggunaan Groq tercapai.${wait ? ` Coba lagi sekitar ${wait} detik lagi.` : ' Tunggu sebentar lalu coba lagi.'} (${raw})`;
    }
    if (status === 413) return 'Permintaan terlalu besar untuk model ini. Kurangi lampiran atau mulai chat baru.';
    return raw;
  }

  /* ---------- Status dan daftar model ---------- */
  app.get('/api/ai/status', (req, res) => res.json({ ready: Boolean(key()) }));

  let cache = { at: 0, live: null };
  async function liveModels(force) {
    if (!force && cache.live && Date.now() - cache.at < 10 * 60 * 1000) return cache.live;
    const r = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${needKey()}` } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !Array.isArray(j.data)) fail(groqError(r.status, j, r.headers), r.status === 401 ? 401 : 502);
    cache = { at: Date.now(), live: j.data };
    return cache.live;
  }

  app.get('/api/ai/models', wrap(async (req, res) => {
    const ready = Boolean(key());
    let live = null, note = '';
    if (ready) {
      try { live = await liveModels(req.query.refresh === '1'); }
      catch (e) { note = e.message; }
    }
    let models;
    if (live) {
      const seen = new Set();
      models = [];
      for (const item of live) {
        if (item.active === false) continue;
        seen.add(item.id);
        const base = BY_ID[item.id] || inferred(item);
        models.push({ ...base, ctx: item.context_window || base.ctx, out: item.max_completion_tokens || base.out, available: true });
      }
      // Model yang ada di katalog tapi tidak dikembalikan API untuk key ini
      for (const m of CATALOG) if (!seen.has(m.id) && m.tier !== 'legacy') models.push({ ...m, available: false });
    } else {
      models = CATALOG.filter((m) => m.tier !== 'legacy').map((m) => ({ ...m, available: ready ? null : false }));
    }
    models.sort((a, b) => (a.pick || 9) - (b.pick || 9) || a.name.localeCompare(b.name));
    res.json({ ready, groq: ready, live: Boolean(live), note, models });
  }));

  /* ---------- Chat (streaming) ---------- */
  const bigJson = express.json({ limit: '12mb' });
  const ROLES = new Set(['system', 'user', 'assistant']);

  function cleanMessages(list) {
    if (!Array.isArray(list) || !list.length || list.length > 300) fail('Pesan tidak valid.');
    return list.map((m) => {
      if (!m || !ROLES.has(m.role)) fail('Peran pesan tidak valid.');
      if (typeof m.content === 'string') return { role: m.role, content: m.content };
      if (Array.isArray(m.content) && m.role === 'user') {
        const parts = m.content.map((p) => {
          if (p && p.type === 'text' && typeof p.text === 'string') return { type: 'text', text: p.text };
          if (p && p.type === 'image_url' && p.image_url && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(p.image_url.url || '')) {
            return { type: 'image_url', image_url: { url: p.image_url.url } };
          }
          return fail('Isi pesan tidak valid.');
        });
        return { role: m.role, content: parts };
      }
      return fail('Isi pesan tidak valid.');
    });
  }

  const EFFORTS = {
    gptoss: ['low', 'medium', 'high'],
    qwen: ['none', 'default', 'low', 'medium', 'high'],
    muse: ['low', 'medium', 'high', 'xhigh'],
  };

  function buildPayload(b) {
    const model = String(b.model || '');
    if (!/^[\w.\-/:]{2,100}$/.test(model)) fail('Nama model tidak valid.');
    const p = { model, messages: cleanMessages(b.messages), stream: true };
    if (typeof b.temperature === 'number' && b.temperature >= 0 && b.temperature <= 2) p.temperature = b.temperature;
    const mt = Number(b.max_tokens);
    if (Number.isInteger(mt) && mt >= 1 && mt <= 131072) p.max_completion_tokens = mt;
    const cap = (BY_ID[model] || {}).reasoning;
    if (cap && EFFORTS[cap] && EFFORTS[cap].includes(b.effort)) {
      p.reasoning_effort = b.effort;
      if (cap === 'qwen' && ['low', 'medium', 'high'].includes(b.effort)) p.reasoning_format = 'parsed';
    }
    return p;
  }

  const SSE = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' };

  const TOOL_GUIDE = `\n\nKamu punya alat (tools): web_search untuk info terbaru, youtube_search, get_lyrics, send_anime_image, make_text_image, search_sound_effect, search_memes, dan search_images. Pakai alat hanya kalau pengguna jelas memintanya (cari di web, kirim gambar, lirik, dan sejenisnya) atau butuh info yang mungkin sudah berubah. Gambar atau video hasil alat otomatis tampil di chat, jadi jangan menulis ulang URL-nya. Untuk pertanyaan coding biasa, jawab langsung tanpa alat.`;

  function canTools(model) {
    if (/^groq\//.test(model)) return false;
    const m = BY_ID[model];
    return m ? m.kind === 'chat' && m.tools !== false : inferKind(model) === 'chat';
  }

  // Jalankan putaran tool calling. Mengembalikan false kalau model tidak mendukung tools (pemanggil lanjut ke mode biasa).
  async function agent(res, payload, k, ac) {
    const messages = payload.messages.map((m) => ({ ...m }));
    if (messages[0] && messages[0].role === 'system' && typeof messages[0].content === 'string') messages[0].content += TOOL_GUIDE;
    else messages.unshift({ role: 'system', content: TOOL_GUIDE.trim() });
    const base = { ...payload };
    delete base.stream;
    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    let started = false, ka = null;
    const send = (o) => {
      if (!started) { started = true; res.writeHead(200, SSE); ka = setInterval(() => res.write(': ping\n\n'), 8000); }
      res.write(`data: ${JSON.stringify(o)}\n\n`);
    };
    try {
      for (let round = 0; round < 5; round++) {
        const body = { ...base, messages, stream: false };
        if (round < 4) { body.tools = nexa.AI_TOOLS; body.tool_choice = 'auto'; }
        const up = await fetch(`${GROQ}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
        const j = await up.json().catch(() => null);
        if (!up.ok) {
          if (round === 0 && up.status === 400) return false;
          const msg = groqError(up.status, j, up.headers);
          if (!started) { res.status(up.status === 401 ? 502 : up.status).json({ error: msg }); return true; }
          send({ error: { message: msg } });
          res.end();
          return true;
        }
        const ch = (j.choices && j.choices[0]) || {};
        const msg = ch.message || {};
        if (j.usage) { usage.prompt_tokens += j.usage.prompt_tokens || 0; usage.completion_tokens += j.usage.completion_tokens || 0; }
        const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (calls.length && round < 4) {
          messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
          for (let i = 0; i < calls.length; i++) {
            const tc = calls[i];
            if (ac.signal.aborted) return true;
            if (i >= 3) { messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Dilewati: terlalu banyak panggilan sekaligus.' }); continue; }
            let a = {};
            try { a = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch (_) {}
            const name = tc.function && tc.function.name;
            send({ zz: { type: 'status', text: nexa.STATUS[name] || 'Menjalankan alat…' } });
            const r = await nexa.runAiTool(name, a);
            if (r.card) send({ zz: { type: 'card', card: r.card } });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: r.forModel });
          }
          continue;
        }
        const rs = msg.reasoning || msg.reasoning_content;
        if (rs) send({ choices: [{ delta: { reasoning: rs } }] });
        send({ choices: [{ delta: { content: msg.content || '' }, finish_reason: ch.finish_reason || 'stop' }], usage });
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return true;
      if (!started) { res.status(502).json({ error: 'Tidak bisa terhubung ke Groq. Cek koneksi server.' }); return true; }
      send({ error: { message: 'Koneksi terputus saat menjalankan alat.' } });
      res.end();
      return true;
    } finally { if (ka) clearInterval(ka); }
  }

  app.post('/api/ai/chat', needHeader, bigJson, async (req, res) => {
    let payload, k;
    try { k = needKey(); payload = buildPayload(req.body || {}); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    if (req.body.tools === true && canTools(payload.model)) {
      if (await agent(res, payload, k, ac)) return;
    }
    try {
      const up = await fetch(`${GROQ}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!up.ok) {
        const j = await up.json().catch(() => null);
        return res.status(up.status === 401 ? 502 : up.status).json({ error: groqError(up.status, j, up.headers) });
      }
      res.writeHead(200, SSE);
      for await (const chunk of up.body) res.write(chunk);
      res.end();
    } catch (e) {
      if (ac.signal.aborted) return;
      if (!res.headersSent) return res.status(502).json({ error: 'Tidak bisa terhubung ke Groq. Cek koneksi server.' });
      res.write(`data: ${JSON.stringify({ error: { message: 'Koneksi ke Groq terputus.' } })}\n\n`);
      res.end();
    }
  });

  /* ---------- Judul otomatis ---------- */
  app.post('/api/ai/title', needHeader, express.json({ limit: '60kb' }), wrap(async (req, res) => {
    const text = String((req.body && req.body.text) || '').slice(0, 1500);
    if (!text.trim()) fail('Teks kosong.');
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${needKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', temperature: 0.3, max_completion_tokens: 24,
        messages: [
          { role: 'system', content: 'Buat judul singkat (maksimal 5 kata) untuk percakapan coding berikut. Pakai bahasa yang sama dengan pengguna. Balas hanya judulnya, tanpa tanda kutip dan tanpa titik.' },
          { role: 'user', content: text },
        ],
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) fail(groqError(r.status, j, r.headers), 502);
    const title = String(j.choices?.[0]?.message?.content || '').replace(/["'`*#\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    res.json({ title });
  }));

  /* ---------- Suara ke teks (mic) ---------- */
  app.post('/api/ai/transcribe', needHeader, express.raw({ type: () => true, limit: '25mb' }), wrap(async (req, res) => {
    const k = needKey();
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail('Rekaman kosong.');
    const ct = (req.get('content-type') || 'audio/webm').split(';')[0];
    const ext = ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' })[ct] || 'webm';
    const fd = new FormData();
    fd.append('file', new Blob([req.body], { type: ct }), `suara.${ext}`);
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    const lang = String(req.query.lang || '');
    if (/^[a-z]{2}$/.test(lang)) fd.append('language', lang);
    const r = await fetch(`${GROQ}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${k}` }, body: fd });
    const j = await r.json().catch(() => null);
    if (!r.ok) fail(groqError(r.status, j, r.headers), 502);
    res.json({ text: String(j.text || '').trim() });
  }));

  /* ---------- Riwayat chat (disimpan di server, data/ai) ---------- */
  const DIR = path.join(__dirname, 'data', 'ai');
  const INDEX = path.join(DIR, 'index.json');
  const ID = /^[a-z0-9]{6,32}$/;
  const readIndex = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch (_) { return {}; } };
  const writeJson = (file, data) => {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  };
  const chatFile = (id) => path.join(DIR, `${id}.json`);
  const idOf = (req) => { if (!ID.test(req.params.id)) fail('ID chat tidak valid.'); return req.params.id; };
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  function cleanChat(b) {
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-400) : [];
    return {
      title: str(b.title, 120) || 'Chat baru',
      model: str(b.model, 100),
      mode: str(b.mode, 40),
      pinned: Boolean(b.pinned),
      messages: msgs.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).map((m) => ({
        role: m.role,
        content: str(m.content, 600000),
        display: typeof m.display === 'string' ? str(m.display, 60000) : undefined,
        reasoning: m.reasoning ? str(m.reasoning, 200000) : undefined,
        files: Array.isArray(m.files) ? m.files.slice(0, 10).map((f) => str(f, 120)) : undefined,
        imgs: Number.isInteger(m.imgs) ? m.imgs : undefined,
        model: m.model ? str(m.model, 100) : undefined,
        usage: m.usage && typeof m.usage === 'object'
          ? { p: Number(m.usage.p) || 0, c: Number(m.usage.c) || 0, ms: Number(m.usage.ms) || 0, think: Number(m.usage.think) || 0 }
          : undefined,
        finish: m.finish ? str(m.finish, 20) : undefined,
        err: m.err ? str(m.err, 400) : undefined,
        cards: Array.isArray(m.cards) ? m.cards.slice(0, 8).map(nexa.sanitizeCard).filter(Boolean) : undefined,
      })),
    };
  }

  app.get('/api/ai/chats', wrap(async (req, res) => {
    const idx = readIndex();
    const list = Object.entries(idx).map(([id, m]) => ({ id, ...m }));
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ chats: list });
  }));

  app.get('/api/ai/chats/:id', wrap(async (req, res) => {
    const id = idOf(req);
    try { res.json({ id, ...JSON.parse(fs.readFileSync(chatFile(id), 'utf8')) }); }
    catch (_) { fail('Chat tidak ditemukan.', 404); }
  }));

  app.put('/api/ai/chats/:id', needHeader, express.json({ limit: '10mb' }), wrap(async (req, res) => {
    const id = idOf(req);
    const chat = cleanChat(req.body || {});
    const idx = readIndex();
    if (!idx[id] && Object.keys(idx).length >= 500) fail('Terlalu banyak chat tersimpan. Hapus beberapa dulu.');
    const updatedAt = Date.now();
    writeJson(chatFile(id), { ...chat, updatedAt });
    idx[id] = { title: chat.title, model: chat.model, pinned: chat.pinned, updatedAt, count: chat.messages.length };
    writeJson(INDEX, idx);
    res.json({ ok: true, updatedAt });
  }));

  app.delete('/api/ai/chats/:id', needHeader, wrap(async (req, res) => {
    const id = idOf(req);
    const idx = readIndex();
    delete idx[id];
    writeJson(INDEX, idx);
    try { fs.unlinkSync(chatFile(id)); } catch (_) {}
    res.json({ ok: true });
  }));
};
