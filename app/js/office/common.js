'use strict';
// Shared parts of the office editors (Document, Tabel, Prezentare):
// file type detection, where files are saved, color picker, PDF export.

const Office = (() => {
  const editors = []; // {screen, isDirty(), save(), name()}

  // ---------------------------------------------------------------------------
  // What kind of file is this?
  // ---------------------------------------------------------------------------

  /** 'pdf' | 'image' | 'word' | 'wordOld' | 'text' | 'sheet' | 'slides' | 'slidesOld' | 'odf' | 'office' | 'empty' | 'unknown' */
  function kindOf(path, b) {
    const ext = Host.ext(path);
    if (!b.length) return 'empty';
    const head = String.fromCharCode(...b.subarray(0, Math.min(1024, b.length)));
    if (head.includes('%PDF')) return 'pdf';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image';
    if (b[0] === 0xff && b[1] === 0xd8) return 'image';
    if (head.startsWith('GIF8') || head.startsWith('BM')) return 'image';
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image';
    if (b[0] === 0x50 && b[1] === 0x4b) {
      // ZIP: look at the names inside (they are stored in plain text)
      const txt = latin(b, 0, Math.min(b.length, 200000)) + latin(b, Math.max(0, b.length - 65536), b.length);
      if (txt.includes('word/document.xml')) return 'word';
      if (txt.includes('xl/workbook.xml') || txt.includes('xl/workbook.bin')) return 'sheet';
      if (txt.includes('ppt/presentation.xml')) return 'slides';
      if (txt.includes('application/vnd.oasis.opendocument.spreadsheet')) return 'sheet';
      if (txt.includes('application/vnd.oasis.opendocument')) return 'odf';
      if (ext === 'docx') return 'word';
      if (ext === 'xlsx' || ext === 'xlsm') return 'sheet';
      if (ext === 'pptx') return 'slides';
      return 'unknown';
    }
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
      if (ext === 'xls') return 'sheet';
      if (ext === 'ppt' || ext === 'pps') return 'slidesOld';
      if (ext === 'doc' || ext === 'dot') return 'wordOld';
      const txt = latin(b, 0, Math.min(b.length, 600000));
      if (/W\0o\0r\0k\0b\0o\0o\0k|Workbook/.test(txt)) return 'sheet';
      if (/P\0o\0w\0e\0r\0P\0o\0i\0n\0t/.test(txt)) return 'slidesOld';
      if (/W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t/.test(txt)) return 'wordOld';
      return 'office';
    }
    if (ext === 'csv') return 'sheet';
    if (ext === 'txt' || ext === 'md' || ext === 'log') return 'text';
    if (head.startsWith('{\\rtf')) return 'text';
    // looks like plain text?
    const sample = b.subarray(0, Math.min(b.length, 4096));
    let bad = 0;
    for (const x of sample) if (x < 9 || (x > 13 && x < 32)) bad++;
    if (bad < sample.length * 0.01) return ext === 'tsv' ? 'sheet' : 'text';
    return 'unknown';
  }

  function latin(b, from, to) {
    let s = '';
    for (let i = from; i < to; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(to, i + 8192)));
    return s;
  }

  // ---------------------------------------------------------------------------
  // Where files go. Opened files are never overwritten: the first save makes
  // "<nume>_editat_<n>.<ext>" next to the original; new files ask for a name.
  // ---------------------------------------------------------------------------

  const EDITED_RE = /_editat_(\d+)$/i;
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

  function sourceFor(path) {
    if (!path) return null;
    const base = Host.baseName(path).replace(/\.[^.]+$/, '').replace(EDITED_RE, '');
    return { dir: Host.dirName(path), base, path };
  }

  function nextCopy(dir, base, ext) {
    let max = 0;
    const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_editat_(\\d+)\\.' + ext + '$', 'i');
    for (const f of Host.listDir(dir)) { const m = re.exec(f); if (m) max = Math.max(max, +m[1]); }
    return Host.join(dir, `${base}_editat_${max + 1}.${ext}`);
  }

  async function docsDir() {
    return Host.specialDir('documents');
  }

  function freeName(dir, base, ext) {
    let name = base, i = 2;
    while (Host.exists(Host.join(dir, `${name}.${ext}`))) name = `${base} ${i++}`;
    return name;
  }

  /** Asks the file name (with the extension shown) and where. Returns the full path or null. */
  async function askName({ title, base, dir, ext }) {
    dir = dir || (await docsDir());
    const def = freeName(dir, base, ext);
    const target = await UI.modal((box, close) => {
      const input = el('input', { type: 'text', spellcheck: 'false' });
      input.value = def;
      let where = dir;
      const other = Host.mobile ? null : el('button', { class: 'btn', text: 'Altă locație…', type: 'button' });
      if (other) other.addEventListener('click', async () => {
        const p = await Host.saveDialog(clean(input.value) + '.' + ext, where, ext);
        if (p) close(p);
      });
      const ok = () => {
        const name = clean(input.value);
        if (!name) { input.focus(); return; }
        close(Host.join(where, name + '.' + ext));
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      box.append(
        el('h2', { text: title || 'Salvează' }),
        el('p', { text: 'Numele fișierului:' }),
        el('div', { class: 'name-row' }, [input, el('span', { text: '.' + ext })]),
        el('div', { class: 'muted small', style: { marginTop: '8px' }, text: 'Se salvează în: ' + (Host.mobile ? 'ACM Docs' : where) }),
        el('div', { class: 'actions' }, [other, el('div', { class: 'spacer' }), el('button', { class: 'btn', text: 'Anulează', onclick: () => close(null) }), el('button', { class: 'btn primary', text: 'Salvează', onclick: ok })]),
      );
      if (!UI.phone()) setTimeout(() => { input.focus(); input.select(); }, 40);
    });
    if (!target) return null;
    if (Host.exists(target) && !(await UI.confirm('Fișierul există deja', `„${Host.baseName(target)}” există. Îl înlocuiesc?`, 'Înlocuiește'))) return null;
    return target;
  }

  /** Path to save [st] to. st: {source, copyPath}. */
  /** A document received encrypted: saving asks first and goes to "Decriptate". */
  async function guardProtected(st) {
    if (typeof Shield === 'undefined' || !st.source || !Shield.isProtected(st.source.path)) return true;
    const dir = await Shield.plainSaveDir(st.source.path);
    if (!dir) return false;
    st.source.dir = dir;
    return true;
  }

  async function target(st, ext, newBase, title) {
    if (!(await guardProtected(st))) return null;
    if (st.copyPath) return st.copyPath;
    if (st.source && st.source.dir) return nextCopy(st.source.dir, st.source.base, ext);
    return askName({ title: title || 'Salvează', base: newBase, ext });
  }

  async function saveAsDialog(st, ext, newBase) {
    if (!(await guardProtected(st))) return null;
    const suggestion = st.source && st.source.dir ? nextCopy(st.source.dir, st.source.base, ext) : Host.join(await docsDir(), freeName(await docsDir(), newBase, ext) + '.' + ext);
    const p = await Host.saveDialog(Host.baseName(suggestion), Host.dirName(suggestion), ext);
    if (!p) return null;
    if (st.source && st.source.path === p && !(await UI.confirm('Suprascrii originalul?', 'Ai ales chiar fișierul original. Dacă continui, originalul se pierde.', 'Suprascrie'))) return null;
    return p;
  }

  /** Writes bytes, remembers the file on the start screen, reports. */
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function writeFile(st, path, bytes, thumbEl) {
    // one action of the plan per document and month (the server counts; the same file counts once)
    if (typeof Plan !== 'undefined' && !(await Plan.allow('docs', (st.source && st.source.path) || path))) return false;
    // picture for the start screen first, while nothing covers the page
    let thumb = null;
    if (thumbEl) { await frame(); thumb = await thumbOf(thumbEl); }
    UI.busy('Se salvează…');
    try {
      Host.writeFile(path, bytes);
      const first = st.copyPath !== path;
      st.copyPath = path;
      App.rememberFile(path, st.source ? 'edited' : 'original', thumb, st.source && st.source.path);
      UI.toast(first && st.source ? `Salvat separat: ${Host.baseName(path)} — originalul a rămas neatins.` : `Salvat: ${Host.baseName(path)}`, {
        duration: 5000, action: { label: Host.mobile ? 'Trimite' : 'Arată în folder', run: () => Host.showInFolder(path) },
      });
      return true;
    } catch (e) {
      console.error(e);
      UI.toast('Salvarea nu a reușit: ' + (/EBUSY|EPERM|EACCES/.test(String(e.code || e.message)) ? 'fișierul e deschis în alt program sau folderul e protejat.' : e.message || e), { error: true });
      return false;
    } finally {
      UI.busy(null);
    }
  }

  async function thumbOf(node) {
    try {
      const r = node.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return null;
      const h = Math.min(r.height, r.width * 1.42);
      return await Host.capture({ x: r.left, y: r.top, w: r.width, h });
    } catch (e) { return null; }
  }

  /** Turns HTML into a PDF next to the document (asks the name), offers to open it. */
  async function exportPdf(st, html, newBase, opts) {
    if (!(await guardProtected(st))) return;
    const dir = st.source && st.source.dir ? st.source.dir : await docsDir();
    const base = st.copyPath ? Host.baseName(st.copyPath).replace(/\.[^.]+$/, '') : st.source ? st.source.base : newBase;
    const p = await askName({ title: 'Exportă ca PDF', base, dir, ext: 'pdf' });
    if (!p) return;
    if (typeof Plan !== 'undefined' && !(await Plan.allow('docs', (st.source && st.source.path) || st.copyPath || p))) return;
    UI.busy('Se creează PDF-ul…');
    try {
      const bytes = await Host.htmlToPdf(html, opts);
      Host.writeFile(p, bytes);
      App.rememberFile(p, 'original', bytes);
      UI.busy(null);
      UI.toast(`PDF creat: ${Host.baseName(p)}`, { duration: 6000, action: { label: 'Deschide', run: () => App.openPath(p) } });
    } catch (e) {
      UI.busy(null);
      UI.errorDetails('Nu am putut crea PDF-ul', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Color picker (Office-like palette)
  // ---------------------------------------------------------------------------

  const PALETTE = [
    ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
    ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'],
    ['#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc', '#e6b8af', '#c9daf8'],
    ['#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0', '#dd7e6b', '#6d9eeb'],
    ['#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47', '#1d5b79', '#c4161c'],
  ];
  let picker = null;
  function closePicker() {
    if (picker) { picker.remove(); picker = null; document.removeEventListener('pointerdown', outside, true); }
  }
  function outside(e) { if (picker && !picker.contains(e.target)) closePicker(); }

  /** Shows a palette under [anchor]. onPick(color|null). allowNone adds "Fără". */
  function pickColor(anchor, { onPick, allowNone = false, noneLabel = 'Fără culoare' } = {}) {
    closePicker();
    const box = el('div', { class: 'cpop' });
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); });
    if (allowNone) {
      const n = el('button', { class: 'cnone', type: 'button', html: '<i></i><span>' + noneLabel + '</span>' });
      n.addEventListener('click', () => { closePicker(); onPick(null); });
      box.append(n);
    }
    for (const row of PALETTE) {
      const r = el('div', { class: 'crow' });
      for (const c of row) {
        const b = el('button', { class: 'csw', type: 'button', title: c, style: { background: c } });
        b.addEventListener('click', () => { closePicker(); onPick(c); });
        r.append(b);
      }
      box.append(r);
    }
    const custom = el('input', { type: 'color', value: '#1d5b79' });
    custom.addEventListener('change', () => { closePicker(); onPick(custom.value); });
    box.append(el('label', { class: 'cmore' }, [custom, el('span', { text: 'Altă culoare…' })]));
    document.body.append(box);
    const r = anchor.getBoundingClientRect();
    const bw = 236;
    box.style.left = Math.max(6, Math.min(window.innerWidth - bw - 6, r.left)) + 'px';
    box.style.top = Math.min(window.innerHeight - box.offsetHeight - 6, r.bottom + 4) + 'px';
    picker = box;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  // ---------------------------------------------------------------------------
  // Small UI helpers for toolbars
  // ---------------------------------------------------------------------------

  /** Button that keeps the text selection (does not steal focus). */
  function tbtn(icon, title, onClick, opts = {}) {
    const b = el('button', { class: 'ob' + (opts.wide ? ' wide' : ''), title, type: 'button', html: (icon ? svg(icon) : '') + (opts.label ? `<span>${opts.label}</span>` : '') });
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); onClick(b, e); });
    return b;
  }

  function colorBtn(icon, title, get, onPick, allowNone) {
    const b = el('button', { class: 'ob color', title, type: 'button', html: svg(icon) + '<i class="bar"></i>' });
    const paint = () => { b.querySelector('.bar').style.background = get() || 'transparent'; };
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => pickColor(b, { allowNone, onPick: (c) => { onPick(c); paint(); } }));
    b.repaint = paint;
    paint();
    return b;
  }

  function select(options, value, onChange, cls, title) {
    const s = el('select', { class: 'osel ' + (cls || ''), title: title || '' });
    for (const o of options) {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      s.append(el('option', { value: v, text: label, selected: String(v) === String(value) }));
    }
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  const sep = () => el('div', { class: 'osep' });

  // ---------------------------------------------------------------------------
  // Editors registry (unsaved changes when leaving / closing)
  // ---------------------------------------------------------------------------

  function register(ed) { editors.push(ed); }
  function active() { return editors.find((e) => !document.getElementById(e.screen).classList.contains('hidden')) || null; }
  function anyDirty() { return editors.some((e) => e.isDirty()); }

  /** Asks to save the editor that is open (if it has changes). false = stay. */
  async function ensureSaved(ed) {
    ed = ed || active();
    if (!ed || !ed.isDirty()) return true;
    const r = await UI.askUnsaved(ed.name());
    if (r === 'cancel') return false;
    if (r === 'save') return ed.save();
    ed.discard && ed.discard();
    return true;
  }

  // Common fonts available on Windows 7+
  const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Cambria', 'Georgia', 'Segoe UI', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Impact'];

  function dataUrlToBytes(url) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(url || '');
    if (!m) return null;
    return { mime: m[1] || 'application/octet-stream', bytes: m[2] ? Host.fromB64(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3])) };
  }

  /** Image file -> data URL, resized to at most [max] px. */
  async function imageDataUrl(max = 1600) {
    const p = await Host.openDialog('image');
    if (!p) return null;
    const bytes = Host.readFile(p);
    const url = URL.createObjectURL(new Blob([bytes]));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      let w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      const c = el('canvas', { width: w, height: h });
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const png = /\.png$/i.test(p) || /\.gif$/i.test(p);
      return { url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------------------------------------------------------------------------
  // Cropping a picture (documents, slides, PDF): one window, the same everywhere
  // ---------------------------------------------------------------------------

  /**
   * Shows the picture [src] (a URL) with a frame to keep; drag the frame or its handles, or pick a shape.
   * Resolves to the part kept as fractions {x, y, w, h} of the picture, or null when cancelled.
   */
  function cropDialog(src, start) {
    return UI.modal((box, close) => {
      box.classList.add('acm-ui', 'crop-modal');
      box.dataset.sticky = '1';
      const img = el('img', { src, draggable: false, alt: '' });
      const frame = el('div', { class: 'crop-frame' }, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => el('i', { class: 'ch ' + h, 'data-h': h })));
      const stage = el('div', { class: 'crop-stage' }, [img, el('div', { class: 'crop-shade' }), frame]);
      let r = { x: 0, y: 0, w: 1, h: 1, ...(start || {}) };
      let ratio = 0; // 0 = free; otherwise width / height of the kept part, in picture pixels
      let nat = { w: 1, h: 1 };
      const draw = () => {
        const W = img.clientWidth, H = img.clientHeight;
        Object.assign(frame.style, { left: r.x * W + 'px', top: r.y * H + 'px', width: r.w * W + 'px', height: r.h * H + 'px' });
        stage.querySelector('.crop-shade').style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.x * 100}% ${r.y * 100}%, ${r.x * 100}% ${(r.y + r.h) * 100}%, ${(r.x + r.w) * 100}% ${(r.y + r.h) * 100}%, ${(r.x + r.w) * 100}% ${r.y * 100}%, ${r.x * 100}% ${r.y * 100}%)`;
        size.textContent = `${Math.round(r.w * nat.w)} × ${Math.round(r.h * nat.h)} px`;
      };
      // a fixed shape: the largest part with that shape, in the middle of what is kept now
      const applyRatio = () => {
        if (!ratio) return draw();
        const k = ratio * (nat.h / nat.w); // in fractions
        let w = r.w, h = w / k;
        if (h > 1) { h = 1; w = h * k; }
        if (h > r.h && r.h * k <= 1) { h = r.h; w = h * k; }
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        r = { w, h, x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)) };
        draw();
      };
      const chips = el('div', { class: 'chips crop-chips' });
      const shapes = [['Liber', 0], ['Original', -1], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];
      for (const [label, v] of shapes) {
        const b = el('button', { class: 'chip' + (v === 0 ? ' on' : ''), type: 'button', text: label });
        b.addEventListener('click', () => { chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); ratio = v === -1 ? nat.w / nat.h : v; applyRatio(); });
        chips.append(b);
      }
      const size = el('span', { class: 'crop-size muted small' });
      // dragging the frame (move) or a handle (resize), with a mouse or a finger
      let drag = null;
      stage.addEventListener('pointerdown', (e) => {
        const h = e.target.dataset && e.target.dataset.h;
        if (!h && !e.target.closest('.crop-frame')) return;
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        drag = { h: h || 'move', x: e.clientX, y: e.clientY, r: { ...r } };
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const W = img.clientWidth, H = img.clientHeight;
        const dx = (e.clientX - drag.x) / W, dy = (e.clientY - drag.y) / H;
        const o = drag.r, MIN = 0.04;
        let { x, y, w, h } = o;
        if (drag.h === 'move') { x = Math.max(0, Math.min(1 - w, o.x + dx)); y = Math.max(0, Math.min(1 - h, o.y + dy)); }
        else {
          if (drag.h.includes('w')) { x = Math.max(0, Math.min(o.x + o.w - MIN, o.x + dx)); w = o.x + o.w - x; }
          if (drag.h.includes('e')) { w = Math.max(MIN, Math.min(1 - o.x, o.w + dx)); }
          if (drag.h.includes('n')) { y = Math.max(0, Math.min(o.y + o.h - MIN, o.y + dy)); h = o.y + o.h - y; }
          if (drag.h.includes('s')) { h = Math.max(MIN, Math.min(1 - o.y, o.h + dy)); }
          if (ratio) {
            const k = ratio * (nat.h / nat.w);
            if (drag.h === 'n' || drag.h === 's') w = Math.min(1 - x, h * k); else h = Math.min(drag.h.includes('n') ? o.y + o.h : 1 - y, w / k);
            w = h * k;
            if (drag.h.includes('w')) x = o.x + o.w - w;
            if (drag.h.includes('n')) y = o.y + o.h - h;
          }
        }
        r = { x, y, w, h };
        draw();
      });
      const end = () => { drag = null; };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      img.addEventListener('load', () => { nat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 }; draw(); });
      const ro = new ResizeObserver(draw);
      ro.observe(stage);
      box.append(
        el('h2', { text: 'Decupează imaginea' }),
        el('p', { class: 'muted small', text: 'Trage chenarul sau colțurile lui. Ce e în afară se taie.' }),
        stage, el('div', { class: 'crop-row' }, [chips, size]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn', type: 'button', text: 'Resetează', onclick: () => { r = { x: 0, y: 0, w: 1, h: 1 }; applyRatio(); } }),
          el('div', { class: 'spacer' }),
          el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => { ro.disconnect(); close(null); } }),
          el('button', { class: 'btn primary', type: 'button', text: 'Decupează', onclick: () => { ro.disconnect(); close(r.w > 0.999 && r.h > 0.999 ? null : { ...r }); } }),
        ]),
      );
    });
  }

  /** The kept part of the picture at [url], as a new data URL (PNG keeps transparency). */
  async function cropDataUrl(url, r) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const sx = Math.round(r.x * img.naturalWidth), sy = Math.round(r.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(r.w * img.naturalWidth)), sh = Math.max(1, Math.round(r.h * img.naturalHeight));
    const c = el('canvas', { width: sw, height: sh });
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const png = /^data:image\/(png|gif|webp|svg)/.test(url);
    return { url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92), width: sw, height: sh };
  }

  return {
    kindOf, sourceFor, target, saveAsDialog, writeFile, askName, exportPdf, thumbOf, docsDir, clean,
    pickColor, closePicker, tbtn, colorBtn, select, sep, register, active, anyDirty, ensureSaved, FONTS, dataUrlToBytes, imageDataUrl,
    cropDialog, cropDataUrl,
  };
})();
