'use strict';
// Font helpers: map PDF font names to Windows fonts and find the font files.

const FontMatch = (() => {
  const known = {
    helvetica: 'Arial', helv: 'Arial', hebo: 'Arial', arial: 'Arial', arialmt: 'Arial', liberationsans: 'Arial',
    nimbussans: 'Arial', nimbussansl: 'Arial', arimo: 'Arial',
    times: 'Times New Roman', timesroman: 'Times New Roman', timesnewroman: 'Times New Roman',
    timesnewromanps: 'Times New Roman', tiro: 'Times New Roman', liberationserif: 'Times New Roman',
    nimbusroman: 'Times New Roman', tinos: 'Times New Roman',
    courier: 'Courier New', cour: 'Courier New', couriernew: 'Courier New', liberationmono: 'Courier New',
    nimbusmono: 'Courier New', cousine: 'Courier New',
    symbol: 'Symbol', zapfdingbats: 'Wingdings', zadb: 'Wingdings',
    arialnarrow: 'Arial Narrow', arialblack: 'Arial Black', arialunicodems: 'Arial Unicode MS',
    calibri: 'Calibri', calibrilight: 'Calibri Light', cambria: 'Cambria', candara: 'Candara',
    consolas: 'Consolas', constantia: 'Constantia', corbel: 'Corbel', georgia: 'Georgia', verdana: 'Verdana',
    tahoma: 'Tahoma', trebuchetms: 'Trebuchet MS', segoeui: 'Segoe UI', garamond: 'Garamond',
    bookantiqua: 'Book Antiqua', bookmanoldstyle: 'Bookman Old Style', centurygothic: 'Century Gothic',
    century: 'Century', palatino: 'Palatino Linotype', palatinolinotype: 'Palatino Linotype',
    comicsansms: 'Comic Sans MS', lucidaconsole: 'Lucida Console', lucidasans: 'Lucida Sans',
    lucidasansunicode: 'Lucida Sans Unicode', franklingothicbook: 'Franklin Gothic Book',
    franklingothicmedium: 'Franklin Gothic Medium', gillsans: 'Gill Sans MT', gillsansmt: 'Gill Sans MT',
    aptos: 'Aptos', bahnschrift: 'Bahnschrift', sylfaen: 'Sylfaen', microsoftsansserif: 'Microsoft Sans Serif',
    mssansserif: 'Microsoft Sans Serif', dejavusans: 'DejaVu Sans', dejavuserif: 'DejaVu Serif',
    roboto: 'Roboto', opensans: 'Open Sans', sourcesanspro: 'Source Sans Pro', notosans: 'Noto Sans',
  };
  const styleWords = /(bolditalic|boldoblique|semibold|demibold|extrabold|ultrabold|bold|black|heavy|medium|light|thin|regular|roman|italic|oblique|book|normal|condensed|narrow)$/i;

  function splitCamel(s) {
    const c = s.replace(/_/g, ' ').trim();
    if (c.includes(' ')) return c;
    return c.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }

  /** PDF font name -> {family, bold, italic}. flags: PDF font descriptor flags. */
  function match(rawName, weight = -1, flags = 0) {
    let name = String(rawName || '').trim();
    if (name.startsWith('/')) name = name.slice(1);
    name = name.replace(/^[A-Z]{6}\+/, '');
    const lower = name.toLowerCase();
    let bold = weight >= 600 || (flags & (1 << 18)) !== 0 || /bold|black|heavy|semibold|demi/.test(lower);
    let italic = (flags & (1 << 6)) !== 0 || lower.includes('italic') || lower.includes('oblique');
    if (lower === 'hebo') bold = true;
    let base = name.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '');
    const key = base.toLowerCase().replace(/[^a-z0-9]/g, '');
    let family = known[key];
    if (!family) {
      let stripped = key;
      for (let i = 0; i < 3; i++) {
        const m = stripped.match(styleWords);
        if (!m || m.index === 0) break;
        const w = m[0].toLowerCase();
        if (w.includes('bold') || w === 'black' || w === 'heavy') bold = true;
        if (w.includes('italic') || w.includes('oblique')) italic = true;
        stripped = stripped.slice(0, m.index);
      }
      family = known[stripped];
    }
    if (!family) family = splitCamel(base);
    if (!family) family = 'Arial';
    return { family, bold, italic };
  }

  /** "/Helv 10 Tf 0 0 1 rg" -> {font, size, argb} */
  function parseDA(da) {
    const out = { font: null, size: null, argb: null };
    const tf = /\/([^\s/]+)\s+([\d.]+)\s+Tf/.exec(da || '');
    if (tf) {
      out.font = tf[1];
      out.size = parseFloat(tf[2]);
    }
    const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    const rg = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da || '');
    const g = /(?:^|\s)([\d.]+)\s+g(?:\s|$)/.exec(da || '');
    if (rg) out.argb = (0xff000000 | (c(+rg[1]) << 16) | (c(+rg[2]) << 8) | c(+rg[3])) >>> 0;
    else if (g) {
      const v = c(+g[1]);
      out.argb = (0xff000000 | (v << 16) | (v << 8) | v) >>> 0;
    }
    return out;
  }

  return { match, parseDA };
})();

/**
 * Installed fonts. The host (Electron) provides [SystemFonts.provider] with
 * {list(): [{name, path}], read(path): Uint8Array}.
 */
const SystemFonts = (() => {
  let index = null; // lower-case registry name -> path
  const cache = new Map();

  function load() {
    if (index) return index;
    index = new Map();
    const provider = SystemFonts.provider;
    if (!provider) return index;
    try {
      for (const { name, path } of provider.list()) {
        const key = name.toLowerCase().trim();
        if (!index.has(key)) index.set(key, path);
      }
    } catch (e) {
      console.warn('font list failed', e);
    }
    return index;
  }

  function read(path) {
    if (cache.has(path)) return cache.get(path);
    let data = null;
    try {
      data = SystemFonts.provider ? SystemFonts.provider.read(path) : null;
    } catch (e) {
      data = null;
    }
    cache.set(path, data);
    return data;
  }

  /** Whether a TrueType font has glyphs for every character of [text]. */
  function covers(data, text) {
    try {
      const need = new Set();
      for (const ch of text) { const c = ch.codePointAt(0); if (c > 32) need.add(c); }
      if (!need.size) return true;
      const rd16 = (o) => (data[o] << 8) | data[o + 1];
      const rd32 = (o) => ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0;
      const n = rd16(4);
      let cmap = -1;
      for (let i = 0; i < n; i++) {
        const rec = 12 + i * 16;
        if (rd32(rec) === 0x636d6170) cmap = rd32(rec + 8);
      }
      if (cmap < 0) return false;
      const count = rd16(cmap + 2);
      let sub4 = -1, sub12 = -1;
      for (let i = 0; i < count; i++) {
        const rec = cmap + 4 + i * 8;
        const pid = rd16(rec), eid = rd16(rec + 2), off = cmap + rd32(rec + 4);
        const fmt = rd16(off);
        if (pid === 3 && eid === 10 && fmt === 12) sub12 = off;
        if (pid === 3 && eid === 1 && fmt === 4) sub4 = off;
        if (pid === 0 && fmt === 12 && sub12 < 0) sub12 = off;
        if (pid === 0 && fmt === 4 && sub4 < 0) sub4 = off;
      }
      const has = (c) => {
        if (sub12 >= 0) {
          const groups = rd32(sub12 + 12);
          for (let g = 0; g < groups; g++) {
            const o = sub12 + 16 + g * 12;
            if (c >= rd32(o) && c <= rd32(o + 4)) return true;
          }
          return false;
        }
        if (sub4 >= 0 && c <= 0xffff) {
          const segX2 = rd16(sub4 + 6);
          const ends = sub4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
          for (let s = 0; s < segX2; s += 2) {
            const end = rd16(ends + s);
            if (c > end) continue;
            const start = rd16(starts + s);
            if (c < start) return false;
            const ro = rd16(ranges + s);
            if (ro === 0) return ((c + rd16(deltas + s)) & 0xffff) !== 0;
            const gi = rd16(ranges + s + ro + (c - start) * 2);
            return gi !== 0;
          }
        }
        return false;
      };
      for (const c of need) if (!has(c)) return false;
      return true;
    } catch (e) {
      return true;
    }
  }

  // Look-alike families, tried when the exact one is missing (same kind of letters).
  const ALIAS = { calibri: 'Carlito', cambria: 'Caladea', arial: 'Liberation Sans', helvetica: 'Liberation Sans', 'times new roman': 'Liberation Serif', times: 'Liberation Serif', 'courier new': 'Liberation Mono', courier: 'Liberation Mono', 'segoe ui': 'Roboto', tahoma: 'Liberation Sans', verdana: 'Liberation Sans' };
  const SERIF = ['Times New Roman', 'Liberation Serif', 'Georgia', 'Cambria', 'Caladea', 'Book Antiqua', 'DejaVu Serif', 'Noto Serif'];
  const MONO = ['Courier New', 'Liberation Mono', 'Consolas', 'Lucida Console', 'DejaVu Sans Mono'];
  const SANS = ['Arial', 'Liberation Sans', 'Segoe UI', 'Tahoma', 'Verdana', 'Calibri', 'Carlito', 'DejaVu Sans', 'Roboto', 'Noto Sans'];
  const SERIF_RE = /times|serif|roman|georgia|cambria|garamond|antiqua|bookman|palatino|century|constantia|minion|baskerville|caslon|tinos|sylfaen/i;
  const MONO_RE = /courier|mono|consolas|console|cousine|typewriter/i;

  function withStyles(list, fam, bold, italic) {
    const f = fam.toLowerCase();
    if (bold && italic) list.push([`${f} bold italic`, fam, true, true], [`${f} bolditalic`, fam, true, true]);
    if (bold) list.push([`${f} bold`, fam, true, false]);
    if (italic) list.push([`${f} italic`, fam, false, true], [`${f} oblique`, fam, false, true]);
    list.push([f, fam, false, false], [`${f} regular`, fam, false, false]);
  }

  /** Font file for writing text (TrueType only), with glyphs for [text]. */
  const found = new Map();
  function findTrueType(family, bold = false, italic = false, text = 'ăâîșțĂÂÎȘȚ') {
    const special = [...new Set(String(text).replace(/[\x00-\x7f]/g, ''))].sort().join('');
    const memo = `${String(family || '').toLowerCase()}|${bold ? 1 : 0}${italic ? 1 : 0}|${special}`;
    if (found.has(memo)) return found.get(memo);
    const r = findTrueTypeSlow(family, bold, italic, text);
    found.set(memo, r);
    return r;
  }
  function findTrueTypeSlow(family, bold, italic, text) {
    const idx = load();
    family = String(family || 'Arial').trim();
    const cands = [];
    withStyles(cands, family, bold, italic);
    // metric-compatible free fonts (bundled on the phone)
    const alias = ALIAS[family.toLowerCase()];
    if (alias) withStyles(cands, alias, bold, italic);
    const similar = MONO_RE.test(family) && !/sans mono/i.test(family) ? MONO : SERIF_RE.test(family) && !/sans/i.test(family) ? SERIF : SANS;
    for (const fam of [...similar, ...SANS]) if (fam.toLowerCase() !== family.toLowerCase()) withStyles(cands, fam, bold, italic);
    for (const [name, fam, b, i] of cands) {
      const path = idx.get(name);
      if (!path || !/\.ttf$/i.test(path)) continue;
      const data = read(path);
      if (data && covers(data, text)) return { key: path, bytes: data, family: fam, bold: b, italic: i };
    }
    // Anything TrueType as a very last resort (plain styles first).
    // (common wide-coverage families first; on a phone only a few files, each read is slow)
    const rank = (n) => (/bold|italic|oblique|black|light|thin|medium/i.test(n) ? 2 : 0) + (/^(noto sans|roboto|dejavu sans|droid sans|liberation sans)/i.test(n) ? 0 : 1);
    const rest = [...idx.entries()].filter(([, p]) => /\.ttf$/i.test(p)).sort((a, b) => rank(a[0]) - rank(b[0])).slice(0, typeof Host !== 'undefined' && Host.mobile ? 12 : 400);
    for (const [name, path] of rest) {
      if (!/\.ttf$/i.test(path)) continue;
      const data = read(path);
      if (data && covers(data, text)) return { key: path, bytes: data, family: name.replace(/\b\w/g, (m) => m.toUpperCase()), bold: false, italic: false };
    }
    return null;
  }

  /** Font file used to *display* a non-embedded font (any format PDFium reads). */
  function findForDisplay(face, weight, italic) {
    const idx = load();
    const m = FontMatch.match(face, weight);
    const f = m.family.toLowerCase();
    const bold = m.bold || weight >= 600;
    const it = m.italic || italic;
    const names = [];
    if (bold && it) names.push(`${f} bold italic`);
    if (bold) names.push(`${f} bold`);
    if (it) names.push(`${f} italic`);
    names.push(f, `${f} regular`);
    const al = ALIAS[f];
    if (al) { const a = al.toLowerCase(); if (bold && it) names.push(`${a} bold italic`); if (bold) names.push(`${a} bold`); if (it) names.push(`${a} italic`); names.push(a, `${a} regular`); }
    for (const n of names) {
      const path = idx.get(n);
      if (path) {
        const data = read(path);
        if (data) return { data, face: m.family };
      }
    }
    return null;
  }

  // Exact font files registered as web fonts for the on-screen text editor.
  const faces = new Map();
  function cssFace(font) {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null;
    if (faces.has(font.key)) return faces.get(font.key);
    const name = `pdfed-font-${faces.size + 1}`;
    try {
      const ff = new FontFace(name, font.bytes.slice().buffer);
      document.fonts.add(ff);
      ff.load().catch(() => {});
      faces.set(font.key, name);
      return name;
    } catch (e) {
      faces.set(font.key, null);
      return null;
    }
  }

  return { provider: null, findTrueType, findForDisplay, load, covers, cssFace };
})();
