# Panel

Panel pribadi untuk domain-kamu.com. Tahap 1: login, kerangka tema gelap, dan manajemen subdomain lewat Cloudflare API.
Menu Situs dan APK masih berupa halaman kosong dan dibangun di tahap berikutnya.

## Menjalankan

1. Pasang Node.js 18 atau lebih baru.
2. `npm install`
3. Salin `.env.example` menjadi `.env`, lalu isi:
   - `PANEL_PASSWORD`: password masuk panel
   - `SESSION_SECRET`: string acak minimal 32 karakter
   - `CF_API_TOKEN`: token Cloudflare dengan izin Edit zone DNS untuk zona domain-kamu.com
   - `CF_ZONE_ID`: Zone ID dari halaman Overview domain di Cloudflare
4. `npm start`, lalu buka `http://localhost:3000`.

## Memasang di hosting

- Railway atau Render: hubungkan repo, isi variabel di atas di menu Environment, dan set `NODE_ENV=production`.
- VPS: jalankan dengan `pm2` atau `systemd`, lalu pasang Nginx/Caddy sebagai reverse proxy dengan HTTPS.
- Di Cloudflare, arahkan record `@` atau subdomain panel (misalnya `panel`) ke hosting tersebut.
  Untuk Railway atau Render, pakai CNAME ke alamat yang mereka berikan. Untuk VPS, pakai A ke IP server.

## Keamanan

- Token tidak pernah dikirim ke browser. Semua panggilan Cloudflare lewat server.
- Sesi memakai cookie HttpOnly, SameSite=Strict, dan Secure saat `NODE_ENV=production`.
- Login dibatasi 5 percobaan per 10 menit per IP.
- Jangan unggah file `.env` ke GitHub.

## Termux (Android)

1. Ekstrak zip ke `~/panel-panel`.
2. `cd ~/panel-panel && bash setup-termux.sh` (memasang Node.js, dependensi, dan membuat `.env` dengan SESSION_SECRET otomatis).
3. `nano .env`, isi `PANEL_PASSWORD`, `CF_API_TOKEN`, `CF_ZONE_ID`, dan `TUNNEL_TOKEN` (opsional).
4. `bash start.sh` untuk menjalankan panel. Kalau `TUNNEL_TOKEN` terisi, tunnel Cloudflare ikut jalan.
5. Cek `http://localhost:3000/healthz`, harusnya menampilkan `ok`.

## Perubahan 0.2.0

- Endpoint `/healthz` untuk cek panel hidup (tanpa login).
- Variabel `BIND_HOST` (bawaan `0.0.0.0`).
- Skrip `setup-termux.sh` dan `start.sh`.
- `.env.example` menambah `NODE_ENV` dan `TUNNEL_TOKEN`.

## Situs (versi 0.3.0)

Menu **Situs** men-deploy situs statis ke Vercel atau Netlify, memasang domain, dan membuat record CNAME di Cloudflare otomatis.

1. Isi token di `.env` (pakai yang dibutuhkan saja):
   - `VERCEL_TOKEN`: vercel.com/account/tokens (isi `VERCEL_TEAM_ID` hanya kalau project ada di Team)
   - `NETLIFY_TOKEN`: Netlify, User settings, Applications, Personal access tokens
   - `GITHUB_TOKEN`: hanya untuk repo private
2. Jalankan `npm install` (ada dependensi baru: adm-zip), lalu `bash start.sh`.
3. Di panel, buka Situs, pilih platform dan subdomain, lalu upload ZIP atau isi repo GitHub.

Catatan:
- `index.html` harus ada di folder utama ZIP (folder pembungkus tunggal otomatis dibuang).
- Data situs disimpan di `data/sites.json`. Jangan hapus file ini.
- Sertifikat HTTPS biasanya aktif beberapa menit setelah DNS terbaca.
- Cloudflare Pages belum didukung.

## Perubahan 0.3.1

- Token hosting (`VERCEL_TOKEN`, `NETLIFY_TOKEN`, `GITHUB_TOKEN`) dibaca ulang dari `.env` setiap halaman Situs dibuka, jadi tidak perlu restart setelah mengisi token.
- Halaman Situs menampilkan status tiap token (terbaca atau belum terisi).

## Perubahan 0.4.0

- Sumber situs baru: tempel kode HTML, upload file HTML, selain ZIP dan GitHub. Tombol "Isi contoh" mengisi halaman awal.
- Progres upload sungguhan (persen) lalu status "Server sedang deploy".
- Tampilan: latar bergerak pelan, kartu kaca, tombol dengan kilau dan efek riak, animasi masuk bertahap, angka ringkasan menghitung naik, indikator menu aktif, dialog dan toast dengan gerak.
- Semua gerak otomatis nonaktif kalau HP memakai setelan "kurangi gerakan".

## APK Builder (versi 0.5.0)

Mengubah URL web, kode HTML, file HTML, atau ZIP situs menjadi aplikasi Android berbasis webview.

Cara kerja: panel membuat repo private `panel-apk-builder` di akun GitHub-mu, mengisinya dengan template Android dan workflow, lalu tiap build dikirim sebagai file ZIP kecil dan dijalankan lewat GitHub Actions. Hasil APK diambil panel dan bisa diunduh dari riwayat build.

1. Buat token GitHub (classic) dengan izin `repo` dan `workflow`, isi ke `.env` sebagai `GITHUB_TOKEN`.
2. Buka menu APK, tekan **Siapkan builder** (sekali saja).
3. Isi form (nama, isi aplikasi, ikon, splash, izin, dan lainnya), tekan **Build APK**.
4. Tunggu 3 sampai 6 menit, lalu tekan **Unduh APK** dan pasang di HP.

Fitur: splash screen (warna, tagline, 5 gaya animasi, 4 gaya loading, durasi), ikon dan logo kustom, nama dan package, orientasi, layar penuh, warna status bar dan navigation bar, tarik untuk muat ulang, garis progres, halaman error kustom, tautan eksternal, upload file, unduhan, kamera, mikrofon, lokasi, notifikasi, dan penyimpanan.

Catatan:
- APK ditandatangani dengan keystore yang dibuat otomatis pada build pertama dan disimpan di repo builder (private). Dengan keystore yang sama, APK versi baru bisa menimpa versi lama. Jangan hapus repo builder kalau ingin tetap bisa memperbarui aplikasi.
- Naikkan Version code setiap membuat versi baru supaya bisa memperbarui aplikasi yang sudah terpasang.
- Hasil build disimpan 14 hari di GitHub, setelah itu build ulang.
- Kalau build gagal, tekan **Log** di riwayat untuk melihat penyebabnya.
- Menu Situs dan APK memakai `GITHUB_TOKEN` yang sama, jadi token itu juga bisa dipakai untuk repo GitHub private.

## AI Coding Agent (versi 0.6.0)

Tab **AI** adalah chat coding berbasis Groq dengan tampilan seperti ChatGPT.

1. Buat API key di console.groq.com/keys, lalu isi `GROQ_API_KEY=gsk_...` di `.env`. Dibaca ulang otomatis, tidak perlu restart. Key tidak pernah dikirim ke browser.
2. Buka tab AI. Pilih model lewat chip di bagian atas (tiap model punya penjelasan, kegunaan, konteks, kecepatan, dan kualitas).

Fitur: jawaban streaming dengan tombol stop, Markdown lengkap (tabel, daftar, kode berwarna) dengan tombol salin, unduh, dan pratinjau HTML/JS/SVG di kotak terisolasi, tampilan proses berpikir untuk model reasoning, 10 mode agent (Coder, Debugger, Code reviewer, Arsitek, Refactor, Penulis tes, Pengajar, DevOps, SQL, Umum) plus instruksi tambahan sendiri, lampiran file kode dan gambar (juga lewat tempel dan seret), dikte suara lewat Whisper, buat ulang, edit pesan, lanjutkan jawaban yang terpotong, riwayat chat di server (cari, sematkan, ganti nama, hapus, judul otomatis), dan ekspor chat ke Markdown.

Daftar model diambil langsung dari API Groq lalu dilengkapi katalog di `ai-models.js`. Model baru yang belum ada di katalog tetap muncul dengan keterangan umum. Ubah `ai-models.js` untuk mengedit penjelasan.

Catatan:
- Riwayat disimpan di `data/ai/`. Gambar tidak ikut tersimpan, hanya jumlahnya.
- Model berstatus Preview bisa berubah atau dihentikan Groq kapan saja.
- Mic butuh alamat HTTPS (tunnel atau domain) dan izin mikrofon.
- Agent ini tidak menjalankan perintah atau menulis file di server. Pratinjau kode jalan di browser, terisolasi dari panel.

## Navbar (versi 0.6.0)

Menu bawah di HP berupa tab bar melayang (ikon + label, maksimal 5 item): Home, Situs, AI, APK, Lainnya. Subdomain dan Setelan ada di tab Lainnya. Warna item aktif diatur lewat `--nav-accent` di `public/style.css`. Di layar lebar, menu tetap berupa sidebar. Saat mengetik di halaman AI di HP, tab bar menyingkir otomatis.

## Nexa: model AI, tool, dan kartu (versi 0.7.0)

Memakai NexaDev API (`api.nexadev.my.id` dan `apii.nexadev.my.id`). Tidak butuh API key.

**Di tab AI**
- Model baru tanpa key: Felo (cari web), GPT-4, ChatGPT Pro, DeepSeek, Llama (Nexa), dan CAI. Jawabannya muncul sekaligus (tanpa streaming) dan tidak bisa membaca gambar.
- Model Groq yang mendukung tool use sekarang bisa memakai alat: cari web (lewat Felo), cari YouTube, lirik, kirim gambar anime, buat gambar atau video teks (Brat, Brat Patrick, IQC, WMP), cari efek suara, meme Lahelu, dan gambar Pinterest. Hasil gambar dan video tampil sebagai kartu di chat dan ikut tersimpan di riwayat.
- Alat bisa dimatikan di Pengaturan AI, bagian Alat Nexa.

**Di tab Lainnya, menu Tools**
- Satu kartu per tool: isi kolomnya, tekan Jalankan, hasil tampil di kartu (gambar, video, daftar, atau teks) lengkap dengan tombol Unduh, Buka, dan Salin link.
- Daftar tool: Anime acak, Pap acak (pratinjau diburamkan), Brat, Brat video, Brat video 2, Brat Patrick, Brat Patrick video, IQC, WMP 1 dan 2, Nokia, TikTok quote card, Fake FF duo, Fake FF, Cari YouTube, Lirik lagu, Lahelu, Sound effect, Pinterest, Minecraft addon, dan Ambil stiker.

**Catatan teknis**
- Semua panggilan ke Nexa lewat server panel, jadi tidak ada masalah CORS dan tidak ada URL pihak ketiga di browser.
- Gambar dan video hasil tool disimpan di `data/nexa` (maksimal 300 file atau 400 MB, yang terlama dihapus otomatis) supaya hasilnya tidak berubah saat riwayat chat dibuka lagi.
- URL Pinterest di daftar awal tertulis `api.nexaadev.my.id` (tiga huruf a). Panel memakai `api.nexadev.my.id`; ubah di `nexa.js` kalau memang domainnya berbeda.

## Perubahan 0.8.0

- **Perbaikan APK**: error "Gambar tidak bisa dibaca" saat memilih ikon atau logo splash. File gambar sekarang dibaca ke memori begitu dipilih (HP Android kadang menutup akses file setelahnya), jenisnya dicek dari isi file, dan pesan error menjelaskan penyebabnya (HEIC, file kosong, bukan gambar). Batas ukuran logo splash dinaikkan ke 1,6 MB.
- **Navbar**: indikator tab sekarang bergeser dengan gerak pegas dari tab ke tab (bukan hilang lalu muncul). Di layar lebar indikatornya bergeser vertikal. Otomatis nonaktif kalau HP memakai "kurangi gerakan".
- **Nexa jadi tab**: Felo, GPT-4, ChatGPT Pro, DeepSeek, Llama (Nexa), dan CAI tidak lagi dicampur di daftar model Chat & kode. Semuanya ada di tab **Nexa** pada sheet Model AI (sebelahnya Keamanan): pilih mesin, tanya, riwayat per mesin selama halaman terbuka. Tab AI sekarang khusus model Groq. Alat Nexa di dalam chat AI (cari web, gambar, dan lainnya) tetap ada.
- **Img to URL** (tab Lainnya): unggah gambar (pilih, seret, atau tempel) ke Supabase Storage lalu dapat link publik, lengkap dengan tombol salin link, Markdown, HTML, dan hapus.

### Memasang Img to URL

1. Buat project di supabase.com, buka Project Settings, API.
2. Buka tab Lainnya, Img to URL, lalu isi **Project URL** dan kunci **Secret** `sb_secret_...` (atau service_role lama, BUKAN publishable/anon) langsung di web, tekan Simpan dan uji. Tersimpan di `data/supabase.json` (izin 600, tidak ikut git), tanpa restart. Opsional nama bucket (bawaan `panel-img`).
   Alternatif lama lewat `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`) tetap jalan sebagai cadangan; isi dari web dipakai lebih dulu.
3. Buka Lainnya, Img to URL, tekan **Siapkan bucket** (sekali saja, membuat bucket publik).

Catatan: file disimpan di Supabase Storage (metadatanya tercatat di tabel `storage.objects` di database Supabase). Kunci service_role hanya dipakai di server. Format yang diterima PNG, JPG, GIF, WebP (maks 10 MB); SVG ditolak karena bisa memuat skrip. Bucket publik berarti siapa pun yang tahu link-nya bisa membukanya.

## Wink (versi 0.9.0)

Menu **Lainnya, Wink** untuk memperbaiki dan mengolah foto lewat endpoint NexaDev:

- **HD** (`/tools/hd`), **Remini** (`/api/remini`), **Wink** (`/api/wink`), **Upscale** (`/api/upscale`), **Upscale 2x/4x** (`/api/upscale1`, parameter `resolusi`), dan **Hapus BG** (`/tools/remove`, hasil PNG transparan).
- Pilih foto (pilih file, seret, atau tempel dengan Ctrl+V) atau tempel link gambar. Foto dikecilkan otomatis (maks 3840 px, di bawah 9 MB) dan EXIF dibuang di browser.
- Pilih satu alat, atau beberapa alat (maks 4) dengan nomor urut. **Berantai**: hasil tiap langkah jadi bahan langkah berikutnya. **Bandingkan**: semua alat memproses foto asli, hasilnya bisa dibandingkan lewat tab.
- Hasil tampil dengan **slider sebelum dan sesudah** (kotak-kotak abu di belakang hasil Hapus BG menandai area transparan), lengkap dengan Unduh, Buka, **Jadikan foto utama** (untuk diproses lagi), **Simpan dan salin link** (ke Supabase), dan Hapus.
- Riwayat 60 hasil terakhir tersimpan di `data/wink`.

Cara kerja dan catatan:

- Endpoint Nexa menerima **link** gambar, jadi foto yang kamu pilih diunggah ke Supabase memakai pengaturan **Img to URL** (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). Kalau Supabase belum siap, kamu tetap bisa memakai link gambar publik.
- File sementara di Supabase berawalan `wink-`, tidak muncul di daftar Img to URL, dan dihapus otomatis (setelah rantai selesai, atau lebih dari 3 jam). Hasil yang kamu simpan berawalan `hasil-wink-` dan muncul di Img to URL.
- Proses berjalan sebagai job di server dan dicek berkala dari browser, jadi tidak terkena batas waktu tunnel Cloudflare (100 detik). Batas per proses 2,5 menit, maksimal 3 proses bersamaan.
- Hasil dari Nexa yang berupa link diunduh server dengan pengecekan keamanan (hanya http/https port 80 dan 443, alamat privat ditolak).
- Hasil lebih dari 10 MB tidak bisa dirantai atau disimpan ke Supabase (batas bucket Img to URL), tapi tetap bisa diunduh.


## Telegram (bot, grup, saluran)

Buka Lainnya, Telegram. Semua diatur dari web, tidak perlu edit `.env`.

1. **Bot**: buat bot di @BotFather, tempel token, Simpan dan uji. Token disimpan di `data/telegram.json` (izin 600).
2. **Grup & Saluran**: tambahkan bot ke grup/saluran (saluran: jadikan admin dengan izin Post messages). Isi `@username` atau ID angka, atau ketik `/id` di chat itu lalu pilih dari daftar terdeteksi. Tombol Cek menunjukkan apakah bot masih bisa mengirim.
3. **Kirim**: pesan teks atau foto (link) ke satu atau banyak target sekaligus. Format HTML opsional.
4. **Jadwal**: kirim sekali, tiap hari, atau tiap minggu. Dijalankan server tiap 20 detik.
5. **Notifikasi**: build APK selesai/gagal dan situs mati/pulih (dicek tiap 5 menit, alarm setelah 2 kali gagal berturut-turut).
6. **Login**: tautkan akunmu (tekan Start di bot), lalu halaman masuk punya tombol "Masuk dengan Telegram". Bot mengirim tombol Izinkan/Tolak berisi IP dan perangkat. Maksimal 5 permintaan per 10 menit per IP. Password tetap berfungsi.

Catatan: bot dipakai lewat long-polling. Kalau token yang sama dipakai program lain atau webhook, deteksi grup dan login Telegram tidak jalan (kirim pesan tetap bisa).

### Bot API lokal (kirim file sampai 2 GB)

Server cloud Telegram membatasi file 50 MB. Dengan server Bot API lokal batasnya 2 GB.
1. Ambil `api_id` dan `api_hash` di my.telegram.org.
2. Jalankan: `docker run -d --name tg-bot-api --restart always -p 8081:8081 -e TELEGRAM_API_ID=ISI -e TELEGRAM_API_HASH=ISI -e TELEGRAM_LOCAL=1 aiogram/telegram-bot-api:latest`
   Tanpa Docker (Termux): `pkg install -y git cmake clang make gperf openssl zlib tmux`, lalu `git clone --recursive https://github.com/tdlib/telegram-bot-api.git`, build dengan cmake (`-DCMAKE_INSTALL_PREFIX=$PREFIX`, `cmake --build . --target install -j2`, sekitar 30 sampai 60 menit), jalankan `telegram-bot-api --local --api-id=ISI --api-hash=ISI --http-port=8081 --dir=$HOME/tg-data` di dalam tmux dengan `termux-wake-lock`.
3. Di tab Bot, tekan **Logout dari cloud**, lalu isi alamat server (`http://localhost:8081`) dan Simpan dan uji. Bot baru bisa kembali ke cloud sekitar 10 menit setelah keluar dari server lokal.
4. Tab Kirim sekarang bisa mengunggah file (dengan progres), dan tab Notifikasi bisa mengirim file APK otomatis setelah build.

Kalau panel diakses lewat Cloudflare (proxy oranye), unggahan dibatasi 100 MB oleh Cloudflare. Untuk file lebih besar, akses panel lewat jalur yang tidak diproxy (misalnya tunnel langsung atau IP server).

### Uploader Python (alternatif ringan untuk file besar)

Tanpa Docker dan tanpa kompilasi. Panel menjalankan `tools/tg_uploader.py` sendiri (Telethon, MTProto) untuk file di atas 50 MB sampai 2 GB. Bot tetap di cloud Telegram.
1. Sekali saja di Termux: `pkg install python && pip install telethon`
2. Di panel, tab Bot, bagian **Uploader Python**: isi `api_id` dan `api_hash` dari my.telegram.org (API development tools), tekan **Aktifkan**.

Panel membuat kunci rahasia sendiri, memilih port bebas, menyalakan ulang skrip kalau mati, dan menyalakannya lagi saat panel dihidupkan. `api_hash` tersimpan di `data/telegram.json` (izin 600) dan tidak pernah dikirim ke browser. Skrip hanya mendengarkan 127.0.0.1 dan hanya membaca file sementara panel (`zz-*` di folder temp).

Mode manual (skrip dijalankan sendiri dengan `TG_API_ID`, `TG_API_HASH`, `TG_BOT_TOKEN`, `UPLOADER_SECRET`) tetap tersedia di bagian "Mode manual".

Untuk grup/saluran privat, uploader butuh mengenal chat-nya: kirim `/id` di chat itu saat uploader menyala, atau pakai chat yang punya @username.


## Command bot, banner video, dan Bot Host

**Tab Command** (Lainnya, Telegram, Command):
- Tiap command (bawaan: /start, /help, /id, plus buatanmu) punya saklar on/off sendiri, dan ada saklar utama untuk mematikan semuanya.
- Per command: teks balasan (variabel `{nama} {username} {id} {grup} {bot}`), format HTML, tombol link, banner video, akses (semua orang atau hanya pemilik yang tertaut), dan cakupan (semua chat, hanya privat, atau hanya grup).
- Menu command di Telegram diperbarui otomatis (command rahasia hanya tampil untuk pemilik). Tombol "Sinkron menu Telegram" untuk memaksa.
- Banner video: MP4/MOV/M4V/WebM maksimal 50 MB, disimpan di `data/banners/`. Pertama kali dikirim lewat unggah, berikutnya memakai file_id Telegram sehingga cepat. Command yang banner-nya dihapus tetap membalas tanpa video.
- Terminal command menampilkan hasil tiap pemakaian: berhasil, gagal, ditolak, atau dilewati.
- `/start link_...` (tautan akun login) selalu aktif dan tidak bergantung pada saklar command.

**Tab Bot Host**:
1. Unggah proyek bot dalam `.zip` (maks 50 MB). Panel mengekstrak otomatis (folder induk tunggal diratakan; path berbahaya, symlink, dan zip bomb ditolak), lalu mendeteksi Python atau Node.js.
2. Dependensi diinstal otomatis. Python memakai venv per bot (`.venv`), Node memakai `npm install --omit=dev`.
3. Tekan **Jalankan**. Terminal menampilkan output langsung dengan warna: hijau berhasil, merah error/gagal, kuning peringatan, biru pesan sistem.
4. Pengaturan per bot: perintah menjalankan, variabel lingkungan (token dan lain-lain, nilainya tidak pernah ditampilkan ulang), auto-start saat panel hidup, dan mulai ulang otomatis kalau crash (backoff 3 detik naik sampai 60 detik, maksimal 10 kali beruntun).
5. "Perbarui ZIP" mengganti file bot tanpa menghapus pengaturan dan variabel lingkungannya.

Keamanan: bot berjalan dengan environment minimal (rahasia panel seperti PANEL_PASSWORD dan SESSION_SECRET tidak diteruskan). Program tetap berjalan sebagai user yang sama dengan panel, jadi hanya unggah kode yang kamu percaya. Pakai token bot yang berbeda dari bot panel supaya tidak bentrok.

## Semua fitur panel jadi command bot (versi 0.10.0)

Tab **Lainnya, Telegram, Command** sekarang berisi 61 command fitur, dikelompokkan per kategori (cari, aktifkan/matikan satu per satu atau per kelompok). Menu command di Telegram (tombol "/" di chat bot) ikut diperbarui otomatis, dan pembaruan ini menyinkronkan menu sekali setelah panel dinyalakan. Pengaturan command lama dan command buatanmu tetap aman; kalau namamu sama dengan nama command fitur (misalnya /brat), command buatanmu yang dipakai.

Ketik /help di bot untuk daftar per kategori. Akses bawaan: fitur yang memakai kuota, kunci, atau data pribadimu hanya untuk pemilik (🔒); sisanya semua orang. Ubah per command lewat tombol Edit.

| Kelompok | Command | Akses |
|---|---|---|
| Gambar & video | /anime /brat /bratvid /bratvid2 /bratpatrick /bratpatrickvid /iqc /wmp1 /wmp2 /nokia /ttqc /fakeffduo /fakeff | semua |
| | /pap | pemilik |
| Cari | /youtube /lirik /lahelu /sfx /pinterest /mcpdl /stiker | semua |
| AI Nexa | /felo /gpt4 /chatgptpro /deepseek /llama /cai (ingat percakapan 20 menit, `/felo reset` untuk mulai baru) | semua |
| AI Groq | /ai /aimodel | pemilik |
| Foto | /hd /remini /wink /upscale /upscale2 /upscale4 /removebg /imgurl /imglist | pemilik |
| Situs | /situs /situsdeploy /situshapus | pemilik |
| APK | /apk /apkbuild /apkunduh /apkhapus | pemilik |
| Bot Host | /bots /botstart /botstop /botrestart /botlog | pemilik |
| DNS | /dns /dnsadd /dnsdel | pemilik |
| Telegram | /targets /kirim /jadwal /notif | pemilik |
| Panel | /panel /perintah /cmdon /cmdoff | pemilik |

Cara pakai singkat:
- Teks: `/brat halo`, atau balas pesan lalu `/brat`. Beberapa isian dipisah `|`: `/nokia pesan | pengirim | tanggal | jam | judul`, `/ttqc url_foto | nama | komentar`, `/fakeffduo nick1 | nick2`.
- Foto (`/hd`, `/remini`, `/wink`, `/upscale`, `/upscale2`, `/upscale4`, `/removebg`, `/imgurl`): kirim foto dengan caption command, atau balas foto dengan command, atau `/hd link_gambar`. Wink dan Img to URL butuh Supabase seperti di web.
- Situs: kirim file `.zip` atau `.html` dengan caption `/situsdeploy vercel subdomain` (situs baru) atau `/situsdeploy 2` (deploy ulang situs nomor 2).
- Perintah yang menghapus (`/situshapus`, `/apkhapus`, `/dnsdel`) meminta kata `ya` di akhir sebagai konfirmasi, contoh `/dnsdel 3 ya`.
- `/apkbuild https://situs.com | Nama App | id.paket` membuat APK dari URL dengan ikon warna polos. Untuk ikon dan pengaturan lengkap pakai menu APK di web.
- `/kirim 1,3 teks` atau `/kirim semua teks` mengirim ke target dari `/targets`.
- `/cmdoff nama` dan `/cmdon nama` mengatur command dari chat (`/cmdon`, `/cmdoff`, dan `/perintah` tidak bisa dimatikan lewat bot supaya kamu tidak terkunci).

Catatan teknis:
- Fitur berjalan di latar belakang, jadi bot tetap responsif dan persetujuan login tidak tertahan. Satu chat memproses satu permintaan dalam satu waktu, dan paling banyak 4 sekaligus di seluruh bot.
- Fitur situs, APK, Bot Host, DNS, Wink, dan Img to URL memanggil API panel sendiri lewat 127.0.0.1 dengan sesi internal, jadi aturan, token, dan batasnya sama dengan di web.
- Perintah dengan caption foto atau dokumen kini dikenali (sebelumnya hanya pesan teks).
- Telegram membatasi menu command 100 item; panel mengirim 100 pertama yang aktif dan punya deskripsi.
- Model AI Groq yang dipilih lewat `/aimodel` tersimpan di `data/tgfeat.json`.

