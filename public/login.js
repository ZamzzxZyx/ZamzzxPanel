const f = document.getElementById('f');
const err = document.getElementById('err');
const go = document.getElementById('go');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  go.disabled = true;
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Panel': '1' },
      body: JSON.stringify({ password: document.getElementById('pw').value }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { location.href = '/'; return; }
    err.textContent = j.error || 'Gagal masuk. Coba lagi.';
  } catch (_) {
    err.textContent = 'Tidak bisa menghubungi server. Cek koneksi kamu.';
  }
  go.disabled = false;
});

// Masuk dengan Telegram: bot mengirim tombol Izinkan ke akun pemilik, halaman ini menunggu hasilnya.
(async () => {
  const box = document.getElementById('tgbox'), btn = document.getElementById('tg'), msg = document.getElementById('tgmsg');
  try {
    const c = await (await fetch('/api/login/telegram-config')).json();
    if (!c.enabled) return;
    box.hidden = false;
  } catch (_) { return; }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  btn.addEventListener('click', async () => {
    err.textContent = ''; msg.textContent = ''; btn.disabled = true;
    try {
      const r = await fetch('/api/login/telegram/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Panel': '1' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.error || 'Gagal memulai login Telegram.'; btn.disabled = false; return; }
      msg.innerHTML = 'Permintaan dikirim. Buka Telegram dan tekan <b>Izinkan</b>. <a href="https://t.me/' + encodeURIComponent(j.bot) + '" style="color:var(--accent)">Buka bot</a>';
      for (let i = 0; i < 60; i++) {
        await sleep(2000);
        const p = await (await fetch('/api/login/telegram/poll?nonce=' + encodeURIComponent(j.nonce))).json().catch(() => ({}));
        if (p.status === 'ok') { location.href = '/'; return; }
        if (p.status === 'no') { msg.textContent = ''; err.textContent = 'Permintaan ditolak di Telegram.'; break; }
        if (p.status === 'expired') { msg.textContent = ''; err.textContent = 'Permintaan kedaluwarsa. Coba lagi.'; break; }
      }
      if (!err.textContent && msg.textContent) { msg.textContent = ''; err.textContent = 'Tidak ada respons dari Telegram. Coba lagi.'; }
    } catch (_) { err.textContent = 'Tidak bisa menghubungi server. Cek koneksi kamu.'; }
    btn.disabled = false;
  });
})();
