'use strict';
// "Prezentare": a slide editor like PowerPoint. Opens .pptx, saves .pptx, exports PDF,
// and plays the slides full screen. Pictures live in a separate media store so undo
// stays light.

const Slides = (() => {
  const $ = (id) => document.getElementById(id);
  let deck = null; // { w, h, theme, slides: [{id, bg: {color, grad, image}, els: []}], media: {} }
  let st = null;
  let cur = 0;
  let selIds = [];
  let editingId = null;
  let history = [], future = [];
  let clipEls = null;
  let k = 1; // stage scale
  let toolsBuilt = false;
  const tools = {};
  let uid = 1;
  const nid = () => 'e' + Date.now().toString(36) + (uid++).toString(36);

  // ---------------------------------------------------------------------------
  // Look
  // ---------------------------------------------------------------------------

  const THEMES = [
    { id: 'alb', name: 'Alb', bg: '#ffffff', title: '#1b1b1f', text: '#3a3a40', accent: '#1d5b79', font: 'Calibri' },
    { id: 'petrol', name: 'Petrol', bg: '#1d5b79', title: '#ffffff', text: '#e3eef3', accent: '#ffc000', font: 'Segoe UI' },
    { id: 'grafit', name: 'Grafit', bg: '#23262c', title: '#ffffff', text: '#c9ccd1', accent: '#ff5b38', font: 'Segoe UI' },
    { id: 'atelier', name: 'Atelier', bg: '#0c0c0e', title: '#ffffff', text: '#d0d0d6', accent: '#c4161c', font: 'Segoe UI' },
    { id: 'hartie', name: 'Hârtie', bg: '#f6f1e7', title: '#3b2f22', text: '#5a4a3a', accent: '#b5651d', font: 'Georgia' },
    { id: 'natura', name: 'Natură', bg: '#eef5ef', title: '#1e4d2b', text: '#2f3e33', accent: '#2e7d4f', font: 'Calibri' },
    { id: 'apus', name: 'Apus', bg: '#ff6a45', grad: 'linear-gradient(135deg,#ff6a45 0%,#d6336c 55%,#6f2dbd 100%)', title: '#ffffff', text: '#fff4ef', accent: '#ffffff', font: 'Segoe UI' },
    { id: 'ocean', name: 'Ocean', bg: '#0f4c81', grad: 'linear-gradient(135deg,#0b3c6d 0%,#1f7a8c 100%)', title: '#ffffff', text: '#dcecf2', accent: '#7fd1ae', font: 'Calibri' },
  ];

  const CSS = `
.sl { position: relative; overflow: hidden; background: #fff; }
.sl .se { position: absolute; box-sizing: border-box; }
.sl .se .tx { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 7px 12px; box-sizing: border-box; }
.sl .se .tx.top { justify-content: flex-start; } .sl .se .tx.middle { justify-content: center; } .sl .se .tx.bottom { justify-content: flex-end; }
.sl .se .txi { outline: none; overflow-wrap: break-word; line-height: 1.15; min-height: 1em; }
.sl .se .txi p, .sl .se .txi div { margin: 0; }
.sl .se .txi ul, .sl .se .txi ol { margin: 0; padding-left: 1.15em; list-style: none; }
.sl .se .txi ol { counter-reset: n; }
.sl .se .txi li { margin: 0 0 .3em; position: relative; }
.sl .se .txi ul > li::before { content: "•"; position: absolute; left: -0.95em; }
.sl .se .txi ul ul > li::before { content: "◦"; }
.sl .se .txi ol > li { counter-increment: n; }
.sl .se .txi ol > li::before { content: counter(n) "."; position: absolute; left: -1.3em; }
.sl .se .txi li.lvl1 { margin-left: 1.1em; } .sl .se .txi li.lvl2 { margin-left: 2.2em; } .sl .se .txi li.lvl3 { margin-left: 3.3em; }
.sl .se svg.shp { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
.sl .se img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.sl .se table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
.sl .se td { border: 1px solid rgba(128,128,128,.6); padding: 4px 8px; vertical-align: middle; }
.sl.editing .se .txi:empty::before { content: attr(data-ph); opacity: .45; }
`;

  // ---------------------------------------------------------------------------
  // Model helpers
  // ---------------------------------------------------------------------------

  const slide = () => deck.slides[cur];
  const theme = () => THEMES.find((t) => t.id === deck.theme) || THEMES[0];
  const findEl = (id, s = slide()) => s.els.find((e) => e.id === id);
  const selected = () => selIds.map((id) => findEl(id)).filter(Boolean);

  function textEl(x, y, w, h, html, st2, role, ph) {
    return { id: nid(), type: 'text', x, y, w, h, html, st: { size: 18, align: 'left', valign: 'top', ...st2 }, role: role || null, ph: ph || '' };
  }

  function layoutEls(kind) {
    const T = theme();
    const W = deck.w, H = deck.h, mx = Math.round(W * 0.065);
    const title = (y, h, size, align) => textEl(mx, y, W - mx * 2, h, '', { size, bold: true, color: T.title, font: T.font, align, valign: 'middle' }, 'title', 'Click pentru titlu');
    const body = (x, y, w, h) => textEl(x, y, w, h, '', { size: 22, color: T.text, font: T.font, bullets: true }, 'body', 'Click pentru text');
    switch (kind) {
      case 'title': return [
        textEl(mx, H * 0.3, W - mx * 2, H * 0.2, '', { size: 46, bold: true, color: T.title, font: T.font, align: 'center', valign: 'bottom' }, 'title', 'Click pentru titlu'),
        textEl(mx, H * 0.52, W - mx * 2, H * 0.13, '', { size: 24, color: T.text, font: T.font, align: 'center' }, 'body', 'Click pentru subtitlu'),
      ];
      case 'content': return [title(H * 0.06, H * 0.15, 36, 'left'), body(mx, H * 0.25, W - mx * 2, H * 0.66)];
      case 'two': return [title(H * 0.06, H * 0.15, 36, 'left'), body(mx, H * 0.25, (W - mx * 2) / 2 - 20, H * 0.66), body(W / 2 + 20, H * 0.25, (W - mx * 2) / 2 - 20, H * 0.66)];
      case 'section': return [
        textEl(mx, H * 0.36, W - mx * 2, H * 0.18, '', { size: 44, bold: true, color: T.title, font: T.font, valign: 'bottom' }, 'title', 'Click pentru titlul secțiunii'),
        textEl(mx, H * 0.56, W - mx * 2, H * 0.1, '', { size: 20, color: T.text, font: T.font }, 'body', 'Click pentru text'),
      ];
      case 'titleOnly': return [title(H * 0.06, H * 0.15, 36, 'left')];
      default: return [];
    }
  }

  function newSlide(kind) {
    return { id: nid(), bg: {}, els: layoutEls(kind) };
  }

  function newDeck() {
    return { w: 1280, h: 720, theme: 'alb', slides: [], media: {} };
  }

  function addMedia(url) {
    for (const [id, u] of Object.entries(deck.media)) if (u === url) return id;
    const id = 'm' + Object.keys(deck.media).length + '_' + Date.now().toString(36);
    deck.media[id] = url;
    return id;
  }

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------

  const snapshotOf = () => JSON.stringify({ w: deck.w, h: deck.h, theme: deck.theme, slides: deck.slides, cur });
  function snapshot() {
    history.push(snapshotOf());
    if (history.length > 80) history.shift();
    future = [];
  }
  function restore(json) {
    const o = JSON.parse(json);
    deck.w = o.w; deck.h = o.h; deck.theme = o.theme; deck.slides = o.slides;
    cur = Math.min(o.cur, deck.slides.length - 1);
    selIds = [];
    editingId = null;
    renderAll();
    markDirty();
  }
  function undo() { if (editingId) endEdit(); if (!history.length) return; future.push(snapshotOf()); restore(history.pop()); }
  function redo() { if (editingId) endEdit(); if (!future.length) return; history.push(snapshotOf()); restore(future.pop()); }

  function change(fn, { all } = {}) {
    snapshot();
    fn();
    markDirty();
    if (all) renderAll(); else { renderStage(); renderThumb(cur); }
  }

  function markDirty() {
    if (!st) return;
    st.dirty = true;
    $('sl-dirty').classList.remove('hidden');
    if (toolsBuilt) { tools.undo.disabled = !history.length; tools.redo.disabled = !future.length; }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function bgCss(s) {
    const T = theme();
    const b = s.bg || {};
    if (b.image) return `center / cover no-repeat url("${deck.media[b.image] || b.image}") , ${b.color || T.bg}`;
    if (b.grad) return b.grad;
    if (b.color) return b.color;
    return T.grad || T.bg;
  }

  function txStyle(e) {
    const s = e.st || {};
    const css = [];
    if (s.font) css.push(`font-family:"${s.font}", Arial, sans-serif`);
    css.push(`font-size:${s.size || 18}pt`);
    if (s.color) css.push(`color:${s.color}`);
    if (s.bold) css.push('font-weight:700');
    if (s.italic) css.push('font-style:italic');
    if (s.underline) css.push('text-decoration:underline');
    css.push(`text-align:${s.align || 'left'}`);
    if (s.lineH) css.push(`line-height:${s.lineH}`);
    return css.join(';');
  }

  function shapeSvg(e) {
    const s = e.st || {};
    const w = e.w, h = e.h;
    const fill = s.fill || 'none', stroke = s.line || 'none', lw = s.line ? s.lineW || 2 : 0;
    const a = lw / 2;
    let body = '';
    switch (s.shape) {
      case 'ellipse': body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - a)}" ry="${Math.max(0, h / 2 - a)}"/>`; break;
      case 'triangle': body = `<polygon points="${w / 2},${a} ${w - a},${h - a} ${a},${h - a}"/>`; break;
      case 'rightArrow': { const t = h * 0.28, hx = w - Math.min(w * 0.4, h * 0.6); body = `<polygon points="${a},${t} ${hx},${t} ${hx},${a} ${w - a},${h / 2} ${hx},${h - a} ${hx},${h - t} ${a},${h - t}"/>`; break; }
      case 'line': return `<svg class="shp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${h <= 12 ? h / 2 : 0}" x2="${w}" y2="${h <= 12 ? h / 2 : h}" stroke="${s.line || '#333'}" stroke-width="${s.lineW || 3}" ${s.flip ? 'transform="scale(1,-1) translate(0,-' + h + ')"' : ''}/></svg>`;
      case 'roundRect': body = `<rect x="${a}" y="${a}" width="${Math.max(0, w - lw)}" height="${Math.max(0, h - lw)}" rx="${Math.min(w, h) * 0.16}"/>`; break;
      default: body = `<rect x="${a}" y="${a}" width="${Math.max(0, w - lw)}" height="${Math.max(0, h - lw)}"/>`;
    }
    return `<svg class="shp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="${fill}" stroke="${stroke}" stroke-width="${lw}">${body}</svg>`;
  }

  function elNode(e, mode) {
    const d = document.createElement('div');
    d.className = 'se';
    d.dataset.id = e.id;
    d.style.left = e.x + 'px'; d.style.top = e.y + 'px'; d.style.width = e.w + 'px'; d.style.height = e.h + 'px';
    if (e.rot) d.style.transform = `rotate(${e.rot}deg)`;
    const s = e.st || {};
    if (e.type === 'image') {
      const img = document.createElement('img');
      img.src = deck.media[e.src] || e.src || '';
      img.draggable = false;
      if (s.crop) img.style.objectFit = 'cover';
      d.append(img);
      return d;
    }
    if (e.type === 'shape' || (e.type === 'text' && (s.fill || s.line))) d.insertAdjacentHTML('beforeend', e.type === 'shape' ? shapeSvg(e) : shapeSvg({ ...e, st: { ...s, shape: 'rect' } }));
    if (e.type === 'table') {
      const tb = document.createElement('table');
      tb.style.cssText = txStyle(e);
      for (const row of e.rows || []) {
        const tr = document.createElement('tr');
        row.forEach((c, i) => { const td = document.createElement('td'); td.innerHTML = c; if (e.head && tr.parentNode === null && i >= 0 && tb.rows.length === 0) td.style.fontWeight = '700'; if (s.fill && tb.rows.length === 0) td.style.background = s.fill; tr.append(td); });
        tb.append(tr);
      }
      d.append(tb);
      return d;
    }
    if (e.type === 'text' || (e.type === 'shape' && e.html)) {
      if (e.type === 'shape' && !e.html && mode !== 'edit') return d;
      const tx = document.createElement('div');
      tx.className = 'tx ' + (s.valign || (e.type === 'shape' ? 'middle' : 'top'));
      const inner = document.createElement('div');
      inner.className = 'txi';
      inner.style.cssText = txStyle(e);
      if (e.ph) {
        // touch screens: "Atinge pentru titlu" instead of "Click pentru titlu"
        const ph = Host.mobile || matchMedia('(pointer: coarse)').matches ? e.ph.replace(/^Click pentru/, 'Atinge pentru') : e.ph;
        inner.dataset.ph = typeof I18n !== 'undefined' && I18n.t ? I18n.t(ph) : ph;
      }
      let html = e.html || '';
      if (s.bullets && html && !/<(ul|ol)\b/i.test(html)) html = toBullets(html);
      inner.innerHTML = html;
      tx.append(inner);
      d.append(tx);
    }
    return d;
  }

  /** Paragraphs -> bullet list (body placeholders). */
  function toBullets(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const items = [];
    for (const n of [...box.childNodes]) {
      if (n.nodeType === 1 && /^(P|DIV)$/.test(n.tagName)) items.push(`<li style="${n.getAttribute('style') || ''}">${n.innerHTML}</li>`);
      else if (n.nodeType === 3 && n.nodeValue.trim()) items.push(`<li>${n.nodeValue}</li>`);
      else if (n.nodeType === 1) items.push(`<li>${n.outerHTML}</li>`);
    }
    return items.length ? `<ul>${items.join('')}</ul>` : html;
  }

  function slideNode(s, mode) {
    const n = document.createElement('div');
    n.className = 'sl' + (mode === 'edit' ? ' editing' : '');
    n.style.width = deck.w + 'px';
    n.style.height = deck.h + 'px';
    n.style.background = bgCss(s);
    for (const e of s.els) {
      if (mode !== 'edit' && e.type === 'text' && !e.html) continue;
      n.append(elNode(e, mode));
    }
    return n;
  }

  function stageSize() {
    const box = $('sl-stage');
    const W = box.clientWidth, H = box.clientHeight;
    k = Math.max(0.1, Math.min((W - 80) / deck.w, (H - 60) / deck.h));
    return { W, H, sw: deck.w * k, sh: deck.h * k };
  }

  function renderStage() {
    if (!deck) return;
    const wrap = $('sl-wrap');
    const { sw, sh } = stageSize();
    wrap.style.width = sw + 'px';
    wrap.style.height = sh + 'px';
    wrap.innerHTML = '';
    const n = slideNode(slide(), 'edit');
    n.style.transform = `scale(${k})`;
    n.style.transformOrigin = '0 0';
    n.id = 'sl-live';
    wrap.append(n);
    const ov = el('div', { id: 'sl-overlay' });
    wrap.append(ov);
    drawSelection();
    $('sl-pos').textContent = `Diapozitivul ${cur + 1} din ${deck.slides.length}`;
    refreshTools();
  }

  function drawSelection(guides) {
    const ov = $('sl-overlay');
    if (!ov) return;
    ov.innerHTML = '';
    for (const g of guides || []) {
      ov.append(el('div', { class: 'guide ' + g.dir, style: g.dir === 'v' ? { left: g.pos * k + 'px' } : { top: g.pos * k + 'px' } }));
    }
    const sel = selected();
    if (!sel.length) return;
    for (const e of sel) {
      const box = el('div', { class: 'selbox' + (editingId === e.id ? ' editing' : ''), style: { left: e.x * k + 'px', top: e.y * k + 'px', width: e.w * k + 'px', height: e.h * k + 'px', transform: e.rot ? `rotate(${e.rot}deg)` : '' } });
      if (sel.length === 1 && editingId !== e.id) {
        for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const hd = el('div', { class: 'hd ' + h });
          hd.dataset.h = h;
          box.append(hd);
        }
        // phones: a clear "write" button on the selected text box (no double click with a finger)
        if (Host.mobile && (e.type === 'text' || e.type === 'table' || (e.type === 'shape' && e.st.shape !== 'line'))) {
          const wb = el('button', { class: 'sl-write', type: 'button', html: svg('edit') + '<span>Scrie</span>' });
          wb.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
          wb.addEventListener('click', (ev) => { ev.stopPropagation(); beginEdit(e.id); });
          box.append(wb);
        }
      }
      ov.append(box);
    }
  }

  function thumbsBox() { return $('sl-list'); }

  function renderThumbs() {
    const box = thumbsBox();
    box.innerHTML = '';
    deck.slides.forEach((s, i) => box.append(thumbItem(i)));
    const add = el('button', { class: 'sl-add', html: svg('plus') + '<span>Diapozitiv nou</span>', type: 'button' });
    add.addEventListener('click', (e) => layoutMenu(e.currentTarget, cur + 1));
    box.append(add);
  }

  function thumbItem(i) {
    const s = deck.slides[i];
    const TW = UI.phone() ? 132 : 176;
    const sc = TW / deck.w;
    const item = el('div', { class: 'sl-th' + (i === cur ? ' on' : '') });
    item.dataset.i = i;
    const frame = el('div', { class: 'sl-frame', style: { width: TW + 'px', height: Math.round(deck.h * sc) + 'px' } });
    const n = slideNode(s, 'thumb');
    n.style.transform = `scale(${sc})`;
    n.style.transformOrigin = '0 0';
    frame.append(n);
    item.append(el('span', { class: 'num', text: String(i + 1) }), frame);
    item.addEventListener('pointerdown', (e) => thumbDown(e, i));
    item.addEventListener('contextmenu', (e) => { e.preventDefault(); goTo(i); slideMenu(e.clientX, e.clientY, i); });
    return item;
  }

  let thumbTimer = new Map();
  function renderThumb(i) {
    clearTimeout(thumbTimer.get(i));
    thumbTimer.set(i, setTimeout(() => {
      const box = thumbsBox();
      const old = box.querySelector(`.sl-th[data-i="${i}"]`);
      if (old) old.replaceWith(thumbItem(i));
    }, 120));
  }

  function renderAll() {
    renderThumbs();
    renderStage();
  }

  function goTo(i) {
    if (editingId) endEdit();
    cur = Math.max(0, Math.min(deck.slides.length - 1, i));
    selIds = [];
    thumbsBox().querySelectorAll('.sl-th').forEach((t) => t.classList.toggle('on', +t.dataset.i === cur));
    const t = thumbsBox().querySelector(`.sl-th[data-i="${cur}"]`);
    if (t) t.scrollIntoView({ block: 'nearest' });
    renderStage();
  }

  // ---------------------------------------------------------------------------
  // Mouse on the slide: select, move (with snapping), resize, edit text
  // ---------------------------------------------------------------------------

  let drag = null;

  function slidePoint(e) {
    const r = $('sl-wrap').getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  }

  function elAt(p) {
    const s = slide();
    for (let i = s.els.length - 1; i >= 0; i--) {
      const e = s.els[i];
      const pad = e.type === 'shape' && e.st && e.st.shape === 'line' ? 8 / k : 0;
      if (p.x >= e.x - pad && p.x <= e.x + e.w + pad && p.y >= e.y - pad && p.y <= e.y + e.h + pad) return e;
    }
    return null;
  }

  function onStageDown(e) {
    if (e.button !== 0) return;
    Office.closePicker();
    const target = e.target;
    if (editingId) {
      const node = $('sl-live').querySelector(`.se[data-id="${editingId}"]`);
      if (node && node.contains(target)) return; // clicking inside the text being edited
      endEdit();
    }
    const p = slidePoint(e);
    const hd = target.classList && target.classList.contains('hd') ? target.dataset.h : null;
    if (hd && selIds.length === 1) {
      const it = findEl(selIds[0]);
      e.preventDefault();
      drag = { type: 'resize', h: hd, start: p, orig: { ...it }, id: it.id, moved: false, keep: it.type === 'image' || e.shiftKey };
      $('sl-stage').setPointerCapture(e.pointerId);
      return;
    }
    const hitEl = elAt(p);
    if (!hitEl) {
      if (p.x < 0 || p.y < 0 || p.x > deck.w || p.y > deck.h) { selIds = []; drawSelection(); refreshTools(); return; }
      selIds = [];
      drag = { type: 'marquee', start: p };
      drawSelection(); refreshTools();
      $('sl-stage').setPointerCapture(e.pointerId);
      return;
    }
    e.preventDefault();
    if (e.shiftKey) {
      selIds = selIds.includes(hitEl.id) ? selIds.filter((x) => x !== hitEl.id) : [...selIds, hitEl.id];
    } else if (!selIds.includes(hitEl.id)) selIds = [hitEl.id];
    drawSelection();
    refreshTools();
    drag = { type: 'move', start: p, origs: selected().map((x) => ({ id: x.id, x: x.x, y: x.y })), moved: false, clickId: hitEl.id };
    $('sl-stage').setPointerCapture(e.pointerId);
  }

  function snapMove(dx, dy) {
    // positions the moving group so its edges/centers line up with the slide or other boxes
    const els = selected();
    const box = bounds(els.map((e) => { const o = drag.origs.find((q) => q.id === e.id); return { x: o.x + dx, y: o.y + dy, w: e.w, h: e.h }; }));
    const others = slide().els.filter((e) => !selIds.includes(e.id));
    const vx = [0, deck.w / 2, deck.w], hy = [0, deck.h / 2, deck.h];
    for (const o of others) { vx.push(o.x, o.x + o.w / 2, o.x + o.w); hy.push(o.y, o.y + o.h / 2, o.y + o.h); }
    const T = 7 / k;
    let bestX = null, bestY = null;
    for (const [val, off] of [[box.x, 0], [box.x + box.w / 2, box.w / 2], [box.x + box.w, box.w]]) {
      for (const v of vx) { const d = v - val; if (Math.abs(d) < T && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: v }; }
      void off;
    }
    for (const val of [box.y, box.y + box.h / 2, box.y + box.h]) {
      for (const v of hy) { const d = v - val; if (Math.abs(d) < T && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: v }; }
    }
    const guides = [];
    if (bestX) { dx += bestX.d; guides.push({ dir: 'v', pos: bestX.pos }); }
    if (bestY) { dy += bestY.d; guides.push({ dir: 'h', pos: bestY.pos }); }
    return { dx, dy, guides };
  }

  function bounds(list) {
    const x0 = Math.min(...list.map((e) => e.x)), y0 = Math.min(...list.map((e) => e.y));
    const x1 = Math.max(...list.map((e) => e.x + e.w)), y1 = Math.max(...list.map((e) => e.y + e.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function onStageMove(e) {
    if (!drag) return;
    const p = slidePoint(e);
    if (drag.type === 'move') {
      let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      // a finger always wobbles a little: a tap is not a move
      if (!drag.moved && Math.hypot(dx, dy) * k < (e.pointerType === 'touch' ? 12 : 3)) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const sn = e.altKey ? { dx, dy, guides: [] } : snapMove(dx, dy);
      for (const o of drag.origs) { const it = findEl(o.id); it.x = Math.round(o.x + sn.dx); it.y = Math.round(o.y + sn.dy); const n = $('sl-live').querySelector(`.se[data-id="${o.id}"]`); if (n) { n.style.left = it.x + 'px'; n.style.top = it.y + 'px'; } }
      drawSelection(sn.guides);
    } else if (drag.type === 'resize') {
      const it = findEl(drag.id);
      const o = drag.orig;
      let { x, y, w, h } = o;
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      if (drag.h.includes('e')) w = o.w + dx;
      if (drag.h.includes('s')) h = o.h + dy;
      if (drag.h.includes('w')) { w = o.w - dx; x = o.x + dx; }
      if (drag.h.includes('n')) { h = o.h - dy; y = o.y + dy; }
      const keep = drag.keep !== e.shiftKey ? true : false;
      if (keep && drag.h.length === 2) {
        const ratio = o.w / o.h;
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
        if (drag.h.includes('w')) x = o.x + o.w - w;
        if (drag.h.includes('n')) y = o.y + o.h - h;
      }
      const min = 12;
      if (w < min) { if (drag.h.includes('w')) x -= min - w; w = min; }
      if (h < (it.type === 'shape' && it.st.shape === 'line' ? 2 : min)) { const mh = it.type === 'shape' && it.st.shape === 'line' ? 2 : min; if (drag.h.includes('n')) y -= mh - h; h = mh; }
      Object.assign(it, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      const n = $('sl-live').querySelector(`.se[data-id="${it.id}"]`);
      if (n) n.replaceWith(elNode(it, 'edit'));
      drawSelection();
    } else if (drag.type === 'marquee') {
      const a = drag.start;
      const r = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
      selIds = slide().els.filter((e2) => e2.x < r.x + r.w && e2.x + e2.w > r.x && e2.y < r.y + r.h && e2.y + e2.h > r.y).map((e2) => e2.id);
      drawSelection();
      const ov = $('sl-overlay');
      ov.append(el('div', { class: 'marq', style: { left: r.x * k + 'px', top: r.y * k + 'px', width: r.w * k + 'px', height: r.h * k + 'px' } }));
    }
  }

  let lastTap = null;
  function onStageUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === 'move' || d.type === 'resize') {
      if (d.moved) { markDirty(); renderThumb(cur); drawSelection(); }
      else if (d.type === 'move' && d.clickId && selIds.length === 1) {
        // second tap on the selected box, or a quick double tap (phones have no double click): edit
        const now = Date.now();
        const twice = lastTap && lastTap.id === d.clickId && now - lastTap.t < 450;
        lastTap = { id: d.clickId, t: now };
        const it = findEl(d.clickId);
        if (d.wasSelected || (twice && it && it.type !== 'image')) { lastTap = null; beginEdit(d.clickId, d.ev); }
      }
    }
    if (d.type === 'marquee') { drawSelection(); refreshTools(); }
  }

  function onStageDbl(e) {
    const it = elAt(slidePoint(e));
    if (!it) return;
    if (it.type === 'text' || it.type === 'shape' || it.type === 'table') beginEdit(it.id, e);
    if (it.type === 'image') replaceImage(it);
  }

  // ---------------------------------------------------------------------------
  // Text editing
  // ---------------------------------------------------------------------------

  function beginEdit(id, ev) {
    const it = findEl(id);
    if (!it) return;
    if (it.type === 'shape' && it.st.shape === 'line') return;
    snapshot();
    editingId = id;
    selIds = [id];
    let node = $('sl-live').querySelector(`.se[data-id="${id}"]`);
    if (it.type === 'shape' && !node.querySelector('.txi')) { node.replaceWith(elNode(it, 'edit')); node = $('sl-live').querySelector(`.se[data-id="${id}"]`); }
    const inner = it.type === 'table' ? node.querySelector('table') : node.querySelector('.txi');
    if (!inner) return;
    inner.contentEditable = 'true';
    inner.focus();
    // put the caret where the user clicked
    let placed = false;
    if (ev && document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
      if (r && inner.contains(r.startContainer)) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); placed = true; }
    }
    if (!placed) { const r = document.createRange(); r.selectNodeContents(inner); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    inner.addEventListener('input', () => {
      if (it.type === 'table') it.rows = [...inner.rows].map((tr) => [...tr.cells].map((td) => td.innerHTML));
      else it.html = cleanHtml(inner.innerHTML);
      markDirty();
    });
    drawSelection();
    refreshTools();
  }

  function cleanHtml(h) {
    return h === '<br>' || h === '<p><br></p>' || h === '<div><br></div>' ? '' : h;
  }

  function endEdit() {
    if (!editingId) return;
    const id = editingId;
    editingId = null;
    const it = findEl(id);
    const node = $('sl-live') && $('sl-live').querySelector(`.se[data-id="${id}"]`);
    if (it && node) {
      const inner = it.type === 'table' ? node.querySelector('table') : node.querySelector('.txi');
      if (inner) {
        inner.contentEditable = 'false';
        if (it.type === 'table') it.rows = [...inner.rows].map((tr) => [...tr.cells].map((td) => td.innerHTML));
        else it.html = cleanHtml(inner.innerHTML);
      }
    }
    // the edit started with a snapshot; drop it when nothing changed
    if (history.length && history[history.length - 1] === snapshotOf()) history.pop();
    window.getSelection().removeAllRanges();
    renderStage();
    renderThumb(cur);
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /** While editing: apply to the selected text. Otherwise: to the whole box. */
  function fmt(prop, value, execName, execVal) {
    if (editingId) {
      document.execCommand('styleWithCSS', false, true);
      if (execName === 'fontSize') {
        document.execCommand('fontSize', false, '7');
        const node = $('sl-live').querySelector(`.se[data-id="${editingId}"]`);
        for (const n of node.querySelectorAll('span[style*="xxx-large"], font[size="7"]')) n.style.fontSize = value + 'pt';
      } else document.execCommand(execName, false, execVal);
      const it = findEl(editingId);
      const inner = $('sl-live').querySelector(`.se[data-id="${editingId}"] .txi`);
      if (inner && it) { it.html = cleanHtml(inner.innerHTML); markDirty(); renderThumb(cur); }
      refreshTools();
      return;
    }
    const els = selected().filter((e) => e.type !== 'image');
    if (!els.length) return;
    change(() => {
      for (const e of els) {
        e.st = { ...(e.st || {}) };
        if (typeof value === 'function') value(e);
        else e.st[prop] = value;
        // the box setting wins over formatting inside the text
        const strip = { size: 'font-size', color: 'color', font: 'font-family', bold: 'font-weight', italic: 'font-style', underline: 'text-decoration', align: 'text-align' }[prop];
        if (strip && e.html) e.html = stripCss(e.html, strip, prop);
      }
    });
  }

  function stripCss(html, cssProp, prop) {
    const box = document.createElement('div');
    box.innerHTML = html;
    for (const n of box.querySelectorAll('*')) {
      if (n.style && n.style[cssProp.replace(/-(.)/g, (m, c) => c.toUpperCase())]) n.style.removeProperty(cssProp);
      if (n.getAttribute && n.getAttribute('style') === '') n.removeAttribute('style');
    }
    if (prop === 'bold') for (const b of box.querySelectorAll('b,strong')) b.replaceWith(...b.childNodes);
    if (prop === 'italic') for (const b of box.querySelectorAll('i,em')) b.replaceWith(...b.childNodes);
    if (prop === 'underline') for (const b of box.querySelectorAll('u')) b.replaceWith(...b.childNodes);
    if (prop === 'color' || prop === 'font' || prop === 'size') for (const f of box.querySelectorAll('font')) f.replaceWith(...f.childNodes);
    return box.innerHTML;
  }

  function cur1() { return selected()[0] || null; }

  // ---------------------------------------------------------------------------
  // Adding things
  // ---------------------------------------------------------------------------

  function addText() {
    const T = theme();
    const e = textEl(deck.w * 0.3, deck.h * 0.4, deck.w * 0.4, 70, '', { size: 24, color: T.text, font: T.font }, null, 'Scrie text');
    change(() => slide().els.push(e));
    selIds = [e.id];
    beginEdit(e.id);
  }

  function addShape(shape) {
    const T = theme();
    const line = shape === 'line';
    const w = line ? 300 : 260, h = line ? 4 : shape === 'rightArrow' ? 120 : 180;
    const e = { id: nid(), type: 'shape', x: Math.round((deck.w - w) / 2), y: Math.round((deck.h - h) / 2), w, h, html: '', st: { shape, fill: line ? null : T.accent, line: line ? T.title : null, lineW: line ? 4 : 0, size: 20, color: '#ffffff', align: 'center', valign: 'middle', font: T.font } };
    change(() => slide().els.push(e));
    selIds = [e.id];
    drawSelection();
    refreshTools();
  }

  async function addImage() {
    const img = await Office.imageDataUrl(1920);
    if (!img) return;
    insertImageUrl(img.url, img.width, img.height);
  }

  function insertImageUrl(url, iw, ih) {
    const maxW = deck.w * 0.6, maxH = deck.h * 0.6;
    const sc = Math.min(1, maxW / iw, maxH / ih);
    const w = Math.round(iw * sc), h = Math.round(ih * sc);
    const e = { id: nid(), type: 'image', x: Math.round((deck.w - w) / 2), y: Math.round((deck.h - h) / 2), w, h, src: addMedia(url), st: {} };
    change(() => slide().els.push(e));
    selIds = [e.id];
    drawSelection();
  }

  async function replaceImage(it) {
    const img = await Office.imageDataUrl(1920);
    if (!img) return;
    change(() => { it.src = addMedia(img.url); it.h = Math.round(it.w * (img.height / img.width)); });
  }

  function addTable(rows = 3, cols = 3) {
    const T = theme();
    const w = Math.min(deck.w * 0.8, cols * 220), h = rows * 54;
    const e = { id: nid(), type: 'table', x: Math.round((deck.w - w) / 2), y: Math.round((deck.h - h) / 2), w: Math.round(w), h, rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => (r === 0 ? '<b>Titlu</b>' : ''))), st: { size: 16, color: T.text, font: T.font, fill: T.accent + '33' } };
    change(() => slide().els.push(e));
    selIds = [e.id];
    drawSelection();
  }

  function deleteSel() {
    if (!selIds.length) return;
    change(() => { slide().els = slide().els.filter((e) => !selIds.includes(e.id)); });
    selIds = [];
    drawSelection();
    refreshTools();
  }

  function duplicateSel() {
    const els = selected();
    if (!els.length) return;
    const copies = els.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: nid(), x: e.x + 20, y: e.y + 20 }));
    change(() => slide().els.push(...copies));
    selIds = copies.map((c) => c.id);
    drawSelection();
  }

  function order(where) {
    const els = selected();
    if (!els.length) return;
    change(() => {
      const s = slide();
      const rest = s.els.filter((e) => !selIds.includes(e.id));
      if (where === 'front') s.els = [...rest, ...els];
      else if (where === 'back') s.els = [...els, ...rest];
      else {
        for (const e of els) {
          const i = s.els.indexOf(e);
          const j = where === 'up' ? Math.min(s.els.length - 1, i + 1) : Math.max(0, i - 1);
          s.els.splice(i, 1); s.els.splice(j, 0, e);
        }
      }
    });
    drawSelection();
  }

  function align(how) {
    const els = selected();
    if (!els.length) return;
    change(() => {
      const b = els.length > 1 ? bounds(els) : { x: 0, y: 0, w: deck.w, h: deck.h };
      for (const e of els) {
        if (how === 'left') e.x = b.x;
        if (how === 'center') e.x = Math.round(b.x + (b.w - e.w) / 2);
        if (how === 'right') e.x = b.x + b.w - e.w;
        if (how === 'top') e.y = b.y;
        if (how === 'middle') e.y = Math.round(b.y + (b.h - e.h) / 2);
        if (how === 'bottom') e.y = b.y + b.h - e.h;
      }
    });
    drawSelection();
  }

  // ---------------------------------------------------------------------------
  // Slides
  // ---------------------------------------------------------------------------

  const LAYOUTS = [['title', 'Titlu'], ['content', 'Titlu și text'], ['two', 'Două coloane'], ['section', 'Început de secțiune'], ['titleOnly', 'Doar titlu'], ['blank', 'Gol']];

  function layoutMenu(anchor, at) {
    const r = anchor.getBoundingClientRect();
    UI.menu(r.left, Math.min(r.bottom + 4, window.innerHeight - 280), LAYOUTS.map(([kind, label]) => ({ label, icon: 'layout', run: () => addSlide(kind, at) })));
  }

  function addSlide(kind, at) {
    if (editingId) endEdit();
    const s = newSlide(kind);
    change(() => { deck.slides.splice(at, 0, s); cur = at; selIds = []; }, { all: true });
  }

  function slideMenu(x, y, i) {
    UI.menu(x, y, [
      { label: 'Diapozitiv nou după', icon: 'plus', run: () => addSlide('content', i + 1) },
      { label: 'Duplică diapozitivul', icon: 'copy', run: () => dupSlide(i) },
      { label: 'Mută mai sus', icon: 'up', disabled: i === 0, run: () => moveSlide(i, i - 1) },
      { label: 'Mută mai jos', icon: 'down', disabled: i === deck.slides.length - 1, run: () => moveSlide(i, i + 1) },
      '-',
      { label: 'Fundal…', icon: 'wallpaper', run: () => backgroundMenu($('sl-tools')) },
      { label: 'Șterge diapozitivul', icon: 'del', disabled: deck.slides.length <= 1, run: () => delSlide(i) },
    ]);
  }

  function dupSlide(i) {
    const c = JSON.parse(JSON.stringify(deck.slides[i]));
    c.id = nid();
    c.els.forEach((e) => { e.id = nid(); });
    change(() => { deck.slides.splice(i + 1, 0, c); cur = i + 1; }, { all: true });
  }
  function moveSlide(from, to) {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    change(() => { const [s] = deck.slides.splice(from, 1); deck.slides.splice(to, 0, s); cur = to; }, { all: true });
  }
  function delSlide(i) {
    if (deck.slides.length <= 1) return;
    change(() => { deck.slides.splice(i, 1); cur = Math.max(0, Math.min(cur, deck.slides.length - 1)); selIds = []; }, { all: true });
  }

  // drag to reorder in the list
  function thumbDown(e, i) {
    if (e.button !== 0) return;
    const startY = e.clientY;
    let moved = false;
    const box = thumbsBox();
    const ind = el('div', { class: 'sl-drop' });
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - startY) < 6) return;
      moved = true;
      const items = [...box.querySelectorAll('.sl-th')];
      let to = items.length;
      for (const it of items) { const r = it.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { to = +it.dataset.i; break; } }
      ind.dataset.to = to;
      const ref = items[to];
      if (ref) box.insertBefore(ind, ref); else box.insertBefore(ind, box.querySelector('.sl-add'));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        let to = +ind.dataset.to;
        ind.remove();
        if (to > i) to--;
        moveSlide(i, to);
      } else goTo(i);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function applyTheme(id) {
    const T = THEMES.find((t) => t.id === id);
    if (!T) return;
    change(() => {
      const old = theme();
      deck.theme = id;
      for (const s of deck.slides) {
        s.bg = s.bg && s.bg.image ? s.bg : {};
        for (const e of s.els) {
          if (e.type === 'image') continue;
          e.st = { ...(e.st || {}) };
          if (e.type === 'text' && !e.st.fill) {
            e.st.color = e.role === 'title' ? T.title : T.text;
            if (!e.st.font || e.st.font === old.font) e.st.font = T.font;
          } else if (e.type === 'shape' && e.st.fill === old.accent) e.st.fill = T.accent;
          else if (e.type === 'table') { e.st.color = T.text; e.st.font = T.font; e.st.fill = T.accent + '33'; }
        }
      }
    }, { all: true });
  }

  function themeMenu(anchor) {
    const pop = el('div', { class: 'thpop' });
    for (const T of THEMES) {
      const b = el('button', { class: 'thc' + (deck.theme === T.id ? ' on' : ''), type: 'button' }, [
        el('div', { class: 'thp', style: { background: T.grad || T.bg } }, [el('b', { text: 'Aa', style: { color: T.title, fontFamily: T.font } }), el('i', { style: { background: T.accent } })]),
        el('span', { text: T.name }),
      ]);
      b.addEventListener('click', () => { close(); applyTheme(T.id); });
      pop.append(b);
    }
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(window.innerWidth - 420, r.left) + 'px';
    pop.style.top = r.bottom + 4 + 'px';
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    function close() { pop.remove(); document.removeEventListener('pointerdown', outside, true); }
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  function backgroundMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    UI.menu(r.left + 300, r.bottom + 4, [
      { label: 'Culoare de fundal…', icon: 'fill', run: () => Office.pickColor(anchor, { allowNone: true, noneLabel: 'Ca tema', onPick: (c) => change(() => { slide().bg = c ? { color: c } : {}; }, { all: false }) }) },
      { label: 'Imagine de fundal…', icon: 'wallpaper', run: async () => { const img = await Office.imageDataUrl(1920); if (img) change(() => { slide().bg = { image: addMedia(img.url) }; }); } },
      { label: 'Fundal ca tema', icon: 'palette', run: () => change(() => { slide().bg = {}; }) },
      '-',
      { label: 'Aplică fundalul la toate', icon: 'copy', run: () => change(() => { const b = JSON.stringify(slide().bg || {}); for (const s of deck.slides) s.bg = JSON.parse(b); }, { all: true }) },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 88, 96];

  function buildTools() {
    if (toolsBuilt) return;
    toolsBuilt = true;
    const T = Office.tbtn;
    const bar = $('sl-tools');
    tools.undo = T('undo', 'Anulează (Ctrl+Z)', () => undo());
    tools.redo = T('redo', 'Refă (Ctrl+Y)', () => redo());
    tools.newSlide = T('addpage', 'Diapozitiv nou', (b) => layoutMenu(b, cur + 1), { label: 'Diapozitiv' });
    tools.text = T('textbox', 'Casetă de text', () => addText(), { label: 'Text' });
    tools.image = T('image', 'Imagine', () => addImage(), { label: 'Imagine' });
    tools.shape = T('shape', 'Forme', (b) => {
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'Dreptunghi', icon: 'shape', run: () => addShape('rect') },
        { label: 'Dreptunghi rotunjit', icon: 'roundrect', run: () => addShape('roundRect') },
        { label: 'Cerc / elipsă', icon: 'ellipse', run: () => addShape('ellipse') },
        { label: 'Triunghi', icon: 'triangle', run: () => addShape('triangle') },
        { label: 'Săgeată', icon: 'arrow', run: () => addShape('rightArrow') },
        { label: 'Linie', icon: 'line', run: () => addShape('line') },
      ]);
    }, { label: 'Forme' });
    tools.table = T('table', 'Tabel', () => addTable(), { label: 'Tabel' });
    tools.font = Office.select(Office.FONTS, 'Calibri', (v) => fmt('font', v, 'fontName', v), 'font', 'Font');
    tools.size = Office.select(SIZES, 18, (v) => fmt('size', +v, 'fontSize'), 'size', 'Mărimea textului');
    tools.b = T('bold', 'Îngroșat (Ctrl+B)', () => fmt('bold', !(cur1() && cur1().st && cur1().st.bold), 'bold'));
    tools.i = T('italic', 'Cursiv (Ctrl+I)', () => fmt('italic', !(cur1() && cur1().st && cur1().st.italic), 'italic'));
    tools.u = T('underline', 'Subliniat (Ctrl+U)', () => fmt('underline', !(cur1() && cur1().st && cur1().st.underline), 'underline'));
    tools.color = Office.colorBtn('fontcolor', 'Culoarea textului', () => (cur1() && cur1().st && cur1().st.color) || theme().text, (c) => fmt('color', c || theme().text, 'foreColor', c || theme().text), false);
    tools.al = T('alignleft', 'Aliniază la stânga', () => fmt('align', 'left', 'justifyLeft'));
    tools.ac = T('aligncenter', 'Centrează', () => fmt('align', 'center', 'justifyCenter'));
    tools.ar = T('alignright', 'Aliniază la dreapta', () => fmt('align', 'right', 'justifyRight'));
    tools.bul = T('bullets', 'Buline', () => {
      if (editingId) { fmt(null, null, 'insertUnorderedList'); return; }
      fmt('bullets', (e) => { e.st.bullets = !e.st.bullets; if (!e.st.bullets && e.html) e.html = e.html.replace(/<\/?ul>/g, '').replace(/<li\b([^>]*)>/g, '<p$1>').replace(/<\/li>/g, '</p>'); });
    });
    tools.va = T('layout', 'Text sus / mijloc / jos', (b) => {
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [['top', 'Sus'], ['middle', 'La mijloc'], ['bottom', 'Jos']].map(([v, l]) => ({ label: 'Text ' + l.toLowerCase(), run: () => { if (editingId) endEdit(); fmt('valign', v); } })));
    });
    tools.fill = Office.colorBtn('fill', 'Culoare de umplere', () => (cur1() && cur1().st && cur1().st.fill) || '', (c) => { if (editingId) endEdit(); fmt('fill', c); }, true);
    tools.line = Office.colorBtn('borders', 'Culoarea conturului', () => (cur1() && cur1().st && cur1().st.line) || '', (c) => { if (editingId) endEdit(); fmt('line', (e) => { e.st.line = c; e.st.lineW = c ? e.st.lineW || 2 : 0; }); }, true);
    tools.arr = T('front', 'Aranjează', (b) => {
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'Adu în față', icon: 'front', run: () => order('front') },
        { label: 'Mai în față', icon: 'up', run: () => order('up') },
        { label: 'Mai în spate', icon: 'down', run: () => order('down') },
        { label: 'Trimite în spate', icon: 'tobackl', run: () => order('back') },
        '-',
        { label: 'Aliniază la stânga', icon: 'alignleft', run: () => align('left') },
        { label: 'Centrează pe orizontală', icon: 'aligncenter', run: () => align('center') },
        { label: 'Aliniază la dreapta', icon: 'alignright', run: () => align('right') },
        { label: 'Aliniază sus', icon: 'up', run: () => align('top') },
        { label: 'Centrează pe verticală', icon: 'layout', run: () => align('middle') },
        { label: 'Aliniază jos', icon: 'down', run: () => align('bottom') },
      ]);
    });
    tools.dup = T('copy', 'Duplică (Ctrl+D)', () => duplicateSel());
    tools.del = T('del', 'Șterge (Delete)', () => deleteSel());
    tools.bg = T('wallpaper', 'Fundal', (b) => backgroundMenu(b), { label: 'Fundal' });
    tools.theme = T('palette', 'Teme', (b) => themeMenu(b), { label: 'Temă' });
    for (const s of [tools.font, tools.size]) s.addEventListener('mousedown', () => { /* keep text selection */ });
    bar.append(tools.undo, tools.redo, Office.sep(), tools.newSlide, tools.text, tools.image, tools.shape, tools.table, Office.sep(),
      tools.font, tools.size, tools.b, tools.i, tools.u, tools.color, Office.sep(), tools.al, tools.ac, tools.ar, tools.bul, tools.va, Office.sep(),
      tools.fill, tools.line, tools.arr, tools.dup, tools.del, Office.sep(), tools.bg, tools.theme);
  }

  function refreshTools() {
    if (!toolsBuilt || !deck) return;
    tools.undo.disabled = !history.length;
    tools.redo.disabled = !future.length;
    const e = cur1();
    const textual = e && e.type !== 'image';
    for (const t of ['font', 'size', 'b', 'i', 'u', 'color', 'al', 'ac', 'ar', 'bul', 'va']) tools[t].disabled = !textual;
    for (const t of ['fill', 'line', 'arr', 'dup', 'del']) tools[t].disabled = !e;
    if (!e) return;
    const s = e.st || {};
    if (editingId) {
      const q = (c) => { try { return document.queryCommandState(c); } catch (x) { return false; } };
      tools.b.classList.toggle('on', q('bold'));
      tools.i.classList.toggle('on', q('italic'));
      tools.u.classList.toggle('on', q('underline'));
    } else {
      tools.b.classList.toggle('on', !!s.bold);
      tools.i.classList.toggle('on', !!s.italic);
      tools.u.classList.toggle('on', !!s.underline);
    }
    tools.al.classList.toggle('on', (s.align || 'left') === 'left');
    tools.ac.classList.toggle('on', s.align === 'center');
    tools.ar.classList.toggle('on', s.align === 'right');
    tools.bul.classList.toggle('on', !!s.bullets);
    if (s.font && ![...tools.font.options].some((o) => o.value === s.font)) tools.font.append(el('option', { value: s.font, text: s.font }));
    tools.font.value = s.font || 'Calibri';
    if (s.size && !SIZES.includes(s.size)) { let o = tools.size.querySelector('.custom'); if (!o) { o = el('option', { class: 'custom' }); tools.size.prepend(o); } o.value = String(s.size); o.textContent = String(s.size); }
    tools.size.value = String(s.size || 18);
    tools.color.repaint(); tools.fill.repaint(); tools.line.repaint();
  }

  // ---------------------------------------------------------------------------
  // Present (full screen)
  // ---------------------------------------------------------------------------

  let showIdx = 0;
  function present(from) {
    if (editingId) endEdit();
    showIdx = from === undefined ? cur : from;
    const ov = $('sl-present');
    ov.classList.remove('hidden');
    try { ov.requestFullscreen && ov.requestFullscreen(); } catch (e) {}
    drawShow();
  }

  function drawShow() {
    const ov = $('sl-present');
    const W = window.innerWidth, H = window.innerHeight;
    ov.innerHTML = '';
    if (showIdx >= deck.slides.length) {
      ov.append(el('div', { class: 'pend', text: 'Sfârșitul prezentării. Click sau Esc pentru ieșire.' }));
      return;
    }
    const sc = Math.min(W / deck.w, H / deck.h);
    const n = slideNode(deck.slides[showIdx], 'show');
    n.style.transform = `scale(${sc})`;
    n.style.transformOrigin = '0 0';
    const holder = el('div', { class: 'pslide', style: { width: deck.w * sc + 'px', height: deck.h * sc + 'px' } });
    holder.append(n);
    ov.append(holder, el('div', { class: 'pnum', text: `${showIdx + 1} / ${deck.slides.length}` }));
  }

  function endShow() {
    $('sl-present').classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    goTo(Math.min(showIdx, deck.slides.length - 1));
  }

  function showKey(e) {
    const k2 = e.key;
    if (k2 === 'Escape') { e.preventDefault(); endShow(); return; }
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n'].includes(k2)) { e.preventDefault(); if (showIdx >= deck.slides.length) { endShow(); return; } showIdx++; drawShow(); return; }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k2)) { e.preventDefault(); showIdx = Math.max(0, showIdx - 1); drawShow(); return; }
    if (k2 === 'Home') { showIdx = 0; drawShow(); }
    if (k2 === 'End') { showIdx = deck.slides.length - 1; drawShow(); }
  }

  // ---------------------------------------------------------------------------
  // PPTX: read
  // ---------------------------------------------------------------------------

  async function readPptx(bytes) {
    await Lib.load('jszip');
    const JSZip = Lib.get('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const dp = new DOMParser();
    const txt = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
    const xml = async (p) => { const t = await txt(p); return t ? dp.parseFromString(t, 'application/xml') : null; };
    const EMU = 9525;
    const kids = (n, tag) => (n ? [...n.children].filter((c) => c.localName === tag) : []);
    const kid = (n, tag) => kids(n, tag)[0] || null;
    const deep = (n, tag) => (n ? n.getElementsByTagNameNS('*', tag) : []);
    const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
    const resolve = (base, target) => {
      if (target.startsWith('/')) return target.slice(1);
      const parts = (dirOf(base) + target).split('/');
      const out = [];
      for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
      return out.join('/');
    };
    const relsOf = async (part) => {
      const r = await xml(dirOf(part) + '_rels/' + part.slice(part.lastIndexOf('/') + 1) + '.rels');
      const map = {};
      if (r) for (const e of r.getElementsByTagName('Relationship')) map[e.getAttribute('Id')] = { target: resolve(part, e.getAttribute('Target')), type: e.getAttribute('Type') || '', external: e.getAttribute('TargetMode') === 'External' };
      return map;
    };

    const pres = await xml('ppt/presentation.xml');
    if (!pres) throw new Error('Fișierul nu pare o prezentare PowerPoint.');
    const presRels = await relsOf('ppt/presentation.xml');
    const sz = deep(pres, 'sldSz')[0];
    const W = sz ? Math.round(+sz.getAttribute('cx') / EMU) : 1280, H = sz ? Math.round(+sz.getAttribute('cy') / EMU) : 720;
    const d = { w: W, h: H, theme: 'alb', slides: [], media: {} };
    const ids = [...deep(pres, 'sldId')].map((e) => e.getAttribute('r:id') || e.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));

    const cache = new Map();
    async function part(p) {
      if (!cache.has(p)) cache.set(p, (async () => ({ doc: await xml(p), rels: await relsOf(p), path: p }))());
      return cache.get(p);
    }

    // theme colors and fonts of a master
    async function themeOf(master) {
      const rel = Object.values(master.rels).find((r) => /\/theme$/.test(r.type));
      const t = rel ? await xml(rel.target) : null;
      const colors = {}, fonts = { major: 'Calibri Light', minor: 'Calibri' };
      if (t) {
        const scheme = deep(t, 'clrScheme')[0];
        if (scheme) for (const c of scheme.children) {
          const v = c.children[0];
          if (v) colors[c.localName] = '#' + (v.localName === 'sysClr' ? v.getAttribute('lastClr') || '000000' : v.getAttribute('val'));
        }
        const mj = deep(t, 'majorFont')[0], mn = deep(t, 'minorFont')[0];
        if (mj && kid(mj, 'latin')) fonts.major = kid(mj, 'latin').getAttribute('typeface');
        if (mn && kid(mn, 'latin')) fonts.minor = kid(mn, 'latin').getAttribute('typeface');
      }
      const map = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
      const cm = master.doc && deep(master.doc, 'clrMap')[0];
      if (cm) for (const a of cm.attributes) map[a.name] = a.value;
      return { colors, fonts, map };
    }

    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, s = 0; const l = (mx + mn) / 2;
      if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
      return [h, s, l];
    }
    function hslToRgb(h, s, l) {
      if (s === 0) return [l * 255, l * 255, l * 255];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }
    function colorOf(node, th) {
      if (!node) return null;
      const c = node.localName === 'srgbClr' || node.localName === 'schemeClr' || node.localName === 'sysClr' || node.localName === 'prstClr' ? node : node.children[0];
      if (!c) return null;
      let hexv = null;
      if (c.localName === 'srgbClr') hexv = '#' + c.getAttribute('val');
      else if (c.localName === 'sysClr') hexv = '#' + (c.getAttribute('lastClr') || '000000');
      else if (c.localName === 'prstClr') hexv = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000' }[c.getAttribute('val')] || '#000000';
      else if (c.localName === 'schemeClr') {
        let v = c.getAttribute('val');
        if (v === 'phClr') v = 'accent1';
        v = th.map[v] || v;
        hexv = th.colors[v] || null;
      }
      if (!hexv) return null;
      let r = parseInt(hexv.slice(1, 3), 16), g = parseInt(hexv.slice(3, 5), 16), b = parseInt(hexv.slice(5, 7), 16);
      let lm = 1, lo = 0;
      for (const m of c.children) {
        const val = +m.getAttribute('val') / 100000;
        if (m.localName === 'lumMod') lm = val;
        if (m.localName === 'lumOff') lo = val;
        if (m.localName === 'tint') { r = r + (255 - r) * (1 - val); g = g + (255 - g) * (1 - val); b = b + (255 - b) * (1 - val); }
        if (m.localName === 'shade') { r *= val; g *= val; b *= val; }
      }
      if (lm !== 1 || lo !== 0) { const [h, s, l] = rgbToHsl(r, g, b); [r, g, b] = hslToRgb(h, s, Math.max(0, Math.min(1, l * lm + lo))); }
      return '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
    }

    function fillOf(spPr, th) {
      if (!spPr) return undefined;
      if (kid(spPr, 'noFill')) return null;
      const sf = kid(spPr, 'solidFill');
      if (sf) return colorOf(sf, th);
      const gf = kid(spPr, 'gradFill');
      if (gf) { const gs = deep(gf, 'gs')[0]; return gs ? colorOf(gs, th) : undefined; }
      return undefined;
    }

    async function mediaOf(rels, rid) {
      const r = rels[rid];
      if (!r || r.external) return null;
      const f = zip.file(r.target);
      if (!f) return null;
      const ext = r.target.split('.').pop().toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
      if (!mime) return null; // emf/wmf/tiff cannot be shown
      const b64 = await f.async('base64');
      const url = `data:${mime};base64,${b64}`;
      for (const [id, u] of Object.entries(d.media)) if (u === url) return id;
      const id = 'm' + Object.keys(d.media).length;
      d.media[id] = url;
      return id;
    }

    function xfrmOf(node) {
      const x = node && (kid(node, 'xfrm') || deep(node, 'xfrm')[0]);
      if (!x) return null;
      const off = kid(x, 'off'), ext = kid(x, 'ext');
      if (!off || !ext) return null;
      const o = { x: +off.getAttribute('x') / EMU, y: +off.getAttribute('y') / EMU, w: +ext.getAttribute('cx') / EMU, h: +ext.getAttribute('cy') / EMU, rot: x.getAttribute('rot') ? +x.getAttribute('rot') / 60000 : 0, flipV: x.getAttribute('flipV') === '1' };
      const ch = kid(x, 'chOff'), che = kid(x, 'chExt');
      if (ch && che) { o.chX = +ch.getAttribute('x') / EMU; o.chY = +ch.getAttribute('y') / EMU; o.chW = +che.getAttribute('cx') / EMU; o.chH = +che.getAttribute('cy') / EMU; }
      return o;
    }

    function phOf(sp) {
      const nv = kid(sp, 'nvSpPr') || kid(sp, 'nvPicPr') || kid(sp, 'nvGraphicFramePr');
      const ph = nv && deep(nv, 'ph')[0];
      if (!ph) return null;
      return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') };
    }

    function findPh(doc, ph) {
      if (!doc || !ph) return null;
      const sps = [...deep(doc, 'sp')];
      const norm = (t) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t);
      return sps.find((s) => { const p = phOf(s); return p && ph.idx && p.idx === ph.idx; })
        || sps.find((s) => { const p = phOf(s); return p && p.type === ph.type; })
        || sps.find((s) => { const p = phOf(s); return p && norm(p.type) === norm(ph.type); }) || null;
    }

    function defaultSize(lvlNode) {
      const def = lvlNode && kid(lvlNode, 'defRPr');
      return def && def.getAttribute('sz') ? +def.getAttribute('sz') / 100 : null;
    }

    function styleLevel(listStyle, lvl) {
      return listStyle ? kid(listStyle, `lvl${lvl + 1}pPr`) : null;
    }

    function textOf(txBody, ctx2) {
      // ctx2: { th, sizes:[...], color, font, bulletsDefault, scale }
      if (!txBody) return { html: '', valign: null };
      const bp = kid(txBody, 'bodyPr');
      const anchor = bp && bp.getAttribute('anchor');
      const valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : anchor === 't' ? 'top' : null;
      const fit = bp && kid(bp, 'normAutofit');
      const scale = fit && fit.getAttribute('fontScale') ? +fit.getAttribute('fontScale') / 100000 : 1;
      const own = kid(txBody, 'lstStyle');
      let html = '';
      let inList = false;
      const paras = kids(txBody, 'p');
      let first = { size: null, align: null, bold: false, color: null, font: null };
      paras.forEach((p, pi) => {
        const pPr = kid(p, 'pPr');
        const lvl = pPr && pPr.getAttribute('lvl') ? +pPr.getAttribute('lvl') : 0;
        const algn = pPr && pPr.getAttribute('algn');
        const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : null;
        const ownLvl = styleLevel(own, lvl);
        const baseSize = defaultSize(ownLvl) || (ctx2.sizes && ctx2.sizes[lvl]) || ctx2.size || 18;
        const bullet = pPr && kid(pPr, 'buNone') ? false : pPr && (kid(pPr, 'buChar') || kid(pPr, 'buAutoNum')) ? true : ctx2.bulletsDefault;
        let inner = '';
        for (const r of p.children) {
          if (r.localName === 'br') { inner += '<br>'; continue; }
          if (r.localName !== 'r' && r.localName !== 'fld') continue;
          const t = kid(r, 't');
          const text = t ? t.textContent : '';
          if (!text) continue;
          const rPr = kid(r, 'rPr');
          const css = [];
          let size = baseSize;
          if (rPr && rPr.getAttribute('sz')) size = +rPr.getAttribute('sz') / 100;
          size = Math.round(size * scale * 10) / 10;
          css.push(`font-size:${size}pt`);
          if (rPr && rPr.getAttribute('b') === '1') css.push('font-weight:700');
          if (rPr && rPr.getAttribute('b') === '0') css.push('font-weight:400');
          if (rPr && rPr.getAttribute('i') === '1') css.push('font-style:italic');
          if (rPr && rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') css.push('text-decoration:underline');
          const col = rPr && colorOf(kid(rPr, 'solidFill'), ctx2.th);
          if (col) css.push('color:' + col);
          const latin = rPr && kid(rPr, 'latin');
          let face = latin && latin.getAttribute('typeface');
          if (face === '+mj-lt') face = ctx2.th.fonts.major;
          if (face === '+mn-lt') face = ctx2.th.fonts.minor;
          if (face) css.push(`font-family:"${face}"`);
          if (pi === 0 && !first.size) first = { size, align, bold: rPr && rPr.getAttribute('b') === '1', color: col, font: face };
          const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
          inner += `<span style="${css.join(';')}">${esc}</span>`;
        }
        if (!inner) inner = '<br>';
        const pstyle = align ? ` style="text-align:${align}"` : '';
        if (bullet && inner !== '<br>') {
          if (!inList) { html += '<ul>'; inList = true; }
          html += `<li${pstyle}${lvl ? ` data-l="${lvl}" class="lvl${lvl}"` : ''}>${inner}</li>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<p${pstyle}>${inner}</p>`;
        }
      });
      if (inList) html += '</ul>';
      if (html.replace(/<[^>]+>/g, '').trim() === '') html = '';
      return { html, valign, first };
    }

    const PRESET = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rightArrow: 'rightArrow', line: 'line', straightConnector1: 'line', snip1Rect: 'rect', flowChartProcess: 'rect', round2SameRect: 'roundRect', rtTriangle: 'triangle' };

    async function shapesOf(tree, rels, th, layoutPart, masterPart, opts) {
      const out = [];
      const walk = async (node, tx) => {
        for (const n of node.children) {
          const name = n.localName;
          if (name === 'grpSp') {
            const g = xfrmOf(kid(n, 'grpSpPr'));
            let t2 = tx;
            if (g && g.chW) {
              const sx = g.chW ? g.w / g.chW : 1, sy = g.chH ? g.h / g.chH : 1;
              t2 = (r) => tx({ x: g.x + (r.x - g.chX) * sx, y: g.y + (r.y - g.chY) * sy, w: r.w * sx, h: r.h * sy, rot: r.rot });
            }
            await walk(n, t2);
            continue;
          }
          if (name === 'sp' || name === 'cxnSp') {
            const ph = phOf(n);
            if (opts.skipPh && ph) continue;
            const spPr = kid(n, 'spPr');
            let xf = xfrmOf(spPr);
            let phNodeL = null, phNodeM = null;
            if (ph) { phNodeL = findPh(layoutPart && layoutPart.doc, ph); phNodeM = findPh(masterPart && masterPart.doc, ph); }
            if (!xf) xf = (phNodeL && xfrmOf(kid(phNodeL, 'spPr'))) || (phNodeM && xfrmOf(kid(phNodeM, 'spPr')));
            if (!xf) continue;
            const r = tx(xf);
            const geom = spPr && kid(spPr, 'prstGeom');
            const prst = geom ? geom.getAttribute('prst') : name === 'cxnSp' ? 'line' : 'rect';
            const styleN = kid(n, 'style');
            let fill = fillOf(spPr, th);
            if (fill === undefined && styleN) { const fr = kid(styleN, 'fillRef'); if (fr && +fr.getAttribute('idx') > 0) fill = colorOf(fr, th); }
            if (fill === undefined && ph) fill = (phNodeL && fillOf(kid(phNodeL, 'spPr'), th)) || null;
            const ln = spPr && kid(spPr, 'ln');
            let line = null, lineW = 0;
            if (ln && !kid(ln, 'noFill')) { line = colorOf(kid(ln, 'solidFill'), th); lineW = ln.getAttribute('w') ? Math.max(1, +ln.getAttribute('w') / EMU) : 1; }
            if (!line && styleN && (!ln || !kid(ln, 'noFill'))) { const lr = kid(styleN, 'lnRef'); if (lr && +lr.getAttribute('idx') > 0) { line = colorOf(lr, th); lineW = lineW || 1.5; } }
            const isTitle = ph && (ph.type === 'title' || ph.type === 'ctrTitle');
            const isBody = ph && (ph.type === 'body' || ph.type === 'obj' || ph.type === 'subTitle' || !ph.type);
            const master = masterPart && masterPart.doc;
            const txStyles = master && deep(master, 'txStyles')[0];
            const styleList = txStyles && (isTitle ? kid(txStyles, 'titleStyle') : isBody && ph.type !== 'subTitle' ? kid(txStyles, 'bodyStyle') : kid(txStyles, 'otherStyle'));
            const sizes = [];
            for (let l = 0; l < 9; l++) {
              const s1 = defaultSize(styleLevel(phNodeL && kid(kid(phNodeL, 'txBody') || phNodeL, 'lstStyle'), l)) || defaultSize(styleLevel(phNodeM && kid(kid(phNodeM, 'txBody') || phNodeM, 'lstStyle'), l)) || defaultSize(styleLevel(styleList, l));
              sizes.push(s1 || (isTitle ? 44 : 18));
            }
            const subTitle = ph && ph.type === 'subTitle';
            const { html, valign, first } = textOf(kid(n, 'txBody'), { th, sizes, bulletsDefault: isBody && !subTitle && ph.type !== 'ctrTitle', size: sizes[0] });
            const fontColor = (first && first.color) || (styleN && colorOf(kid(styleN, 'fontRef'), th)) || (isTitle ? th.colors[th.map.tx1] || th.colors.dk1 : th.colors[th.map.tx1] || th.colors.dk1) || '#000000';
            const textAlign = (first && first.align) || (ph && (ph.type === 'ctrTitle' || subTitle) ? 'center' : 'left');
            const isTextbox = !geom || n.querySelector('cNvSpPr') && n.getElementsByTagNameNS('*', 'cNvSpPr')[0].getAttribute('txBox') === '1';
            const asShape = prst !== 'rect' || fill || line;
            const e = {
              id: nid(), type: asShape && !(isTextbox && !fill && !line) ? 'shape' : 'text',
              x: Math.round(r.x), y: Math.round(r.y), w: Math.max(4, Math.round(r.w)), h: Math.max(prst === 'line' ? 2 : 4, Math.round(r.h)), rot: r.rot || 0,
              html, role: isTitle ? 'title' : isBody ? 'body' : null,
              st: {
                shape: PRESET[prst] || 'rect', fill: fill || null, line, lineW, flip: xf.flipV,
                size: (first && first.size) || sizes[0], color: fontColor, align: textAlign,
                valign: valign || (isTitle ? 'middle' : asShape ? 'middle' : 'top'),
                font: (first && first.font) || (isTitle ? th.fonts.major : th.fonts.minor),
              },
            };
            if (e.type === 'text' && !e.html && !ph) continue;
            if (e.type === 'text' && !e.html && ph) continue; // empty placeholders are not shown on slides
            out.push(e);
            continue;
          }
          if (name === 'pic') {
            const blip = deep(n, 'blip')[0];
            const rid = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
            const xf = xfrmOf(kid(n, 'spPr'));
            if (!xf || !rid) continue;
            const r = tx(xf);
            const m = await mediaOf(rels, rid);
            if (!m) { out.push({ id: nid(), type: 'shape', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), html: '<p>Imagine (format nesuportat)</p>', st: { shape: 'rect', fill: '#e8e8e8', size: 12, color: '#777777', align: 'center', valign: 'middle' } }); continue; }
            out.push({ id: nid(), type: 'image', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), rot: r.rot || 0, src: m, st: {} });
            continue;
          }
          if (name === 'graphicFrame') {
            const tbl = deep(n, 'tbl')[0];
            const xf = xfrmOf(n);
            if (!tbl || !xf) continue;
            const r = tx(xf);
            const rows = [...deep(tbl, 'tr')].map((tr) => [...kids(tr, 'tc')].map((tc) => textOf(kid(tc, 'txBody'), { th, sizes: [14], size: 14 }).html.replace(/<\/?(ul|li)[^>]*>/g, '')));
            out.push({ id: nid(), type: 'table', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), rows, st: { size: 14, color: th.colors.dk1 || '#000000', font: th.fonts.minor } });
          }
        }
      };
      if (tree) await walk(tree, (r) => r);
      return out;
    }

    async function bgOf(partObj, th) {
      const bg = partObj && partObj.doc && deep(partObj.doc, 'bg')[0];
      if (!bg) return null;
      const pr = kid(bg, 'bgPr');
      if (pr) {
        const sf = kid(pr, 'solidFill');
        if (sf) return { color: colorOf(sf, th) };
        const gf = kid(pr, 'gradFill');
        if (gf) {
          const stops = [...deep(gf, 'gs')].map((g) => `${colorOf(g, th)} ${+g.getAttribute('pos') / 1000}%`);
          const lin = kid(gf, 'lin');
          const ang = lin ? +lin.getAttribute('ang') / 60000 + 90 : 180;
          if (stops.length) return { grad: `linear-gradient(${ang}deg, ${stops.join(', ')})`, color: colorOf(deep(gf, 'gs')[0], th) };
        }
        const bf = kid(pr, 'blipFill');
        if (bf) {
          const blip = deep(bf, 'blip')[0];
          const rid = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
          const m = rid && (await mediaOf(partObj.rels, rid));
          if (m) return { image: m };
        }
      }
      const ref = kid(bg, 'bgRef');
      if (ref) return { color: colorOf(ref, th) };
      return null;
    }

    for (const rid of ids) {
      const rel = presRels[rid];
      if (!rel) continue;
      const sp = await part(rel.target);
      if (!sp.doc) continue;
      if (sp.doc.documentElement.getAttribute('show') === '0') { /* hidden slide: still keep it */ }
      const layoutRel = Object.values(sp.rels).find((r) => /\/slideLayout$/.test(r.type));
      const lp = layoutRel ? await part(layoutRel.target) : null;
      const masterRel = lp && Object.values(lp.rels).find((r) => /\/slideMaster$/.test(r.type));
      const mp = masterRel ? await part(masterRel.target) : null;
      const th = mp ? await themeOf(mp) : { colors: {}, fonts: { major: 'Calibri', minor: 'Calibri' }, map: {} };
      const bg = (await bgOf(sp, th)) || (await bgOf(lp, th)) || (await bgOf(mp, th)) || { color: '#ffffff' };
      const els = [];
      const showMaster = sp.doc.documentElement.getAttribute('showMasterSp') !== '0';
      if (showMaster && mp && lp && lp.doc.documentElement.getAttribute('showMasterSp') !== '0') els.push(...(await shapesOf(deep(mp.doc, 'spTree')[0], mp.rels, th, null, mp, { skipPh: true })));
      if (showMaster && lp) els.push(...(await shapesOf(deep(lp.doc, 'spTree')[0], lp.rels, th, null, mp, { skipPh: true })));
      els.push(...(await shapesOf(deep(sp.doc, 'spTree')[0], sp.rels, th, lp, mp, { skipPh: false })));
      d.slides.push({ id: nid(), bg, els });
    }
    if (!d.slides.length) d.slides.push({ id: nid(), bg: {}, els: [] });
    return d;
  }

  // ---------------------------------------------------------------------------
  // PPTX: write
  // ---------------------------------------------------------------------------

  const hex6 = (c) => {
    if (!c) return null;
    if (/^#?[0-9a-f]{6}$/i.test(c)) return c.replace('#', '').toUpperCase();
    if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(1, 7).toUpperCase();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m ? [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
  };
  const alphaOf = (c) => (/^#[0-9a-f]{8}$/i.test(c || '') ? Math.round((1 - parseInt(c.slice(7, 9), 16) / 255) * 100) : 0);

  function gradientPng(css) {
    const c = el('canvas', { width: 1280, height: 720 });
    const g = c.getContext('2d');
    const m = /linear-gradient\(([\d.]+)deg,(.*)\)$/.exec(css.replace(/\s+/g, ' ').replace(/, /g, ','));
    const ang = m ? +m[1] : 135;
    const rad = ((ang - 90) * Math.PI) / 180;
    const cx = 640, cy = 360, len = Math.abs(1280 * Math.cos(rad)) / 2 + Math.abs(720 * Math.sin(rad)) / 2;
    const grad = g.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
    const stops = (m ? m[2] : '').split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
    stops.forEach((s, i) => { const mm = /^(\S+)\s*([\d.]+)?%?$/.exec(s); if (mm) grad.addColorStop(mm[2] !== undefined ? +mm[2] / 100 : i / Math.max(1, stops.length - 1), mm[1]); });
    g.fillStyle = grad;
    g.fillRect(0, 0, 1280, 720);
    return c.toDataURL('image/png');
  }

  /** Text runs for pptxgenjs from what the browser really shows. */
  function runsOf(node, e) {
    const out = [];
    const blocks = [];
    const collect = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1 && /^(P|DIV|LI|H[1-6])$/.test(c.tagName)) blocks.push(c);
        else if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) collect(c);
        else if (c.nodeType === 3 && c.nodeValue.trim() || c.nodeType === 1) { if (!blocks.includes(n)) blocks.push(n); }
      }
    };
    collect(node);
    const seen = new Set();
    const list = blocks.filter((b) => { if (seen.has(b)) return false; seen.add(b); return true; });
    list.forEach((b, bi) => {
      const pcs = getComputedStyle(b);
      const para = { align: ({ center: 'center', right: 'right', end: 'right', justify: 'justify' })[pcs.textAlign] || 'left' };
      if (b.tagName === 'LI') para.bullet = b.closest('ol') ? { type: 'number' } : true;
      if (b.dataset && b.dataset.l) para.indentLevel = +b.dataset.l;
      const runs = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            if (!c.nodeValue) continue;
            const cs = getComputedStyle(c.parentElement);
            const o = {
              fontFace: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
              fontSize: Math.round(parseFloat(cs.fontSize) * 0.75 * 10) / 10,
              color: hex6(cs.color) || '000000',
            };
            if (parseInt(cs.fontWeight, 10) >= 600) o.bold = true;
            if (cs.fontStyle === 'italic') o.italic = true;
            if ((cs.textDecorationLine || '').includes('underline')) o.underline = { style: 'sng' };
            if ((cs.textDecorationLine || '').includes('line-through')) o.strike = 'sngStrike';
            runs.push({ text: c.nodeValue, options: o });
          } else if (c.nodeType === 1) {
            if (c.tagName === 'BR') { runs.push({ text: '', options: { breakLine: true } }); continue; }
            if (/^(UL|OL|LI|P|DIV)$/.test(c.tagName) && c !== b) continue;
            walk(c);
          }
        }
      };
      walk(b);
      if (!runs.length) runs.push({ text: '', options: {} });
      Object.assign(runs[0].options, para);
      if (bi < list.length - 1) runs[runs.length - 1].options.breakLine = true;
      out.push(...runs);
    });
    return out;
  }

  async function pptxBytes() {
    if (editingId) endEdit();
    const P = Lib.get('pptxgenjs');
    const pres = new P();
    const inch = (px) => px / 96;
    pres.defineLayout({ name: 'APP', width: inch(deck.w), height: inch(deck.h) });
    pres.layout = 'APP';
    pres.author = 'PDF Editor';
    // render every slide once (hidden) to read real text styles
    const host = el('div', { style: { position: 'fixed', left: '-99999px', top: '0', width: deck.w + 'px' } });
    document.body.append(host);
    const SHAPES = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rightArrow: 'rightArrow', line: 'line' };
    try {
      for (const s of deck.slides) {
        const out = pres.addSlide();
        const b = s.bg || {};
        const T = theme();
        if (b.image) out.background = { data: (deck.media[b.image] || b.image).replace(/^data:/, '') };
        else if (b.grad || (!b.color && T.grad)) out.background = { data: gradientPng(b.grad || T.grad).replace(/^data:/, '') };
        else out.background = { color: hex6(b.color || T.bg) || 'FFFFFF' };
        host.innerHTML = '';
        const node = slideNode(s, 'show');
        host.append(node);
        for (const e of s.els) {
          const pos = { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h) };
          if (e.rot) pos.rotate = e.rot;
          const st2 = e.st || {};
          if (e.type === 'image') {
            const url = deck.media[e.src] || e.src;
            if (url) out.addImage({ data: url.replace(/^data:/, ''), ...pos });
            continue;
          }
          if (e.type === 'table') {
            const tn = node.querySelector(`.se[data-id="${e.id}"] table`);
            const rows = (e.rows || []).map((row, ri) => row.map((cellHtml, ci) => {
              const td = tn && tn.rows[ri] && tn.rows[ri].cells[ci];
              const cs = td ? getComputedStyle(td) : null;
              return { text: td ? td.innerText : cellHtml.replace(/<[^>]+>/g, ''), options: { fontFace: st2.font || 'Calibri', fontSize: st2.size || 14, color: hex6(st2.color) || '000000', bold: ri === 0 || (cs && parseInt(cs.fontWeight, 10) >= 600), fill: ri === 0 && st2.fill ? { color: hex6(st2.fill), transparency: alphaOf(st2.fill) } : undefined, valign: 'middle' } };
            }));
            if (rows.length) out.addTable(rows, { ...pos, border: { type: 'solid', pt: 1, color: '999999' }, colW: Array(rows[0].length).fill(inch(e.w) / rows[0].length) });
            continue;
          }
          const sh = e.type === 'shape' ? SHAPES[st2.shape] || 'rect' : 'rect';
          const opts = { ...pos, valign: ({ top: 'top', middle: 'middle', bottom: 'bottom' })[st2.valign || (e.type === 'shape' ? 'middle' : 'top')], margin: [7 * 0.75, 12 * 0.75, 7 * 0.75, 12 * 0.75] };
          if (st2.fill) opts.fill = { color: hex6(st2.fill), transparency: alphaOf(st2.fill) };
          if (st2.line) opts.line = { color: hex6(st2.line), width: (st2.lineW || 1) * 0.75 };
          if (sh === 'line') { opts.line = { color: hex6(st2.line) || '333333', width: (st2.lineW || 3) * 0.75 }; if (st2.flip) opts.flipV = true; out.addShape('line', opts); continue; }
          const inner = node.querySelector(`.se[data-id="${e.id}"] .txi`);
          if (e.html && inner) {
            if (e.type === 'shape') opts.shape = sh;
            out.addText(runsOf(inner, e), opts);
          } else if (e.type === 'shape') out.addShape(sh, opts);
        }
      }
    } finally {
      host.remove();
    }
    const buf = await pres.write({ outputType: 'nodebuffer' });
    return new Uint8Array(buf);
  }

  function pdfHtml() {
    if (editingId) endEdit();
    const host = el('div');
    for (const s of deck.slides) {
      const n = slideNode(s, 'show');
      n.style.pageBreakAfter = 'always';
      n.style.breakAfter = 'page';
      host.append(n);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${deck.w / 96}in ${deck.h / 96}in; margin: 0; }
html, body { margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${CSS}
.sl:last-child { page-break-after: auto !important; break-after: auto !important; }
</style></head><body>${host.innerHTML}</body></html>`;
  }

  // ---------------------------------------------------------------------------
  // Open / save
  // ---------------------------------------------------------------------------

  async function open(path, bytes) {
    try { await Lib.load('jszip', 'pptxgenjs'); } catch (e) { UI.errorDetails('Nu am putut porni editorul', e); return; }
    show();
    UI.busy('Se deschide prezentarea…');
    try {
      if (path) deck = await readPptx(bytes);
      else { deck = newDeck(); deck.slides.push(newSlide('title')); }
    } catch (e) {
      UI.busy(null);
      UI.errorDetails('Nu am putut deschide prezentarea', e);
      App.showHome();
      return;
    }
    st = { source: path ? Office.sourceFor(path) : null, copyPath: null, dirty: false, name: path ? Host.baseName(path) : 'Prezentare nouă.pptx' };
    cur = 0; selIds = []; editingId = null; history = []; future = [];
    buildTools();
    $('sl-name').textContent = st.name;
    $('sl-dirty').classList.add('hidden');
    Host.setTitle(st.name + ' — Prezentare');
    UI.busy(null);
    requestAnimationFrame(() => renderAll());
  }

  function show() {
    for (const id of ['home', 'editor', 'invoice', 'writer', 'slides', 'sheet']) { const n = $(id); if (n) n.classList.toggle('hidden', id !== 'slides'); }
  }

  async function save() {
    if (!deck) return false;
    if (editingId) endEdit();
    const t = deck.slides[0] && deck.slides[0].els.find((e) => e.role === 'title' && e.html);
    const base = (t && Office.clean(t.html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 50))) || 'Prezentare nouă';
    const p = await Office.target(st, 'pptx', base, 'Salvează prezentarea');
    return p ? writeTo(p) : false;
  }
  async function saveAs() {
    if (editingId) endEdit();
    const p = await Office.saveAsDialog(st, 'pptx', 'Prezentare nouă');
    return p ? writeTo(p) : false;
  }
  async function writeTo(p) {
    let bytes;
    UI.busy('Se pregătește prezentarea…');
    try { bytes = await pptxBytes(); } catch (e) { UI.busy(null); UI.errorDetails('Nu am putut pregăti prezentarea', e); return false; }
    UI.busy(null);
    const prevSel = selIds; selIds = []; drawSelection();
    const ok = await Office.writeFile(st, p, bytes, $('sl-wrap'));
    selIds = prevSel; drawSelection();
    if (ok) {
      st.dirty = false; st.name = Host.baseName(p);
      $('sl-name').textContent = st.name;
      $('sl-dirty').classList.add('hidden');
      Host.setTitle(st.name + ' — Prezentare');
    }
    return ok;
  }

  function exportPdf() {
    Office.exportPdf(st, pdfHtml(), 'Prezentare nouă', { margins: 0 });
  }

  async function back() {
    if (editingId) endEdit();
    if (!(await Office.ensureSaved(api))) return;
    deck = null;
    $('sl-wrap').innerHTML = '';
    $('sl-list').innerHTML = '';
    App.showHome();
  }

  function more() {
    const r = $('sl-more').getBoundingClientRect();
    UI.menu(r.right - 260, r.bottom + 6, [
      { label: 'Salvează ca…', icon: 'save', run: () => saveAs() },
      { label: 'Exportă ca PDF', icon: 'pdf', run: () => exportPdf() },
      '-',
      { label: 'Format lat (16:9)', icon: 'layout', run: () => setSize(1280, 720) },
      { label: 'Format standard (4:3)', icon: 'layout', run: () => setSize(960, 720) },
    ]);
  }

  function setSize(w, h) {
    if (deck.w === w && deck.h === h) return;
    change(() => {
      const sx = w / deck.w, sy = h / deck.h;
      for (const s of deck.slides) for (const e of s.els) { e.x = Math.round(e.x * sx); e.w = Math.round(e.w * sx); e.y = Math.round(e.y * sy); e.h = Math.round(e.h * sy); }
      deck.w = w; deck.h = h;
    }, { all: true });
  }

  // ---------------------------------------------------------------------------
  // Keyboard & init
  // ---------------------------------------------------------------------------

  function onKey(e) {
    if (!$('sl-present').classList.contains('hidden')) { showKey(e); return; }
    if ($('slides').classList.contains('hidden') || document.querySelector('#modal-root .backdrop')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && key === 's') { e.preventDefault(); if (editingId) endEdit(); e.shiftKey ? saveAs() : save(); return; }
    if (e.key === 'F5') { e.preventDefault(); present(e.shiftKey ? cur : 0); return; }
    if (editingId) {
      if (e.key === 'Escape') { e.preventDefault(); endEdit(); drawSelection(); }
      if (ctrl && ['b', 'i', 'u'].includes(key)) { e.preventDefault(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[key]); const it = findEl(editingId); const inner = $('sl-live').querySelector(`.se[data-id="${editingId}"] .txi`); if (it && inner) { it.html = cleanHtml(inner.innerHTML); markDirty(); } refreshTools(); }
      return;
    }
    const t = e.target;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && key === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl && key === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (ctrl && key === 'a') { e.preventDefault(); selIds = slide().els.map((x) => x.id); drawSelection(); refreshTools(); return; }
    if (ctrl && key === 'c') { if (selIds.length) { e.preventDefault(); clipEls = JSON.stringify(selected()); try { Lib.clipboard.writeText(selected().map((x) => (x.html || '').replace(/<[^>]+>/g, ' ')).join('\n')); } catch (x) {} } return; }
    if (ctrl && key === 'x') { if (selIds.length) { e.preventDefault(); clipEls = JSON.stringify(selected()); deleteSel(); } return; }
    if (ctrl && key === 'v') { e.preventDefault(); pasteEls(); return; }
    if (ctrl && key === 'm') { e.preventDefault(); addSlide('content', cur + 1); return; }
    if (ctrl && ['b', 'i', 'u'].includes(key) && selIds.length) { e.preventDefault(); ({ b: tools.b, i: tools.i, u: tools.u })[key].click(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      if (selIds.length) deleteSel();
      else if (document.activeElement === $('sl-list') || e.target.closest && e.target.closest('#sl-list')) delSlide(cur);
      return;
    }
    if (e.key === 'Escape') { selIds = []; drawSelection(); refreshTools(); return; }
    if (e.key === 'Enter' && selIds.length === 1) { e.preventDefault(); beginEdit(selIds[0]); return; }
    if (e.key === 'PageDown' || (!selIds.length && (e.key === 'ArrowDown' || e.key === 'ArrowRight'))) { e.preventDefault(); goTo(cur + 1); return; }
    if (e.key === 'PageUp' || (!selIds.length && (e.key === 'ArrowUp' || e.key === 'ArrowLeft'))) { e.preventDefault(); goTo(cur - 1); return; }
    if (e.key.startsWith('Arrow') && selIds.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      change(() => { for (const it of selected()) { it.x += dx; it.y += dy; } });
      return;
    }
    // typing on a selected text box starts editing it
    if (e.key.length === 1 && !ctrl && !e.altKey && selIds.length === 1) {
      const it = findEl(selIds[0]);
      if (it && (it.type === 'text' || it.type === 'shape')) beginEdit(it.id);
    }
  }

  function pasteEls() {
    // a picture copied from somewhere else
    try {
      const img = window.ElectronHost && window.ElectronHost.clipboard.readImage();
      if (img && !clipEls) {
        insertImageUrl(img.url, img.width, img.height);
        return;
      }
      if (!clipEls) {
        const text = Lib.clipboard.readText();
        if (text) {
          const T = theme();
          const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
          const e = textEl(deck.w * 0.2, deck.h * 0.35, deck.w * 0.6, 120, esc.split(/\r?\n/).map((l) => `<p>${l || '<br>'}</p>`).join(''), { size: 20, color: T.text, font: T.font });
          change(() => slide().els.push(e));
          selIds = [e.id]; drawSelection();
          return;
        }
      }
    } catch (x) { /* no clipboard */ }
    if (!clipEls) return;
    const copies = JSON.parse(clipEls).map((e) => ({ ...e, id: nid(), x: e.x + 20, y: e.y + 20 }));
    clipEls = JSON.stringify(copies);
    change(() => slide().els.push(...copies));
    selIds = copies.map((c) => c.id);
    drawSelection();
  }

  function init() {
    const style = el('style', { id: 'slides-css' });
    style.textContent = CSS;
    document.head.append(style);
    const stage = $('sl-stage');
    stage.addEventListener('pointerdown', (e) => {
      // remember if the box was already selected (second click edits the text)
      const p = deck ? elAt(slidePoint(e)) : null;
      const was = p && selIds.length === 1 && selIds[0] === p.id;
      onStageDown(e);
      if (drag && drag.type === 'move') { drag.wasSelected = was && (p.type === 'text' || p.type === 'shape' || p.type === 'table'); drag.ev = { clientX: e.clientX, clientY: e.clientY }; }
    });
    stage.addEventListener('pointermove', onStageMove);
    stage.addEventListener('pointerup', onStageUp);
    stage.addEventListener('pointercancel', () => { drag = null; });
    stage.addEventListener('dblclick', onStageDbl);
    stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const it = deck && elAt(slidePoint(e));
      if (it && !selIds.includes(it.id)) { selIds = [it.id]; drawSelection(); refreshTools(); }
      const items = it ? [
        { label: 'Copiază', icon: 'copy', run: () => { clipEls = JSON.stringify(selected()); } },
        { label: 'Duplică', icon: 'copy', run: () => duplicateSel() },
        { label: 'Adu în față', icon: 'front', run: () => order('front') },
        { label: 'Trimite în spate', icon: 'tobackl', run: () => order('back') },
        it.type === 'image' ? { label: 'Schimbă imaginea…', icon: 'image', run: () => replaceImage(it) } : { label: 'Editează textul', icon: 'edit', run: () => beginEdit(it.id) },
        '-',
        { label: 'Șterge', icon: 'del', run: () => deleteSel() },
      ] : [
        { label: 'Lipește', icon: 'copy', run: () => pasteEls() },
        { label: 'Casetă de text', icon: 'textbox', run: () => addText() },
        { label: 'Imagine…', icon: 'image', run: () => addImage() },
        '-',
        { label: 'Fundal…', icon: 'wallpaper', run: () => backgroundMenu(e.currentTarget) },
        { label: 'Diapozitiv nou', icon: 'addpage', run: () => addSlide('content', cur + 1) },
      ];
      UI.menu(e.clientX, e.clientY, items);
    });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { if (deck && !$('slides').classList.contains('hidden')) renderStage(); if (!$('sl-present').classList.contains('hidden')) drawShow(); });
    $('sl-present').addEventListener('click', () => { if (showIdx >= deck.slides.length) endShow(); else { showIdx++; drawShow(); } });
    $('sl-present').addEventListener('contextmenu', (e) => { e.preventDefault(); showIdx = Math.max(0, showIdx - 1); drawShow(); });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !$('sl-present').classList.contains('hidden')) endShow(); });
    document.addEventListener('selectionchange', () => { if (editingId) refreshTools(); });
    $('sl-back').addEventListener('click', back);
    $('sl-save').addEventListener('click', save);
    $('sl-pdf').addEventListener('click', exportPdf);
    $('sl-play').addEventListener('click', () => present(0));
    $('sl-more').addEventListener('click', more);
    // pictures dropped on the slide
    stage.addEventListener('drop', (e) => {
      const f = e.dataTransfer && [...e.dataTransfer.files].find((x) => /^image\//.test(x.type));
      if (!f || !deck) return;
      e.preventDefault(); e.stopPropagation();
      const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => insertImageUrl(r.result, im.naturalWidth, im.naturalHeight); im.src = r.result; };
      r.readAsDataURL(f);
    }, true);
  }

  const api = {
    screen: 'slides',
    isDirty: () => !!(deck && st && st.dirty),
    save,
    discard: () => { if (st) st.dirty = false; },
    name: () => (st ? st.name : 'Prezentare'),
  };
  Office.register(api);

  return { init, open, save, api, present, _debug: () => ({ deck, pptxBytes, pdfHtml, readPptx, goTo, beginEdit, endEdit, selIds: () => selIds }) };
})();
