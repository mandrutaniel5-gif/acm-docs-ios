'use strict';
// The pages on screen: rendering, zoom, and everything the mouse does on a page
// (select, move, resize, edit text, draw, fill forms).

const Pages = (() => {
  const vp = () => document.getElementById('viewport');
  const host = () => document.getElementById('pages');
  let views = [];
  let observer = null;
  let current = 0;
  let renderTimer = 0;
  let hover = null; // {page, id}
  let drag = null; // active move/resize
  let edit = null; // active text editor
  const dpr = () => window.devicePixelRatio || 1;
  const MAX_PIXELS = 18e6;

  // ---------------------------------------------------------------------------
  // Building & layout
  // ---------------------------------------------------------------------------

  function build({ keepScroll = false } = {}) {
    const v = vp();
    const scrollTop = v.scrollTop, scrollLeft = v.scrollLeft;
    closeEditor(false);
    if (observer) observer.disconnect();
    host().innerHTML = '';
    views = Editor.sizes.map((size, i) => makeView(i, size));
    host().append(...views.map((view) => view.el));
    observer = new IntersectionObserver(onIntersect, { root: v, rootMargin: '800px 0px' });
    for (const view of views) observer.observe(view.el);
    layout();
    if (keepScroll) {
      v.scrollTop = scrollTop;
      v.scrollLeft = scrollLeft;
    } else {
      v.scrollTop = 0;
    }
    updateCurrent();
  }

  function makeView(i, size) {
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.page = i;
    const canvas = document.createElement('canvas');
    canvas.className = 'render';
    const ov = document.createElement('div');
    ov.className = 'ov';
    const fx = document.createElement('div');
    fx.className = 'fx';
    el.append(canvas, ov, fx);
    const view = { i, el, canvas, ov, fx, size, scale: 0, visible: false, fieldsBuilt: false };
    attachPointer(view);
    return view;
  }

  function layout() {
    const z = Editor.zoom;
    for (const v of views) {
      v.el.style.width = Math.round(v.size.w * z) + 'px';
      v.el.style.height = Math.round(v.size.h * z) + 'px';
    }
    for (const v of views) refreshOverlay(v);
    scheduleRender();
    updateCurrent();
  }

  function onIntersect(entries) {
    for (const e of entries) {
      const v = views[+e.target.dataset.page];
      if (!v) continue;
      v.visible = e.isIntersecting;
      if (!v.visible && v.scale) {
        // Free memory of pages far away.
        v.canvas.width = 1;
        v.canvas.height = 1;
        v.scale = 0;
      }
      if (v.visible) refreshOverlay(v);
    }
    scheduleRender();
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(renderNext, 16);
  }

  function renderNext() {
    renderTimer = 0;
    if (!Editor.doc) return;
    const want = Editor.zoom * dpr();
    const vr = vp().getBoundingClientRect();
    const mid = vr.top + vr.height / 2;
    let best = null, bestD = Infinity;
    for (const v of views) {
      if (!v.visible || Math.abs(v.scale - want) < 1e-6 || (drag && drag.view === v) || v.lifted) continue;
      const r = v.el.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return;
    renderView(best, want);
    scheduleRender();
  }

  function pixelSize(v, scale) {
    let w = Math.max(1, Math.round(v.size.w * scale)), h = Math.max(1, Math.round(v.size.h * scale));
    if (w * h > MAX_PIXELS) {
      const k = Math.sqrt(MAX_PIXELS / (w * h));
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    return { w, h };
  }

  function renderView(v, scale) {
    try {
      const { w, h } = pixelSize(v, scale);
      const img = Editor.doc.render(v.i, w, h);
      putPixels(v.canvas, img);
      v.scale = scale;
    } catch (e) {
      console.error('render', e);
      v.scale = scale; // do not retry forever
    }
  }

  function putPixels(canvas, img) {
    if (canvas.width !== img.width) canvas.width = img.width;
    if (canvas.height !== img.height) canvas.height = img.height;
    canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  }

  function invalidate(i) {
    const v = views[i];
    if (!v) return;
    v.scale = 0;
    v.fieldsBuilt = false;
    if (v.visible) {
      renderView(v, Editor.zoom * dpr());
      refreshOverlay(v);
    }
  }

  // ---------------------------------------------------------------------------
  // Zoom & scrolling
  // ---------------------------------------------------------------------------

  let lastFit = 0;
  function fitWidthZoom() {
    let pad = 22;
    try { pad = parseFloat(getComputedStyle(document.getElementById('pages')).paddingLeft) || 0; } catch (e) {}
    const avail = vp().clientWidth - pad * 2 - (UI.phone() ? 0 : 14);
    const maxW = Math.max(...Editor.sizes.map((s) => s.w), 100);
    lastFit = Math.max(0.1, Math.min(4, avail / maxW));
    return lastFit;
  }

  function setZoom(z, anchor) {
    closeEditor(true);
    z = Math.max(0.1, Math.min(8, z));
    const v = vp();
    const r = v.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left : v.clientWidth / 2;
    const ay = anchor ? anchor.y - r.top : v.clientHeight / 2;
    const k = z / Editor.zoom;
    const sx = (v.scrollLeft + ax) * k - ax;
    const sy = (v.scrollTop + ay) * k - ay;
    Editor.zoom = z;
    layout();
    v.scrollLeft = Math.max(0, sx);
    v.scrollTop = Math.max(0, sy);
    Editor.emit('zoom');
  }

  const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8];
  // 100% = real size on a 96-dpi screen: 1 pt = 96/72 px
  const REAL = 96 / 72;
  function zoomStep(dir, anchor) {
    const cur = Editor.zoom / REAL;
    let next = dir > 0 ? STEPS.find((s) => s > cur + 0.001) : [...STEPS].reverse().find((s) => s < cur - 0.001);
    if (next === undefined) next = dir > 0 ? STEPS[STEPS.length - 1] : STEPS[0];
    setZoom(next * REAL, anchor);
  }

  function zoomPercent() {
    return Math.round((Editor.zoom / REAL) * 100);
  }

  function updateCurrent() {
    const v = vp();
    const r = v.getBoundingClientRect();
    const mid = r.top + r.height * 0.35;
    let idx = 0;
    for (const view of views) {
      const pr = view.el.getBoundingClientRect();
      if (pr.top <= mid) idx = view.i;
      else break;
    }
    if (idx !== current) {
      current = idx;
      Editor.emit('current', current);
    }
  }

  function scrollToPage(i) {
    const view = views[Math.max(0, Math.min(views.length - 1, i))];
    if (!view) return;
    vp().scrollTop = view.el.offsetTop - 18;
  }

  function scrollToRect(page, rect) {
    const view = views[page];
    if (!view) return;
    const v = vp();
    const y = view.el.offsetTop + rect.t * view.el.offsetHeight;
    const x = view.el.offsetLeft + rect.l * view.el.offsetWidth;
    if (y < v.scrollTop + 40 || y > v.scrollTop + v.clientHeight - 80) v.scrollTop = y - v.clientHeight / 3;
    if (x < v.scrollLeft || x > v.scrollLeft + v.clientWidth - 40) v.scrollLeft = x - v.clientWidth / 3;
  }

  // ---------------------------------------------------------------------------
  // Overlays: selection, hover, form fields, search hits
  // ---------------------------------------------------------------------------

  function px(v, box) {
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    return { left: box.l * W, top: box.t * H, width: (box.r - box.l) * W, height: (box.b - box.t) * H };
  }

  function place(node, r) {
    node.style.left = r.left + 'px';
    node.style.top = r.top + 'px';
    node.style.width = Math.max(0, r.width) + 'px';
    node.style.height = Math.max(0, r.height) + 'px';
  }

  function refreshOverlay(v) {
    if (!v.visible || !Editor.doc) return;
    // Keep the text editor if it lives here.
    const keep = edit && edit.view === v ? [edit.box, edit.bar] : [];
    for (const n of [...v.fx.children]) if (!keep.includes(n) && !n.classList.contains('fld') && !n.classList.contains('sprite')) n.remove();
    if (!v.fieldsBuilt) buildFields(v);
    else layoutFields(v);
    v.ov.className = 'ov ' + toolCursor();

    // Search hits
    for (const hit of Search.hitsFor(v.i)) {
      for (const r of hit.rects) {
        const d = document.createElement('div');
        d.className = 'search-hit' + (hit.current ? ' current' : '');
        place(d, px(v, r));
        v.fx.append(d);
      }
    }

    if (Editor.tool !== 'select') return;
    if (hover && hover.page === v.i && (!Editor.selected || Editor.selected.id !== hover.id) && !drag) {
      const it = Editor.item(hover);
      if (it) {
        const d = document.createElement('div');
        d.className = 'hover-box';
        const r = px(v, it.box);
        place(d, { left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4 });
        v.fx.append(d);
      }
    }
    const sel = Editor.selected && Editor.selected.page === v.i ? Editor.selectedItem() : null;
    if (sel && !(edit && edit.item && edit.item.id === sel.id)) {
      const box = drag && drag.item.id === sel.id ? drag.box : sel.box;
      const r = px(v, box);
      const frame = document.createElement('div');
      frame.className = 'sel-box' + (touchUI ? ' grab' : '');
      place(frame, { left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4 });
      if (touchUI && !drag) frame.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); startDrag(v, sel, e, { mode: 'move', wasSelected: true }); });
      v.fx.append(frame);
      if (!drag || drag.mode === 'resize') addHandles(v, sel, r);
      if (!drag) v.fx.append(Bars.forItem(sel, v, r));
      for (const g of drag && drag.guides ? drag.guides : []) {
        const d = document.createElement('div');
        if (g.x != null) { d.className = 'guide-x'; d.style.left = g.x * v.el.offsetWidth + 'px'; }
        else { d.className = 'guide-y'; d.style.top = g.y * v.el.offsetHeight + 'px'; }
        v.fx.append(d);
      }
    }
  }

  function refreshAll() {
    for (const v of views) refreshOverlay(v);
  }

  function toolCursor() {
    switch (Editor.tool) {
      case 'text': return 'text';
      case 'pen': case 'highlight': case 'whiteout': return 'draw';
      case 'eraser': return 'erase';
      case 'check': case 'cross': case 'place': return 'click';
      default: return 'select';
    }
  }

  // ---- form fields ------------------------------------------------------------------

  function fieldFont(f) {
    const size = Math.max(4, f.size * Editor.zoom);
    return `${f.italic ? 'italic ' : ''}${f.bold ? 700 : 400} ${size}px "${f.family}", Arial, sans-serif`;
  }

  function buildFields(v) {
    for (const n of [...v.fx.querySelectorAll('.fld')]) n.remove();
    v.fieldsBuilt = true;
    const list = Editor.fields(v.i);
    for (const f of list) {
      let node;
      if (f.kind === 'text') {
        node = document.createElement('div');
        node.className = 'fld';
        const input = document.createElement(f.multiline ? 'textarea' : 'input');
        if (!f.multiline) input.type = f.password ? 'password' : 'text';
        input.value = f.value || '';
        input.spellcheck = false;
        input.style.textAlign = ['left', 'center', 'right'][f.align] || 'left';
        input.style.color = argbCss(f.argb);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !f.multiline) input.blur();
          e.stopPropagation();
        });
        input.addEventListener('change', () => {
          if (input.value !== (f.value || '')) Editor.setField(f, input.value);
        });
        node.append(input);
      } else if (f.kind === 'checkbox' || f.kind === 'radio') {
        node = document.createElement('div');
        node.className = 'fld toggle' + (f.kind === 'radio' ? ' round' : '');
        if (f.checked) node.innerHTML = f.kind === 'radio' ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#111"/></svg>' : `<svg viewBox="0 0 24 24"><path fill="#111" d="${Icons.check}"/></svg>`;
        node.addEventListener('pointerdown', (e) => e.stopPropagation());
        node.addEventListener('click', () => {
          if (f.kind === 'radio' && f.checked) return;
          Editor.setField(f, !f.checked);
        });
      } else {
        node = document.createElement('div');
        node.className = 'fld';
        const sel = document.createElement('select');
        f.options.forEach((o, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = o || '—';
          if (i === f.selected) opt.selected = true;
          sel.append(opt);
        });
        if (f.selected < 0) sel.selectedIndex = -1;
        sel.addEventListener('change', () => Editor.setField(f, +sel.value));
        node.append(sel);
      }
      node.dataset.key = f.key;
      node.style.pointerEvents = 'auto';
      node.addEventListener('pointerdown', (e) => e.stopPropagation());
      v.fx.append(node);
    }
    layoutFields(v);
  }

  function layoutFields(v) {
    const list = Editor.fields(v.i);
    const byKey = new Map(list.map((f) => [f.key, f]));
    const drawing = ['pen', 'highlight', 'whiteout', 'eraser', 'place'].includes(Editor.tool);
    for (const node of v.fx.querySelectorAll('.fld')) {
      const f = byKey.get(node.dataset.key);
      if (!f) continue;
      place(node, px(v, f.box));
      node.style.font = fieldFont(f);
      node.style.pointerEvents = drawing || drag ? 'none' : 'auto';
      const inner = node.querySelector('input,textarea,select');
      if (inner) inner.style.font = fieldFont(f);
    }
  }

  function argbCss(argb) {
    return `rgb(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255})`;
  }

  // ---- handles --------------------------------------------------------------------

  const HANDLES = [
    ['tl', -1, -1, 'nwse-resize'], ['tr', 1, -1, 'nesw-resize'], ['bl', -1, 1, 'nesw-resize'], ['br', 1, 1, 'nwse-resize'],
    ['t', 0, -1, 'ns-resize'], ['b', 0, 1, 'ns-resize'], ['l', -1, 0, 'ew-resize'], ['r', 1, 0, 'ew-resize'],
  ];

  function addHandles(v, item, r) {
    const textFlow = item.kind === 'text' && item.editable;
    for (const [name, ax, ay, cursor] of HANDLES) {
      if (textFlow && ay !== 0) continue; // paragraphs: only width changes (text reflows)
      const h = document.createElement('div');
      h.className = 'handle';
      h.style.cursor = cursor;
      h.style.pointerEvents = 'auto';
      h.style.left = r.left - 2 + ((ax + 1) / 2) * (r.width + 4) - 5 + 'px';
      h.style.top = r.top - 2 + ((ay + 1) / 2) * (r.height + 4) - 5 + 'px';
      h.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        startDrag(v, item, e, { mode: 'resize', ax, ay, keepAspect: item.kind !== 'text' && ax !== 0 && ay !== 0 });
      });
      v.fx.append(h);
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer handling on a page
  // ---------------------------------------------------------------------------

  function norm(v, e) {
    const r = v.el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function itemAt(v, p) {
    const list = Editor.items(v.i);
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    const skip = edit && edit.item ? edit.item.id : null;
    let best = null, bestScore = Infinity;
    for (const it of list) {
      if (it.id === skip) continue;
      const m = 3;
      const l = it.box.l * W - m, r = it.box.r * W + m, t = it.box.t * H - m, b = it.box.b * H + m;
      const x = p.x * W, y = p.y * H;
      if (x < l || x > r || y < t || y > b) continue;
      const k = it.kind === 'text' ? 1 : it.kind === 'image' ? 2 : 3;
      const score = Math.max(1, (r - l) * (b - t)) * k;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  function attachPointer(v) {
    v.ov.addEventListener('pointerdown', (e) => onDown(v, e));
    v.ov.addEventListener('pointermove', (e) => {
      if (drag || e.buttons) return;
      if (Editor.tool !== 'select') return;
      const it = itemAt(v, norm(v, e));
      const id = it ? it.id : null;
      v.ov.style.cursor = it ? 'move' : '';
      if ((hover && hover.id) !== id) {
        const prev = hover ? views[hover.page] : null;
        hover = it ? { page: v.i, id } : null;
        if (prev && prev !== v) refreshOverlay(prev);
        refreshOverlay(v);
      }
    });
    v.ov.addEventListener('pointerleave', () => {
      if (hover && hover.page === v.i) {
        hover = null;
        refreshOverlay(v);
      }
    });
    v.ov.addEventListener('dblclick', (e) => {
      if (Editor.tool !== 'select') return;
      const it = itemAt(v, norm(v, e));
      if (it && it.kind === 'text') beginEdit(v, it);
      else scanNotReady(v);
    });
    v.ov.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const it = itemAt(v, norm(v, e));
      if (!it) return;
      Editor.select(it);
      const isText = it.kind === 'text';
      UI.menu(e.clientX, e.clientY, [
        { label: 'Editează textul', icon: 'edit', disabled: !(isText && it.editable), run: () => beginEdit(v, it) },
        { label: 'Copiază textul', icon: 'copy', disabled: !isText, run: () => copyText(it) },
        '-',
        { label: 'Șterge', icon: 'del', run: () => guard(() => Editor.deleteItem(it)) },
      ]);
    });
  }

  // Touch: a tap acts, a drag scrolls (except while drawing or on the selected item).
  let touchUI = false;
  // A drawing in progress is dropped as soon as a second finger touches: two fingers zoom, they never draw.
  const fingers = new Set();
  let gesture = null; // {cancel()}
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fingers.add(e.pointerId);
    if (fingers.size > 1 && gesture) { const g = gesture; gesture = null; g.cancel(); }
  }, true);
  const fingerUp = (e) => fingers.delete(e.pointerId);
  window.addEventListener('pointerup', fingerUp, true);
  window.addEventListener('pointercancel', fingerUp, true);
  function onDown(v, e) {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      touchUI = true;
      if (fingers.size > 1) return; // second finger: zoom
      if (!['pen', 'highlight', 'whiteout', 'eraser'].includes(Editor.tool)) {
        const x0 = e.clientX, y0 = e.clientY, t0 = Date.now();
        const up = (ev) => {
          window.removeEventListener('pointerup', up, true);
          window.removeEventListener('pointercancel', cancel, true);
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12 || Date.now() - t0 > 700) return;
          tap(v, e);
        };
        const cancel = () => { window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true); };
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', cancel, true);
        return;
      }
    }
    act(v, e);
  }
  function tap(v, e) {
    if (Editor.tool === 'select') {
      if (edit) closeEditor(true);
      const it = itemAt(v, norm(v, e));
      const wasSelected = !!(it && Editor.selected && Editor.selected.id === it.id);
      Editor.select(it);
      if (wasSelected && it.kind === 'text' && it.editable) beginEdit(v, it);
      else if (wasSelected && it.kind === 'image') scanNotReady(v);
      return;
    }
    act(v, e);
  }
  /** A scan whose text is still being read (or was not read yet): say so, and read this page first. */
  function scanNotReady(v) {
    if (typeof ImageText === 'undefined') return;
    const st = ImageText.state(v.i);
    if (st === 'done') return;
    let scanned = false;
    try { scanned = ImageText.scannedPages().includes(v.i); } catch (e) {}
    if (!scanned && st !== 'reading') return;
    ImageText.read(v.i, null, true);
    UI.toast('Citesc textul din scanare… încă o clipă, apoi poți edita orice rând.');
  }
  function act(v, e) {
    if (edit) {
      // Clicking outside the editor finishes it.
      closeEditor(true);
      if (Editor.tool === 'text') return;
    }
    const p = norm(v, e);
    const tool = Editor.tool;
    if (tool === 'select') {
      const it = itemAt(v, p);
      const wasSelected = !!(it && Editor.selected && Editor.selected.id === it.id);
      Editor.select(it);
      if (it && !it.scan) startDrag(v, it, e, { mode: 'move', wasSelected }); // a scanned line stays where it is
      return;
    }
    if (tool === 'text') {
      e.preventDefault();
      const it = itemAt(v, p);
      if (it && it.kind === 'text' && it.editable) beginEdit(v, it);
      else beginNewText(v, p);
      return;
    }
    if (tool === 'pen') return startStroke(v, e);
    if (tool === 'eraser') return startErase(v, e);
    if (tool === 'highlight' || tool === 'whiteout') return startRect(v, e, tool);
    if (tool === 'check' || tool === 'cross') {
      const s = Math.max(8, Editor.style.size * 1.2);
      const w = s / v.size.w, h = s / v.size.h;
      guard(() => Editor.addMark(v.i, { l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 }, tool));
      return;
    }
    if (tool === 'place' && Editor.pending) {
      const img = Editor.pending;
      const wPt = img.isSignature ? 150 : Math.min(220, Math.max(40, img.width * 0.5));
      const hPt = wPt * img.height / img.width;
      const w = wPt / v.size.w, h = hPt / v.size.h;
      guard(() => Editor.placeImage(v.i, { l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 }));
    }
  }

  // ---- move / resize ------------------------------------------------------------------

  function startDrag(v, item, e, opts) {
    const start = { x: e.clientX, y: e.clientY };
    const d = { view: v, item, box: { ...item.box }, mode: opts.mode, moved: false, guides: [], opts, pointerId: e.pointerId };
    const onMove = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        drag = d;
        lift(d);
      }
      const W = v.el.offsetWidth, H = v.el.offsetHeight;
      const b = item.box;
      if (d.mode === 'move') {
        let box = { l: b.l + dx / W, t: b.t + dy / H, r: b.r + dx / W, b: b.b + dy / H };
        const snapped = snap(v, box, item.id);
        d.box = snapped.box;
        d.guides = snapped.guides;
      } else {
        d.box = resized(b, opts, dx / W, dy / H, W, H, item);
      }
      positionSprite(d);
      refreshOverlay(v);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      if (!d.moved) {
        // Second click on a selected paragraph: edit it.
        if (opts.wasSelected && item.kind === 'text' && item.editable) beginEdit(v, item);
        return;
      }
      finishDrag(d, true);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape' && d.moved) {
        ev.stopPropagation();
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('keydown', onKey, true);
        finishDrag(d, false);
      }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('keydown', onKey, true);
  }

  function lift(d) {
    const v = d.view;
    try {
      const w = v.canvas.width > 1 ? v.canvas.width : pixelSize(v, Editor.zoom * dpr()).w;
      const h = v.canvas.height > 1 ? v.canvas.height : pixelSize(v, Editor.zoom * dpr()).h;
      const r = Editor.doc.lift(v.i, d.item.objects, d.item.box, w, h);
      putPixels(v.canvas, r.background);
      v.lifted = true;
      if (r.sprite) {
        const c = document.createElement('canvas');
        c.className = 'sprite';
        putPixels(c, r.sprite);
        d.sprite = c;
        d.spriteBox = r.spriteBox;
        v.fx.append(c);
      }
    } catch (e) {
      console.error('lift', e);
    }
    for (const n of v.fx.querySelectorAll('.fld')) n.style.pointerEvents = 'none';
  }

  function positionSprite(d) {
    if (!d.sprite) return;
    const v = d.view, b = d.item.box, s = d.spriteBox;
    const sx = b.r > b.l ? (d.box.r - d.box.l) / (b.r - b.l) : 1;
    const sy = b.b > b.t ? (d.box.b - d.box.t) / (b.b - b.t) : 1;
    const box = { l: d.box.l + (s.l - b.l) * sx, t: d.box.t + (s.t - b.t) * sy };
    box.r = box.l + (s.r - s.l) * sx;
    box.b = box.t + (s.b - s.t) * sy;
    place(d.sprite, px(v, box));
  }

  function finishDrag(d, commit) {
    drag = null;
    const v = d.view;
    v.lifted = false;
    if (d.sprite) d.sprite.remove();
    const b = d.item.box;
    const same = Math.abs(d.box.l - b.l) < 1e-5 && Math.abs(d.box.t - b.t) < 1e-5 && Math.abs(d.box.r - b.r) < 1e-5 && Math.abs(d.box.b - b.b) < 1e-5;
    if (!commit || same) {
      Editor.doc.setActive(v.i, d.item.objects, true);
      invalidate(v.i);
      return;
    }
    guard(() => {
      if (d.mode === 'resize' && d.item.kind === 'text' && d.item.editable && Math.abs((d.box.r - d.box.l) - (b.r - b.l)) > 1e-4) {
        // Wider or narrower paragraph: the text flows again, like in Word.
        Editor.doc.setActive(v.i, d.item.objects, true);
        reflow(v, d.item, d.item.style, d.box.l, (d.box.r - d.box.l) * v.size.w);
      } else {
        Editor.moveItem(d.item, d.box);
      }
    }, () => { Editor.doc.setActive(v.i, d.item.objects, true); invalidate(v.i); });
  }

  function resized(b, o, dx, dy, W, H, item) {
    let l = b.l, t = b.t, r = b.r, bt = b.b;
    if (o.ax < 0) l += dx;
    if (o.ax > 0) r += dx;
    const textFlow = item.kind === 'text' && item.editable;
    if (!textFlow) {
      if (o.ay < 0) t += dy;
      if (o.ay > 0) bt += dy;
    }
    const minW = 8 / W, minH = 8 / H;
    if (r - l < minW) { if (o.ax < 0) l = r - minW; else r = l + minW; }
    if (bt - t < minH) { if (o.ay < 0) t = bt - minH; else bt = t + minH; }
    if (o.keepAspect && b.r > b.l && b.b > b.t) {
      const ratio = ((b.r - b.l) * W) / ((b.b - b.t) * H);
      const h = ((r - l) * W) / ratio / H;
      if (o.ay < 0) t = bt - h; else bt = t + h;
    }
    return { l, t, r, b: bt };
  }

  function snap(v, box, selfId) {
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    const tx = 5 / W, ty = 5 / H;
    const cx = [0.5], cy = [0.5];
    for (const it of Editor.items(v.i)) {
      if (it.id === selfId) continue;
      cx.push(it.box.l, (it.box.l + it.box.r) / 2, it.box.r);
      cy.push(it.box.t, (it.box.t + it.box.b) / 2, it.box.b);
    }
    let bx = null, gx = 0, by = null, gy = 0;
    for (const edge of [box.l, (box.l + box.r) / 2, box.r]) for (const c of cx) {
      const d = c - edge;
      if (Math.abs(d) < tx && (bx === null || Math.abs(d) < Math.abs(bx))) { bx = d; gx = c; }
    }
    for (const edge of [box.t, (box.t + box.b) / 2, box.b]) for (const c of cy) {
      const d = c - edge;
      if (Math.abs(d) < ty && (by === null || Math.abs(d) < Math.abs(by))) { by = d; gy = c; }
    }
    const out = { l: box.l + (bx || 0), r: box.r + (bx || 0), t: box.t + (by || 0), b: box.b + (by || 0) };
    const guides = [];
    if (bx !== null) guides.push({ x: gx });
    if (by !== null) guides.push({ y: gy });
    return { box: out, guides };
  }

  // ---- drawing tools ----------------------------------------------------------------------

  function startStroke(v, e) {
    const c = document.createElement('canvas');
    c.className = 'sprite';
    c.style.opacity = '1';
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    c.width = Math.round(W * dpr());
    c.height = Math.round(H * dpr());
    place(c, { left: 0, top: 0, width: W, height: H });
    v.fx.append(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr(), dpr());
    ctx.strokeStyle = argbCss(Editor.style.pen);
    ctx.lineWidth = Math.max(0.5, Editor.style.penWidth * Editor.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = [norm(v, e)];
    const id = e.pointerId;
    const onMove = (ev) => {
      if (ev.pointerId !== id) return;
      const p = norm(v, ev);
      const last = pts[pts.length - 1];
      if (Math.hypot((p.x - last.x) * W, (p.y - last.y) * H) < 1.2) return;
      pts.push(p);
      ctx.beginPath();
      ctx.moveTo(last.x * W, last.y * H);
      ctx.lineTo(p.x * W, p.y * H);
      ctx.stroke();
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      if (gesture === g) gesture = null;
    };
    const onUp = (ev) => {
      if (ev.pointerId !== id) return;
      stop();
      guard(() => Editor.addInk(v.i, pts));
      c.remove();
    };
    const onCancel = (ev) => { if (ev.pointerId === id) { stop(); c.remove(); } };
    const g = { cancel: () => { stop(); c.remove(); } };
    gesture = g;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
  }

  /** Eraser: everything drawn that the finger / mouse passes over disappears. */
  function startErase(v, e) {
    const list = Editor.erasables(v.i);
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    const R = (UI.phone() ? 16 : 10); // reach, in screen pixels
    const ring = document.createElement('div');
    ring.className = 'sprite erase-ring';
    ring.style.opacity = '1';
    v.fx.append(ring);
    const gone = [];
    let frame = 0;
    const id = e.pointerId;
    const near = (it, p) => {
      const px = p.x * W, py = p.y * H;
      const b = it.box, pad = R + (it.width * W) / 2;
      if (px < b.l * W - pad || px > b.r * W + pad || py < b.t * H - pad || py > b.b * H + pad) return false;
      if (it.fill || it.pts.length < 2) return true;
      for (let k = 1; k < it.pts.length; k++) {
        const ax = it.pts[k - 1][0] * W, ay = it.pts[k - 1][1] * H, bx = it.pts[k][0] * W, by = it.pts[k][1] * H;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        if (Math.hypot(ax + t * dx - px, ay + t * dy - py) <= pad) return true;
      }
      return false;
    };
    const at = (ev) => {
      const p = norm(v, ev);
      place(ring, { left: p.x * W - R, top: p.y * H - R, width: R * 2, height: R * 2 });
      const hit = [];
      for (const it of list) if (!it.gone && near(it, p)) { it.gone = true; hit.push(it.obj); gone.push(it.obj); }
      if (hit.length) {
        Editor.doc.setActive(v.i, hit, false);
        for (const o of hit) Editor.doc.hidden.add(o);
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; Editor.hideNow(v.i, []); });
      }
    };
    at(e);
    const onMove = (ev) => { if (ev.pointerId === id) at(ev); };
    const stop = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      ring.remove();
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (gesture === g) gesture = null;
    };
    const onUp = (ev) => {
      if (ev.pointerId !== id) return;
      stop();
      if (gone.length) guard(() => Editor.erase(v.i, gone));
      else if (!list.length) UI.toast(I18n.t('Aici nu e nimic desenat de șters. Radiera șterge desenele, marcajele și bifele.'));
    };
    // two fingers: put back what this stroke of the eraser took
    const g = { cancel: () => { stop(); if (gone.length) { Editor.doc.setActive(v.i, gone, true); for (const o of gone) Editor.doc.hidden.delete(o); Editor.hideNow(v.i, []); } } };
    gesture = g;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }

  function startRect(v, e, tool) {
    const d = document.createElement('div');
    d.className = 'sprite';
    d.style.opacity = '1';
    d.style.background = tool === 'whiteout' ? '#fff' : 'rgba(255, 230, 41, .45)';
    if (tool === 'whiteout') d.style.outline = '1px solid rgba(0,0,0,.3)';
    v.fx.append(d);
    const p0 = norm(v, e);
    let p1 = p0;
    const rect = () => ({ l: Math.min(p0.x, p1.x), t: Math.min(p0.y, p1.y), r: Math.max(p0.x, p1.x), b: Math.max(p0.y, p1.y) });
    const id = e.pointerId;
    const onMove = (ev) => {
      if (ev.pointerId !== id) return;
      p1 = norm(v, ev);
      place(d, px(v, rect()));
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      if (gesture === g) gesture = null;
      d.remove();
    };
    const g = { cancel: stop };
    gesture = g;
    const onUp = (ev) => {
      if (ev.pointerId !== id) return;
      stop();
      const r = rect();
      if ((r.r - r.l) * v.el.offsetWidth < 3 || (r.b - r.t) * v.el.offsetHeight < 3) return;
      guard(() => (tool === 'whiteout' ? Editor.addWhiteout(v.i, r) : Editor.addHighlight(v.i, r)));
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  }

  // ---------------------------------------------------------------------------
  // Text editing
  // ---------------------------------------------------------------------------

  function cssFont(style, zoom) {
    // The exact font file that will be written is loaded as a web font, so what you
    // see while typing is exactly what ends up in the PDF.
    if (style.css) return `400 ${style.size * zoom}px "${style.css}", Arial, sans-serif`;
    return `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${style.size * zoom}px "${style.family}", Arial, sans-serif`;
  }

  /** Top of the first line relative to its baseline, in points. */
  function baselineOffset(style) {
    const ctx = document.createElement('canvas').getContext('2d');
    const z = 4;
    ctx.font = cssFont(style, z);
    const m = ctx.measureText('Hg');
    const A = (m.fontBoundingBoxAscent || style.size * z * 0.8);
    const D = (m.fontBoundingBoxDescent || style.size * z * 0.2);
    const LH = style.lineGap * z;
    return ((LH - (A + D)) / 2 + A) / z;
  }

  function applyStyle(node, style, widthPt) {
    const z = Editor.zoom;
    node.style.font = cssFont(style, z);
    node.style.lineHeight = style.lineGap * z + 'px';
    node.style.color = argbCss(style.argb);
    node.style.textAlign = widthPt ? ['left', 'center', 'right'][style.align] || 'left' : 'left';
    if (widthPt) node.style.width = widthPt * z + 'px';
    else node.style.width = '';
  }

  /** Lines exactly as the browser wraps them in [node] (same font, width, spacing). */
  function measureLines(node, text, style) {
    const z = Editor.zoom;
    const mirror = node.cloneNode(false);
    mirror.removeAttribute('contenteditable');
    mirror.style.position = 'absolute';
    mirror.style.left = '-99999px';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.boxShadow = 'none';
    mirror.textContent = text;
    document.body.append(mirror);
    try {
      const base = mirror.getBoundingClientRect();
      const LH = style.lineGap * z;
      const tn = mirror.firstChild;
      const lines = new Map();
      if (tn) {
        const range = document.createRange();
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '\n') continue;
          range.setStart(tn, i);
          range.setEnd(tn, i + 1);
          const rects = range.getClientRects();
          if (!rects.length) continue;
          const r = rects[0];
          const idx = Math.max(0, Math.round((r.top - base.top) / LH - 0.001));
          const ln = lines.get(idx) || { chars: '', left: Infinity };
          if (!(text[i] === ' ' && ln.chars === '')) {
            ln.chars += text[i];
            ln.left = Math.min(ln.left, r.left - base.left);
          }
          lines.set(idx, ln);
        }
      }
      const off = baselineOffset(style);
      const out = [];
      for (const [idx, ln] of [...lines.entries()].sort((a, b) => a[0] - b[0])) {
        const t = ln.chars.replace(/\s+$/, '');
        if (!t) continue;
        out.push({ text: t, dx: (ln.left === Infinity ? 0 : ln.left) / z, baseline: idx * style.lineGap + off });
      }
      return out;
    } finally {
      mirror.remove();
    }
  }

  function beginEdit(v, item) {
    if (!item.editable || !item.style) {
      UI.toast('Acest text nu poate fi editat (e rotit sau nu are font citibil). Îl poți muta sau șterge.');
      return;
    }
    closeEditor(true);
    guard(() => {
      const font = Editor.fontFor(item.style, item.text);
      const style = { ...item.style, family: font.family, bold: font.bold, italic: font.italic, css: font.css };
      // a scanned line grows to the right as it is typed (it is one line of a form, not a paragraph)
      const widthPt = item.scan ? null : (item.box.r - item.box.l) * v.size.w * 1.04 + 2;
      const baseline = item.firstBaseline != null ? item.firstBaseline : item.box.t + (style.size * 0.8) / v.size.h;
      const topLeft = { x: item.box.l, y: baseline - baselineOffset(style) / v.size.h };
      Editor.doc.setActive(v.i, item.objects, false);
      renderView(v, Editor.zoom * dpr());
      openEditor(v, { item, style, font, widthPt, topLeft, text: item.text });
      // a scanned line: the editor covers the letters of the picture with the paper's color
      if (item.scan && edit) {
        edit.box.style.background = item.paper;
        edit.box.style.minHeight = (item.box.b - topLeft.y) * v.el.offsetHeight + 'px';
      }
    });
  }

  function beginNewText(v, p) {
    closeEditor(true);
    guard(() => {
      const near = Editor.styleNear(v.i, p.x, p.y);
      const font = Editor.fontFor(near.style);
      const style = { ...near.style, family: font.family, bold: font.bold, italic: font.italic, css: font.css };
      const baseline = near.baseline != null ? near.baseline : p.y;
      const topLeft = { x: Math.max(0, Math.min(0.95, near.x)), y: Math.max(0, baseline - baselineOffset(style) / v.size.h) };
      Editor.style.size = style.size;
      Editor.style.color = style.argb;
      Editor.emit('state');
      openEditor(v, { item: null, style, font, widthPt: null, topLeft, text: '' });
    });
  }

  function openEditor(v, s) {
    const node = document.createElement('div');
    node.className = 'text-edit' + (s.widthPt ? '' : ' grow');
    node.contentEditable = 'plaintext-only';
    node.spellcheck = false;
    node.style.pointerEvents = 'auto';
    node.textContent = s.text;
    applyStyle(node, s.style, s.widthPt);
    const W = v.el.offsetWidth, H = v.el.offsetHeight;
    node.style.left = s.topLeft.x * W + 'px';
    node.style.top = s.topLeft.y * H + 'px';
    if (!s.widthPt) node.style.maxWidth = Math.max(40, W - s.topLeft.x * W - 4) + 'px';
    node.addEventListener('pointerdown', (e) => e.stopPropagation());
    node.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); closeEditor(true); }
    });
    v.fx.append(node);
    edit = { view: v, box: node, ...s, original: s.text, originalStyle: { ...s.style } };
    const bar = Bars.forEditor(edit);
    edit.bar = bar;
    v.fx.append(bar);
    positionEditorBar();
    node.addEventListener('input', positionEditorBar);
    setTimeout(() => {
      node.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
    Editor.emit('editing', true);
  }

  function positionEditorBar() {
    if (!edit || !edit.bar) return;
    const r = { left: edit.box.offsetLeft, top: edit.box.offsetTop, width: edit.box.offsetWidth, height: edit.box.offsetHeight };
    Bars.position(edit.bar, r, edit.view);
  }

  function editorText() {
    if (!edit) return '';
    let t = edit.box.innerText.replace(/\r/g, '');
    if (t.endsWith('\n') && !edit.original.endsWith('\n')) t = t.slice(0, -1);
    return t;
  }

  /** Applies a new style to the open editor (from the floating bar). */
  function restyleEditor(changes) {
    if (!edit) return;
    const next = { ...edit.style, ...changes };
    if (changes.size) next.lineGap = edit.style.lineGap * changes.size / edit.style.size;
    if (changes.bold !== undefined || changes.italic !== undefined) {
      const f = Editor.fontFor({ ...next, family: edit.originalStyle.family }, editorText());
      edit.font = f;
      next.family = f.family;
      next.css = f.css;
      next.bold = f.bold;
      next.italic = f.italic;
    }
    edit.style = next;
    applyStyle(edit.box, next, edit.widthPt);
    edit.box.focus();
    positionEditorBar();
    Bars.refreshEditor(edit);
  }

  function closeEditor(commit) {
    const e = edit;
    if (!e) return;
    const finalText = editorText();
    edit = null;
    const v = e.view;
    const unchanged = finalText === e.original && sameStyle(e.style, e.originalStyle);
    const cleanup = () => {
      e.box.remove();
      if (e.bar) e.bar.remove();
      Editor.emit('editing', false);
    };
    if (!commit || unchanged || (!e.item && !finalText.trim())) {
      cleanup();
      if (e.item) {
        Editor.doc.setActive(v.i, e.item.objects, true);
        invalidate(v.i);
      }
      return;
    }
    guard(() => {
      const font = finalText === e.original ? e.font : Editor.fontFor(e.style, finalText);
      const lines = measureLines(e.box, finalText, e.style);
      if (e.item && e.item.scan) {
        // the edited line of a scan: its letters leave the picture, the new text takes their place
        UI.busy('Scriu textul…');
        ImageText.replace(v.i, e.item, { lines: finalText.trim() ? lines : [], topLeft: e.topLeft, size: e.style.size, argb: e.style.argb, font })
          .catch((err) => UI.errorDetails('Nu am putut scrie textul', err))
          .finally(() => { cleanup(); UI.busy(null); });
        return;
      }
      cleanup();
      Editor.writeText(v.i, { remove: e.item ? e.item.objects : [], lines, topLeft: e.topLeft, style: { size: e.style.size, argb: e.style.argb }, font });
    }, () => {
      cleanup();
      if (e.item) { Editor.doc.setActive(v.i, e.item.objects, true); invalidate(v.i); }
    });
  }

  function sameStyle(a, b) {
    return Math.abs(a.size - b.size) < 0.05 && a.argb === b.argb && a.bold === b.bold && a.italic === b.italic && a.family === b.family;
  }

  /** Rewrites a paragraph with a new style or width (text flows again). */
  function reflow(v, item, style, left, widthPt) {
    const font = Editor.fontFor(style, item.text);
    const eff = { ...style, family: font.family, bold: font.bold, italic: font.italic, css: font.css };
    const node = document.createElement('div');
    node.className = 'text-edit';
    applyStyle(node, eff, widthPt);
    const baseline = item.firstBaseline != null ? item.firstBaseline : item.box.t + (style.size * 0.8) / v.size.h;
    const topLeft = { x: left, y: baseline - baselineOffset(eff) / v.size.h };
    const lines = measureLines(node, item.text, eff);
    Editor.writeText(v.i, { remove: item.objects, lines, topLeft, style: { size: eff.size, argb: eff.argb }, font });
  }

  function restyleItem(item, changes) {
    const v = views[item.page];
    if (!v || !item.style) return;
    if (!item.editable) {
      UI.toast('Acest text poate fi doar mutat sau șters.');
      return;
    }
    guard(() => {
      if (changes.argb !== undefined && changes.size === undefined && changes.bold === undefined) {
        Editor.setTextColor(item, changes.argb);
        return;
      }
      const next = { ...item.style, ...changes };
      if (changes.size) next.lineGap = item.style.lineGap * changes.size / item.style.size;
      reflow(v, item, next, item.box.l, (item.box.r - item.box.l) * v.size.w * 1.04 + 2);
    });
  }

  function copyText(item) {
    if (item && item.text) {
      navigator.clipboard.writeText(item.text);
      UI.toast('Text copiat.');
    }
  }

  function guard(fn, onError) {
    try {
      return fn();
    } catch (e) {
      console.error(e);
      if (onError) { try { onError(); } catch (_) {} }
      UI.toast('Operația nu a reușit: ' + (e.message || e), { error: true, action: { label: 'Detalii', run: () => UI.errorDetails('Eroare', e) } });
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function init() {
    const v = vp();
    v.addEventListener('scroll', () => {
      updateCurrent();
      scheduleRender();
    }, { passive: true });
    v.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomStep(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
    }, { passive: false });
    window.addEventListener('resize', () => {
      if (Editor.doc && lastFit && Math.abs(Editor.zoom - lastFit) < 0.005) setZoom(fitWidthZoom());
      scheduleRender();
    });
    pinch(v);
    Editor.on('doc', (info) => {
      if (info && info.fresh) {
        Editor.zoom = 1;
        build();
        Editor.zoom = fitWidthZoom();
        layout();
        Editor.emit('zoom');
      } else build({ keepScroll: true });
    });
    Editor.on('page', (i) => invalidate(i));
    Editor.on('selection', () => refreshAll());
    Editor.on('tool', () => { closeEditor(true); hover = null; refreshAll(); });
  }

  // Two fingers: zoom (a quick preview while moving, sharp pages when lifted).
  function pinch(v) {
    let st = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    v.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2 || !Editor.doc) return;
      closeEditor(true);
      st = { d: dist(e.touches), m: mid(e.touches), k: 1 };
      const r = v.getBoundingClientRect();
      const pages = document.getElementById('pages');
      pages.style.transformOrigin = `${st.m.x - r.left + v.scrollLeft}px ${st.m.y - r.top + v.scrollTop}px`;
    }, { passive: true });
    v.addEventListener('touchmove', (e) => {
      if (!st || e.touches.length !== 2) return;
      e.preventDefault();
      st.k = Math.max(0.3, Math.min(5, dist(e.touches) / st.d));
      const m = mid(e.touches);
      st.dx = m.x - st.m.x; st.dy = m.y - st.m.y; // two fingers also move the page
      document.getElementById('pages').style.transform = `translate(${st.dx}px, ${st.dy}px) scale(${st.k})`;
    }, { passive: false });
    const end = (e) => {
      if (!st || e.touches.length >= 2) return;
      const k = st.k, m = st.m, dx = st.dx || 0, dy = st.dy || 0;
      st = null;
      document.getElementById('pages').style.transform = '';
      if (Math.abs(k - 1) > 0.02) setZoom(Editor.zoom * k, m);
      if (dx || dy) v.scrollBy(-dx, -dy);
    };
    v.addEventListener('touchend', end, { passive: true });
    v.addEventListener('touchcancel', end, { passive: true });
  }

  return {
    init, build, layout, invalidate, refreshAll, setZoom, zoomStep, zoomPercent, fitWidthZoom,
    scrollToPage, scrollToRect, get current() { return current; }, get pageCount() { return views.length; },
    closeEditor, beginEdit: (item) => views[item.page] && beginEdit(views[item.page], item),
    restyleEditor, restyleItem, copyText, isEditing: () => !!edit, editState: () => edit, guard,
    measureLines, cssFont,
  };
})();
