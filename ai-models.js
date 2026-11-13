// Katalog model Groq: penjelasan dan kegunaan tiap model.
// Daftar sebenarnya diambil langsung dari API Groq (lihat ai.js); katalog ini hanya memberi
// keterangan. Model baru yang belum ada di sini tetap muncul dengan keterangan umum.
//
// kind: chat | stt | tts | safety      tier: production | preview | legacy
// reasoning: gptoss (low/medium/high) | qwen (none/default/low/medium/high) | muse (low..xhigh) | null
// speed dan quality: skala 1 sampai 5 (perkiraan relatif, bukan benchmark resmi)

const CATALOG = [
  {
    id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', dev: 'OpenAI', kind: 'chat', tier: 'production',
    ctx: 131072, out: 65536, speed: 3, quality: 5, reasoning: 'gptoss', vision: false, tools: true, pick: 1,
    desc: 'Model open-weight terbesar dari OpenAI di Groq. Berpikir dulu sebelum menjawab, jadi paling kuat untuk masalah yang butuh penalaran berlapis.',
    use: ['Debug bug yang sulit dilacak', 'Merancang arsitektur dan struktur proyek', 'Refactor besar dan migrasi framework', 'Algoritma, kompleksitas, dan optimasi', 'Tugas agent yang berlangsung beberapa langkah'],
    tip: 'Pilihan utama untuk coding serius. Turunkan Reasoning ke Low kalau butuh lebih cepat.',
  },
  {
    id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', dev: 'OpenAI', kind: 'chat', tier: 'production',
    ctx: 131072, out: 65536, speed: 5, quality: 3, reasoning: 'gptoss', vision: false, tools: true, pick: 3,
    desc: 'Versi kecil GPT-OSS. Tetap bisa berpikir, tapi jauh lebih cepat dan hemat kuota.',
    use: ['Menulis fungsi dan snippet', 'Menjelaskan error dan stack trace', 'Review cepat satu file', 'Tool calling ringan'],
    tip: 'Cocok sebagai model harian kalau 120B terasa lambat.',
  },
  {
    id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', dev: 'Meta', kind: 'chat', tier: 'production',
    ctx: 131072, out: 32768, speed: 4, quality: 4, reasoning: null, vision: false, tools: true, pick: 2,
    desc: 'Model serba guna yang stabil. Langsung menjawab tanpa tahap berpikir, dan gaya jawabannya rapi untuk penjelasan plus kode.',
    use: ['Menulis kode dan dokumentasi sekaligus', 'Mengubah format data (JSON, CSV, YAML)', 'Komponen UI dan endpoint CRUD', 'Terjemahan dan komentar kode'],
    tip: 'Kalau jawaban GPT-OSS terlalu panjang atau terlalu banyak berpikir, coba model ini.',
  },
  {
    id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', dev: 'Meta', kind: 'chat', tier: 'production',
    ctx: 131072, out: 131072, speed: 5, quality: 2, reasoning: null, vision: false, tools: true, pick: 6,
    desc: 'Model paling ringan dan paling cepat. Kualitas nalarnya terbatas, tapi hampir instan dan murah.',
    use: ['Boilerplate dan template', 'Regex, perintah shell, dan one-liner', 'Judul chat, ringkasan, klasifikasi', 'Mengubah nama variabel atau format kode'],
    tip: 'Jangan dipakai untuk bug yang rumit. Pakai untuk pekerjaan ringan yang berulang.',
  },
  {
    id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', dev: 'Alibaba Cloud', kind: 'chat', tier: 'preview',
    ctx: 131072, out: 16384, speed: 4, quality: 4, reasoning: 'qwen', vision: null, tools: true, pick: 4,
    desc: 'Model menengah dengan mode berpikir yang bisa diatur (none sampai high). Kuat di coding dan banyak bahasa.',
    use: ['Coding dengan komentar atau instruksi berbahasa Indonesia', 'Soal logika dan matematika dengan Reasoning tinggi', 'Mode None untuk jawaban cepat tanpa berpikir'],
    tip: 'Output maksimal 16K token, jadi file yang sangat panjang perlu dipecah. Status Preview: bisa berubah atau dihentikan.',
  },
  {
    id: 'minimaxai/minimax-m2.7', name: 'MiniMax M2.7', dev: 'MiniMax', kind: 'chat', tier: 'preview',
    ctx: 196608, out: 131072, speed: 3, quality: 4, reasoning: null, vision: null, tools: true, pick: 5,
    desc: 'Konteks terpanjang di daftar (sekitar 196K token). Keluarga M2 dikenal untuk coding dan alur kerja agent yang panjang.',
    use: ['Membaca banyak file sekaligus dalam satu chat', 'Analisis repo atau log yang sangat panjang', 'Tugas agent berlangsung lama dengan banyak langkah'],
    tip: 'Tempel beberapa file dalam satu pesan lalu minta analisis menyeluruh. Status Preview.',
  },
  {
    id: 'meta-models/muse-spark-open', name: 'Muse Spark Open', dev: 'Meta', kind: 'chat', tier: 'preview',
    ctx: 131072, out: 131072, speed: 2, quality: 4, reasoning: 'muse', vision: null, tools: true, pick: 7,
    desc: 'Model Meta yang selalu berpikir (tidak bisa dimatikan). Tingkat Reasoning bisa diatur dari Low sampai XHigh.',
    use: ['Soal sulit yang butuh analisis mendalam', 'Mencari akar masalah dari beberapa gejala', 'Merencanakan langkah sebelum menulis kode'],
    tip: 'Lebih lambat karena selalu berpikir. Pakai Low atau Medium untuk pekerjaan sehari-hari. Status Preview.',
  },
  {
    id: 'openai/gpt-oss-safeguard-20b', name: 'GPT-OSS Safeguard 20B', dev: 'OpenAI', kind: 'safety', tier: 'preview',
    ctx: 131072, out: 65536, speed: 4, quality: 3, reasoning: null,
    desc: 'Bukan untuk ngobrol. Model ini menilai teks berdasarkan aturan (policy) yang kamu tulis sendiri, lalu memberi putusan dan alasannya.',
    use: ['Moderasi komentar atau chat di aplikasimu', 'Memeriksa apakah teks melanggar aturan khusus'],
    tip: 'Dipakai lewat API dari aplikasimu, bukan dari halaman chat ini.',
  },
  {
    id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Prompt Guard 2 86M', dev: 'Meta', kind: 'safety', tier: 'preview',
    ctx: 512, out: 512, speed: 5, quality: 4, reasoning: null,
    desc: 'Pengklasifikasi kecil yang mendeteksi prompt injection dan jailbreak. Lebih akurat dari versi 22M.',
    use: ['Menyaring input pengguna sebelum masuk ke agent', 'Melindungi aplikasi AI dari instruksi berbahaya'],
    tip: 'Konteks hanya 512 token. Dipakai lewat API, bukan chat.',
  },
  {
    id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Prompt Guard 2 22M', dev: 'Meta', kind: 'safety', tier: 'preview',
    ctx: 512, out: 512, speed: 5, quality: 3, reasoning: null,
    desc: 'Versi paling ringan dari Prompt Guard 2. Latensi sangat rendah dengan akurasi sedikit di bawah 86M.',
    use: ['Penyaring prompt injection berkecepatan tinggi', 'Pemeriksaan setiap pesan tanpa menambah delay'],
    tip: 'Dipakai lewat API, bukan chat.',
  },
  {
    id: 'whisper-large-v3', name: 'Whisper Large v3', dev: 'OpenAI', kind: 'stt', tier: 'production',
    speed: 3, quality: 5,
    desc: 'Pengenal suara paling akurat dari OpenAI. Mendukung lebih dari 90 bahasa termasuk Indonesia. Ukuran file maksimal 100 MB.',
    use: ['Mengubah rekaman rapat atau voice note jadi teks', 'Subtitle dan transkrip dengan akurasi tinggi'],
    tip: 'Tombol mic di halaman AI memakai Turbo agar cepat. Pakai model ini lewat API untuk hasil paling teliti.',
  },
  {
    id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo', dev: 'OpenAI', kind: 'stt', tier: 'production',
    speed: 5, quality: 4,
    desc: 'Versi Whisper yang jauh lebih cepat dengan akurasi hampir sama. Ini yang dipakai tombol mic di chat.',
    use: ['Dikte pesan lewat mic', 'Transkrip cepat untuk rekaman pendek'],
    tip: 'Sudah aktif otomatis di tombol mic.',
  },
  {
    id: 'canopylabs/orpheus-v1-english', name: 'Orpheus v1 English', dev: 'Canopy Labs', kind: 'tts', tier: 'preview',
    ctx: 4000, speed: 4, quality: 4,
    desc: 'Mengubah teks jadi suara bahasa Inggris yang ekspresif. Mendukung arahan nada seperti [cheerful] di dalam teks.',
    use: ['Narasi atau voice-over bahasa Inggris', 'Asisten suara di aplikasi'],
    tip: 'Perlu menyetujui syarat penggunaan di console.groq.com sebelum bisa dipakai. Lewat API, bukan chat.',
  },
  {
    id: 'canopylabs/orpheus-arabic-saudi', name: 'Orpheus Arabic (Saudi)', dev: 'Canopy Labs', kind: 'tts', tier: 'preview',
    ctx: 4000, speed: 4, quality: 4,
    desc: 'Teks ke suara untuk bahasa Arab dialek Saudi.',
    use: ['Narasi dan asisten suara berbahasa Arab'],
    tip: 'Lewat API, bukan chat.',
  },

  /* Model lama: hanya tampil kalau API Groq masih mengembalikannya. */
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', dev: 'Meta', kind: 'chat', tier: 'legacy',
    ctx: 131072, out: 8192, speed: 5, quality: 3, reasoning: null, vision: true, tools: true, pick: 9,
    desc: 'Model multimodal yang bisa membaca gambar. Berguna untuk screenshot error atau desain UI.',
    use: ['Membaca screenshot error', 'Mengubah mockup jadi HTML/CSS'], tip: 'Model lama, bisa dihentikan Groq kapan saja.',
  },
  {
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B', dev: 'Meta', kind: 'chat', tier: 'legacy',
    ctx: 131072, out: 8192, speed: 4, quality: 4, reasoning: null, vision: true, tools: true, pick: 9,
    desc: 'Multimodal yang lebih besar dari Scout, lebih teliti membaca gambar dan kode.',
    use: ['Analisis screenshot dan diagram', 'Coding dengan konteks gambar'], tip: 'Model lama.',
  },
  {
    id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 (0905)', dev: 'Moonshot AI', kind: 'chat', tier: 'legacy',
    ctx: 262144, out: 16384, speed: 3, quality: 4, reasoning: null, vision: false, tools: true, pick: 9,
    desc: 'Model besar yang kuat untuk coding agentik dan tool calling, konteks sangat panjang.',
    use: ['Repo besar', 'Alur agent dengan banyak tool'], tip: 'Model lama.',
  },
  {
    id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', dev: 'Alibaba Cloud', kind: 'chat', tier: 'legacy',
    ctx: 131072, out: 40960, speed: 4, quality: 3, reasoning: 'qwen', vision: false, tools: true, pick: 9,
    desc: 'Qwen generasi sebelumnya dengan mode berpikir.', use: ['Coding umum', 'Soal logika'], tip: 'Model lama.',
  },
  {
    id: 'groq/compound', name: 'Groq Compound', dev: 'Groq', kind: 'chat', tier: 'legacy',
    ctx: 131072, out: 8192, speed: 3, quality: 4, reasoning: null, vision: false, tools: true, pick: 9,
    desc: 'Sistem agent bawaan Groq: otomatis mencari di web dan menjalankan kode untuk menjawab.',
    use: ['Pertanyaan yang butuh info terbaru', 'Menjalankan kode kecil untuk verifikasi'], tip: 'Model lama.',
  },
  {
    id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4 12B', dev: 'Meta', kind: 'safety', tier: 'legacy',
    ctx: 131072, out: 1024, speed: 4, quality: 3, reasoning: null,
    desc: 'Pemeriksa keamanan konten teks dan gambar.', use: ['Moderasi konten'], tip: 'Model lama.',
  },
];

const BY_ID = Object.fromEntries(CATALOG.map((m) => [m.id, m]));

function inferKind(id) {
  if (/whisper/i.test(id)) return 'stt';
  if (/orpheus|tts/i.test(id)) return 'tts';
  if (/guard|safeguard/i.test(id)) return 'safety';
  return 'chat';
}

// Model yang belum ada di katalog: dibuat dari data API Groq.
function inferred(item) {
  const id = item.id;
  const tail = id.split('/').pop();
  const kind = inferKind(id);
  return {
    id, name: tail, dev: item.owned_by || '', kind, tier: 'preview',
    ctx: item.context_window || undefined, out: item.max_completion_tokens || undefined,
    speed: 3, quality: 3, reasoning: null, vision: null, tools: null, pick: 8, unknown: true,
    desc: kind === 'chat'
      ? 'Model ini belum ada di katalog panel. Datanya diambil langsung dari API Groq, jadi kemampuannya belum dipastikan.'
      : 'Model ini belum ada di katalog panel dan bukan model chat.',
    use: kind === 'chat' ? ['Coba dulu dengan pertanyaan kecil untuk menilai kualitasnya'] : [],
    tip: 'Cek console.groq.com/docs/models untuk keterangan resminya.',
  };
}

module.exports = { CATALOG, BY_ID, inferred, inferKind };
