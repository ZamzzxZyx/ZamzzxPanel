#!/usr/bin/env python3
"""
Uploader Telegram untuk file besar (sampai 2 GB) lewat MTProto (Telethon).

Panel memakai skrip ini hanya untuk file di atas 50 MB. Bot tetap di cloud Telegram,
tidak perlu server Bot API lokal dan tidak perlu logout dari cloud.

Pasang:   pip install telethon
Jalankan: TG_API_ID=... TG_API_HASH=... TG_BOT_TOKEN=... UPLOADER_SECRET=kunci-panjang python tools/tg_uploader.py

Skrip hanya mendengarkan 127.0.0.1 dan hanya mau membaca file sementara milik panel
(nama diawali "zz-" di folder temp), jadi kunci bocor pun tidak bisa dipakai membaca file lain.
"""
import asyncio
import hmac
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from telethon import TelegramClient, types
from telethon.errors import FloodWaitError

HERE = os.path.dirname(os.path.abspath(__file__))


def need(name):
    v = os.environ.get(name, '').strip()
    if not v:
        sys.exit(f'Variabel {name} belum diisi. Lihat komentar di atas file ini.')
    return v


API_ID = int(need('TG_API_ID'))
API_HASH = need('TG_API_HASH')
BOT_TOKEN = need('TG_BOT_TOKEN')
SECRET = need('UPLOADER_SECRET')
if len(SECRET) < 8:
    sys.exit('UPLOADER_SECRET minimal 8 karakter.')
HOST = os.environ.get('UPLOADER_HOST', '127.0.0.1')
PORT = int(os.environ.get('UPLOADER_PORT', '8090'))
ALLOWED_DIR = os.path.realpath(os.environ.get('UPLOADER_DIR') or tempfile.gettempdir())
MAX_BYTES = 2000 * 1024 * 1024

loop = asyncio.new_event_loop()
client = TelegramClient(os.environ.get('UPLOADER_SESSION') or os.path.join(HERE, 'uploader'), API_ID, API_HASH, loop=loop)
ME = {}
send_lock = None  # dibuat di dalam loop


def safe_path(p):
    """Hanya file sementara panel: di folder temp, nama diawali zz-."""
    rp = os.path.realpath(str(p or ''))
    if os.path.dirname(rp) != ALLOWED_DIR or not os.path.basename(rp).startswith('zz-'):
        raise ValueError('Path file tidak diizinkan.')
    if not os.path.isfile(rp):
        raise ValueError('File tidak ditemukan.')
    if os.path.getsize(rp) > MAX_BYTES:
        raise ValueError('File lebih dari 2 GB.')
    return rp


async def resolve(chat_id, username):
    tries = []
    s = str(chat_id or '').strip()
    if s.lstrip('-').isdigit():
        tries.append(int(s))
    if username:
        tries.append('@' + str(username).lstrip('@'))
    last = None
    for t in tries:
        try:
            return await client.get_input_entity(t)
        except Exception as e:  # noqa: BLE001
            last = e
    raise ValueError(
        'Chat tidak ketemu oleh uploader. Untuk grup/saluran privat, kirim /id di chat itu '
        'saat skrip ini menyala, atau pakai grup/saluran dengan @username. ' + (f'({last})' if last else '')
    )


async def do_send(body):
    path = safe_path(body.get('path'))
    name = os.path.basename(str(body.get('name') or 'file'))[:120] or 'file'
    caption = str(body.get('caption') or '')[:1024] or None
    entity = await resolve(body.get('chat_id'), body.get('username'))
    async with send_lock:  # satu unggahan sekali jalan
        for attempt in (1, 2):
            try:
                await client.send_file(
                    entity, path, caption=caption, force_document=True,
                    parse_mode='html' if body.get('parse') == 'HTML' else None,
                    attributes=[types.DocumentAttributeFilename(name)],
                )
                return
            except FloodWaitError as e:
                if attempt == 2 or e.seconds > 60:
                    raise ValueError(f'Telegram minta tunggu {e.seconds} detik.')
                await asyncio.sleep(e.seconds + 1)


class Handler(BaseHTTPRequestHandler):
    server_version = 'zz-uploader'

    def log_message(self, *a):  # senyap
        pass

    def reply(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        got = self.headers.get('X-Secret', '')
        if hmac.compare_digest(got.encode(), SECRET.encode()):
            return True
        self.reply(401, {'ok': False, 'error': 'Kunci rahasia salah.'})
        return False

    def do_GET(self):
        if self.path != '/health' or not self.authed():
            return None if self.path == '/health' else self.reply(404, {'ok': False, 'error': 'Tidak ditemukan.'})
        self.reply(200, {'ok': True, **ME})

    def do_POST(self):
        if self.path != '/send' or not self.authed():
            return None if self.path == '/send' else self.reply(404, {'ok': False, 'error': 'Tidak ditemukan.'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if n <= 0 or n > 20000:
                raise ValueError('Permintaan tidak valid.')
            body = json.loads(self.rfile.read(n))
            asyncio.run_coroutine_threadsafe(do_send(body), loop).result(timeout=45 * 60)
            self.reply(200, {'ok': True})
        except ValueError as e:
            self.reply(422, {'ok': False, 'error': str(e)})
        except Exception as e:  # noqa: BLE001
            self.reply(500, {'ok': False, 'error': f'Gagal mengirim: {type(e).__name__}: {e}'})


async def main():
    global send_lock
    send_lock = asyncio.Lock()
    # Buka port dulu: kalau sudah dipakai (misalnya skrip ini sudah jalan di tmux), berhenti dengan pesan jelas
    try:
        srv = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        sys.exit(
            f'Port {PORT} sudah dipakai ({e.strerror}). Kemungkinan skrip ini sudah berjalan di latar belakang.\n'
            f'  Cek:       tmux ls\n'
            f'  Hentikan:  tmux kill-session -t uploader   (atau: pkill -f tg_uploader.py)\n'
            f'  Atau pakai port lain: UPLOADER_PORT=8091 python tools/tg_uploader.py'
        )
    await client.start(bot_token=BOT_TOKEN)
    me = await client.get_me()
    ME.update({'id': me.id, 'bot': me.username})
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f'Uploader siap di http://{HOST}:{PORT} sebagai @{me.username}', flush=True)
    await client.run_until_disconnected()


if __name__ == '__main__':
    try:
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        pass
    finally:
        try:
            if client.is_connected():
                loop.run_until_complete(client.disconnect())
        except Exception:  # noqa: BLE001
            pass
