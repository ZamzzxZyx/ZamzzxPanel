// Integrasi NexaDev API: model AI (GET), tool gambar/video/pencarian, cache media, dan tool untuk AI.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOSTS = {
  api: process.env.NEXA_API_BASE || 'https://api.nexadev.my.id',
  apii: process.env.NEXA_APII_BASE || 'https://apii.nexadev.my.id', // NEXA_*_BASE hanya untuk pengujian
};

/* ---------- Model AI (semua lewat GET) ---------- */
const MODELS = [
  { id: 'felo', param: 'q', path: '/ai/felo', name: 'Felo (cari web)', speed: 3, quality: 4, pick: 20, search: true,
    desc: 'Mesin pencari berbasis AI. Menjawab dengan info dari web dan biasanya menyertakan sumber.',
    use: ['Berita dan info terbaru', 'Riset singkat dengan sumber', 'Cek fakta'],
    tip: 'Pakai ini kalau butuh info terkini. Jawabannya bergantung pada layanan Nexa.' },
  { id: 'gpt4', param: 'q', path: '/ai/gpt4', name: 'GPT-4', speed: 4, quality: 4, pick: 21,
    desc: 'Model GPT-4 lewat API Nexa. Cocok untuk tanya jawab dan penjelasan umum.',
    use: ['Penjelasan konsep', 'Menulis dan merangkum', 'Pertanyaan umum'], tip: 'Tanpa streaming: jawaban muncul sekaligus.' },
  { id: 'chatgptpro', param: 'q', path: '/ai/chatgptpro', name: 'ChatGPT Pro', speed: 3, quality: 4, pick: 22,
    desc: 'Layanan ChatGPT Pro lewat API Nexa.', use: ['Tanya jawab umum', 'Penjelasan teknis'], tip: 'Tanpa streaming.' },
  { id: 'deepsek', param: 'text', path: '/ai/deepsek', name: 'DeepSeek', speed: 3, quality: 4, pick: 23,
    desc: 'Model DeepSeek lewat API Nexa. Kuat untuk logika dan kode.', use: ['Coding', 'Soal logika'], tip: 'Tanpa streaming.' },
  { id: 'llama', param: 'q', path: '/ai/llama', name: 'Llama (Nexa)', speed: 4, quality: 3, pick: 24,
    desc: 'Model Llama lewat API Nexa. Ringan dan cepat.', use: ['Tanya jawab ringan', 'Ringkasan'], tip: 'Kadang gagal kalau layanan sumbernya sibuk.' },
  { id: 'cai', param: 'q', path: '/ai/cai', name: 'CAI (Nexa)', speed: 3, quality: 3, pick: 25,
    desc: 'Layanan CAI lewat API Nexa untuk obrolan santai.', use: ['Ngobrol santai'], tip: 'Bukan untuk coding.' },
];
const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

/* ---------- Tool (kartu di tab Lainnya, sebagian juga dipakai AI) ---------- */
const P = (k, label, ph, extra = {}) => ({ k, label, ph, req: true, ...extra });
const TOOLS = [
  // Gambar dan video
  { id: 'anime', group: 'Gambar', title: 'Anime acak', desc: 'Gambar anime acak setiap kali dijalankan.', host: 'api', path: '/api/random/anime', params: [], out: 'media', media: 'image' },
  { id: 'pap', group: 'Gambar', title: 'Pap acak', desc: 'Foto acak dari layanan Nexa. Isinya tidak kuketahui, jadi pratinjau diburamkan dulu.', host: 'api', path: '/api/random/pap', params: [], out: 'media', media: 'image', blur: true },
  { id: 'brat', group: 'Gambar', title: 'Brat', desc: 'Teks gaya album Brat (latar hijau).', host: 'api', path: '/api/canvas/brat', params: [P('text', 'Teks', 'halo nexa')], out: 'media', media: 'image' },
  { id: 'bratvid', group: 'Video', title: 'Brat video', desc: 'Teks Brat yang muncul kata demi kata.', host: 'api', path: '/api/canvas/bratvid', params: [P('text', 'Teks', 'halo nexa')], out: 'media', media: 'video' },
  { id: 'bratvid2', group: 'Video', title: 'Brat video 2', desc: 'Varian lain dari Brat video.', host: 'apii', path: '/bratvid2', params: [P('text', 'Teks', 'nexa nich')], out: 'media', media: 'video' },
  { id: 'bratpatrick', group: 'Gambar', title: 'Brat Patrick', desc: 'Teks gaya Brat dengan Patrick Star.', host: 'apii', path: '/bratpatrick', params: [P('text', 'Teks', 'hallo gua nexa')], out: 'media', media: 'image' },
  { id: 'bratpatrick_video', group: 'Video', title: 'Brat Patrick video', desc: 'Versi video dari Brat Patrick.', host: 'apii', path: '/bratpatrick/video', params: [P('text', 'Teks', 'hallo gua nexa')], out: 'media', media: 'video' },
  { id: 'iqc', group: 'Gambar', title: 'IQC', desc: 'Teks dalam kartu kutipan gaya chat iPhone.', host: 'api', path: '/api/canvas/iqc', params: [P('text', 'Teks', 'hasbunallah wa nikmal wakil', { long: true })], out: 'media', media: 'image' },
  { id: 'wmp1', group: 'Gambar', title: 'WMP 1', desc: 'Teks lirik gaya pemutar musik. Pisahkan baris dengan tanda |.', host: 'apii', path: '/wmp1', params: [P('text', 'Teks (pisahkan dengan |)', 'ngapain cemburu|kan|cuman sebatas|teman', { long: true })], out: 'media', media: 'image' },
  { id: 'wmp2', group: 'Gambar', title: 'WMP 2', desc: 'Varian kedua WMP. Pisahkan baris dengan tanda |.', host: 'apii', path: '/wmp2', params: [P('text', 'Teks (pisahkan dengan |)', 'ngapain cemburu|kan|cuman sebatas|teman', { long: true })], out: 'media', media: 'image' },
  { id: 'nokia', group: 'Gambar', title: 'Nokia', desc: 'Tampilan SMS ala ponsel Nokia.', host: 'apii', path: '/nokia',
    params: [P('text', 'Isi pesan', 'kata-kata hari ini', { long: true }), P('from', 'Pengirim', 'nexa'), P('date', 'Tanggal', '08/06/2026'), P('time', 'Jam', '12:00'), P('title', 'Judul', 'nexa')], out: 'media', media: 'image' },
  { id: 'ttqc', group: 'Gambar', title: 'TikTok quote card', desc: 'Kartu komentar ala TikTok dengan foto profil dari URL gambar.', host: 'apii', path: '/ttqc',
    params: [P('url', 'URL foto profil', 'https://.../foto.jpeg'), P('name', 'Nama', 'NexaDev'), P('text', 'Komentar', 'halo gua nexa', { long: true })], out: 'media', media: 'image' },
  { id: 'fakeffduo', group: 'Gambar', title: 'Fake FF duo', desc: 'Kartu lobi duo gaya Free Fire dengan dua nickname.', host: 'apii', path: '/fakeffduo', params: [P('nickname1', 'Nickname 1', 'Nexa'), P('nickname2', 'Nickname 2', 'Xy Pemula')], out: 'media', media: 'image' },
  { id: 'fakeff', group: 'Gambar', title: 'Fake FF', desc: 'Kartu profil gaya Free Fire dari satu username.', host: 'apii', path: '/fakeff', params: [P('usn', 'Username', 'NexaDev')], out: 'media', media: 'image' },
  // Pencarian dan info
  { id: 'ytsearch', group: 'Cari', title: 'Cari YouTube', desc: 'Cari video YouTube beserta durasi dan channel.', host: 'api', path: '/tools/ytsearch', params: [P('q', 'Kata kunci', 'karna kamu')], out: 'json' },
  { id: 'lyric', group: 'Cari', title: 'Lirik lagu', desc: 'Cari lirik dari judul lagu atau URL Genius.', host: 'api', path: '/api/lyric', params: [P('q', 'Judul atau URL Genius', 'alone')], out: 'json' },
  { id: 'lahelu', group: 'Cari', title: 'Lahelu', desc: 'Cari meme dan post dari Lahelu.', host: 'api', path: '/api/lahelu', params: [P('query', 'Kata kunci', 'sad')], out: 'json' },
  { id: 'soundeffect', group: 'Cari', title: 'Sound effect', desc: 'Cari efek suara dari MyInstants. Tekan Putar untuk mendengar.', host: 'api', path: '/api/soundeffect', params: [P('q', 'Kata kunci', 'sad')], out: 'json', itemAction: { label: 'Putar', tool: 'soundeffect_detail', param: 'url' } },
  { id: 'soundeffect_detail', hidden: true, group: 'Cari', title: 'Detail sound effect', desc: '', host: 'api', path: '/api/soundeffect/detail', params: [P('url', 'URL MyInstants', 'https://www.myinstants.com/...')], out: 'json' },
  { id: 'pin', group: 'Cari', title: 'Pinterest', desc: 'Cari gambar dari Pinterest.', host: 'api', path: '/api/pin', params: [P('q', 'Kata kunci', 'anime')], out: 'json' },
  { id: 'mcpdl', group: 'Cari', title: 'Minecraft addon', desc: 'Cari addon dan map Minecraft PE.', host: 'api', path: '/api/mcpdl/', params: [P('q', 'Kata kunci', 'lucky bloc')], out: 'json' },
  { id: 'stickerget', group: 'Cari', title: 'Ambil stiker', desc: 'Ambil isi paket stiker dari URL Sticker.ly.', host: 'api', path: '/api/stickerget', params: [P('url', 'URL Sticker.ly', 'https://sticker.ly/s/75AT76')], out: 'json' },
];
const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

/* ---------- Panggilan ke Nexa ---------- */
function cleanParams(tool, input) {
  const out = {};
  for (const p of tool.params) {
    let v = input && input[p.k] != null ? String(input[p.k]).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (p.k === 'url' && v && !/^https?:\/\/\S+$/i.test(v)) fail(`${p.label} harus berupa URL yang diawali http:// atau https://`);
    if (v.length > 1500) fail(`${p.label} terlalu panjang.`);
    if (!v && p.req) fail(`${p.label} wajib diisi.`);
    if (v) out[p.k] = v;
  }
  return out;
}

async function upstream(tool, params, timeoutMs = 50000) {
  const u = new URL(HOSTS[tool.host] + tool.path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let r;
  try {
    r = await fetch(u, { headers: { 'User-Agent': 'panel-panel', Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    fail(e.name === 'TimeoutError' ? 'Layanan Nexa terlalu lama merespons. Coba lagi.' : 'Tidak bisa terhubung ke layanan Nexa.', 502);
  }
  return r;
}

const envelopeError = (j) => {
  if (!j || typeof j !== 'object') return null;
  const bad = j.status === false || j.success === false || j.status === 'error';
  return bad ? String(j.message || j.error || 'Layanan Nexa mengembalikan error.') : null;
};

/* ---------- Normalisasi JSON agar bisa jadi kartu ---------- */
const IMG_EXT = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const VID_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const AUD_EXT = /\.(mp3|ogg|wav|m4a|opus)(\?|#|$)/i;
const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s);
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return String(o[k]); return ''; };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function itemOf(x) {
  if (typeof x === 'string') {
    if (isUrl(x)) return IMG_EXT.test(x) ? { image: x } : VID_EXT.test(x) ? { video: x } : AUD_EXT.test(x) ? { audio: x } : { title: x, link: x };
    return { title: clip(x, 300) };
  }
  if (!x || typeof x !== 'object') return { title: String(x) };
  const it = {};
  it.title = clip(pick(x, ['title', 'name', 'judul', 'songName', 'caption', 'text', 'message']), 200);
  it.sub = clip([pick(x, ['channel', 'artist', 'author', 'userUsername', 'username', 'duration', 'creator', 'category']), pick(x, ['description', 'desc', 'size', 'version'])].filter(Boolean).join(' · '), 240);
  const media = pick(x, ['media']);
  const thumb = pick(x, ['imageUrl', 'thumbnail', 'thumb', 'image', 'img', 'cover', 'mediaThumbnail', 'icon', 'preview']);
  const vid = pick(x, ['video', 'mp4']) || (VID_EXT.test(media) ? media : '');
  it.video = isUrl(vid) ? vid : '';
  it.audio = [pick(x, ['mp3', 'audio'])].find(isUrl) || '';
  it.image = [thumb, IMG_EXT.test(media) ? media : '', pick(x, ['url', 'link', 'src'])].find((s) => isUrl(s) && IMG_EXT.test(s)) || (isUrl(thumb) ? thumb : '');
  const link = pick(x, ['link', 'url', 'href', 'page', 'download', 'downloadUrl']);
  it.link = isUrl(link) ? link : '';
  const body = pick(x, ['lyrics', 'lyric', 'content', 'result']);
  if (body.length > 200) it.text = body.slice(0, 20000);
  return it;
}

function normalize(j) {
  const err = envelopeError(j);
  if (err) fail(err, 502);
  let p = j;
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    p = j.result != null ? j.result : j.data != null ? j.data : j;
  }
  if (typeof p === 'string') return { kind: 'text', text: p.slice(0, 20000) };
  if (Array.isArray(p)) return { kind: 'list', items: p.slice(0, 24).map(itemOf).filter((i) => Object.keys(i).length) };
  if (p && typeof p === 'object') {
    // objek dengan satu daftar utama (postInfos, results, stickers, ...)
    const arr = Object.entries(p).filter(([, v]) => Array.isArray(v) && v.length).sort((a, b) => b[1].length - a[1].length)[0];
    if (arr) return { kind: 'list', items: arr[1].slice(0, 24).map(itemOf).filter((i) => Object.keys(i).length), head: itemOf(Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v !== 'object'))) };
    const one = itemOf(p);
    if (one.text || one.title || one.image || one.video || one.audio) return { kind: 'list', items: [one] };
  }
  return { kind: 'raw' };
}

/* ---------- Cache media ---------- */
const CACHE = path.join(__dirname, 'data', 'nexa');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]));
const MAX_BYTES = 30 * 1024 * 1024;

function prune() {
  try {
    const files = fs.readdirSync(CACHE).map((f) => ({ f, st: fs.statSync(path.join(CACHE, f)) })).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    let total = 0;
    files.forEach((x, i) => { total += x.st.size; if (i >= 300 || total > 400 * 1024 * 1024) fs.rmSync(path.join(CACHE, x.f), { force: true }); });
  } catch (_) {}
}

function findMediaUrl(j) {
  let found = null;
  (function walk(v, d) {
    if (found || d > 4) return;
    if (typeof v === 'string') { if (isUrl(v) && (IMG_EXT.test(v) || VID_EXT.test(v))) found = v; return; }
    if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, d + 1));
  })(j, 0);
  return found;
}

// Jalankan tool bergambar/video. Hasilnya {kind:'media', media, src} yang stabil (disimpan di cache).
async function runMedia(tool, params) {
  const r = await upstream(tool, params);
  const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (ct.includes('json')) {
    const j = await r.json().catch(() => null);
    const err = envelopeError(j);
    if (err) fail(err, 502);
    const url = findMediaUrl(j);
    if (!url) fail('Layanan Nexa tidak mengirim gambar atau video.', 502);
    return { kind: 'media', media: VID_EXT.test(url) ? 'video' : 'image', src: url, external: true };
  }
  if (!r.ok) fail(`Layanan Nexa mengembalikan status ${r.status}.`, 502);
  const ext = TYPES[ct];
  if (!ext) fail(`Format ${ct || 'tak dikenal'} tidak didukung.`, 502);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_BYTES) fail('File dari Nexa terlalu besar.', 502);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) fail('File dari Nexa terlalu besar.', 502);
  if (!buf.length) fail('Layanan Nexa mengirim file kosong.', 502);
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, `${hash}.${ext}`), buf);
  prune();
  return { kind: 'media', media: ext === 'mp4' || ext === 'webm' ? 'video' : ext === 'mp3' ? 'audio' : 'image', src: `/api/nexa/file/${hash}.${ext}` };
}

async function runJson(tool, params) {
  const r = await upstream(tool, params);
  const j = await r.json().catch(() => null);
  if (!j) fail(`Layanan Nexa mengirim respons yang tidak bisa dibaca (status ${r.status}).`, 502);
  return normalize(j);
}

async function runTool(id, input) {
  const tool = TOOL_BY_ID[id];
  if (!tool) fail('Tool tidak ditemukan.', 404);
  const params = cleanParams(tool, input);
  const res = tool.out === 'media' ? await runMedia(tool, params) : await runJson(tool, params);
  if (tool.blur) res.blur = true;
  return { id, title: tool.title, args: params, ...res };
}

/* ---------- Teks dari model AI ---------- */
function textOf(j) {
  const err = envelopeError(j);
  if (err) fail(err, 502);
  const d = j && j.data;
  const cands = [d && d.message, d && d.response, d && d.text, d && d.answer, d && d.result, d && d.output, j && j.result, j && j.response, j && j.answer, j && j.text, j && j.message, typeof d === 'string' ? d : null];
  for (const c of cands) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (c && typeof c === 'object') {
      for (const k of ['text', 'message', 'answer', 'response', 'content', 'result']) if (typeof c[k] === 'string' && c[k].trim()) return c[k].trim();
    }
  }
  return '';
}

function sourcesOf(j) {
  const out = [];
  (function walk(v, d) {
    if (d > 4 || out.length >= 8) return;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x && typeof x === 'object' && isUrl(x.url || x.link)) out.push({ title: String(x.title || x.name || x.url || x.link).slice(0, 120), url: x.url || x.link });
        else walk(x, d + 1);
      }
    } else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (/source|reference|citation|link/i.test(k) || typeof x === 'object') walk(x, d + 1); });
  })(j, 0);
  const seen = new Set();
  return out.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 8);
}

async function askModel(id, prompt) {
  const m = MODEL_BY_ID[id];
  if (!m) fail('Model Nexa tidak ditemukan.', 404);
  const t0 = Date.now();
  const r = await upstream({ host: 'api', path: m.path }, { [m.param]: prompt.slice(0, 3200) }, 80000);
  const j = await r.json().catch(() => null);
  if (!j) fail(`Layanan Nexa mengirim respons yang tidak bisa dibaca (status ${r.status}).`, 502);
  let text = textOf(j);
  if (!text) fail('Layanan Nexa tidak mengirim jawaban. Coba lagi atau pilih model lain.', 502);
  const src = sourcesOf(j);
  if (m.search && src.length && !/https?:\/\//.test(text.slice(-400))) text += '\n\n**Sumber**\n' + src.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n');
  return { text, ms: Date.now() - t0 };
}

// Susun satu prompt dari riwayat chat (endpoint hanya menerima satu teks)
function promptFrom(messages) {
  const msgs = (Array.isArray(messages) ? messages : []).filter((m) => m && typeof m.content === 'string' && m.content.trim() && (m.role === 'user' || m.role === 'assistant'));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') fail('Pesan terakhir harus dari pengguna.');
  const last = msgs[msgs.length - 1].content.trim();
  const sys = (messages.find((m) => m && m.role === 'system') || {}).content;
  const hist = [];
  let used = last.length;
  for (let i = msgs.length - 2; i >= 0 && hist.length < 8; i--) {
    const line = `${msgs[i].role === 'user' ? 'Pengguna' : 'Asisten'}: ${msgs[i].content.trim().slice(0, 600)}`;
    if (used + line.length > 1800) break;
    used += line.length;
    hist.unshift(line);
  }
  const head = typeof sys === 'string' ? 'Jawab dalam bahasa Indonesia kecuali pengguna memakai bahasa lain.' : '';
  return [head, hist.length ? `Percakapan sebelumnya:\n${hist.join('\n')}` : '', hist.length ? `Pertanyaan sekarang: ${last}` : last].filter(Boolean).join('\n\n').slice(-3200);
}

/* ---------- Tool untuk AI (function calling) ---------- */
const STYLE_TO_TOOL = { brat: 'brat', brat_video: 'bratvid', brat_video2: 'bratvid2', brat_patrick: 'bratpatrick', brat_patrick_video: 'bratpatrick_video', iqc: 'iqc', wmp1: 'wmp1', wmp2: 'wmp2' };
const fn = (name, description, props, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required: required || [] } } });
const AI_TOOLS = [
  fn('web_search', 'Cari info terbaru di web dan kembalikan jawaban beserta sumbernya. Pakai untuk berita, fakta terkini, harga, rilis, atau apa pun yang mungkin sudah berubah.', { query: { type: 'string', description: 'Kata kunci atau pertanyaan pencarian' } }, ['query']),
  fn('youtube_search', 'Cari video YouTube.', { query: { type: 'string' } }, ['query']),
  fn('get_lyrics', 'Cari lirik lagu dari judul (atau URL Genius).', { query: { type: 'string' } }, ['query']),
  fn('send_anime_image', 'Kirim satu gambar anime acak ke pengguna. Gambarnya langsung tampil di chat.', {}),
  fn('make_text_image', 'Buat gambar atau video bergaya dari teks, lalu tampilkan di chat. style: brat, brat_video, brat_video2, brat_patrick, brat_patrick_video, iqc, wmp1, wmp2 (wmp: pisahkan baris dengan tanda |).', { style: { type: 'string', enum: Object.keys(STYLE_TO_TOOL) }, text: { type: 'string' } }, ['style', 'text']),
  fn('search_sound_effect', 'Cari efek suara. Hasilnya tampil sebagai daftar yang bisa diputar.', { query: { type: 'string' } }, ['query']),
  fn('search_memes', 'Cari meme atau post dari Lahelu.', { query: { type: 'string' } }, ['query']),
  fn('search_images', 'Cari gambar dari Pinterest dan tampilkan di chat.', { query: { type: 'string' } }, ['query']),
];

const briefList = (res, n = 6) => (res.items || []).slice(0, n).map((it, i) => `${i + 1}. ${[it.title, it.sub].filter(Boolean).join(' - ') || it.link || '(tanpa judul)'}${it.link ? ` <${it.link}>` : ''}`).join('\n');

const STATUS = { web_search: 'Mencari di web…', youtube_search: 'Mencari di YouTube…', get_lyrics: 'Mencari lirik…', send_anime_image: 'Mengambil gambar…', make_text_image: 'Membuat gambar…', search_sound_effect: 'Mencari efek suara…', search_memes: 'Mencari meme…', search_images: 'Mencari gambar…' };

// Tidak pernah melempar error: kegagalan dikembalikan sebagai teks agar model bisa menjelaskannya.
async function runAiTool(name, args) {
  args = args && typeof args === 'object' ? args : {};
  try {
    if (name === 'web_search') {
      const q = String(args.query || '').trim();
      if (!q) return { forModel: 'Kata kunci kosong.' };
      const a = await askModel('felo', q);
      return { forModel: a.text.slice(0, 6000) };
    }
    const map = {
      youtube_search: ['ytsearch', { q: args.query }], get_lyrics: ['lyric', { q: args.query }], send_anime_image: ['anime', {}],
      search_sound_effect: ['soundeffect', { q: args.query }], search_memes: ['lahelu', { query: args.query }], search_images: ['pin', { q: args.query }],
    };
    let id, input;
    if (name === 'make_text_image') {
      id = STYLE_TO_TOOL[args.style];
      if (!id) return { forModel: 'Style tidak dikenal.' };
      input = { text: args.text };
    } else if (map[name]) [id, input] = map[name];
    else return { forModel: `Tool ${name} tidak ada.` };
    const res = await runTool(id, input);
    const card = sanitizeCard(res);
    if (res.kind === 'media') return { card, forModel: 'Berhasil. Hasilnya sudah tampil langsung di chat untuk pengguna. Jangan menulis ulang URL-nya, cukup beri komentar singkat.' };
    if (res.kind === 'text') return { card, forModel: res.text.slice(0, 5000) };
    const body = briefList(res) + (res.items && res.items[0] && res.items[0].text ? '\n\n' + res.items[0].text.slice(0, 3500) : '');
    return { card, forModel: (body || 'Tidak ada hasil.') + '\n\n(Hasilnya juga tampil sebagai kartu di chat.)' };
  } catch (e) {
    return { forModel: `Gagal menjalankan ${name}: ${e.message}` };
  }
}

/* ---------- Kartu yang disimpan di riwayat chat ---------- */
function sanitizeCard(c) {
  if (!c || typeof c !== 'object') return null;
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  const url = (v) => (typeof v === 'string' && (/^\/api\/nexa\/file\/[a-f0-9]{40}\.[a-z0-9]{2,4}$/.test(v) || /^https?:\/\/\S+$/i.test(v)) ? v.slice(0, 1500) : undefined);
  const out = { id: s(c.id, 40), title: s(c.title, 80), kind: ['media', 'list', 'text', 'raw'].includes(c.kind) ? c.kind : 'raw' };
  if (c.args && typeof c.args === 'object') out.args = Object.fromEntries(Object.entries(c.args).slice(0, 6).map(([k, v]) => [s(k, 20), s(String(v), 300)]));
  if (c.kind === 'media') { out.media = ['image', 'video', 'audio'].includes(c.media) ? c.media : 'image'; out.src = url(c.src); if (c.blur) out.blur = true; }
  if (c.kind === 'text') out.text = s(c.text, 8000);
  if (c.kind === 'list') {
    out.items = (Array.isArray(c.items) ? c.items : []).slice(0, 12).map((i) => ({ title: s(i.title, 200), sub: s(i.sub, 240), image: url(i.image), video: url(i.video), audio: url(i.audio), link: url(i.link), text: s(i.text, 6000) }));
  }
  return out;
}

/* ---------- Rute ---------- */
function register({ app, express, wrap, needHeader }) {
  const meta = (m) => ({ id: 'nexa:' + m.id, name: m.name, dev: 'NexaDev', kind: 'chat', tier: 'production', provider: 'nexa', ctx: 8000, out: 4000, speed: m.speed, quality: m.quality, reasoning: null, vision: false, tools: false, pick: m.pick, search: Boolean(m.search), desc: m.desc, use: m.use, tip: m.tip, available: true });
  app.get('/api/nexa/catalog', (req, res) => {
    res.json({
      models: MODELS.map(meta),
      tools: TOOLS.filter((t) => !t.hidden).map(({ id, group, title, desc, params, out, media, blur, itemAction }) => ({ id, group, title, desc, params, out, media, blur, itemAction })),
    });
  });

  app.post('/api/nexa/run', needHeader, express.json({ limit: '60kb' }), wrap(async (req, res) => {
    const b = req.body || {};
    const r = await runTool(String(b.id || ''), b.params);
    res.json({ result: r });
  }));

  app.get('/api/nexa/file/:name', (req, res) => {
    const m = /^([a-f0-9]{40})\.([a-z0-9]{2,4})$/.exec(req.params.name);
    if (!m || !MIME[m[2]]) return res.status(404).json({ error: 'File tidak ditemukan.' });
    const file = path.join(CACHE, req.params.name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'File sudah dihapus dari cache server.' });
    res.set({ 'Content-Type': MIME[m[2]], 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': `inline; filename="nexa-${m[1].slice(0, 8)}.${m[2]}"` });
    res.sendFile(file);
  });

  app.post('/api/ai/nexa', needHeader, express.json({ limit: '1mb' }), wrap(async (req, res) => {
    const b = req.body || {};
    const id = String(b.model || '').replace(/^nexa:/, '');
    if (!MODEL_BY_ID[id]) fail('Model Nexa tidak ditemukan.', 404);
    const a = await askModel(id, promptFrom(b.messages));
    res.json({ text: a.text, ms: a.ms });
  }));
}

module.exports = { register, MODELS, TOOLS, AI_TOOLS, STATUS, runAiTool, sanitizeCard, runTool, askModel, normalize, promptFrom, textOf, MODEL_BY_ID };
