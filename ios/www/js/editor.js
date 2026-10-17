'use strict';
// Document state and every action the user can take. The UI (pageview.js,
// panels.js) only calls these functions and listens to the events.

const Editor = (() => {
  const E = {
    doc: null,
    path: null,
    name: '',
    password: null,
    dirty: false,
    sizes: [],
    zoom: 1,
    tool: 'select',
    pending: null, // image waiting to be placed {rgba, width, height, isSignature, url}
    selected: null, // {page, id}
    history: [],
    future: [],
    style: {
      size: 12, color: 0xff111111, bold: false, italic: false, family: 'Arial', auto: true,
      pen: 0xff1c3faa, penWidth: 1.6, highlight: 0xffffe629, mark: 0xff111111,
    },
  };

  const items = new Map();
  const fields = new Map();
  const runs = new Map();
  const listeners = new Map();

  E.on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  E.emit = (type, arg) => {
    for (const fn of listeners.get(type) || []) {
      try { fn(arg); } catch (e) { console.error(e); }
    }
  };

  // ---------------------------------------------------------------------------
  // Opening / closing
  // ---------------------------------------------------------------------------

  E.openDoc = (doc, { path = null, name = 'Document nou.pdf', password = null } = {}) => {
    E.close();
    E.doc = doc;
    E.path = path;
    E.name = name;
    E.password = password;
    E.dirty = false;
    E.history = [];
    E.future = [];
    E.selected = null;
    E.tool = 'select';
    E.pending = null;
    resetCaches();
    E.sizes = doc.pageSizes();
    E.emit('doc', { fresh: true });
    E.emit('state');
  };

  E.close = () => {
    if (E.doc) {
      try { E.doc.close(); } catch (e) { console.warn(e); }
    }
    E.doc = null;
    resetCaches();
  };

  function resetCaches() {
    items.clear();
    fields.clear();
    runs.clear();
  }

  function invalidate(pages) {
    for (const p of pages) {
      items.delete(p);
      fields.delete(p);
      runs.delete(p);
    }
  }

  function reload(bytes) {
    const d = PDF.Doc.open(bytes, E.password);
    E.doc.close();
    E.doc = d;
    resetCaches();
    E.sizes = d.pageSizes();
    E.selected = null;
    E.emit('doc', { fresh: false });
  }

  // ---------------------------------------------------------------------------
  // Undo / redo
  // ---------------------------------------------------------------------------

  const MAX_UNDO = 40;
  // History entries:
  //  - bytes: the whole document before a change (slow to go back to, works for anything)
  //  - {quick}: drawings shown / hidden (pen, marker, tick, eraser): undone at once, no reload
  //  - {marker}: the document before a series of quick steps (used when the series is closed)

  function snapshot() {
    closeRun();
    E.history.push(E.doc.save());
    if (E.history.length > MAX_UNDO) E.history.shift();
    E.future = [];
  }
  /** A slow change follows: the quick steps on top become one step (back to the marker). */
  function closeRun() {
    let i = E.history.length;
    while (i > 0 && E.history[i - 1].quick) i--;
    if (i > 0 && E.history[i - 1].marker) {
      E.history[i - 1] = E.history[i - 1].bytes;
      E.history.length = i;
    } else if (i < E.history.length) E.history.length = i;
  }
  const purgeQuick = () => {
    E.history = E.history.filter((h) => !h.quick && !h.marker);
    E.future = E.future.filter((h) => !h.quick && !h.marker);
  };
  function show(page, objs, on) {
    E.doc.setActive(page, objs, on);
    for (const o of objs) { if (on) E.doc.hidden.delete(o); else E.doc.hidden.add(o); }
    invalidate([page]);
    E.emit('page', page);
  }
  /** Records a quick step: [objs] on [page] were just shown (added) or hidden (erased). */
  function quick(page, objs, added) {
    const top = E.history[E.history.length - 1];
    if (!top || !(top.quick || top.marker)) {
      // the document as it was just before this step (what was added left out, what was erased put back)
      E.doc.setActive(page, objs, !added);
      try { E.history.push({ marker: true, bytes: E.doc.save() }); } finally { E.doc.setActive(page, objs, added); }
    }
    E.history.push({ quick: true, page, objs, added });
    if (E.history.length > MAX_UNDO * 4) E.history.splice(0, E.history.length - MAX_UNDO * 4);
    E.future = [];
    E.dirty = true;
    invalidate([page]);
    E.emit('page', page);
    E.emit('state');
  }

  /** Runs a change that can be undone. [pages] = pages whose look changes (null = all). */
  E.change = (pages, fn) => {
    if (!E.doc) return undefined;
    snapshot();
    let result;
    try {
      result = fn(E.doc);
    } catch (e) {
      // Roll back to a clean state
      const last = E.history.pop();
      try { reload(last); purgeQuick(); } catch (_) {}
      throw e;
    }
    E.dirty = true;
    if (pages) {
      invalidate(pages);
      for (const p of pages) E.emit('page', p);
    } else {
      resetCaches();
      E.sizes = E.doc.pageSizes();
      E.emit('doc', { fresh: false });
    }
    E.emit('state');
    return result;
  };

  E.canUndo = () => E.history.some((h) => !h.marker);
  E.canRedo = () => E.future.some((h) => !h.marker);

  E.undo = () => {
    while (E.history.length) {
      const h = E.history.pop();
      if (h.marker) { E.future.push(h); continue; }
      if (h.quick) { show(h.page, h.objs, !h.added); E.future.push(h); }
      else { E.future.push(E.doc.save()); reload(h); purgeQuick(); }
      E.dirty = true;
      E.emit('state');
      return;
    }
  };

  E.redo = () => {
    while (E.future.length) {
      const h = E.future.pop();
      if (h.marker) { E.history.push(h); continue; }
      if (h.quick) { show(h.page, h.objs, h.added); E.history.push(h); }
      else { closeRun(); E.history.push(E.doc.save()); reload(h); purgeQuick(); }
      E.dirty = true;
      E.emit('state');
      return;
    }
  };

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  E.items = (page) => {
    if (!items.has(page)) {
      let list = [];
      try { list = E.doc.items(page); } catch (e) { console.warn('items', e); }
      items.set(page, list);
    }
    return items.get(page);
  };

  E.fields = (page) => {
    if (!fields.has(page)) {
      let list = [];
      try { list = E.doc.fields(page).filter((f) => !f.readOnly); } catch (e) { console.warn('fields', e); }
      fields.set(page, list);
    }
    return fields.get(page);
  };

  E.runs = (page) => {
    if (!runs.has(page)) {
      let list = [];
      try { list = E.doc.textRuns(page); } catch (e) { console.warn('runs', e); }
      runs.set(page, list);
    }
    return runs.get(page);
  };

  E.item = (sel) => {
    if (!sel) return null;
    return E.items(sel.page).find((i) => i.id === sel.id) || null;
  };

  E.selectedItem = () => E.item(E.selected);

  /** Selects the item that now contains object [obj] (after a change). */
  E.selectObject = (page, obj) => {
    const it = E.items(page).find((i) => i.objects.includes(obj));
    E.selected = it ? { page, id: it.id } : null;
    E.emit('selection');
  };

  E.select = (item) => {
    E.selected = item ? { page: item.page, id: item.id } : null;
    E.emit('selection');
  };

  E.setTool = (tool) => {
    E.tool = tool;
    if (tool !== 'place') E.pending = null;
    E.selected = null;
    E.emit('tool');
    E.emit('selection');
  };

  // ---------------------------------------------------------------------------
  // Content changes
  // ---------------------------------------------------------------------------

  E.moveItem = (item, to) => {
    // The item may be hidden while it is dragged: show it again before the undo snapshot.
    E.doc.setActive(item.page, item.objects, true);
    E.change([item.page], (d) => d.transform(item.page, item.objects, item.box, to));
    E.selectObject(item.page, item.objects[0]);
  };

  E.deleteItem = (item) => {
    E.change([item.page], (d) => d.deleteObjects(item.page, item.objects));
    E.selected = null;
    E.emit('selection');
  };

  E.nudge = (dxPt, dyPt) => {
    const item = E.selectedItem();
    if (!item) return;
    const s = E.sizes[item.page];
    const b = item.box;
    const dx = dxPt / s.w, dy = dyPt / s.h;
    E.moveItem(item, { l: b.l + dx, t: b.t + dy, r: b.r + dx, b: b.b + dy });
  };

  /** Font actually used to write [style] (and shown while editing). */
  E.fontFor = (style, text) => {
    const f = SystemFonts.findTrueType(style.family, style.bold, style.italic, text || 'ăâîșțĂÂÎȘȚ');
    if (!f) throw new PDF.PdfError('Nu am găsit niciun font pe calculator pentru a scrie textul.', -1);
    f.css = SystemFonts.cssFace(f);
    return f;
  };

  /** Writes [lines] (from the on-screen layout) for a text box. */
  E.writeText = (page, { remove, lines, topLeft, style, font }) => {
    if (remove && remove.length) E.doc.setActive(page, remove, true);
    const created = E.change([page], (d) =>
      d.writeText(page, { remove: remove || [], lines, topLeft, fontKey: font.key, fontBytes: font.bytes, size: style.size, argb: style.argb }),
    );
    if (created && created.length) E.selectObject(page, created[0]);
    else { E.selected = null; E.emit('selection'); }
    return created;
  };

  E.setTextColor = (item, argb) => {
    E.change([item.page], (d) => d.setTextColor(item.page, item.objects, argb));
    E.selectObject(item.page, item.objects[0]);
  };

  E.setField = (field, value) => {
    E.change([field.page], (d) => d.setField(field, value));
  };

  // Drawings are quick steps: added at once, undone at once.
  const draw = (page, make) => { if (!E.doc) return null; const o = make(E.doc); quick(page, [o], true); return o; };
  E.addInk = (page, points) => draw(page, (d) => d.addInk(page, points, E.style.pen, E.style.penWidth));

  E.addHighlight = (page, rect) => draw(page, (d) => d.addRect(page, rect, E.style.highlight, 110, true));

  E.addWhiteout = (page, rect) => draw(page, (d) => d.addRect(page, rect, 0xffffffff, 255, false));

  E.addMark = (page, rect, kind) => draw(page, (d) => d.addMark(page, rect, kind, E.style.mark));

  /** Eraser: drawings that can be rubbed out on [page]. */
  E.erasables = (page) => { try { return E.doc.erasables(page); } catch (e) { console.warn('erasables', e); return []; } };
  /** Hides [objs] right away (while the eraser moves); [commit] records the step. */
  E.hideNow = (page, objs) => { E.doc.setActive(page, objs, false); for (const o of objs) E.doc.hidden.add(o); invalidate([page]); E.emit('page', page); };
  E.erase = (page, objs) => { if (objs.length) quick(page, objs, false); };

  E.placeImage = (page, rect) => {
    const img = E.pending;
    if (!img) return;
    const obj = E.change([page], (d) => d.insertImage(page, img.rgba, img.width, img.height, rect));
    E.tool = 'select';
    E.pending = null;
    E.emit('tool');
    E.selectObject(page, obj);
  };

  // ---------------------------------------------------------------------------
  // Style of new text (auto = like the text around the click)
  // ---------------------------------------------------------------------------

  E.styleNear = (page, nx, ny) => {
    const s = E.sizes[page];
    const base = {
      family: E.style.family, size: E.style.size, argb: E.style.color, bold: E.style.bold, italic: E.style.italic,
      lineGap: E.style.size * 1.2, align: 0,
    };
    if (!E.style.auto) return { style: base, baseline: null, x: nx };
    const list = E.runs(page);
    if (!list.length) return { style: base, baseline: null, x: nx };
    let best = null, bestScore = Infinity, bestOn = false;
    for (const r of list) {
      const hPt = (r.box.b - r.box.t) * s.h;
      const top = r.box.t * s.h - hPt * 0.3, bottom = r.box.b * s.h + hPt * 0.3;
      const y = ny * s.h, x = nx * s.w;
      const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
      const left = r.box.l * s.w, right = r.box.r * s.w;
      const dx = x < left ? left - x : x > right ? x - right : 0;
      const on = dy === 0;
      const score = on ? dx : 10000 + dy * 3 + dx;
      if (score < bestScore) { bestScore = score; best = r; bestOn = on; }
    }
    let run = best;
    if (!(bestOn || bestScore < 10000 + 72 * 3)) {
      const w = new Map(), sample = new Map();
      for (const r of list) {
        const k = `${r.fontName}|${Math.round(r.size)}|${r.argb}`;
        w.set(k, (w.get(k) || 0) + r.chars);
        if (!sample.has(k)) sample.set(k, r);
      }
      let top = null;
      for (const [k, v] of w) if (!top || v > w.get(top)) top = k;
      run = sample.get(top);
      bestOn = false;
    }
    const m = FontMatch.match(run.fontName, run.weight, run.flags);
    const size = Math.round(run.size * 10) / 10;
    let x = nx;
    if (bestOn && Math.abs(nx - run.box.l) * s.w < size * 0.8) x = run.box.l;
    return {
      style: { family: m.family, size, argb: run.argb, bold: m.bold, italic: m.italic, lineGap: size * 1.2, align: 0 },
      baseline: bestOn ? run.baseline : null,
      x,
    };
  };

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  E.rotatePage = (i, q) => E.change(null, (d) => d.rotatePage(i, q));
  E.deletePage = (i) => E.change(null, (d) => d.deletePage(i));
  E.movePage = (from, to) => E.change(null, (d) => d.movePage(from, to));
  E.insertBlank = (at) => {
    const ref = E.sizes[Math.max(0, at - 1)] || { w: 595.28, h: 841.89 };
    E.change(null, (d) => d.insertBlankPage(at, ref.w, ref.h));
  };
  E.appendDoc = (other) => E.change(null, (d) => d.appendDocument(other));

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  E.bytes = () => E.doc.save();

  E.saveTo = (path) => {
    const bytes = E.doc.save();
    Host.writeFile(path, bytes);
    E.path = path;
    E.name = Host.baseName(path);
    E.dirty = false;
    E.emit('state');
  };

  return E;
})();
