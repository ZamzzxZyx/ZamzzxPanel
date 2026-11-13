/* Renderer Markdown kecil + penyorot sintaks untuk halaman AI. Tanpa dependensi.
   Semua teks di-escape dulu; satu-satunya HTML yang keluar dibuat di sini. */
(() => {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Penyorot sintaks ---------- */
  const KW = new Set(('abstract as async await break case catch class const constructor continue def default defer del do elif else enum except export extends ' +
    'false final finally fn for from func function go goto if impl implements import in instanceof interface is lambda let loop match mod module new nil none null of ' +
    'override package pass private protected pub public raise readonly return self static struct super switch this throw trait true try type typeof undefined unsafe use ' +
    'val var void volatile while with yield print echo fi then done esac begin end elsif unless ' +
    'select insert update delete create table join where group order by limit values into drop alter set and or not primary key foreign references index ' +
    'on as distinct having union all asc desc left right inner outer null').split(' '));
  const HASH = /^(py|python|sh|bash|shell|zsh|yaml|yml|rb|ruby|toml|ini|dockerfile|makefile|conf|env|r|pl|perl|ps1|powershell|gitignore)$/;
  const DASH = /^(sql|lua|hs|haskell|psql|mysql|sqlite)$/;
  const MARK = /^(html|htm|xml|svg|vue|svelte|jsx|tsx|php)$/;
  const NOCOM = /^(json|jsonc|csv|txt|text|log|diff|patch)$/;
  const rxCache = {};

  function rxFor(lang) {
    const key = HASH.test(lang) ? 'h' : DASH.test(lang) ? 'd' : NOCOM.test(lang) ? 'n' : 's';
    const k = key + (MARK.test(lang) ? 'm' : '');
    if (rxCache[k]) return rxCache[k];
    const com = [];
    if (key === 's') com.push('\\/\\*[\\s\\S]*?(?:\\*\\/|$)', '\\/\\/[^\\n]*');
    if (key === 'h') com.push('#[^\\n]*');
    if (key === 'd') com.push('--[^\\n]*', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)');
    if (MARK.test(lang)) com.push('<!--[\\s\\S]*?(?:-->|$)');
    const src = '(' + (com.length ? com.join('|') : '(?!)') + ')' +
      '|("(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?|`(?:\\\\.|[^`\\\\])*`?)' +
      '|(\\b0x[\\da-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?\\b)' +
      (MARK.test(lang) ? '|(<\\/?[A-Za-z][\\w:-]*|\\/?>)' : '|((?!))') +
      '|([A-Za-z_$][\\w$]*)(?=\\s*\\()' +
      '|([A-Za-z_$][\\w$]*)';
    return (rxCache[k] = src);
  }

  function hl(code, lang) {
    const L = (lang || '').toLowerCase();
    if (code.length > 60000) return esc(code);
    const re = new RegExp(rxFor(L), 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      last = m.index + m[0].length;
      const t = esc(m[0]);
      if (m[1] != null && m[1] !== '') out += `<i class="c">${t}</i>`;
      else if (m[2] != null) out += `<i class="s">${t}</i>`;
      else if (m[3] != null) out += `<i class="n">${t}</i>`;
      else if (m[4] != null) out += `<i class="t">${t}</i>`;
      else if (m[5] != null) out += KW.has(m[5].toLowerCase()) ? `<i class="k">${t}</i>` : `<i class="f">${t}</i>`;
      else if (m[6] != null) out += KW.has(m[6].toLowerCase()) && !NOCOM.test(L) ? `<i class="k">${t}</i>` : t;
      else out += t;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- Markdown ---------- */
  function inline(t) {
    const codes = [];
    t = t.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    t = esc(t);
    t = t.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  }

  function listHtml(items) {
    let html = '';
    const stack = [];
    for (const it of items) {
      while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
      const top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) {
        const tag = it.ord ? 'ol' : 'ul';
        stack.push({ indent: it.indent, tag });
        html += `<${tag}${it.ord && it.num !== 1 ? ` start="${it.num}"` : ''}>`;
      } else html += '</li>';
      html += '<li>' + inline(it.text);
    }
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
  }

  const ROW = /^\s*\|?.*\|.*$/;
  const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const FENCE = /^\u0001(\d+)\u0001$/;

  function render(src, opts) {
    opts = opts || {};
    const fences = [];
    if (!opts.nested) {
      src = String(src).replace(/(^|\n)```([^\n]*)\n([\s\S]*?)(\n```[ \t]*(?=\n|$)|$)/g, (m, pre, info, code, end) => {
        fences.push({ lang: info.trim().split(/\s+/)[0].toLowerCase(), code, open: !end });
        return pre + '\u0001' + (fences.length - 1) + '\u0001';
      });
    }
    const lines = src.split('\n');
    const out = [];
    const starts = (l) => FENCE.test(l.trim()) || /^#{1,6}\s/.test(l) || /^>/.test(l) || LI.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if (!l.trim()) { i++; continue; }
      if ((m = l.trim().match(FENCE))) { out.push(opts.fence(fences[+m[1]])); i++; continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (l.startsWith('>')) {
        const q = [];
        while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${render(q.join('\n'), { nested: true, fence: opts.fence })}</blockquote>`);
        continue;
      }
      if (ROW.test(l) && i + 1 < lines.length && SEP.test(lines[i + 1]) && l.includes('|')) {
        const head = cells(l);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
        out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if ((m = l.match(LI))) {
        const items = [];
        while (i < lines.length) {
          const mm = lines[i].match(LI);
          if (mm) {
            items.push({ indent: mm[1].replace(/\t/g, '    ').length, ord: /\d/.test(mm[2]), num: parseInt(mm[2], 10) || 1, text: mm[3] });
            i++;
          } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !FENCE.test(lines[i].trim()) && items.length) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          } else if (!lines[i].trim() && i + 1 < lines.length && LI.test(lines[i + 1])) i++;
          else break;
        }
        // Normalisasi indentasi: tingkat 0 selalu sama
        const base = Math.min(...items.map((x) => x.indent));
        items.forEach((x) => { x.indent -= base; });
        out.push(listHtml(items));
        continue;
      }
      const para = [l];
      i++;
      while (i < lines.length && lines[i].trim() && !starts(lines[i]) && !(ROW.test(lines[i]) && i + 1 < lines.length && SEP.test(lines[i + 1]))) para.push(lines[i++]);
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  window.ZZMD = { esc, hl, render };
})();
