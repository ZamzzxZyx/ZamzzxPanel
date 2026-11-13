# Panel APK Builder

Repo ini dibuat dan dikelola otomatis oleh panel. Jangan diubah manual.

- `builds/<id>.zip`: konfigurasi dan aset satu build (dihapus panel setelah selesai)
- `tools/generate.py`: membuat proyek Android dari konfigurasi
- `.github/workflows/build-apk.yml`: workflow build
- `signing/panel.jks`: keystore (dibuat otomatis pada build pertama, simpan repo ini tetap private)
