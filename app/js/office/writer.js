'use strict';
// "Document": a text editor like Word. Opens .docx .doc .txt, saves .docx, exports PDF.
// The page is an editable A4 sheet; saving reads the real look of every piece of
// text (fonts, sizes, colors, alignment, lists, tables, images) and writes it to .docx.

const Writer = (() => {
  const $ = (id) => document.getElementById(id);
  const PAGE_W = 794, PAGE_H = 1123; // A4 at 96 dpi
  const PX_TWIP = 15; // 1 px = 15 twips (1/1440 inch)

  let st = null; // {source, copyPath, dirty, name}
  let margins = { t: 96, r: 96, b: 96, l: 96 };
  let undoStack = [], redoStack = [];
  let lastInput = 0;
  let zoom = 1;
  let toolsBuilt = false;
  const tools = {};
  let selImg = null;
  let savedRange = null;

  const page = () => $('wr-page');

  // ---------------------------------------------------------------------------
  // Default look of a document (like Word: Calibri 11)
  // ---------------------------------------------------------------------------

  const BASE_CSS = `
.wr-doc { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 11pt; line-height: 1.15; color: #000; }
.wr-doc p { margin: 0 0 8pt; }
.wr-doc h1 { font-family: "Calibri Light", Calibri, Arial, sans-serif; font-size: 16pt; font-weight: 400; color: #2f5496; margin: 12pt 0 4pt; }
.wr-doc h2 { font-family: "Calibri Light", Calibri, Arial, sans-serif; font-size: 13pt; font-weight: 400; color: #2f5496; margin: 10pt 0 4pt; }
.wr-doc h3 { font-size: 12pt; font-weight: 400; color: #1f3763; margin: 8pt 0 4pt; }
.wr-doc h4 { font-size: 11pt; font-style: italic; color: #2f5496; margin: 8pt 0 4pt; font-weight: 400; }
.wr-doc blockquote { margin: 8pt 24pt; font-style: italic; color: #404040; border-left: 3px solid #c9c9c9; padding-left: 10pt; }
.wr-doc ul, .wr-doc ol { margin: 0 0 8pt; padding-left: 28pt; list-style: none; }
.wr-doc ol { counter-reset: n; }
.wr-doc li { margin: 0 0 2pt; position: relative; }
.wr-doc ul > li::before { content: "•"; position: absolute; left: -14pt; }
.wr-doc ul ul > li::before { content: "◦"; }
.wr-doc ul ul ul > li::before { content: "▪"; }
.wr-doc ol > li { counter-increment: n; }
.wr-doc ol > li::before { content: counter(n) "."; position: absolute; left: -18pt; }
.wr-doc ol ol > li::before { content: counter(n, lower-alpha) "."; }
.wr-doc table { border-collapse: collapse; margin: 0 0 8pt; }
.wr-doc table.wgrid td, .wr-doc table.wgrid th { border: 1px solid #000; }
.wr-doc td, .wr-doc th { padding: 2pt 5pt; vertical-align: top; min-width: 24px; }
.wr-doc td > p:last-child, .wr-doc th > p:last-child { margin-bottom: 0; }
.wr-doc img { max-width: 100%; }
.wr-doc hr.pb { border: 0; border-top: 1px dashed #9aa0a6; margin: 10pt 0; page-break-after: always; break-after: page; height: 0; }
.wr-doc a { color: #0563c1; }
`;

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  function inPage(node) { return node && page().contains(node.nodeType === 3 ? node.parentNode : node); }

  function saveSel() {
    const s = window.getSelection();
    if (s.rangeCount && inPage(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
  }
  function restoreSel() {
    if (!savedRange) return;
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }

  /** Caret as a character offset (survives replacing the HTML for undo). */
  function caretOffset() {
    const s = window.getSelection();
    if (!s.rangeCount || !inPage(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(page());
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  function setCaret(offset) {
    if (offset === null || offset === undefined) return;
    const walker = document.createTreeWalker(page(), NodeFilter.SHOW_TEXT);
    let n, left = offset;
    while ((n = walker.nextNode())) {
      if (left <= n.length) {
        const r = document.createRange();
        r.setStart(n, left); r.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        return;
      }
      left -= n.length;
    }
  }

  // ---------------------------------------------------------------------------
  // Undo (snapshots of the page)
  // ---------------------------------------------------------------------------

  function snapshot() {
    undoStack.push({ html: page().innerHTML, caret: caretOffset() });
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
    refreshUndo();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push({ html: page().innerHTML, caret: caretOffset() });
    const s = undoStack.pop();
    page().innerHTML = s.html;
    setCaret(s.caret);
    changed(false);
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ html: page().innerHTML, caret: caretOffset() });
    const s = redoStack.pop();
    page().innerHTML = s.html;
    setCaret(s.caret);
    changed(false);
  }
  function refreshUndo() {
    if (!toolsBuilt) return;
    tools.undo.disabled = !undoStack.length;
    tools.redo.disabled = !redoStack.length;
  }

  let countTimer = 0;
  function changed(markDirty = true) {
    if (markDirty !== false && st) { st.dirty = true; $('wr-dirty').classList.remove('hidden'); }
    refreshUndo();
    clearTimeout(countTimer);
    countTimer = setTimeout(updateCount, 300);
    hideBars();
  }

  function updateCount() {
    const t = page().innerText || '';
    const words = (t.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
    const pages = Math.max(1, Math.ceil((page().scrollHeight - 2) / PAGE_H));
    $('wr-count').textContent = `Pagina 1 din ${pages} · ${words} ${words === 1 ? 'cuvânt' : 'cuvinte'} · ${t.replace(/\s/g, '').length} caractere`;
  }

  // ---------------------------------------------------------------------------
  // Formatting commands
  // ---------------------------------------------------------------------------

  const CARET_STYLE = { bold: ['fontWeight', '700', '400'], italic: ['fontStyle', 'italic', 'normal'], underline: ['textDecoration', 'underline', 'none'], strikeThrough: ['textDecoration', 'line-through', 'none'] };

  function cmd(name, value) {
    restoreFocus();
    snapshot();
    const sel = window.getSelection();
    // At a blinking caret the browser sometimes forgets the toggle: start a styled piece of text instead.
    if (CARET_STYLE[name] && sel.rangeCount && sel.isCollapsed && inPage(sel.anchorNode)) {
      const on = document.queryCommandState(name);
      const [prop, onv, offv] = CARET_STYLE[name];
      const span = document.createElement('span');
      span.style[prop] = on ? offv : onv;
      span.textContent = '\u200b';
      const r = sel.getRangeAt(0);
      r.insertNode(span);
      const r2 = document.createRange();
      r2.setStart(span.firstChild, 1); r2.collapse(true);
      sel.removeAllRanges(); sel.addRange(r2);
      changed();
      refreshTools();
      return;
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(name, false, value);
    changed();
    refreshTools();
  }

  // ---------------------------------------------------------------- marker (highlight)
  // Typing right after (or before) highlighted text does not continue the highlight: only a marker
  // just picked at the caret colors what is typed.
  let markerArmed = false, lastTyped = 0;
  function leaveMark() {
    if (markerArmed) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !inPage(sel.anchorNode)) return;
    const r = sel.getRangeAt(0);
    const mk = markAround(r.startContainer);
    if (!mk) return;
    const visible = (range) => range.toString().replace(/\u200b/g, '').length > 0;
    const after = document.createRange(); after.setStart(r.startContainer, r.startOffset); after.setEndAfter(mk);
    const before = document.createRange(); before.setStartBefore(mk); before.setEnd(r.startContainer, r.startOffset);
    // a separate piece of text next to the highlight, with the caret inside it (not on the boundary,
    // where the browser would put it back into the highlight)
    const sel2 = (node, off) => { const nr = document.createRange(); nr.setStart(node, off); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); };
    if (!visible(after)) { const gap = document.createTextNode('\u200b'); mk.after(gap); sel2(gap, 1); }
    else if (!visible(before)) { const gap = document.createTextNode('\u200b'); mk.before(gap); sel2(gap, 1); }
  }
  const isMark = (n) => n && n.nodeType === 1 && n.style && n.style.backgroundColor
    && !/^(transparent|initial|inherit|rgba\(0, 0, 0, 0\))$/.test(n.style.backgroundColor) && /^inline/.test(getComputedStyle(n).display);
  /** The outermost highlighted piece of text around node (or null). */
  function markAround(n) {
    let out = null;
    for (; n && n !== page(); n = n.parentNode) if (isMark(n)) out = n;
    return out;
  }
  /** Splits the highlighted piece around (node, offset) in two; returns the gap (a text node) or null. */
  function splitMark(node, offset) {
    const hl = markAround(node);
    if (!hl) return null;
    const tailR = document.createRange();
    tailR.setStart(node, offset); tailR.setEndAfter(hl);
    const tail = tailR.extractContents();
    const gap = document.createTextNode('\u200b');
    hl.after(gap);
    if (tail.textContent.replace(/\u200b/g, '')) gap.after(tail);
    if (!hl.textContent.replace(/\u200b/g, '')) hl.remove();
    return gap;
  }
  /** "No color" for the marker: the selected text (or what is typed next) is not highlighted any more. */
  function unmark() {
    restoreFocus();
    snapshot();
    const sel = window.getSelection();
    if (!sel.rangeCount || !inPage(sel.anchorNode)) return;
    const r = sel.getRangeAt(0);
    if (r.collapsed) {
      const gap = splitMark(r.startContainer, r.startOffset);
      if (gap) { const nr = document.createRange(); nr.setStart(gap, 1); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); }
    } else {
      const frag = r.extractContents();
      frag.querySelectorAll('*').forEach((x) => { if (x.style) x.style.backgroundColor = ''; });
      const first = frag.firstChild, last = frag.lastChild;
      const gap = splitMark(r.startContainer, r.startOffset);
      if (gap) gap.after(frag); else r.insertNode(frag);
      if (first && last) { const nr = document.createRange(); nr.setStartBefore(first); nr.setEndAfter(last); sel.removeAllRanges(); sel.addRange(nr); }
    }
    tools.hlOn = null;
    changed();
    refreshTools();
  }

  function restoreFocus() {
    if (document.activeElement !== page()) { page().focus(); restoreSel(); }
  }

  /** Exact font size in pt on the selection (execCommand only knows sizes 1..7). */
  function setFontSize(pt) {
    restoreFocus();
    snapshot();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    for (const n of page().querySelectorAll('span[style*="xxx-large"], font[size="7"]')) {
      if (n.tagName === 'FONT') { const sp = document.createElement('span'); sp.innerHTML = n.innerHTML; n.replaceWith(sp); sp.style.fontSize = pt + 'pt'; }
      else n.style.fontSize = pt + 'pt';
    }
    // nested spans inside keep their own sizes otherwise
    changed();
    refreshTools();
  }

  function setBlock(tag) {
    restoreFocus();
    snapshot();
    document.execCommand('formatBlock', false, '<' + tag + '>');
    changed();
    refreshTools();
  }

  function selectedBlocks() {
    const s = window.getSelection();
    if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    const blocks = [...page().querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(:has(p,div,table,ul,ol))')].filter((b) => r.intersectsNode(b));
    if (!blocks.length) {
      let n = r.startContainer;
      while (n && n !== page()) { if (n.nodeType === 1 && /^(P|H\d|LI|BLOCKQUOTE|DIV)$/.test(n.tagName)) return [n]; n = n.parentNode; }
    }
    return blocks;
  }

  function setLineSpacing(v) {
    restoreFocus();
    snapshot();
    for (const b of selectedBlocks()) b.style.lineHeight = v;
    changed();
  }

  function clearFormat() {
    restoreFocus();
    snapshot();
    document.execCommand('removeFormat');
    document.execCommand('formatBlock', false, '<p>');
    for (const b of selectedBlocks()) { b.style.lineHeight = ''; b.removeAttribute('class'); }
    changed();
    refreshTools();
  }

  function insertHtml(html) {
    restoreFocus();
    snapshot();
    document.execCommand('insertHTML', false, html);
    changed();
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  function tablePicker(anchor) {
    const pop = el('div', { class: 'tpick' });
    const label = el('div', { class: 'tl', text: 'Inserează tabel' });
    const grid = el('div', { class: 'tg' });
    const N = 8;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cellEl = el('i');
      cellEl.dataset.r = r; cellEl.dataset.c = c;
      grid.append(cellEl);
    }
    grid.addEventListener('mousemove', (e) => {
      const t = e.target;
      if (!t.dataset.r) return;
      const R = +t.dataset.r, C = +t.dataset.c;
      grid.querySelectorAll('i').forEach((x) => x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C));
      label.textContent = `${C + 1} × ${R + 1}`;
    });
    grid.addEventListener('mousedown', (e) => e.preventDefault());
    grid.addEventListener('click', (e) => {
      const t = e.target;
      if (!t.dataset.r) return;
      close();
      insertTable(+t.dataset.r + 1, +t.dataset.c + 1);
    });
    pop.append(label, grid);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = r.bottom + 4 + 'px';
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    function close() { pop.remove(); document.removeEventListener('pointerdown', outside, true); }
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  function currentBlock() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n.parentNode !== page()) n = n.parentNode;
    return n && n !== page() ? n : null;
  }

  function placeCaret(node, end) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function insertTable(rows, cols) {
    restoreFocus();
    snapshot();
    const t = document.createElement('table');
    t.className = 'wgrid';
    t.style.width = '100%';
    const w = (100 / cols).toFixed(2) + '%';
    for (let r = 0; r < rows; r++) {
      const tr = t.insertRow();
      for (let c = 0; c < cols; c++) { const td = tr.insertCell(); td.style.width = w; td.innerHTML = '<p><br></p>'; }
    }
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    const blk = currentBlock();
    if (blk && blk.nodeType === 1 && blk.textContent.trim() === '' && !blk.querySelector('img,table')) blk.replaceWith(t);
    else if (blk) blk.after(t);
    else page().append(t);
    t.after(after);
    placeCaret(t.rows[0].cells[0].firstChild);
    changed();
    showTableBar();
  }

  function currentCell() {
    const s = window.getSelection();
    if (!s.rangeCount) return null;
    let n = s.anchorNode;
    while (n && n !== page()) { if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n; n = n.parentNode; }
    return null;
  }

  function tableOp(op) {
    const td = currentCell();
    if (!td) return;
    const tr = td.parentNode, table = td.closest('table');
    const idx = [...tr.children].indexOf(td);
    snapshot();
    const blank = () => { const c = document.createElement(td.tagName); c.innerHTML = '<p><br></p>'; c.style.cssText = td.style.cssText; return c; };
    if (op === 'rowAbove' || op === 'rowBelow') {
      const nr = document.createElement('tr');
      for (let i = 0; i < tr.children.length; i++) nr.append(blank());
      if (op === 'rowAbove') tr.before(nr); else tr.after(nr);
    } else if (op === 'colLeft' || op === 'colRight') {
      for (const row of table.rows) {
        const ref = row.children[Math.min(idx, row.children.length - 1)];
        if (!ref) continue;
        const c = blank();
        if (op === 'colLeft') ref.before(c); else ref.after(c);
      }
    } else if (op === 'delRow') {
      if (table.rows.length <= 1) table.remove(); else tr.remove();
    } else if (op === 'delCol') {
      if (tr.children.length <= 1) table.remove();
      else for (const row of table.rows) { const c = row.children[idx]; if (c) c.remove(); }
    } else if (op === 'grid') {
      table.classList.toggle('wgrid');
      if (!table.classList.contains('wgrid')) for (const c of table.querySelectorAll('td,th')) c.style.border = 'none';
      else for (const c of table.querySelectorAll('td,th')) c.style.border = '';
    } else if (op === 'delete') {
      table.remove();
    }
    changed();
    showTableBar();
  }

  // ---------------------------------------------------------------------------
  // Pictures
  // ---------------------------------------------------------------------------

  async function insertImage() {
    saveSel();
    const img = await Office.imageDataUrl(1600);
    if (!img) return;
    const contentW = PAGE_W - margins.l - margins.r;
    const w = Math.min(img.width, contentW);
    restoreSel();
    restoreFocus();
    snapshot();
    const im = document.createElement('img');
    im.src = img.url;
    im.style.width = w + 'px';
    const sel = window.getSelection();
    if (sel.rangeCount && inPage(sel.anchorNode)) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(im);
      r.setStartAfter(im); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    } else { const p2 = document.createElement('p'); p2.append(im); page().append(p2); }
    changed();
  }

  function selectImage(img) {
    selImg = img;
    page().querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel'));
    const frame = imgFrame();
    if (!img) { $('wr-imgbar').classList.add('hidden'); frame.classList.add('hidden'); return; }
    img.classList.add('sel');
    const bar = $('wr-imgbar');
    bar.querySelector('[data-op="inline"]').classList.toggle('hidden', !img.classList.contains('free'));
    bar.classList.remove('hidden');
    placeImgUi();
  }
  /** The handles around the selected picture (resize) — the picture itself is dragged to move it. */
  function imgFrame() {
    let f = $('wr-imgsel');
    if (!f) {
      f = el('div', { id: 'wr-imgsel', class: 'hidden' }, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => el('i', { class: 'ch ' + h, 'data-h': h })));
      $('wr-scroll').append(f);
      f.addEventListener('pointerdown', (e) => { const h = e.target.dataset.h; if (h && selImg) startImgDrag(e, h); });
    }
    return f;
  }
  function placeImgUi() {
    if (!selImg) return;
    const r = selImg.getBoundingClientRect(), host = $('wr-scroll').getBoundingClientRect(), sc = $('wr-scroll');
    Object.assign(imgFrame().style, { left: r.left - host.left + sc.scrollLeft + 'px', top: r.top - host.top + sc.scrollTop + 'px', width: r.width + 'px', height: r.height + 'px' });
    imgFrame().classList.remove('hidden');
    placeBar($('wr-imgbar'), r);
  }
  const zoomOf = () => parseFloat(page().style.zoom) || 1;
  /** A picture taken out of the text: it stays exactly where it is now and can go anywhere on the page. */
  function makeFree(img) {
    if (img.classList.contains('free')) return;
    const z = zoomOf(), pr = page().getBoundingClientRect(), r = img.getBoundingClientRect();
    const w = r.width / z;
    img.classList.add('free');
    img.style.left = Math.round((r.left - pr.left) / z) + 'px';
    img.style.top = Math.round((r.top - pr.top) / z) + 'px';
    img.style.width = Math.round(w) + 'px';
    img.style.height = 'auto';
    img.removeAttribute('width'); img.removeAttribute('height');
  }
  /** Moving (h = 'move') or resizing (h = a handle) the selected picture, with the mouse or a finger. */
  function startImgDrag(e, h) {
    e.preventDefault(); e.stopPropagation();
    const img = selImg, z = zoomOf();
    const start = { x: e.clientX, y: e.clientY, w: img.getBoundingClientRect().width / z, h: img.getBoundingClientRect().height / z, l: parseFloat(img.style.left) || 0, t: parseFloat(img.style.top) || 0 };
    const aspect = start.w / Math.max(1, start.h);
    let moved = false;
    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
      if (!moved) { if (Math.hypot(dx, dy) < 3) return; moved = true; snapshot(); if (h === 'move') makeFree(img); start.l = parseFloat(img.style.left) || 0; start.t = parseFloat(img.style.top) || 0; }
      const free = img.classList.contains('free');
      if (h === 'move') {
        img.style.left = Math.round(Math.max(-start.w * 0.8, Math.min(PAGE_W - start.w * 0.2, start.l + dx))) + 'px';
        img.style.top = Math.round(Math.max(0, start.t + dy)) + 'px';
      } else {
        let w = start.w, hh = start.h;
        if (h.includes('e')) w = start.w + dx;
        if (h.includes('w')) w = start.w - dx;
        if (h.includes('s')) hh = start.h + dy;
        if (h.includes('n')) hh = start.h - dy;
        const corner = h.length === 2;
        if (corner && !ev.shiftKey) hh = w / aspect; // corners keep the shape (Shift: free)
        w = Math.max(16, Math.min(PAGE_W, w)); hh = Math.max(12, hh);
        img.style.width = Math.round(w) + 'px';
        img.style.height = corner && !ev.shiftKey ? 'auto' : Math.round(hh) + 'px';
        img.removeAttribute('width'); img.removeAttribute('height');
        if (free && h.includes('w')) img.style.left = Math.round(start.l + (start.w - w)) + 'px';
        if (free && h.includes('n')) img.style.top = Math.round(start.t + (start.h - (corner && !ev.shiftKey ? w / aspect : hh))) + 'px';
      }
      placeImgUi();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (moved) { changed(); selectImage(img); }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }

  async function imgOp(op) {
    if (!selImg) return;
    const img = selImg;
    const contentW = PAGE_W - margins.l - margins.r;
    if (op === 'crop') {
      $('wr-imgbar').classList.add('hidden'); imgFrame().classList.add('hidden');
      const r = await Office.cropDialog(img.src);
      if (!r) { selectImage(img); return; }
      const z = zoomOf(), b = img.getBoundingClientRect();
      const out = await Office.cropDataUrl(img.src, r);
      snapshot();
      const w = b.width / z, h = b.height / z;
      img.src = out.url;
      img.style.width = Math.max(8, Math.round(w * r.w)) + 'px';
      img.style.height = img.style.height && img.style.height !== 'auto' ? Math.max(8, Math.round(h * r.h)) + 'px' : 'auto';
      if (img.classList.contains('free')) { img.style.left = Math.round((parseFloat(img.style.left) || 0) + w * r.x) + 'px'; img.style.top = Math.round((parseFloat(img.style.top) || 0) + h * r.y) + 'px'; }
      img.removeAttribute('width'); img.removeAttribute('height');
      changed();
      await img.decode().catch(() => {});
      selectImage(img);
      return;
    }
    snapshot();
    const pct = { s: 0.25, m: 0.5, l: 0.75, f: 1 }[op];
    if (pct) { img.style.width = Math.round(contentW * pct) + 'px'; img.style.height = 'auto'; img.removeAttribute('width'); img.removeAttribute('height'); }
    if (op === 'inline') { img.classList.remove('free'); img.style.left = ''; img.style.top = ''; }
    if (op === 'left' || op === 'center' || op === 'right') {
      if (img.classList.contains('free')) {
        const w = img.getBoundingClientRect().width / zoomOf();
        img.style.left = Math.round(op === 'left' ? margins.l : op === 'right' ? PAGE_W - margins.r - w : (PAGE_W - w) / 2) + 'px';
      } else {
        let p = img.parentElement;
        if (p === page()) { const w = document.createElement('p'); img.before(w); w.append(img); p = w; }
        p.style.textAlign = op;
      }
    }
    if (op === 'del') { img.remove(); selectImage(null); changed(); return; }
    changed();
    requestAnimationFrame(() => selectImage(img));
  }

  function placeBar(bar, r) {
    const host = $('wr-scroll').getBoundingClientRect();
    const bw = bar.offsetWidth || 300;
    let top = r.top - host.top - 44;
    if (top < 6) top = r.bottom - host.top + 8;
    bar.style.top = top + $('wr-scroll').scrollTop + 'px';
    bar.style.left = Math.max(8, Math.min(host.width - bw - 20, r.left - host.left + $('wr-scroll').scrollLeft)) + 'px';
  }

  function showTableBar() {
    const td = currentCell();
    const bar = $('wr-tblbar');
    if (!td) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    placeBar(bar, td.closest('table').getBoundingClientRect());
  }

  function hideBars() {
    if (selImg && !page().contains(selImg)) selectImage(null);
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  const STYLES = [['p', 'Normal'], ['h1', 'Titlu 1'], ['h2', 'Titlu 2'], ['h3', 'Titlu 3'], ['h4', 'Titlu 4'], ['blockquote', 'Citat']];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];

  function buildTools() {
    if (toolsBuilt) return;
    toolsBuilt = true;
    const T = Office.tbtn;
    const bar = $('wr-tools');
    tools.undo = T('undo', 'Anulează (Ctrl+Z)', () => undo());
    tools.redo = T('redo', 'Refă (Ctrl+Y)', () => redo());
    tools.style = Office.select(STYLES, 'p', (v) => setBlock(v), 'style', 'Stilul paragrafului');
    tools.font = Office.select(Office.FONTS, 'Calibri', (v) => cmd('fontName', v), 'font', 'Font');
    tools.size = Office.select(SIZES, 11, (v) => setFontSize(+v), 'size', 'Mărimea textului');
    for (const s of [tools.style, tools.font, tools.size]) s.addEventListener('mousedown', saveSel);
    tools.b = T('bold', 'Îngroșat (Ctrl+B)', () => cmd('bold'));
    tools.i = T('italic', 'Cursiv (Ctrl+I)', () => cmd('italic'));
    tools.u = T('underline', 'Subliniat (Ctrl+U)', () => cmd('underline'));
    tools.s = T('strike', 'Tăiat', () => cmd('strikeThrough'));
    tools.fc = Office.colorBtn('fontcolor', 'Culoarea textului', () => tools.fcVal || '#c00000', (c) => { tools.fcVal = c || '#000000'; cmd('foreColor', c || '#000000'); }, true);
    tools.hl = Office.colorBtn('marker', 'Evidențiere (marker)', () => tools.hlOn || tools.hlVal || '#ffff00', (c) => {
      if (c) {
        tools.hlVal = c;
        // at a blinking caret the marker colors only what is typed now (until the caret is moved)
        const s = window.getSelection();
        markerArmed = !!(s.rangeCount && s.isCollapsed); lastTyped = Date.now();
        cmd('hiliteColor', c);
      } else unmark();
    }, true);
    for (const b of [tools.fc, tools.hl]) b.addEventListener('mousedown', saveSel);
    tools.al = T('alignleft', 'Aliniază la stânga', () => cmd('justifyLeft'));
    tools.ac = T('aligncenter', 'Centrează', () => cmd('justifyCenter'));
    tools.ar = T('alignright', 'Aliniază la dreapta', () => cmd('justifyRight'));
    tools.aj = T('justify', 'Aliniază stânga-dreapta', () => cmd('justifyFull'));
    tools.ul = T('bullets', 'Listă cu buline', () => cmd('insertUnorderedList'));
    tools.ol = T('numbers', 'Listă numerotată', () => cmd('insertOrderedList'));
    tools.out = T('outdent', 'Micșorează retragerea', () => cmd('outdent'));
    tools.ind = T('indent', 'Mărește retragerea', () => cmd('indent'));
    tools.ls = T('linespacing', 'Spațiere între rânduri', (b) => {
      saveSel();
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, ['1', '1.15', '1.5', '2', '2.5', '3'].map((v) => ({ label: v.replace('.', ','), run: () => setLineSpacing(v) })));
    });
    tools.tbl = T('table', 'Inserează tabel', (b) => { saveSel(); tablePicker(b); });
    tools.img = T('image', 'Inserează imagine', () => insertImage());
    tools.pb = T('pagebreak', 'Pagină nouă (salt de pagină)', () => insertHtml('<hr class="pb"><p><br></p>'));
    tools.clr = T('clearfmt', 'Șterge formatarea', () => clearFormat());
    tools.find = T('search', 'Caută și înlocuiește (Ctrl+F)', () => openFind());
    bar.append(tools.undo, tools.redo, Office.sep(), tools.style, tools.font, tools.size, Office.sep(),
      tools.b, tools.i, tools.u, tools.s, tools.fc, tools.hl, Office.sep(),
      tools.al, tools.ac, tools.ar, tools.aj, Office.sep(), tools.ul, tools.ol, tools.out, tools.ind, tools.ls, Office.sep(),
      tools.tbl, tools.img, tools.pb, Office.sep(), tools.clr, tools.find);

    // picture bar
    const ib = $('wr-imgbar');
    const IB = (label, op, title) => { const b = el('button', { class: 'fb', text: label, title: title || label, type: 'button' }); b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => imgOp(op)); return b; };
    const ibInline = IB('Înapoi în text', 'inline', 'Pune imaginea înapoi în rândurile textului');
    ibInline.dataset.op = 'inline';
    ib.append(IB('Mică', 's'), IB('Medie', 'm'), IB('Mare', 'l'), IB('Toată lățimea', 'f'), el('div', { class: 'fdiv' }),
      IB('Stânga', 'left'), IB('Centru', 'center'), IB('Dreapta', 'right'), el('div', { class: 'fdiv' }),
      IB('Decupează', 'crop', 'Taie marginile imaginii'), ibInline, IB('Șterge', 'del'));
    // table bar
    const tb = $('wr-tblbar');
    const TB = (label, op, title) => { const b = el('button', { class: 'fb', text: label, title: title || label, type: 'button' }); b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => tableOp(op)); return b; };
    tb.append(TB('+ Rând sus', 'rowAbove', 'Inserează rând deasupra'), TB('+ Rând jos', 'rowBelow', 'Inserează rând dedesubt'),
      TB('+ Coloană stânga', 'colLeft'), TB('+ Coloană dreapta', 'colRight'), el('div', { class: 'fdiv' }),
      TB('− Rând', 'delRow', 'Șterge rândul'), TB('− Coloană', 'delCol', 'Șterge coloana'), TB('Chenare', 'grid', 'Arată / ascunde chenarele'), TB('Șterge tabelul', 'delete'));
    refreshUndo();
  }

  function refreshTools() {
    if (!toolsBuilt) return;
    const s = window.getSelection();
    if (!s.rangeCount || !inPage(s.anchorNode)) return;
    const q = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
    tools.b.classList.toggle('on', q('bold'));
    tools.i.classList.toggle('on', q('italic'));
    tools.u.classList.toggle('on', q('underline'));
    tools.s.classList.toggle('on', q('strikeThrough'));
    tools.ul.classList.toggle('on', q('insertUnorderedList'));
    tools.ol.classList.toggle('on', q('insertOrderedList'));
    let n = s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode;
    // the marker shows when the text here is highlighted (and with which color)
    const mk = markAround(n);
    tools.hlOn = mk ? mk.style.backgroundColor : null;
    // the marker never looks "pressed": it only shows the color of the text here
    tools.hl.classList.remove('on');
    if (tools.hl.repaint) tools.hl.repaint();
    const cs = getComputedStyle(n);
    const al = cs.textAlign;
    tools.al.classList.toggle('on', al === 'left' || al === 'start');
    tools.ac.classList.toggle('on', al === 'center');
    tools.ar.classList.toggle('on', al === 'right' || al === 'end');
    tools.aj.classList.toggle('on', al === 'justify');
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    tools.size.value = SIZES.includes(pt) ? String(pt) : '';
    if (!SIZES.includes(pt)) { let o = tools.size.querySelector('option.custom'); if (!o) { o = el('option', { class: 'custom' }); tools.size.prepend(o); } o.value = String(pt); o.textContent = String(pt).replace('.', ','); tools.size.value = String(pt); }
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (![...tools.font.options].some((o) => o.value === fam)) tools.font.append(el('option', { value: fam, text: fam }));
    tools.font.value = fam;
    let blk = n;
    while (blk && blk !== page() && !/^(P|H[1-6]|BLOCKQUOTE|LI|TD)$/.test(blk.tagName)) blk = blk.parentNode;
    const tag = blk && blk !== page() ? blk.tagName.toLowerCase() : 'p';
    tools.style.value = STYLES.some(([v]) => v === tag) ? tag : 'p';
  }

  // ---------------------------------------------------------------------------
  // Find & replace
  // ---------------------------------------------------------------------------

  function openFind() {
    saveSel();
    const bar = $('wr-findbar');
    bar.classList.remove('hidden');
    const s = window.getSelection();
    if (s.rangeCount && !s.isCollapsed && inPage(s.anchorNode)) $('wr-find').value = s.toString().slice(0, 100);
    $('wr-find').focus();
    $('wr-find').select();
  }

  function findNext(back) {
    const q = $('wr-find').value;
    if (!q) return false;
    page().focus();
    const found = window.find(q, false, !!back, true, false, false, false);
    if (!found || !inPage(window.getSelection().anchorNode)) {
      // wrap around inside the page
      const r = document.createRange();
      r.selectNodeContents(page()); r.collapse(!back);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      const again = window.find(q, false, !!back, true, false, false, false);
      $('wr-findinfo').textContent = again ? '' : 'Nu am găsit';
      return again;
    }
    $('wr-findinfo').textContent = '';
    return true;
  }

  function replaceOne() {
    const q = $('wr-find').value, rep = $('wr-replace').value;
    const s = window.getSelection();
    if (s.rangeCount && inPage(s.anchorNode) && s.toString().toLowerCase() === q.toLowerCase()) {
      snapshot();
      document.execCommand('insertText', false, rep);
      changed();
    }
    findNext();
  }

  function replaceAll() {
    const q = $('wr-find').value, rep = $('wr-replace').value;
    if (!q) return;
    snapshot();
    let n = 0;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const walker = document.createTreeWalker(page(), NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const t of nodes) {
      const m = t.nodeValue.match(re);
      if (m) { n += m.length; t.nodeValue = t.nodeValue.replace(re, rep); }
    }
    $('wr-findinfo').textContent = n ? `Am înlocuit ${n}` : 'Nu am găsit';
    if (n) changed(); else undoStack.pop();
  }

  // ---------------------------------------------------------------------------
  // Opening
  // ---------------------------------------------------------------------------

  function setDocStyles(css) {
    let s = $('wr-docstyles');
    if (!s) { s = el('style', { id: 'wr-docstyles' }); document.head.append(s); }
    s.textContent = css || '';
  }

  // phones (2.6): the text flows to the width of the screen at its real size, like Pages; the page
  // itself (margins, A4) is unchanged in the file and in the PDF. "Pagina întreagă" shows the sheet.
  let wholePage = false;
  const screenView = () => UI.phone() && !wholePage && typeof Feel !== 'undefined' && Feel.on;
  function applyPage() {
    const p = page();
    p.classList.toggle('screen-view', screenView());
    if (screenView()) {
      const w = Math.max(280, $('wr-scroll').clientWidth - 24);
      p.style.padding = '28px 22px 120px';
      p.style.width = w + 'px';
      p.style.minHeight = Math.round(w * 1.3) + 'px';
      p.style.zoom = 1;
      $('wr-zoomval').textContent = '100%';
      return;
    }
    p.style.padding = `${margins.t}px ${margins.r}px ${margins.b}px ${margins.l}px`;
    p.style.width = PAGE_W + 'px';
    p.style.minHeight = PAGE_H + 'px';
    p.style.zoom = zoom;
    $('wr-zoomval').textContent = Math.round(zoom * 100) + '%';
  }

  async function readDocx(bytes) {
    await Lib.load('jszip', 'docx-preview');
    window.JSZip = window.JSZip || Lib.get('jszip');
    const dp = Lib.get('docx-preview');
    const body = el('div'), styles = el('div');
    await dp.renderAsync(bytes, body, styles, {
      className: 'docx', inWrapper: false, ignoreWidth: false, ignoreHeight: true, ignoreFonts: false, breakPages: true,
      ignoreLastRenderedPageBreak: true, experimental: true, trimXmlDeclaration: true, useBase64URL: true,
      renderHeaders: false, renderFooters: false, renderFootnotes: true, renderEndnotes: true,
    });
    const css = [...styles.querySelectorAll('style')].map((s) => s.textContent).join('\n')
      // the library styles its own page boxes; our page already is one
      .replace(/\.docx-wrapper[^{]*\{[^}]*\}/g, '').replace(/section\.docx\s*\{[^}]*\}/g, '')
      // Word bullets use the Symbol font (private characters): show real bullet signs
      .replace(/\\0*f0b7|\uf0b7/gi, '•').replace(/\\0*f0a7|\uf0a7/gi, '▪').replace(/\\0*f0d8|\uf0d8/gi, '➢')
      .replace(/\\0*f076|\uf076/gi, '❖').replace(/\\0*f0fc|\uf0fc/gi, '✓').replace(/\\0*f0a8|\uf0a8/gi, '◦');
    const sections = [...body.querySelectorAll('section.docx')];
    let html = '';
    sections.forEach((sec, i) => {
      if (i === 0) {
        const cs = sec.style;
        const pt = (v) => { const m = /([\d.]+)pt/.exec(v || ''); return m ? (parseFloat(m[1]) * 96) / 72 : null; };
        const t = pt(cs.paddingTop), r = pt(cs.paddingRight), b = pt(cs.paddingBottom), l = pt(cs.paddingLeft);
        if (t !== null) margins = { t, r: r ?? 96, b: b ?? 96, l: l ?? 96 };
      }
      const art = sec.querySelector('article') || sec;
      if (i > 0) html += '<hr class="pb">';
      html += art.innerHTML;
    });
    return { html: html || '<p><br></p>', css };
  }

  function textToHtml(text) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const paras = text.replace(/\r\n?/g, '\n').split('\n');
    return paras.map((p) => `<p>${p.trim() ? esc(p) : '<br>'}</p>`).join('') || '<p><br></p>';
  }

  function rtfToText(rtf) {
    return rtf.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode(n < 0 ? 65536 + +n : +n)).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').trim();
  }

  /** kind 'html': [bytes] is ready-made HTML (e.g. a scanned page read by OCR), [name] its file name. */
  async function open(path, bytes, kind, name) {
    try { await Lib.load('docx'); } catch (e) { UI.errorDetails('Nu am putut porni editorul', e); return; }
    show();
    UI.busy('Se deschide documentul…');
    margins = { t: 96, r: 96, b: 96, l: 96 };
    let html = '<p><br></p>', css = '';
    let note = null;
    try {
      if (kind === 'html') html = String(bytes || '') || html;
      else if (path) {
        const ext = Host.ext(path);
        if (kind === 'word') ({ html, css } = await readDocx(bytes));
        else if (kind === 'wordOld') {
          await Lib.load('word-extractor');
          const WE = Lib.get('word-extractor');
          const d = await new WE().extract(typeof Buffer !== 'undefined' ? Buffer.from(bytes) : bytes);
          html = textToHtml(d.getBody());
          note = 'Document Word vechi (.doc): am păstrat textul; formatarea poate lipsi. Se salvează ca .docx.';
        } else {
          let t = new TextDecoder('utf-8').decode(bytes);
          if (t.includes('�')) t = new TextDecoder('windows-1250').decode(bytes);
          if (ext === 'rtf' || t.startsWith('{\\rtf')) { t = rtfToText(t); note = 'Fișier RTF: am păstrat textul. Se salvează ca .docx.'; }
          html = textToHtml(t.replace(/^﻿/, ''));
        }
      }
    } catch (e) {
      UI.busy(null);
      UI.errorDetails('Nu am putut deschide documentul', e);
      App.showHome();
      return;
    }
    st = { source: path ? Office.sourceFor(path) : null, copyPath: null, dirty: kind === 'html', name: path ? Host.baseName(path) : name || 'Document nou.docx' };
    setDocStyles(css);
    buildTools();
    const p = page();
    p.innerHTML = html;
    undoStack = []; redoStack = [];
    zoom = 1;
    applyPage();
    $('wr-name').textContent = st.name;
    $('wr-dirty').classList.toggle('hidden', !st.dirty);
    Host.setTitle(st.name + ' — Document');
    $('wr-scroll').scrollTop = 0;
    selectImage(null);
    $('wr-tblbar').classList.add('hidden');
    $('wr-findbar').classList.add('hidden');
    UI.busy(null);
    updateCount();
    refreshUndo();
    requestAnimationFrame(() => {
      fitZoom();
      if (UI.phone()) { refreshTools(); return; }
      p.focus();
      const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      refreshTools();
    });
    if (note) UI.toast(note, { duration: 7000 });
  }

  function show() {
    for (const id of ['home', 'editor', 'invoice', 'writer', 'slides', 'sheet']) { const n = $(id); if (n) n.classList.toggle('hidden', id !== 'writer'); }
  }

  let fitted = 0;
  function fitZoom() {
    const phone = UI.phone();
    const avail = $('wr-scroll').clientWidth - (phone ? 16 : 60);
    zoom = Math.max(0.3, Math.min(1.25, Math.floor((avail / PAGE_W) * (phone ? 100 : 20)) / (phone ? 100 : 20)));
    if (zoom > 1) zoom = 1;
    fitted = zoom;
    applyPage();
  }
  window.addEventListener('resize', () => { if (st && !$('writer').classList.contains('hidden') && Math.abs(zoom - fitted) < 0.001) fitZoom(); });

  // ---------------------------------------------------------------------------
  // Saving: .docx from what is on the page
  // ---------------------------------------------------------------------------

  const hex = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || '');
    if (!m || (m[4] !== undefined && +m[4] === 0)) return null;
    return [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const firstFont = (f) => (f || '').split(',')[0].replace(/["']/g, '').trim() || 'Calibri';

  function buildDocx() {
    const D = Lib.get('docx');
    const p = page();
    const oldZoom = p.style.zoom;
    p.style.zoom = 1;
    const BLOCK = /^(P|H[1-6]|DIV|BLOCKQUOTE|UL|OL|LI|TABLE|HR|SECTION|ARTICLE|PRE|HEADER|FOOTER|FIGURE)$/;
    let numInstance = 0;
    const listInstances = new Map();

    function runsOf(node, blockEl) {
      const out = [];
      const walk = (n) => {
        if (n.nodeType === 3) {
          const text = n.nodeValue.replace(/​/g, '');
          if (!text) return;
          const parent = n.parentElement;
          const cs = getComputedStyle(parent);
          const o = { text: text.replace(/\n/g, ' ') };
          o.font = firstFont(cs.fontFamily);
          o.size = Math.round(parseFloat(cs.fontSize) * 0.75 * 2);
          if (parseInt(cs.fontWeight, 10) >= 600) o.bold = true;
          if (cs.fontStyle === 'italic') o.italics = true;
          const deco = cs.textDecorationLine || cs.textDecoration || '';
          if (deco.includes('underline')) o.underline = {};
          if (deco.includes('line-through')) o.strike = true;
          const col = hex(cs.color);
          if (col && col !== '000000') o.color = col;
          if (cs.verticalAlign === 'super') o.superScript = true;
          if (cs.verticalAlign === 'sub') o.subScript = true;
          // background of the text (marker) — look up to the paragraph
          let e = parent;
          while (e && e !== blockEl && e !== p) {
            const bg = hex(getComputedStyle(e).backgroundColor);
            if (bg) { o.shading = { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' }; break; }
            e = e.parentElement;
          }
          if (cs.textTransform === 'uppercase') o.allCaps = true;
          out.push(new D.TextRun(o));
          return;
        }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'BR') { out.push(new D.TextRun({ break: 1 })); return; }
        if (n.tagName === 'IMG') { const im = imageRun(n); if (im) out.push(im); return; }
        if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return;
        if (getComputedStyle(n).display === 'none') return;
        if (n.tagName === 'SPAN' && n.style.whiteSpace === 'pre' && /^\s+$/.test(n.textContent)) { out.push(new D.TextRun({ text: '\t' })); return; }
        for (const c of n.childNodes) walk(c);
      };
      for (const c of node.childNodes) walk(c);
      return out;
    }

    function imageRun(img) {
      const d = Office.dataUrlToBytes(img.src);
      if (!d) return null;
      const type = /png/.test(d.mime) ? 'png' : /gif/.test(d.mime) ? 'gif' : /bmp/.test(d.mime) ? 'bmp' : 'jpg';
      const w = Math.max(1, Math.round(img.offsetWidth || img.naturalWidth)), h = Math.max(1, Math.round(img.offsetHeight || img.naturalHeight));
      // a picture placed freely on the page: kept where it is (over the text, like in Word "in front of text")
      let floating;
      if (img.classList.contains('free') && D.HorizontalPositionRelativeFrom) {
        const para = img.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, td, blockquote, div') || page();
        const EMU = 9525;
        const top = img.offsetTop - (para === page() ? 0 : para.offsetTop);
        floating = {
          horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: Math.round((parseFloat(img.style.left) || 0) * EMU) },
          verticalPosition: { relative: D.VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.round(top * EMU) },
          wrap: { type: D.TextWrappingType.NONE }, allowOverlap: true, zIndex: 3,
        };
      }
      try { return new D.ImageRun({ type, data: d.bytes, transformation: { width: w, height: h }, ...(floating ? { floating } : {}) }); } catch (e) { return null; }
    }

    function paraProps(b, extra = {}) {
      const cs = getComputedStyle(b);
      const o = { ...extra };
      const al = { center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, end: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
      if (al[cs.textAlign]) o.alignment = al[cs.textAlign];
      const fs = parseFloat(cs.fontSize) || 14.67;
      let lh = cs.lineHeight === 'normal' ? 1.15 : parseFloat(cs.lineHeight) / fs;
      if (!Number.isFinite(lh) || lh <= 0) lh = 1.15;
      const hasImg = !!(b.querySelector && b.querySelector('img'));
      o.spacing = { before: Math.round(parseFloat(cs.marginTop) * PX_TWIP) || 0, after: Math.round(parseFloat(cs.marginBottom) * PX_TWIP) || 0, line: hasImg ? 240 : Math.round(lh * 240), lineRule: D.LineRuleType.AUTO };
      if (!extra.numbering) {
        const left = Math.round(((parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.paddingLeft) || 0)) * PX_TWIP);
        const first = Math.round((parseFloat(cs.textIndent) || 0) * PX_TWIP);
        if (left > 0 || first) o.indent = { left: Math.max(0, left), firstLine: first > 0 ? first : undefined, hanging: first < 0 ? -first : undefined };
      }
      const border = {};
      for (const side of ['Left', 'Top', 'Bottom', 'Right']) {
        const bw = parseFloat(cs[`border${side}Width`]);
        if (bw > 0 && cs[`border${side}Style`] !== 'none') border[side.toLowerCase()] = { style: D.BorderStyle.SINGLE, size: Math.max(2, Math.round(bw * 6)), color: hex(cs[`border${side}Color`]) || 'C9C9C9', space: side === 'Left' ? 8 : 1 };
      }
      if (Object.keys(border).length) o.border = border;
      const bg = hex(cs.backgroundColor);
      if (bg) o.shading = { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' };
      const tag = b.tagName;
      const hl = { H1: D.HeadingLevel.HEADING_1, H2: D.HeadingLevel.HEADING_2, H3: D.HeadingLevel.HEADING_3, H4: D.HeadingLevel.HEADING_4, H5: D.HeadingLevel.HEADING_5, H6: D.HeadingLevel.HEADING_6 };
      if (hl[tag]) o.heading = hl[tag];
      if (cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') o.pageBreakBefore = true;
      return o;
    }

    function paragraph(b, extra) {
      const children = runsOf(b, b);
      return new D.Paragraph({ ...paraProps(b, extra), children: children.length ? children : [new D.TextRun('')] });
    }

    function listItems(listEl, level, out) {
      const ordered = listEl.tagName === 'OL';
      const inst = ++numInstance;
      for (const li of listEl.children) {
        if (li.tagName !== 'LI') continue;
        // the text of the item (without nested lists)
        const clone = li.cloneNode(true);
        for (const sub of clone.querySelectorAll('ul,ol')) sub.remove();
        const tmp = li; // computed styles come from the real node
        const runs = [];
        const holder = document.createElement('div');
        const directRuns = runsOfLi(li);
        out.push(new D.Paragraph({ ...paraProps(tmp, { numbering: { reference: ordered ? 'nums' : 'bullets', level: Math.min(level, 8), instance: ordered ? inst : 1 } }), children: directRuns.length ? directRuns : [new D.TextRun('')] }));
        for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') listItems(sub, level + 1, out);
        void clone; void runs; void holder;
      }
    }

    function runsOfLi(li) {
      const out = [];
      for (const c of li.childNodes) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) continue;
        if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) { out.push(...runsOf(c, li)); continue; }
        const wrap = { childNodes: [c] };
        out.push(...runsOf(wrap, li));
      }
      return out;
    }

    function table(t) {
      const rows = [];
      const firstRow = t.rows[0];
      const totalPx = t.offsetWidth || PAGE_W - margins.l - margins.r;
      const colWidths = firstRow ? [...firstRow.cells].map((c) => Math.round((c.offsetWidth || totalPx / firstRow.cells.length) * PX_TWIP)) : [];
      for (const tr of t.rows) {
        const cells = [];
        for (const td of tr.cells) {
          const cs = getComputedStyle(td);
          const kids = blocksOf(td);
          const bw = (side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none';
          const line = (side) => (bw(side) ? { style: D.BorderStyle.SINGLE, size: Math.max(2, Math.round(parseFloat(cs[`border${side}Width`]) * 6)), color: hex(cs[`border${side}Color`]) || '000000' } : { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' });
          const o = {
            children: kids.length ? kids : [new D.Paragraph('')],
            width: { size: Math.round(td.offsetWidth * PX_TWIP), type: D.WidthType.DXA },
            borders: { top: line('Top'), bottom: line('Bottom'), left: line('Left'), right: line('Right') },
            margins: { top: Math.round(parseFloat(cs.paddingTop) * PX_TWIP), bottom: Math.round(parseFloat(cs.paddingBottom) * PX_TWIP), left: Math.round(parseFloat(cs.paddingLeft) * PX_TWIP), right: Math.round(parseFloat(cs.paddingRight) * PX_TWIP) },
          };
          if (td.colSpan > 1) o.columnSpan = td.colSpan;
          if (td.rowSpan > 1) o.rowSpan = td.rowSpan;
          const bg = hex(cs.backgroundColor);
          if (bg) o.shading = { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' };
          const va = { middle: D.VerticalAlign.CENTER, bottom: D.VerticalAlign.BOTTOM };
          if (va[cs.verticalAlign]) o.verticalAlign = va[cs.verticalAlign];
          cells.push(new D.TableCell(o));
        }
        if (cells.length) rows.push(new D.TableRow({ children: cells }));
      }
      if (!rows.length) return null;
      return new D.Table({ rows, columnWidths: colWidths, width: { size: Math.round(totalPx * PX_TWIP), type: D.WidthType.DXA } });
    }

    function blocksOf(container) {
      const out = [];
      let inline = [];
      const flush = () => {
        if (!inline.length) return;
        const wrap = { childNodes: inline };
        const runs = runsOf(wrap, container);
        if (runs.length) out.push(new D.Paragraph({ ...paraProps(container.nodeType === 1 ? container : p), children: runs }));
        inline = [];
      };
      for (const n of container.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue.trim()) inline.push(n); continue; }
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') continue;
        const disp = getComputedStyle(n).display;
        if (disp === 'none') continue;
        const isBlock = BLOCK.test(n.tagName) || disp === 'block' || disp === 'table' || disp === 'list-item';
        if (!isBlock) { inline.push(n); continue; }
        flush();
        const tag = n.tagName;
        if (tag === 'TABLE') { const t = table(n); if (t) out.push(t); out.push(new D.Paragraph({ spacing: { after: 0 }, children: [] })); continue; }
        if (tag === 'UL' || tag === 'OL') { listItems(n, 0, out); continue; }
        if (tag === 'HR') {
          if (n.classList.contains('pb')) out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
          else out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, children: [] }));
          continue;
        }
        // paragraphs from Word keep their list look (docx-preview draws bullets with CSS)
        const m = /docx-num-(\d+)-(\d+)/.exec(n.className || '');
        if (m) {
          const before = getComputedStyle(n, '::before').content || '';
          const ordered = before.includes('counter');
          if (!listInstances.has(m[1])) listInstances.set(m[1], ++numInstance);
          out.push(paragraph(n, { numbering: { reference: ordered ? 'nums' : 'bullets', level: Math.min(+m[2], 8), instance: ordered ? listInstances.get(m[1]) : 1 } }));
          continue;
        }
        const hasBlockKids = [...n.children].some((k) => BLOCK.test(k.tagName) || /^(block|table|list-item)$/.test(getComputedStyle(k).display));
        if (hasBlockKids && !/^(P|H[1-6])$/.test(tag)) { out.push(...blocksOf(n)); continue; }
        out.push(paragraph(n));
      }
      flush();
      return out;
    }

    const children = blocksOf(p);
    p.style.zoom = oldZoom;
    const bulletChars = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
    const doc = new D.Document({
      creator: 'PDF Editor',
      styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 276 } } } } },
      numbering: {
        config: [
          { reference: 'bullets', levels: bulletChars.map((ch, i) => ({ level: i, format: D.LevelFormat.BULLET, text: ch, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } })) },
          { reference: 'nums', levels: Array.from({ length: 9 }, (_, i) => ({ level: i, format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN][i % 3], text: `%${i + 1}.`, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } } })) },
        ],
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: Math.round(margins.t * PX_TWIP), right: Math.round(margins.r * PX_TWIP), bottom: Math.round(margins.b * PX_TWIP), left: Math.round(margins.l * PX_TWIP) } } },
        children: children.length ? children : [new D.Paragraph('')],
      }],
    });
    return D.Packer.toArrayBuffer ? D.Packer.toArrayBuffer(doc) : D.Packer.toBuffer(doc);
  }

  async function save() {
    if (!st) return false;
    const first = (page().innerText || '').split('\n').map((l) => l.trim()).find((l) => l.length > 1) || '';
    const base = Office.clean(first.slice(0, 50)).replace(/[.,;:!?]+$/, '') || 'Document nou';
    const p = await Office.target(st, 'docx', base, 'Salvează documentul');
    if (!p) return false;
    return writeTo(p);
  }
  async function saveAs() {
    const p = await Office.saveAsDialog(st, 'docx', 'Document nou');
    return p ? writeTo(p) : false;
  }
  async function writeTo(path) {
    let bytes;
    selectImage(null);
    try { await Lib.load('docx'); bytes = new Uint8Array(await buildDocx()); } catch (e) { UI.errorDetails('Nu am putut pregăti documentul', e); return false; }
    const ok = await Office.writeFile(st, path, bytes, page());
    if (ok) {
      st.dirty = false; st.name = Host.baseName(path);
      $('wr-name').textContent = st.name;
      $('wr-dirty').classList.add('hidden');
      Host.setTitle(st.name + ' — Document');
    }
    return ok;
  }

  function pdfHtml() {
    const css = ($('wr-docstyles') && $('wr-docstyles').textContent) || '';
    const w = PAGE_W - margins.l - margins.r;
    const content = page().innerHTML.replace(/ class="sel"/g, '');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: ${margins.t}px ${margins.r}px ${margins.b}px ${margins.l}px; }
html, body { margin: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${BASE_CSS}
${css}
.wr-doc { width: ${w}px; }
.wr-doc hr.pb { border: 0; margin: 0; height: 0; }
</style></head><body><div class="docx wr-doc">${content}</div></body></html>`;
  }

  function exportPdf() {
    selectImage(null);
    Office.exportPdf(st, pdfHtml(), 'Document nou', { margins: { top: margins.t / 96, bottom: margins.b / 96, left: margins.l / 96, right: margins.r / 96 } });
  }

  async function back() {
    if (!(await Office.ensureSaved(api))) return;
    st = null;
    page().innerHTML = '';
    setDocStyles('');
    App.showHome();
  }

  function more() {
    const r = $('wr-more').getBoundingClientRect();
    UI.menu(r.right - 260, r.bottom + 6, [
      { label: 'Salvează ca…', icon: 'save', run: () => saveAs() },
      { label: 'Exportă ca PDF', icon: 'pdf', run: () => exportPdf() },
      UI.phone() && typeof Feel !== 'undefined' && Feel.on ? { label: wholePage ? 'Text pe lățimea ecranului' : 'Pagina întreagă', icon: 'layout', run: () => { wholePage = !wholePage; fitZoom(); } } : null,
      '-',
      { label: 'Margini: normale (2,54 cm)', icon: 'layout', run: () => setMargins(96) },
      { label: 'Margini: înguste (1,27 cm)', icon: 'layout', run: () => setMargins(48) },
      { label: 'Margini: late (3,18 cm)', icon: 'layout', run: () => setMargins(120) },
    ]);
  }

  function setMargins(v) {
    snapshot();
    margins = { t: v, r: v, b: v, l: v };
    applyPage();
    changed();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function sanitizePaste(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, meta, link, title, xml, o\\:p, iframe, object, embed').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      for (const a of [...n.attributes]) if (/^on/i.test(a.name) || a.name === 'class' && /^Mso/.test(a.value) === false && false) n.removeAttribute(a.name);
      n.removeAttribute('contenteditable');
    });
    return doc.body.innerHTML;
  }

  function init() {
    const p = page();
    p.classList.add('docx', 'wr-doc');
    const base = el('style', { id: 'wr-base' });
    base.textContent = BASE_CSS;
    document.head.append(base);
    p.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); return; }
      if (e.inputType === 'insertText' && !e.isComposing) leaveMark();
      if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); return; }
      const now = Date.now();
      if (now - lastInput > 900 || /^(insertParagraph|deleteContent|insertFromPaste|insertFromDrop)/.test(e.inputType)) snapshot();
      lastInput = now;
    });
    p.addEventListener('input', () => { lastTyped = Date.now(); changed(); });
    p.addEventListener('compositionstart', () => leaveMark()); // phone keyboards type through composition
    p.addEventListener('paste', (e) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const file = [...dt.files].find((f) => /^image\//.test(f.type));
      if (file) {
        e.preventDefault();
        const r = new FileReader();
        r.onload = () => insertHtml(`<img src="${r.result}" style="max-width:100%">`);
        r.readAsDataURL(file);
        return;
      }
      const html = dt.getData('text/html');
      if (html) { e.preventDefault(); insertHtml(sanitizePaste(html)); }
    });
    p.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') selectImage(e.target); else selectImage(null);
      showTableBar();
    });
    p.addEventListener('keyup', () => { saveSel(); refreshTools(); showTableBar(); });
    p.addEventListener('mouseup', () => { saveSel(); refreshTools(); });
    document.addEventListener('selectionchange', () => {
      if ($('writer').classList.contains('hidden') || document.activeElement !== p) return;
      if (Date.now() - lastTyped > 120) markerArmed = false; // the caret was moved (not by typing)
      saveSel(); refreshTools();
    });
    $('wr-scroll').addEventListener('scroll', () => { if (selImg) placeImgUi(); if (!$('wr-tblbar').classList.contains('hidden')) showTableBar(); }, { passive: true });
    window.addEventListener('resize', () => { if (selImg) placeImgUi(); });
    // the selected picture is dragged to move it anywhere on the page (it leaves the text when moved)
    p.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'IMG' && e.target === selImg && e.button === 0) startImgDrag(e, 'move'); });
    p.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });

    window.addEventListener('keydown', (e) => {
      if ($('writer').classList.contains('hidden') || document.querySelector('#modal-root .backdrop')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
      if (ctrl && (k === 'f' || k === 'h')) { e.preventDefault(); openFind(); return; }
      if (ctrl && k === 'z' && document.activeElement === p) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (ctrl && k === 'y' && document.activeElement === p) { e.preventDefault(); redo(); return; }
      if (ctrl && (k === 'b' || k === 'i' || k === 'u') && document.activeElement === p) { e.preventDefault(); cmd({ b: 'bold', i: 'italic', u: 'underline' }[k]); return; }
      if (ctrl && k === 'e' && document.activeElement === p) { e.preventDefault(); cmd('justifyCenter'); return; }
      if (ctrl && k === 'l' && document.activeElement === p) { e.preventDefault(); cmd('justifyLeft'); return; }
      if (ctrl && k === 'r' && document.activeElement === p) { e.preventDefault(); cmd('justifyRight'); return; }
      if (ctrl && k === 'j' && document.activeElement === p) { e.preventDefault(); cmd('justifyFull'); return; }
      if (ctrl && k === 'enter' && document.activeElement === p) { e.preventDefault(); insertHtml('<hr class="pb"><p><br></p>'); return; }
      if (e.key === 'Tab' && document.activeElement === p) {
        e.preventDefault();
        if (currentCell()) {
          // move between table cells
          const td = currentCell();
          const all = [...td.closest('table').querySelectorAll('td,th')];
          const i = all.indexOf(td);
          const next = all[i + (e.shiftKey ? -1 : 1)];
          if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
          else if (!e.shiftKey) { tableOp('rowBelow'); }
          return;
        }
        if (document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList')) cmd(e.shiftKey ? 'outdent' : 'indent');
        else insertHtml('&emsp;');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selImg) { e.preventDefault(); imgOp('del'); return; }
      if (e.key === 'Escape') { $('wr-findbar').classList.add('hidden'); selectImage(null); }
    });

    $('wr-find').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey); } if (e.key === 'Escape') { $('wr-findbar').classList.add('hidden'); p.focus(); } });
    $('wr-replace').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } });
    $('wr-fnext').addEventListener('click', () => findNext(false));
    $('wr-fprev').addEventListener('click', () => findNext(true));
    $('wr-rone').addEventListener('click', replaceOne);
    $('wr-rall').addEventListener('click', replaceAll);
    $('wr-fclose').addEventListener('click', () => { $('wr-findbar').classList.add('hidden'); p.focus(); });

    $('wr-back').addEventListener('click', back);
    $('wr-save').addEventListener('click', save);
    $('wr-pdf').addEventListener('click', exportPdf);
    $('wr-more').addEventListener('click', more);
    $('wr-zin').addEventListener('click', () => { zoom = Math.min(2, Math.round((zoom + 0.1) * 10) / 10); applyPage(); });
    $('wr-zout').addEventListener('click', () => { zoom = Math.max(0.4, Math.round((zoom - 0.1) * 10) / 10); applyPage(); });
    $('wr-zoomval').addEventListener('click', fitZoom);
    $('wr-scroll').addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoom = Math.max(0.4, Math.min(2, Math.round((zoom + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)); applyPage(); }, { passive: false });
    $('wr-scroll').addEventListener('mousedown', (e) => {
      // a click in the gray area puts the caret at the end
      if (e.target === $('wr-scroll') || e.target === $('wr-page-wrap')) {
        e.preventDefault();
        p.focus();
        const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    });
  }

  const api = {
    screen: 'writer',
    isDirty: () => !!(st && st.dirty),
    save,
    discard: () => { if (st) st.dirty = false; },
    name: () => (st ? st.name : 'Document'),
  };
  Office.register(api);

  return { init, open, save, api, _debug: () => ({ buildDocx, pdfHtml, page, margins }) };
})();
