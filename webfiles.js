const path = require('path');
const AdmZip = require('adm-zip');

const MAX_FILES = 2000;
const MAX_BYTES = 40 * 1024 * 1024;
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

function extractFiles(buf) {
  let zip;
  try { zip = new AdmZip(buf); } catch (_) { fail('File ZIP tidak bisa dibaca. Pastikan formatnya .zip yang valid.'); }
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  let total = 0;
  for (const e of entries) total += e.header.size;
  if (total > MAX_BYTES) fail('Ukuran isi ZIP melebihi 40 MB.');
  let files = entries
    .map((e) => ({ p: e.entryName.replace(/\\/g, '/').replace(/^\.?\//, ''), e }))
    .filter((f) => !/(^|\/)(__MACOSX|\.git|node_modules)\//.test(f.p) && !/(^|\/)\.DS_Store$/.test(f.p));
  if (!files.length) fail('ZIP kosong.');
  const firsts = new Set(files.map((f) => f.p.split('/')[0]));
  if (firsts.size === 1 && files.every((f) => f.p.includes('/'))) {
    files = files.map((f) => ({ ...f, p: f.p.split('/').slice(1).join('/') }));
  }
  if (files.length > MAX_FILES) fail('Jumlah file melebihi 2000.');
  for (const f of files) {
    if (!f.p || f.p.split('/').includes('..') || path.isAbsolute(f.p)) fail('ZIP berisi path file yang tidak valid.');
  }
  if (!files.some((f) => f.p === 'index.html')) {
    fail('File index.html tidak ditemukan di folder utama ZIP. Pastikan index.html ada di level paling atas.');
  }
  return files.map((f) => ({ p: f.p, data: f.e.getData() }));
}

module.exports = { extractFiles, fail };
