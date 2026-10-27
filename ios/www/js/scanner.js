'use strict';
// Document scanner: photo -> straight, clean page (like a flatbed scanner).
// Finds the sheet, lets you fix the corners, cleans the paper and saves
// a PDF (with hidden, searchable text) or an editable Word document made
// from the text it reads in the photo.
//
// Speed: the photo is decoded once inside two background workers. One answers
// the screen at once (small previews of every look), the other prepares the
// full-size pages and reads the text while you are still looking at them.
// Every result is kept, so pressing a button again never redoes the work.

const Scanner = (() => {
  const $ = (id) => document.getElementById(id);
  const FILTERS = [['doc', 'Document'], ['color', 'Color'], ['gray', 'Gri'], ['bw', 'Alb-negru'], ['original', 'Original']];
  let pages = []; // see newPage()
  let cur = -1;
  let cropping = null; // {quad} while the corners are being moved
  let isOpen = false;
  let saved = false;
  let wired = false;
  let acting = false; // one result button at a time (a second tap does not start it again)
  let nextId = 1;

  const prefs = (() => { try { return { filter: 'doc', ocr: true, ...JSON.parse(localStorage.getItem('acm.scan') || '{}') }; } catch (e) { return { filter: 'doc', ocr: true }; } })();
  const savePrefs = () => { try { localStorage.setItem('acm.scan', JSON.stringify(prefs)); } catch (e) {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- the two workers
  function lane(name) {
    let worker = null, seq = 0;
    const waits = new Map();
    function start() {
      if (worker !== null) return;
      try {
        if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
        worker = new Worker('js/scancore.js');
        worker.onmessage = (e) => {
          const w = waits.get(e.data.id);
          if (!w) return;
          waits.delete(e.data.id);
          if (e.data.error) w.reject(new Error(e.data.error)); else w.resolve(e.data.result);
        };
        worker.onerror = (ev) => {
          if (ev && ev.preventDefault) ev.preventDefault();
          console.warn('scan worker', name, ev && ev.message);
          const list = [...waits.values()];
          waits.clear();
          try { worker.terminate(); } catch (x) {}
          worker = false;
          for (const w of list) w.reject(new Error('NOPAGE'));
        };
      } catch (e) { worker = false; }
    }
    return {
      call(op, args, transfer) {
        start();
        if (!worker) return sleep(0).then(() => ScanPipe[op](...args)); // same code, on this thread
        return new Promise((resolve, reject) => {
          const id = ++seq;
          waits.set(id, { resolve, reject });
          worker.postMessage({ id, op, args, pipe: true }, transfer || []);
        });
      },
      stop() { if (worker) { try { worker.terminate(); } catch (e) {} } worker = null; for (const w of waits.values()) w.reject(new Error('closed')); waits.clear(); },
    };
  }
  const ui = lane('ui'), bg = lane('bg');

  // ---------------------------------------------------------------- pictures
  async function imageOf(bytes) {
    const url = URL.createObjectURL(new Blob([bytes]));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
  const blobUrl = (bytes) => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));

  const FULL = () => [[0, 0], [1, 0], [1, 1], [0, 1]];

  function newPage(bytes) {
    return {
      id: 'p' + nextId++, bytes, photo: null, // photo: decoded <img> (corners screen)
      quad: FULL(), auto: false, rot: 0, filter: prefs.filter, ver: 1, changed: Date.now(),
      w: 0, h: 0, // size of the straightened page
      prev: new Map(), // `${ver}|${filter}` -> blob url of the quick look
      full: null, fullJob: null, // {key, jpeg, w, h} the page that goes into the PDF
      ocr: null, ocrJob: null, // {ver, data}
    };
  }
  const keyOf = (pg) => `${pg.ver}|${pg.filter}`;

  /** Makes sure a worker still has the photo decoded (it forgets old pages to save memory). */
  async function onLane(L, role, pg, op, args, again) {
    try {
      return await L.call(op, [pg.id + role, ...args]);
    } catch (e) {
      if (again || !/NOPAGE/.test(String(e && e.message))) throw e;
      const img = pg.photo || (pg.photo = await imageOf(pg.bytes));
      const bmp = await createImageBitmap(img);
      await L.call('load', [pg.id + role, bmp, false, role], [bmp]);
      return onLane(L, role, pg, op, args, true);
    }
  }
  const viaUi = (pg, op, ...args) => onLane(ui, 'u', pg, op, args);
  const viaBg = (pg, op, ...args) => onLane(bg, 'b', pg, op, args);

  /** Quick look of [pg] with its current corners, rotation and look. */
  async function preview(pg, filter = pg.filter) {
    const k = `${pg.ver}|${filter}`;
    if (pg.prev.has(k)) return pg.prev.get(k);
    const ver = pg.ver;
    const r = await viaUi(pg, 'preview', pg.quad, pg.rot, filter, ver);
    if (pg.ver !== ver) return null; // changed meanwhile
    const url = blobUrl(r.jpeg);
    pg.prev.set(k, url);
    pg.w = r.fullW || pg.w; pg.h = r.fullH || pg.h;
    return url;
  }
  /** Shows the current page as soon as its quick look exists. */
  async function show(pg) {
    try {
      const url = await preview(pg);
      if (url && pages[cur] === pg && !cropping) { setImg(url); refreshThumb(pg); }
    } catch (e) { console.warn('preview', e); }
  }

  /** The full-size page for the PDF (done once per corners/rotation/look). */
  function ensureFull(pg) {
    const key = keyOf(pg);
    if (pg.full && pg.full.key === key) return Promise.resolve(pg.full);
    if (pg.fullJob && pg.fullJob.key === key) return pg.fullJob.promise;
    const ver = pg.ver;
    const promise = viaBg(pg, 'full', pg.quad, pg.rot, pg.filter, ver).then((r) => {
      const done = { key, jpeg: r.jpeg, w: r.w, h: r.h };
      if (keyOf(pg) === key) { pg.full = done; pg.w = r.w; pg.h = r.h; }
      return done;
    });
    pg.fullJob = { key, promise };
    promise.catch(() => {}).then(() => { if (pg.fullJob && pg.fullJob.key === key) pg.fullJob = null; });
    return promise;
  }

  // ---------------------------------------------------------------- background work
  // two loops that run side by side: quick looks (screen worker) and full pages (background worker)
  const looping = { ui: false, bg: false };
  async function loop(kind) {
    if (looping[kind]) return;
    looping[kind] = true;
    try {
      while (isOpen) {
        const task = kind === 'ui' ? nextUi() : nextBg();
        if (!task) break;
        try { await task(); } catch (e) { if (!/closed/.test(String(e && e.message))) console.warn('scan', kind, e); await sleep(200); }
      }
    } finally { looping[kind] = false; }
  }
  const order = () => [pages[cur], ...pages.filter((p, i) => i !== cur)].filter(Boolean);
  function nextUi() {
    // the other looks of the page on screen, so switching is instant; then a look for every page
    const c = pages[cur];
    if (c && !cropping) for (const [f] of FILTERS) if (!c.prev.has(`${c.ver}|${f}`)) return () => preview(c, f);
    for (const pg of order()) if (!pg.prev.has(keyOf(pg))) return () => preview(pg).then(() => refreshThumb(pg));
    return null;
  }
  function nextBg() {
    for (const pg of order()) if (!(pg.full && pg.full.key === keyOf(pg))) return () => ensureFull(pg);
    return null;
  }

  // reading the text: its own lane (the reader has its own worker), after a short pause
  let reading = false;
  async function readLoop() {
    if (reading) return;
    reading = true;
    try {
      while (isOpen) {
        const order = [pages[cur], ...pages.filter((p, i) => i !== cur)].filter(Boolean);
        const pg = order.find((p) => !(p.ocr && p.ocr.ver === p.ver));
        if (!pg) break;
        const wait = 1200 - (Date.now() - pg.changed);
        if (wait > 0) { await sleep(wait); continue; }
        // the pages for the PDF come first (same worker)
        if (pages.some((p) => !(p.full && p.full.key === keyOf(p)))) { await sleep(150); continue; }
        try { await ensureOcr(pg); } catch (e) { if (!/closed/.test(String(e && e.message))) console.warn('scan ocr', e); await sleep(500); }
      }
    } finally { reading = false; }
  }
  function kick() { loop('ui'); loop('bg'); readLoop(); }
  function changed(pg) {
    pg.ver++;
    pg.changed = Date.now();
    pg.full = null;
    kick();
  }

  // ---------------------------------------------------------------- reading the text (OCR)
  const FIX = { 'ţ': 'ț', 'ş': 'ș', 'Ţ': 'Ț', 'Ş': 'Ș' };
  const fixText = (t) => {
    let x = String(t || '').replace(/[ţşŢŞ]/g, (c) => FIX[c]).replace(/\s+/g, ' ').trim();
    // in numbers and codes: O -> 0, l / I -> 1 next to digits ("5W3O" -> "5W30", "l50,00" -> "150,00")
    if (/\d/.test(x)) x = x.replace(/(?<=\d)[Oo]|(?<![A-Za-z])[Oo](?=\d)/g, '0').replace(/(?<=\d[.,]?)[lI](?=[\d.,]|$)|^[lI](?=\d)/g, '1');
    return x;
  };
  const junk = (w) => (!/[\p{L}\p{N}]/u.test(w.text) && !(w.conf >= 60 && /^[-–—·•/&+=%:;*]{1,2}$/.test(w.text))) || (w.conf < 35 && !/[\p{L}\p{N}]{2,}/u.test(w.text)) ||
    (w.text.length <= 3 && w.conf < 75 && !/^\p{L}{1,3}[.,:]?$/u.test(w.text) && !/^\d{1,3}[.,)]?$/.test(w.text)); // bits of stamps, lines, dots

  // pieces of one word read apart ("FACTUR" + "Ă"): put back together
  function glue(words, rh) {
    const out = [];
    for (const w of words) {
      const p = out[out.length - 1];
      if (p && w.bbox.x0 - p.bbox.x1 < rh * 0.14 && (w.text.length <= 2 || p.text.length <= 2) && /[\p{L}]$/u.test(p.text) && /^[\p{L}]/u.test(w.text)) {
        out[out.length - 1] = { ...p, text: p.text + w.text, conf: Math.min(p.conf, w.conf), bbox: { x0: p.bbox.x0, y0: Math.min(p.bbox.y0, w.bbox.y0), x1: w.bbox.x1, y1: Math.max(p.bbox.y1, w.bbox.y1) } };
      } else out.push(w);
    }
    return out;
  }
  // a single letter much smaller than the line: an accent or a dot read on its own
  const speck = (w, rh) => w.text.length === 1 && /[\p{L}\p{N}]/u.test(w.text) && w.bbox.y1 - w.bbox.y0 < rh * 0.45;

  // the reader works on one picture at a time
  let ocrChain = Promise.resolve();
  const ocrOne = (fn) => { const p = ocrChain.then(fn, fn); ocrChain = p.catch(() => {}); return p; };

  /** Text of a page (read once per corners/rotation, in the background). */
  function ensureOcr(pg) {
    if (pg.ocr && pg.ocr.ver === pg.ver) return Promise.resolve(pg.ocr.data);
    if (pg.ocrJob && pg.ocrJob.ver === pg.ver) return pg.ocrJob.promise;
    const ver = pg.ver;
    const job = { ver, p: 0, promise: null };
    job.promise = ocrOne(async () => {
      if (pg.ver !== ver) throw new Error('STALE');
      const img = await viaBg(pg, 'ocrImage', pg.quad, pg.rot, ver);
      if (pg.ver !== ver) throw new Error('STALE');
      const res = await Host.ocr(img.png, (st, p) => { if (/recogniz/i.test(st)) job.p = p * 0.85; }, { page: true });
      const lines = [];
      for (const par of res.paragraphs || []) {
        par.lines.forEach((l, li) => {
          const rh = l.rowHeight > 0 ? l.rowHeight : 0;
          const words = l.words.map((w) => ({ ...w, text: fixText(w.text) })).filter((w) => w.text && !junk(w) && !speck(w, rh || l.bbox.y1 - l.bbox.y0));
          if (!words.length) return;
          lines.push({ par: par.bbox, first: li === 0, bbox: l.bbox, baseline: l.baseline, rowHeight: rh, words, conf: l.conf });
        });
      }
      try { await reread(pg, ver, img, lines, job); } catch (e) { console.warn('reread', e); }
      for (const l of lines) l.words = glue(l.words, l.rowHeight || l.bbox.y1 - l.bbox.y0);
      bg.call('doneOcr', [pg.id + 'b']).catch(() => {});
      const data = { W: img.W, H: img.H, lines };
      job.p = 1;
      if (pg.ver === ver) pg.ocr = { ver, data };
      return data;
    });
    pg.ocrJob = job;
    job.promise.catch(() => {}).then(() => { if (pg.ocrJob === job) pg.ocrJob = null; });
    return job.promise;
  }

  /**
   * Second look at the lines the reader was unsure about: each part of the line
   * is cut out and read again on its own (one line of text), kept when surer.
   */
  async function reread(pg, ver, img, lines, job) {
    const todo = [];
    for (const l of lines) {
      if (l.conf >= 90 && l.words.every((w) => w.conf >= 80)) continue;
      // parts of the line far apart (e.g. a name on the left, a title on the right)
      const rh = l.rowHeight || l.bbox.y1 - l.bbox.y0;
      let part = null;
      for (const w of l.words) {
        if (part && w.bbox.x0 - part.x1 > rh * 1.6) { todo.push(part); part = null; }
        if (!part) part = { line: l, words: [], x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 };
        part.words.push(w);
        part.x1 = Math.max(part.x1, w.bbox.x1); part.y0 = Math.min(part.y0, w.bbox.y0); part.y1 = Math.max(part.y1, w.bbox.y1);
      }
      if (part) todo.push(part);
    }
    const list = todo.filter((p) => p.words.some((w) => w.conf < 85)).slice(0, 20);
    if (!list.length) return;
    const rects = list.map((p) => {
      const pad = Math.round((p.y1 - p.y0) * 0.45);
      return { x0: Math.max(0, p.x0 - pad), y0: Math.max(0, p.y0 - pad), x1: Math.min(img.W, p.x1 + pad), y1: Math.min(img.H, p.y1 + pad) };
    });
    const pngs = await bg.call('crops', [pg.id + 'b', ver, rects]);
    for (let i = 0; i < list.length; i++) {
      if (pg.ver !== ver) return;
      job.p = 0.85 + (0.15 * i) / list.length;
      const p = list[i], r = rects[i];
      let res;
      try { res = await Host.ocr(pngs[i], null, { line: true }); } catch (e) { continue; }
      const words = (res.paragraphs || []).flatMap((pp) => pp.lines.flatMap((l) => l.words))
        .map((w) => ({ ...w, text: fixText(w.text), bbox: { x0: w.bbox.x0 + r.x0, y0: w.bbox.y0 + r.y0, x1: w.bbox.x1 + r.x0, y1: w.bbox.y1 + r.y0 } }))
        .filter((w) => w.text && !junk(w));
      if (!words.length) continue;
      const before = p.words.reduce((a, w) => a + w.conf, 0) / p.words.length;
      const after = words.reduce((a, w) => a + w.conf, 0) / words.length;
      if (after <= before + 2) continue;
      const L = p.line;
      const k = L.words.indexOf(p.words[0]);
      if (k >= 0) L.words.splice(k, p.words.length, ...words);
    }
  }

  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

  /** PDF page size (points) for a page picture. */
  function pagePt(pg) {
    const r = pg.h / pg.w;
    if (Math.abs(r - Math.SQRT2) < 0.02) return { w: 595.28, h: 841.89 };
    if (Math.abs(1 / r - Math.SQRT2) < 0.02) return { w: 841.89, h: 595.28 };
    if (r >= 1) return { w: 595.28, h: 595.28 * r };
    return { w: 841.89, h: 841.89 * r };
  }

  /** Words for the hidden text layer of a PDF page. */
  function hiddenWords(ocr, ptH) {
    const out = [];
    for (const l of ocr.lines) {
      const lh = l.bbox.y1 - l.bbox.y0;
      const size = Math.max(2, ((l.rowHeight || lh * 0.85) / ocr.H) * ptH);
      const b = l.baseline;
      for (const w of l.words) {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        let base = w.bbox.y1;
        if (b && b.x1 !== b.x0) base = b.y0 + ((b.y1 - b.y0) * (cx - b.x0)) / (b.x1 - b.x0);
        if (!(base > w.bbox.y0) || base > w.bbox.y1 + lh) base = w.bbox.y1;
        out.push({ text: w.text, l: w.bbox.x0 / ocr.W, r: w.bbox.x1 / ocr.W, base: base / ocr.H, size });
      }
    }
    return out;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * Rebuilds the page as a real document: paragraphs, titles, centred lines,
   * side-by-side blocks (as a borderless table). Unsure words are marked.
   */
  function pageHtml(ocr, mark) {
    const L = ocr.lines;
    if (!L.length) return '';
    const W = ocr.W;
    // letter size of a line: the reader's row height (steady even with accents like "Î"), else the box
    const hOf = (l) => l.rowHeight || (l.bbox.y1 - l.bbox.y0) * 0.85;
    const hs = L.filter((l) => l.words.map((w) => w.text).join('').length >= 4).map(hOf);
    const medH = median(hs.length ? hs : L.map(hOf)) || 30;
    const left = pct(L.map((l) => l.bbox.x0), 0.1), right = pct(L.map((l) => l.bbox.x1), 0.9);
    const colW = Math.max(1, right - left);
    const ptPerPx = 595.28 / W;
    const medWord = median(L.flatMap((l) => l.words.filter((w) => w.text.length > 2).map((w) => w.bbox.y1 - w.bbox.y0)));
    const body = Math.max(8, Math.min(16, Math.round(medH * ptPerPx * 2) / 2));
    const word = (w) => (mark && w.conf < 62 ? `<span style="background-color:#fff0a6">${esc(w.text)}</span>` : esc(w.text));
    const segmentsOf = (l) => {
      const segs = [];
      let curS = null;
      for (const w of l.words) {
        const lh = l.rowHeight || medH;
        if (curS && w.bbox.x0 - curS.x1 > Math.max(medH * 2.2, lh * 1.6)) { segs.push(curS); curS = null; }
        if (!curS) curS = { x0: w.bbox.x0, x1: w.bbox.x1, words: [] };
        curS.words.push(w);
        curS.x1 = w.bbox.x1;
      }
      if (curS) segs.push(curS);
      return segs;
    };
    const info = L.map((l) => {
      const text = l.words.map((w) => w.text).join(' ');
      let h = hOf(l);
      if (!l.rowHeight && !/[a-zăâîșțgjpqy,;]/.test(text)) h /= 0.78; // capitals only: no letters below the line
      const big = h / medH;
      const cx = (l.bbox.x0 + l.bbox.x1) / 2;
      const width = l.bbox.x1 - l.bbox.x0;
      let align = 'left';
      const centred = Math.abs(cx - (left + right) / 2) < colW * 0.04 || Math.abs(cx - W / 2) < W * 0.03;
      if (centred && l.bbox.x0 - left > colW * 0.06 && width < colW * 0.92) align = 'center';
      else if (right - l.bbox.x1 < colW * 0.03 && l.bbox.x0 - left > colW * 0.35) align = 'right';
      return { l, text, big, align, segs: segmentsOf(l) };
    });
    const out = [];
    let para = null;
    const flush = () => {
      if (!para) return;
      const st = [];
      if (para.align !== 'left') st.push(`text-align:${para.align}`);
      if (para.space) st.push(`margin-top:${Math.round(para.space)}pt`);
      if (para.align === 'left' && para.ends.length >= 3 && para.ends.slice(0, -1).every((x) => right - x < colW * 0.015)) st.push('text-align:justify');
      if (para.big > 1.3) st.push(`font-size:${Math.min(28, Math.round(body * Math.min(2.2, para.big) * 2) / 2)}pt`, 'font-weight:bold');
      out.push(`<p${st.length ? ` style="${st.join(';')}"` : ''}>${para.html}</p>`);
      para = null;
    };
    let prevBottom = null;
    for (let i = 0; i < info.length; i++) {
      const it = info[i];
      const gap = prevBottom === null ? 0 : it.l.bbox.y0 - prevBottom;
      const space = gap > medH * 1.2 ? Math.min(30, (gap / medH - 0.6) * body * 0.6) : 0;
      // side by side blocks (e.g. "Prestator, ... Beneficiar,"): a borderless table
      if (it.segs.length > 1) {
        flush();
        const rows = [it];
        while (i + 1 < info.length && info[i + 1].segs.length > 1 && info[i + 1].l.bbox.y0 - rows[rows.length - 1].l.bbox.y1 < medH * 1.6) rows.push(info[++i]);
        const starts = [];
        for (const r of rows) for (const sg of r.segs) if (!starts.some((x) => Math.abs(x - sg.x0) < colW * 0.12)) starts.push(sg.x0);
        starts.sort((a, b) => a - b);
        const cols = starts.length;
        const widths = starts.map((x, k) => Math.round((((k + 1 < cols ? starts[k + 1] : right) - x) / colW) * 100));
        let t = `<table style="width:100%${space ? `;margin-top:${Math.round(space)}pt` : ''}"><tbody>`;
        for (const r of rows) {
          const cells = new Array(cols).fill('');
          for (const sg of r.segs) {
            let k = 0, best = Infinity;
            starts.forEach((x, j) => { const d = Math.abs(x - sg.x0); if (d < best) { best = d; k = j; } });
            let part = sg.words.map(word).join(' ');
            const hh = median(sg.words.map((w) => w.bbox.y1 - w.bbox.y0)) / (medWord || 1);
            if (r.big > 1.3 && hh > 1.45) part = `<span style="font-size:${Math.min(28, Math.round(body * Math.min(2.2, hh) * 2) / 2)}pt;font-weight:bold">${part}</span>`;
            cells[k] += (cells[k] ? '<br>' : '') + part;
          }
          t += '<tr>' + cells.map((c, k) => `<td style="width:${widths[k]}%">${c || '<br>'}</td>`).join('') + '</tr>';
        }
        out.push(t + '</tbody></table>');
        prevBottom = rows[rows.length - 1].l.bbox.y1;
        continue;
      }
      const html = it.l.words.map(word).join(' ');
      const prev = info[i - 1];
      const ended = prev && prev.l.bbox.x1 - prev.l.bbox.x0 < colW * 0.8 && /[.:;!?]$/.test(prev.text);
      const sameBlock = para && !ended && para.align === it.align && Math.abs(para.big - it.big) < 0.25 && gap < medH * 0.9;
      if (sameBlock) {
        if (/[-‐]$/.test(para.text) && /^[a-zăâîșț]/.test(it.text)) { para.html = para.html.replace(/[-‐](<\/span>)?$/, '$1') + html; }
        else para.html += ' ' + html;
        para.text = it.text;
        para.ends.push(it.l.bbox.x1);
      } else {
        flush();
        para = { html, text: it.text, align: it.align, big: it.big, space, ends: [it.l.bbox.x1] };
      }
      prevBottom = it.l.bbox.y1;
    }
    flush();
    return `<div style="font-size:${body}pt">` + out.join('') + '</div>';
  }

  // ---------------------------------------------------------------- screen
  function wire() {
    if (wired) return;
    wired = true;
    $('sc-back').addEventListener('click', () => back());
    $('sc-rot').addEventListener('click', () => rotateCur());
    $('sc-crop').addEventListener('click', () => startCrop());
    $('sc-del').addEventListener('click', () => deleteCur());
    $('sc-pdf').addEventListener('click', () => once(savePdf));
    $('sc-word').addEventListener('click', () => once(makeWord));
    $('sc-ocr').addEventListener('change', (e) => { prefs.ocr = e.target.checked; savePrefs(); });
    $('sc-crop-full').addEventListener('click', () => { if (cropping) { cropping.quad = FULL(); drawQuad(); } });
    $('sc-crop-auto').addEventListener('click', () => { if (cropping) { cropping.quad = (pages[cur].autoQuad || FULL()).map((p) => p.slice()); drawQuad(); if (!pages[cur].autoQuad) UI.toast(I18n.t('Nu am găsit marginile foii. Mută colțurile cu degetul.')); } });
    $('sc-crop-cancel').addEventListener('click', () => endCrop(false));
    $('sc-crop-ok').addEventListener('click', () => endCrop(true));
    const fl = $('sc-filters');
    for (const [k, label] of FILTERS) {
      const b = el('button', { class: 'chip', type: 'button', text: label, 'data-f': k });
      b.addEventListener('click', () => setFilter(k));
      fl.append(b);
    }
    window.addEventListener('resize', () => { if (isOpen && cropping) layoutCrop(); });
    wireHandles();
  }
  async function once(fn) {
    if (acting) return;
    acting = true;
    try { await fn(); } finally { acting = false; }
  }

  function setBusy(text, p) {
    const b = $('sc-busy');
    if (!text) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    $('sc-busy-t').textContent = text;
    $('sc-busy-p').style.width = p == null ? '0' : Math.round(p * 100) + '%';
    $('sc-busy-bar').classList.toggle('hidden', p == null);
  }
  function setImg(url) {
    const img = $('sc-img');
    img.style.transform = '';
    if (img.getAttribute('src') !== url) img.src = url;
    img.classList.remove('hidden');
  }

  /** Opens the scanner: [source] 'camera' | 'gallery' | a file path | null (asks). */
  async function start(source) {
    wire();
    if (!(await App.ensureClosed())) return;
    let paths = null;
    if (typeof source === 'string' && source !== 'camera' && source !== 'gallery') paths = [source];
    else {
      const how = source || (Host.mobile ? await chooseSource() : 'gallery');
      if (!how) return;
      paths = await pick(how);
    }
    if (!paths || !paths.length) return;
    pages = []; cur = -1; saved = false; cropping = null; scanRef = null;
    $('sc-ocr').checked = prefs.ocr;
    isOpen = true;
    App.showScreen('scanner');
    Host.setTitle(I18n.t('Scanare') + ' — ACM Docs');
    Host.ocrWarm();
    render();
    await addPhotos(paths);
    if (!pages.length) { close(); App.showHome(); }
  }

  /** Camera or gallery? (phone) */
  function chooseSource() {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      UI.menuAt($('act-scan') || document.body, [
        { label: 'Fă o poză', icon: 'camera', run: () => fin('camera') },
        { label: 'Alege din galerie (una sau mai multe)', icon: 'image', run: () => fin('gallery') },
      ], 'Scanează');
      // closing the menu without choosing
      const t = setInterval(() => { if (!document.querySelector('.menu')) { clearInterval(t); setTimeout(() => fin(null), 50); } }, 300);
    });
  }
  async function pick(how) {
    if (how === 'camera') { const p = await Host.camera(); return p ? [p] : []; }
    return Host.pickImages();
  }

  /** Adds photos as pages (the first one is shown as soon as it is ready). */
  async function addPhotos(paths) {
    let first = true;
    for (const path of paths) {
      if (!isOpen) return;
      if (first) setBusy(I18n.t('Se pregătește pagina…'));
      try {
        const bytes = await Host.readFileAsync(path);
        const pg = newPage(bytes);
        pg.photo = await imageOf(bytes);
        const b1 = await createImageBitmap(pg.photo), b2 = await createImageBitmap(pg.photo);
        const [r] = await Promise.all([
          ui.call('load', [pg.id + 'u', b1, true, 'u'], [b1]),
          bg.call('load', [pg.id + 'b', b2, false, 'b'], [b2]),
        ]);
        if (r.quad) { pg.quad = r.quad; pg.auto = true; pg.autoQuad = r.quad.map((p) => p.slice()); }
        if (r.rot) pg.rot = r.rot; // the text was sideways / upside down in the photo
        pages.push(pg);
        if (first) cur = pages.length - 1;
        render();
        if (first) {
          await show(pg);
          setBusy(null);
          if (!r.quad) UI.toast(I18n.t('Nu am găsit marginile foii. Apasă „Margini” ca să le alegi.'), { duration: 5000 });
        } else preview(pg).then(() => refreshThumb(pg)).catch(() => {});
        first = false;
        kick();
      } catch (e) {
        setBusy(null);
        console.error(e);
        UI.errorDetails(I18n.t('Nu am putut folosi poza'), e);
      }
    }
    setBusy(null);
  }

  function render() {
    const pg = cur >= 0 ? pages[cur] : null;
    $('sc-sub').textContent = pages.length ? `${I18n.t('Pagina')} ${cur + 1} / ${pages.length}` : '';
    const img = $('sc-img');
    const url = pg && pg.prev.get(keyOf(pg));
    if (url) setImg(url); else if (!pg) img.classList.add('hidden');
    for (const b of $('sc-filters').children) b.classList.toggle('on', !!pg && b.dataset.f === pg.filter);
    for (const id of ['sc-rot', 'sc-crop', 'sc-del', 'sc-pdf', 'sc-word']) $(id).disabled = !pg;
    const strip = $('sc-strip');
    strip.innerHTML = '';
    pages.forEach((p, i) => {
      const u = p.prev.get(keyOf(p)) || [...p.prev.values()].pop() || '';
      const t = el('button', { class: 'sc-th' + (i === cur ? ' on' : ''), type: 'button', title: `${I18n.t('Pagina')} ${i + 1}`, 'data-id': p.id }, [el('img', { src: u, alt: '' }), el('span', { text: String(i + 1) })]);
      t.addEventListener('click', () => { if (cur !== i) { cur = i; render(); show(p); kick(); } });
      strip.append(t);
    });
    const add = el('button', { class: 'sc-th add', type: 'button', title: I18n.t('Adaugă o pagină'), html: svg('plus') + `<small>${esc(I18n.t('Pagină'))}</small>` });
    add.addEventListener('click', () => addMenu(add));
    strip.append(add);
    const ca = strip.children[cur];
    if (ca && ca.scrollIntoView) ca.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function refreshThumb(pg) {
    const t = $('sc-strip').querySelector(`[data-id="${pg.id}"] img`);
    const u = pg.prev.get(keyOf(pg));
    if (t && u) t.src = u;
  }

  function addMenu(anchor) {
    if (!Host.mobile) { pick('gallery').then(addPhotos); return; }
    UI.menuAt(anchor, [
      { label: 'Fă o poză', icon: 'camera', run: async () => addPhotos(await pick('camera')) },
      { label: 'Alege din galerie (una sau mai multe)', icon: 'image', run: async () => addPhotos(await pick('gallery')) },
    ], 'Pagină nouă');
  }

  async function setFilter(k) {
    const pg = pages[cur];
    if (!pg || pg.filter === k) return;
    pg.filter = k;
    prefs.filter = k; savePrefs();
    pg.full = null;
    for (const b of $('sc-filters').children) b.classList.toggle('on', b.dataset.f === k);
    if (!pg.prev.has(keyOf(pg))) setBusy(I18n.t('Se curăță pagina…'));
    try { await show(pg); } finally { setBusy(null); }
    kick();
  }

  function rotateCur() {
    const pg = pages[cur];
    if (!pg) return;
    // turn the picture on screen at once; the sharp one follows
    const img = $('sc-img');
    const turned = ((+img.dataset.turn || 0) + 90);
    img.dataset.turn = turned;
    img.style.transition = 'transform .18s';
    img.style.transform = `rotate(${turned}deg) scale(${pg.h && pg.w ? Math.min(pg.w, pg.h) / Math.max(pg.w, pg.h) : 0.75})`;
    pg.rot = (pg.rot + 1) % 4;
    [pg.w, pg.h] = [pg.h, pg.w];
    changed(pg);
    clearTimeout(rotateCur.t);
    rotateCur.t = setTimeout(async () => {
      await show(pg);
      img.style.transition = ''; img.dataset.turn = 0;
    }, 120);
  }

  async function deleteCur() {
    if (cur < 0) return;
    if (!(await UI.confirm(I18n.t('Ștergi pagina?'), null, I18n.t('Șterge')))) return;
    const [pg] = pages.splice(cur, 1);
    forget(pg);
    cur = Math.min(cur, pages.length - 1);
    render();
    if (pages[cur]) show(pages[cur]);
    if (!pages.length) addMenu($('sc-strip').lastChild);
  }
  function forget(pg) {
    if (!pg) return;
    for (const u of pg.prev.values()) URL.revokeObjectURL(u);
    ui.call('drop', [pg.id + 'u']).catch(() => {});
    bg.call('drop', [pg.id + 'b']).catch(() => {});
  }

  // ---- corners
  let disp = null; // {x, y, w, h, k} where the photo is drawn on the stage
  async function startCrop() {
    const pg = pages[cur];
    if (!pg) return;
    if (!pg.photo) pg.photo = await imageOf(pg.bytes);
    cropping = { quad: pg.quad.map((p) => p.slice()) };
    document.getElementById('scanner').classList.add('cropping');
    layoutCrop();
  }
  function layoutCrop() {
    const img = pages[cur] && pages[cur].photo;
    if (!img) return;
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const stage = $('sc-stage'), r = stage.getBoundingClientRect();
    const pad = 22;
    const k = Math.min((r.width - pad * 2) / sw, (r.height - pad * 2) / sh);
    const w = Math.round(sw * k), h = Math.round(sh * k);
    disp = { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w, h, k, img };
    const cv = $('sc-cv');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    Object.assign(cv.style, { left: disp.x + 'px', top: disp.y + 'px', width: w + 'px', height: h + 'px' });
    const x = cv.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, cv.width, cv.height);
    const sv = $('sc-svg');
    sv.setAttribute('width', r.width); sv.setAttribute('height', r.height);
    sv.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    drawQuad();
  }
  function drawQuad() {
    if (!cropping || !disp) return;
    const pts = cropping.quad.map(([x, y]) => [disp.x + x * disp.w, disp.y + y * disp.h]);
    const sv = $('sc-svg');
    const poly = pts.map((p) => p.join(',')).join(' ');
    const W = sv.getAttribute('width'), H = sv.getAttribute('height');
    sv.innerHTML = `<path class="shade" fill-rule="evenodd" d="M0 0H${W}V${H}H0Z M${pts.map((p) => p.join(' ')).join(' L')}Z"/>` +
      `<polygon class="edge" points="${poly}"/>` +
      pts.map((p, i) => `<circle class="hit" data-k="${i}" cx="${p[0]}" cy="${p[1]}" r="26"/><circle class="knob" cx="${p[0]}" cy="${p[1]}" r="11"/>`).join('');
  }
  function wireHandles() {
    const sv = $('sc-svg');
    let drag = null;
    sv.addEventListener('pointerdown', (e) => {
      if (!cropping) return;
      const r = sv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      let k = -1, best = 48;
      cropping.quad.forEach(([x, y], i) => { const d = Math.hypot(disp.x + x * disp.w - px, disp.y + y * disp.h - py); if (d < best) { best = d; k = i; } });
      if (k < 0) return;
      e.preventDefault();
      sv.setPointerCapture(e.pointerId);
      const [qx, qy] = cropping.quad[k];
      drag = { k, dx: disp.x + qx * disp.w - px, dy: disp.y + qy * disp.h - py };
      loupe(disp.x + qx * disp.w, disp.y + qy * disp.h);
    });
    sv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = sv.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left + drag.dx - disp.x) / disp.w));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top + drag.dy - disp.y) / disp.h));
      cropping.quad[drag.k] = [x, y];
      drawQuad();
      loupe(disp.x + x * disp.w, disp.y + y * disp.h);
    });
    const up = () => { drag = null; $('sc-loupe').classList.add('hidden'); };
    sv.addEventListener('pointerup', up);
    sv.addEventListener('pointercancel', up);
  }
  /** Magnifier above the finger, so the corner can be placed exactly. */
  function loupe(x, y) {
    const lp = $('sc-loupe');
    lp.classList.remove('hidden');
    const S = 120, Z = 2.6;
    const c = lp.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = S * dpr;
    const g = c.getContext('2d');
    const img = disp.img;
    const sx = ((x - disp.x) / disp.w) * img.naturalWidth, sy = ((y - disp.y) / disp.h) * img.naturalHeight;
    const span = (S / Z) / disp.k;
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, sx - span / 2, sy - span / 2, span, span, 0, 0, c.width, c.height);
    g.strokeStyle = '#2f7cf6'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(c.width / 2, c.height / 2 - 14 * dpr); g.lineTo(c.width / 2, c.height / 2 + 14 * dpr); g.moveTo(c.width / 2 - 14 * dpr, c.height / 2); g.lineTo(c.width / 2 + 14 * dpr, c.height / 2); g.stroke();
    const stage = $('sc-stage').getBoundingClientRect();
    let ly = y - S - 46;
    if (ly < 6) ly = y + 46;
    const lx = Math.max(6, Math.min(stage.width - S - 6, x - S / 2));
    Object.assign(lp.style, { left: lx + 'px', top: ly + 'px' });
  }
  async function endCrop(apply) {
    const pg = pages[cur];
    const q = cropping && cropping.quad;
    cropping = null;
    document.getElementById('scanner').classList.remove('cropping');
    $('sc-svg').innerHTML = '';
    if (!apply || !pg || !q) return;
    const area = Math.abs((q[0][0] * q[1][1] - q[1][0] * q[0][1]) + (q[1][0] * q[2][1] - q[2][0] * q[1][1]) + (q[2][0] * q[3][1] - q[3][0] * q[2][1]) + (q[3][0] * q[0][1] - q[0][0] * q[3][1])) / 2;
    if (area < 0.01) { UI.toast(I18n.t('Zona aleasă e prea mică.'), { error: true }); return; }
    if (JSON.stringify(q) === JSON.stringify(pg.quad)) return; // nothing moved: nothing to redo
    pg.quad = q; pg.auto = false;
    changed(pg);
    setBusy(I18n.t('Se îndreaptă pagina…'));
    try { await show(pg); } catch (e) { UI.errorDetails(I18n.t('Nu am putut prelucra poza'), e); } finally { setBusy(null); }
  }

  // ---- results
  const stamp = () => {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}`;
  };

  /** Waits for what the background has not finished yet (usually nothing), with progress. */
  async function finish(withText) {
    const n = pages.length;
    const progress = () => {
      let done = 0;
      for (const pg of pages) {
        const f = pg.full && pg.full.key === keyOf(pg) ? 1 : 0;
        const t = !withText ? 1 : pg.ocr && pg.ocr.ver === pg.ver ? 1 : pg.ocrJob && pg.ocrJob.ver === pg.ver ? pg.ocrJob.p : 0;
        done += withText ? f * 0.15 + t * 0.85 : f;
      }
      return done / n;
    };
    const ready = () => pages.every((pg) => pg.full && pg.full.key === keyOf(pg) && (!withText || (pg.ocr && pg.ocr.ver === pg.ver)));
    if (ready()) return;
    const label = withText ? I18n.t('Se citește textul…') : I18n.t('Se pregătesc paginile…');
    setBusy(label, progress());
    const tick = setInterval(() => setBusy(label, progress()), 250);
    try {
      for (const pg of pages) {
        while (!(pg.full && pg.full.key === keyOf(pg))) await ensureFull(pg);
        if (withText) while (!(pg.ocr && pg.ocr.ver === pg.ver)) { try { await ensureOcr(pg); } catch (e) { if (!/STALE/.test(String(e && e.message))) throw e; } }
      }
    } finally { clearInterval(tick); }
  }

  const textReady = (pg) => !!(pg.ocr && pg.ocr.ver === pg.ver);

  /**
   * Saves at once. When the text of some page is still being read, the PDF is
   * saved with the pictures now and the hidden text is added a few seconds later
   * (the file is updated quietly; nothing to wait for).
   */
  /** One scan of the plan per scanning session, whatever comes out of it (PDF or document). */
  async function planOk() {
    if (typeof Plan === 'undefined') return true;
    if (!scanRef) scanRef = Date.now() + '-' + Math.random();
    return Plan.allow('scans', scanRef);
  }
  let scanRef = null;

  async function savePdf() {
    if (!pages.length) return;
    if (!(await planOk())) return;
    let doc = null;
    try {
      // the text is read before the PDF appears (the bar shows it): then it opens ready to edit
      await finish(!!prefs.ocr);
      setBusy(I18n.t('Se salvează…'));
      await sleep(16);
      const list = pages.map((pg) => { const pt = pagePt(pg.full); return { jpeg: pg.full.jpeg, ptW: pt.w, ptH: pt.h }; });
      doc = PDF.Doc.fromJpegs(list);
      const later = false;
      if (prefs.ocr) addText(doc, pages.map((pg) => pg.ocr.data), list);
      const bytes = doc.save();
      const dir = Host.join(await Host.specialDir('documents'), 'Scanări');
      Host.mkdirp(dir);
      let path = Host.join(dir, `Scan ${stamp()}.pdf`);
      for (let n = 2; Host.exists(path); n++) path = Host.join(dir, `Scan ${stamp()} (${n}).pdf`);
      Host.writeFile(path, bytes);
      saved = true;
      setBusy(null);
      const keep = later ? pages.slice() : null;
      close(!!keep);
      ImageText.fromScanner(path, prefs.ocr ? pages.map((pg) => pg.ocr && pg.ocr.data) : null);
      await App.openPath(path);
      UI.toast(I18n.t('PDF salvat în') + ' ' + (Host.mobile ? (Host.info.platform === 'ios' ? I18n.t('Fișiere › ACM Docs › Scanări') : 'Documents/ACM Docs/Scanări') : dir));
      if (keep) textLater(path, keep, list);
    } catch (e) {
      setBusy(null);
      console.error(e);
      UI.errorDetails(I18n.t('Nu am putut crea PDF-ul'), e);
    } finally {
      if (doc) try { doc.close(); } catch (e) {}
    }
  }
  function addText(doc, all, list) {
    const text = all.flatMap((o) => o.lines.flatMap((l) => l.words.map((w) => w.text))).join(' ');
    const font = SystemFonts.findTrueType('Arial', false, false, text.slice(0, 4000) || 'ăâîșț');
    if (font) all.forEach((o, i) => doc.writeHiddenText(i, hiddenWords(o, list[i].ptH), font.key, font.bytes));
    return !!font;
  }
  /** Finishes reading the text after the PDF was saved, then adds it to the file. */
  async function textLater(path, list, sizes) {
    try {
      const all = [];
      for (const pg of list) {
        while (!textReady(pg)) { try { await ensureOcr(pg); } catch (e) { if (!/STALE/.test(String(e && e.message))) throw e; } }
        all.push(pg.ocr.data);
      }
      if (Editor.doc && Editor.path === path) {
        // open in the editor: add the words there (only if the pages were not rearranged meanwhile)
        if (Editor.sizes.length !== list.length) return;
        if (!addText(Editor.doc, all, sizes)) return;
        if (!Editor.dirty) Host.writeFile(path, Editor.doc.save());
        for (let i = 0; i < list.length; i++) Editor.emit('page', i);
      } else {
        const d = PDF.Doc.open(Host.readFile(path));
        try { if (addText(d, all, sizes)) Host.writeFile(path, d.save()); } finally { d.close(); }
      }
      UI.toast(I18n.t('Textul din PDF e gata: îl poți căuta și copia.'));
    } catch (e) {
      console.warn('text later', e);
    } finally {
      if (!isOpen) bg.call('dropAll', []).catch(() => {});
    }
  }

  async function makeWord() {
    if (!pages.length) return;
    if (!(await planOk())) return;
    try {
      await finish(true);
      setBusy(I18n.t('Se așază documentul…'));
      await sleep(16);
      const all = pages.map((pg) => pg.ocr.data);
      const parts = all.map((o) => pageHtml(o, true)).filter(Boolean);
      if (!parts.length) { setBusy(null); UI.toast(I18n.t('Nu am găsit text în poză. Încearcă o poză mai clară, de aproape și cu lumină bună.'), { error: true, duration: 7000 }); return; }
      const html = parts.join('<hr class="pb">');
      const unsure = all.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.words.filter((w) => w.conf < 62).length, 0), 0);
      setBusy(null);
      saved = true;
      close();
      await Writer.open(null, html, 'html', `Scan ${stamp()}.docx`);
      UI.toast(unsure ? `${I18n.t('Documentul e gata. Verifică cuvintele marcate cu galben')} (${unsure}).` : I18n.t('Documentul e gata și poate fi editat.'), { duration: 7000 });
    } catch (e) {
      setBusy(null);
      console.error(e);
      UI.errorDetails(I18n.t('Nu am putut citi textul'), e);
    }
  }

  // ---- leaving
  async function back() {
    if (cropping) { endCrop(false); return; }
    if (pages.length && !saved && !(await UI.confirm(I18n.t('Renunți la scanare?'), I18n.t('Paginile scanate nu au fost salvate.'), I18n.t('Renunță')))) return;
    close();
    App.showHome();
  }
  /** [keepText]: the background keeps the pages until their text has been read. */
  function close(keepText) {
    isOpen = false;
    $('scanner').classList.add('hidden');
    for (const pg of pages) for (const u of pg.prev.values()) URL.revokeObjectURL(u);
    pages = []; cur = -1; cropping = null;
    ui.call('dropAll', []).catch(() => {});
    if (!keepText) bg.call('dropAll', []).catch(() => {});
    document.getElementById('scanner').classList.remove('cropping');
    setBusy(null);
  }

  return { start, back, get isOpen() { return isOpen; }, _pageHtml: pageHtml, _pages: () => pages };
})();
