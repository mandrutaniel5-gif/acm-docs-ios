'use strict';
// Text inside scans and pictures, editable in place.
//  - the picture is read in the background (OCR, offline); nothing on the page changes: the lines it
//    found can be searched, copied and edited like the text of any PDF;
//  - only a line that is edited is replaced: its letters are removed from the picture (the paper, frames,
//    dotted lines and check boxes stay) and the new text is written in the same place, size and color.
//    One undo step.

const ImageText = (() => {
  const FIX = { 'ţ': 'ț', 'ş': 'ș', 'Ţ': 'Ț', 'Ş': 'Ș' };
  const fixText = (t) => t.replace(/[ţşŢŞ]/g, (c) => FIX[c]).replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------------------
  // Pixels helpers
  // ---------------------------------------------------------------------------

  function toCanvas(px, scale = 1, onWhite = false) {
    const src = el('canvas', { width: px.width, height: px.height });
    src.getContext('2d').putImageData(new ImageData(px.rgba, px.width, px.height), 0, 0);
    if (scale === 1 && !onWhite) return src;
    const c = el('canvas', { width: Math.round(px.width * scale), height: Math.round(px.height * scale) });
    const ctx = c.getContext('2d');
    if (onWhite) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function encode(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => {
      if (!b) return reject(new Error('Nu am putut pregăti imaginea.'));
      b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject);
    }, type, quality));
  }

  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  function median(arr) {
    if (!arr.length) return 0;
    const s = Float64Array.from(arr).sort();
    return s[s.length >> 1];
  }

  /** Background color, ink color and stroke thickness of one line of text. */
  function measureInk(px, x0, y0, x1, y1, baseY) {
    const { rgba, width: W } = px;
    const ring = [];
    const push = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < px.height) ring.push((y * W + x) * 4); };
    for (let x = x0; x <= x1; x += 2) { push(x, y0 - 2); push(x, y1 + 2); }
    for (let y = y0; y <= y1; y += 2) { push(x0 - 2, y); push(x1 + 2, y); }
    const bg = [0, 1, 2].map((c) => median(ring.map((i) => rgba[i + c])));
    const bgL = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    let minL = 255, maxL = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const l = lum(rgba, (y * W + x) * 4); if (l < minL) minL = l; if (l > maxL) maxL = l; }
    const dark = bgL - minL >= maxL - bgL;
    const extreme = dark ? minL : maxL;
    const thr = bgL + (extreme - bgL) * 0.55;
    const isInk = (i) => (dark ? lum(rgba, i) <= thr : lum(rgba, i) >= thr);
    const ink = [[], [], []];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (isInk(i)) { ink[0].push(rgba[i]); ink[1].push(rgba[i + 1]); ink[2].push(rgba[i + 2]); }
    }
    const color = ink[0].length ? ink.map(median) : (dark ? [17, 17, 17] : [255, 255, 255]);
    // Thickness of the letters: horizontal ink runs in the middle of the line
    const runs = [];
    const yA = Math.round(y0 + (baseY - y0) * 0.45), yB = Math.round(baseY - (baseY - y0) * 0.12);
    for (let y = Math.max(y0, yA); y <= Math.min(y1, yB); y += 1) {
      let run = 0;
      for (let x = x0; x <= x1 + 1; x++) {
        const on = x <= x1 && isInk((y * W + x) * 4);
        if (on) run++;
        else if (run) { runs.push(run); run = 0; }
      }
    }
    const argb = (0xff000000 | (Math.round(color[0]) << 16) | (Math.round(color[1]) << 8) | Math.round(color[2])) >>> 0;
    return { argb, stem: runs.length ? median(runs) : 0, contrast: Math.abs(extreme - bgL) };
  }

  /** Paper color and ink threshold around one word (the light pixels of a ring just outside it). */
  function paperAround(px, x0, y0, x1, y1) {
    const { rgba, width: W, height: H } = px;
    const ring = [];
    const push = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) ring.push((y * W + x) * 4); };
    for (let x = x0 - 3; x <= x1 + 3; x++) { push(x, y0 - 3); push(x, y1 + 3); }
    for (let y = y0 - 3; y <= y1 + 3; y++) { push(x0 - 3, y); push(x1 + 3, y); }
    if (!ring.length) return null;
    // paper = the lighter half of the ring (dots, lines and neighbouring letters are darker)
    ring.sort((i, j) => lum(rgba, j) - lum(rgba, i));
    const light = ring.slice(0, Math.max(1, Math.ceil(ring.length * 0.5)));
    const color = [0, 1, 2].map((c) => median(light.map((i) => rgba[i + c])));
    return { color, L: 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2] };
  }

  /**
   * Removes only the letters inside a word's box: dark (or, on dark paper, light) pixels become the
   * paper color around them. Everything else (paper texture, frames next to the word) stays.
   */
  function eraseInk(px, x0, y0, x1, y1) {
    const { rgba, width: W, height: H } = px;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    const paper = paperAround(px, x0, y0, x1, y1);
    if (!paper) return;
    let ext = paper.L;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const l = lum(rgba, (y * W + x) * 4); if (Math.abs(l - paper.L) > Math.abs(ext - paper.L)) ext = l; }
    const contrast = ext - paper.L;
    if (Math.abs(contrast) < 30) return;
    const thr = paper.L + contrast * 0.22; // includes the soft edges of the letters
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const inkAt = (x, y) => { const l = lum(rgba, (y * W + x) * 4); return contrast < 0 ? l < thr : l > thr; };
    const mask = new Uint8Array(bw * bh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inkAt(x, y)) mask[(y - y0) * bw + (x - x0)] = 1;
    // frame and table lines crossing the word stay: ink runs that go on well outside the box
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!mask[(y - y0) * bw + (x - x0)]) continue;
        let a = x, b = x;
        while (a > 0 && a > x0 - bw && inkAt(a - 1, y)) a--;
        while (b < W - 1 && b < x1 + bw && inkAt(b + 1, y)) b++;
        if (b - a + 1 > bh * 3 && (a < x0 || b > x1)) for (let k = Math.max(a, x0); k <= Math.min(b, x1); k++) mask[(y - y0) * bw + (k - x0)] = 2;
        x = b;
      }
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (!mask[(y - y0) * bw + (x - x0)]) continue;
        let a = y, b = y;
        while (a > 0 && a > y0 - bh * 2 && inkAt(x, a - 1)) a--;
        while (b < H - 1 && b < y1 + bh * 2 && inkAt(x, b + 1)) b++;
        if (b - a + 1 > bh * 1.6 && (a < y0 || b > y1)) for (let k = Math.max(a, y0); k <= Math.min(b, y1); k++) mask[(k - y0) * bw + (x - x0)] = 2;
        y = b;
      }
    }
    // one pixel more around every letter (blur and JPEG halos)
    const L1 = (v) => v === 1;
    const grown = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const v = mask[y * bw + x];
      if (v === 2) continue;
      if (v === 1 || (x > 0 && L1(mask[y * bw + x - 1])) || (x < bw - 1 && L1(mask[y * bw + x + 1])) || (y > 0 && L1(mask[(y - 1) * bw + x])) || (y < bh - 1 && L1(mask[(y + 1) * bw + x]))) grown[y * bw + x] = 1;
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!grown[y * bw + x]) continue;
      const i = ((y + y0) * W + (x + x0)) * 4;
      rgba[i] = paper.color[0]; rgba[i + 1] = paper.color[1]; rgba[i + 2] = paper.color[2];
    }
  }

  // Arial proportions (of the font size): how high the top of the letters is above the baseline.
  const TALL = /[A-ZĂÂÎȘȚbdfhklt0-9ăâîßÄÖÜ!?/\\(){}[\]|'"#%&@$]/;
  const topOf = (text) => (TALL.test(text) ? 0.73 : /[ăâî]/.test(text) ? 0.7 : 0.53);
  // a check box read as a letter (☐ -> "O", "D", "E", "0"...): square, as tall as capitals, alone
  // a check box read as a letter (☐ -> "O", "D", "CO"...): decided from the picture itself, a square
  // outline with straight sides (letters are round or open)
  const BOXLIKE = /^[ODCGQOo0□☐■▢⊠☒xXEIl|\][]{1,2}$/;
  function isBox(px, w) {
    if (!BOXLIKE.test(w.text)) return false;
    const { rgba, width: W, height: H } = px;
    const x0 = Math.max(0, w.x0 - 1), y0 = Math.max(0, w.y0 - 1), x1 = Math.min(W - 1, w.x1 + 1), y1 = Math.min(H - 1, w.y1 + 1);
    const paper = paperAround(px, x0, y0, x1, y1);
    if (!paper) return false;
    let dark = paper.L;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dark = Math.min(dark, lum(rgba, (y * W + x) * 4));
    if (paper.L - dark < 40) return false;
    const thr = paper.L - (paper.L - dark) * 0.45;
    const ink = (x, y) => lum(rgba, (y * W + x) * 4) < thr;
    // the whole mark: the ink connected to what the reader saw (its box is often only part of it)
    const h0 = w.y1 - w.y0 + 1;
    const rx0 = Math.max(0, w.x0 - h0), rx1 = Math.min(W - 1, w.x1 + h0), ry0 = Math.max(0, w.y0 - h0), ry1 = Math.min(H - 1, w.y1 + h0);
    const rw = rx1 - rx0 + 1;
    const seen = new Uint8Array(rw * (ry1 - ry0 + 1));
    const stack = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ink(x, y)) { stack.push(x, y); seen[(y - ry0) * rw + (x - rx0)] = 1; }
    let ax = x1, ay = y1, bx = x0, by = y0, count = 0;
    while (stack.length && count < 40000) {
      const y = stack.pop(), x = stack.pop();
      count++;
      if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < rx0 || nx > rx1 || ny < ry0 || ny > ry1) continue;
        const k = (ny - ry0) * rw + (nx - rx0);
        if (seen[k] || !ink(nx, ny)) continue;
        seen[k] = 1; stack.push(nx, ny);
      }
    }
    if (ax > bx) return false;
    const bw = bx - ax + 1, bh = by - ay + 1;
    if (bw < 5 || bh < 5 || bw / bh < 0.7 || bw / bh > 1.45) return false;
    const rowFill = (y) => { let n = 0; for (let x = ax; x <= bx; x++) if (ink(x, y)) n++; return n / bw; };
    const colFill = (x) => { let n = 0; for (let y = ay; y <= by; y++) if (ink(x, y)) n++; return n / bh; };
    const top = Math.max(rowFill(ay), rowFill(ay + 1)), bottom = Math.max(rowFill(by), rowFill(by - 1));
    const left = Math.max(colFill(ax), colFill(ax + 1)), right = Math.max(colFill(bx), colFill(bx - 1));
    return top > 0.8 && bottom > 0.8 && left > 0.8 && right > 0.8;
  }
  const LEADER = /[.…_·-]{3,}/; // dotted lines of forms: they stay part of the picture

  // ---------------------------------------------------------------------------
  // Reading one picture: the lines it holds, in page coordinates
  // ---------------------------------------------------------------------------

  async function analyze(page, img, onProgress, pre) {
    const doc = Editor.doc;
    const px = doc.imagePixels(page, img.obj);
    // a picture that covers most of the page is a scanned page: let the reader find titles and columns
    const page0 = img.box && (img.box.r - img.box.l) * (img.box.b - img.box.t) > 0.35;
    let res, scale;
    if (pre && pre.W && Math.abs(pre.W / px.width - pre.H / px.height) < (pre.W / px.width) * 0.02) {
      // read already by the scanner, on the same picture: used as it is (no second wait)
      res = { paragraphs: [{ lines: pre.lines }] };
      scale = pre.W / px.width;
    } else {
      // The reader needs letters about 30 px tall: a scanned page is read at ~300 dpi, a small picture enlarged.
      const longest = Math.max(px.width, px.height);
      const want = page0 ? 3300 : 1600;
      scale = longest < want ? Math.min(page0 ? 4 : 3, want / longest) : 1;
      if (px.width * px.height * scale * scale > 16e6) scale = Math.sqrt(16e6 / (px.width * px.height));
      const png = await encode(toCanvas(px, scale, true), 'image/png');
      res = await Host.ocr(png, onProgress, { page: !!page0 });
    }
    if (window.__ACM_TEST) window.__ocrDebug = { res, scale };

    const m = img.m; // [a b c d e f]: picture square -> page
    const ptX = m[0] / px.width, ptY = m[3] / px.height;
    const toPage = (x, y) => ({ x: m[4] + m[0] * (x / px.width), y: m[5] + m[3] * (1 - y / px.height) });
    const S = (v) => v / scale;

    // Pieces of a line between dotted lines, check boxes and wide gaps (form fields stay separate).
    const pieces = [];
    for (const par of res.paragraphs) {
      for (const ln of par.lines) {
        const bl = ln.baseline;
        const baseAt = (x) => (!bl || bl.x1 === bl.x0 ? null : S(bl.y0 + (bl.y1 - bl.y0) * ((x * scale - bl.x0) / (bl.x1 - bl.x0))));
        const words = (ln.words || []).map((w) => ({
          text: fixText(w.text || ''), conf: w.conf,
          x0: Math.floor(S(w.bbox.x0)), y0: Math.floor(S(w.bbox.y0)), x1: Math.ceil(S(w.bbox.x1)) - 1, y1: Math.ceil(S(w.bbox.y1)) - 1,
        })).filter((w) => w.text);
        const good = (w) => w.conf >= 45 && /[\p{L}\p{N}]/u.test(w.text) && !LEADER.test(w.text) && w.x1 - w.x0 >= 2 && w.y1 - w.y0 >= 3 && !isBox(px, w);
        let cur = null;
        const close = () => {
          if (!cur) return;
          cur.text = cur.words.map((w) => w.text).join(' ');
          const chars = cur.text.replace(/[^\p{L}\p{N}]/gu, '').length;
          const minConf = Math.min(...cur.words.map((w) => w.conf));
          if ((chars >= 2 || /\d/.test(cur.text)) && !(chars === 2 && minConf < 80) && cur.words.some((w) => w.conf >= 70)) {
            cur.y0 = Math.round(median(cur.words.map((w) => w.y0)));
            let base = baseAt((cur.x0 + cur.x1) / 2);
            if (!(base > cur.y0 + (cur.y1 - cur.y0) * 0.4 && base <= cur.y1 + 2)) base = cur.y1 - (/[gjpqyșț,;]/.test(cur.text) ? (cur.y1 - cur.y0) * 0.22 : 0);
            cur.base = base;
            pieces.push(cur);
          }
          cur = null;
        };
        for (const w of words) {
          if (!good(w)) { close(); continue; }
          const h = w.y1 - w.y0 + 1;
          if (cur && w.x0 - cur.x1 > Math.max(h * 1.6, (cur.y1 - cur.y0) * 1.6)) close();
          if (!cur) cur = { words: [], x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, line: ln };
          cur.words.push(w);
          cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1);
        }
        close();
      }
    }
    if (!pieces.length) return [];

    // Letter size: the width of the words is the surest measure (the reader's boxes are sometimes much
    // taller than the letters); the height is the fallback.
    const fontR = Editor.fontFor({ family: 'Arial', bold: false, italic: false }, pieces.map((pc) => pc.text).join(' '));
    for (const pc of pieces) {
      pc.sizeH = Math.max(2, (pc.base - pc.y0) / topOf(pc.text));
      const w10 = doc.textWidth(fontR.key, fontR.bytes, 10, pc.text);
      if (w10 > 0 && pc.text.replace(/\s/g, '').length >= 6) pc.sizeW = (10 * (pc.x1 - pc.x0 + 1) * ptX) / w10 / ptY;
    }
    const medSize = median(pieces.map((pc) => pc.sizeW || pc.sizeH));
    for (const pc of pieces) {
      const ref = pc.sizeH > medSize * 0.8 && pc.sizeH < medSize * 1.25 ? pc.sizeH : medSize;
      pc.size = pc.sizeW ? Math.max(ref * 0.75, Math.min(ref * 1.3, pc.sizeW)) : ref;
    }
    const byLine = new Map();
    for (const pc of pieces) { if (!byLine.has(pc.line)) byLine.set(pc.line, []); byLine.get(pc.line).push(pc); }
    for (const list of byLine.values()) {
      const measured = list.filter((pc) => pc.sizeW);
      if (!measured.length) continue;
      const ls = median(measured.map((pc) => pc.size));
      for (const pc of list) if (!pc.sizeW || Math.abs(pc.size - ls) < ls * 0.25) pc.size = ls;
    }
    for (const pc of pieces) {
      pc.y0 = Math.max(pc.y0, Math.floor(pc.base - pc.size * 0.98));
      pc.y1 = Math.min(pc.y1, Math.ceil(pc.base + pc.size * 0.3));
      for (const w of pc.words) { w.y0 = Math.max(w.y0, pc.y0); w.y1 = Math.min(w.y1, pc.y1); }
      pc.ink = measureInk(px, pc.x0, pc.y0, pc.x1, pc.y1, pc.base);
      pc.paper = paperAround(px, pc.x0, pc.y0, pc.x1, pc.y1);
    }
    const real = pieces.filter((pc) => pc.ink.contrast >= 40);
    const medStem = median(real.map((pc) => pc.ink.stem / pc.size));

    // As text items, like the ones of a PDF (positions kept relative to the picture, which may be replaced).
    const rel = (x, y) => ({ x: x / px.width, y: y / px.height });
    return real.map((pc, n) => {
      const bold = pc.ink.stem / pc.size > Math.max(0.118, medStem * 1.3);
      const size = Math.max(3, Math.round(pc.size * ptY * 10) / 10);
      const tl = doc.pointToNorm(page, ...Object.values(toPage(pc.x0, pc.y0)));
      const br = doc.pointToNorm(page, ...Object.values(toPage(pc.x1 + 1, pc.y1 + 1)));
      const bn = doc.pointToNorm(page, ...Object.values(toPage(pc.x0, pc.base)));
      const pcol = pc.paper ? pc.paper.color.map(Math.round) : [255, 255, 255];
      return {
        id: `scan${page}-${n}-${Math.round(pc.x0)}-${Math.round(pc.y0)}`, page, kind: 'text', scan: true, editable: true,
        box: { l: tl.x, t: tl.y, r: br.x, b: br.y }, objects: [], text: pc.text, firstBaseline: bn.y,
        style: { family: 'Arial', size, argb: pc.ink.argb, bold, italic: false, lineGap: size * 1.2, align: 0 },
        paper: `rgb(${pcol.join(',')})`,
        imgBox: img.box,
        words: pc.words.map((w) => ({ a: rel(w.x0, w.y0), b: rel(w.x1, w.y1), text: w.text })),
      };
    });
  }

  function colorClose(a, b) {
    const d = (s) => Math.abs(((a >>> s) & 255) - ((b >>> s) & 255));
    return d(16) + d(8) + d(0) < 60;
  }

  // ---------------------------------------------------------------------------
  // The text found on each page (kept while the document is open)
  // ---------------------------------------------------------------------------

  const found = new Map(); // page -> { state: 'done', items }
  let toldOnce = false;
  let handoff = null; // what the scanner read, for the PDF it just saved: { path, pages: [{W, H, lines}] }

  function candidates(page, onlyObj) {
    const list = Editor.doc.images(page).filter((i) => (!onlyObj || i.obj === onlyObj));
    return list.filter((i) => i.upright && i.width >= 40 && i.height >= 14);
  }

  /**
   * The page's own text layer (invisible words a scanner — ours or another — keeps in the PDF), as the
   * reader's lines for the picture [img]: no reading needed. null when the page has none.
   */
  function layerLines(page, img, px) {
    let words = [];
    try { words = Editor.doc.hiddenWords(page); } catch (e) { return null; }
    const b = img.box, bw = b.r - b.l, bh = b.b - b.t;
    const pageH = Editor.sizes[page] ? Editor.sizes[page].h : 842;
    const inside = words.filter((w) => (w.l + w.r) / 2 > b.l && (w.l + w.r) / 2 < b.r && w.base > b.t && w.base < b.b);
    if (inside.length < 3) return null;
    const X = (v) => ((v - b.l) / bw) * px.width, Y = (v) => ((v - b.t) / bh) * px.height;
    const conv = inside.map((w) => {
      const sizePx = (w.size / pageH / bh) * px.height;
      const base = Y(w.base);
      return { text: w.text, conf: 90, base, sizePx, bbox: { x0: X(w.l), x1: X(w.r), y0: base - sizePx * 0.75, y1: base + sizePx * 0.22 } };
    }).sort((p, q) => p.base - q.base || p.bbox.x0 - q.bbox.x0);
    // words on the same baseline make a line
    const lines = [];
    for (const w of conv) {
      const ln = lines.find((l) => Math.abs(l.base - w.base) < w.sizePx * 0.35);
      if (ln) ln.words.push(w); else lines.push({ base: w.base, words: [w] });
    }
    return {
      W: px.width, H: px.height,
      lines: lines.map((l) => {
        l.words.sort((p, q) => p.bbox.x0 - q.bbox.x0);
        // a gap wider than a few spaces (a check box, a dotted line) keeps the pieces apart
        const split = [];
        l.words.forEach((w, i) => { const prev = l.words[i - 1]; if (prev && w.bbox.x0 - prev.bbox.x1 > w.sizePx * 0.9) split.push({ text: '·', conf: 0, bbox: { x0: prev.bbox.x1, x1: w.bbox.x0, y0: w.bbox.y0, y1: w.bbox.y1 } }); split.push(w); });
        l.words = split;
        const x0 = Math.min(...l.words.map((w) => w.bbox.x0)), x1 = Math.max(...l.words.map((w) => w.bbox.x1));
        return { bbox: { x0, x1, y0: Math.min(...l.words.map((w) => w.bbox.y0)), y1: Math.max(...l.words.map((w) => w.bbox.y1)) }, baseline: { x0, x1, y0: l.base, y1: l.base }, rowHeight: null, words: l.words };
      }),
    };
  }
  const hasLayer = (page) => { try { return Editor.doc.hiddenWords(page).length >= 3; } catch (e) { return false; } };

  /** The scanner hands over the text it read, so the PDF opens with it ready (read only once). */
  function fromScanner(path, pages) { handoff = { path, pages }; }

  /**
   * Reads the text of [pages] (or of one picture) while the loading bar shows how far it is; when it is
   * done, every line can be edited at once. Nothing on the page changes.
   */
  async function prepare(pages, onlyObj) {
    if (!Editor.doc || !pages.length) return;
    const doc = Editor.doc;
    const pre = handoff && handoff.path && handoff.path === Editor.path ? handoff.pages : null;
    handoff = null;
    let total = 0;
    try {
      for (let k = 0; k < pages.length; k++) {
        const page = pages[k];
        const quick = pre || hasLayer(page);
        const label = (quick ? I18n.t('Pregătesc textul pentru editare…') : I18n.t('Citesc textul din scanare…')) + (pages.length > 1 ? ` ${k + 1}/${pages.length}` : '');
        UI.busy(label);
        let items = [];
        for (const img of candidates(page, onlyObj)) {
          // the text the scanner just read, or the page's own text layer: ready at once; otherwise it is read now
          let given = pre && pre[page];
          if (!given) { const px = doc.imagePixels(page, img.obj); given = layerLines(page, img, px); }
          items.push(...(await analyze(page, img, (st, p) => { if (/recogniz/i.test(st)) UI.busy(`${label} ${Math.round(p * 100)}%`); }, given)));
          if (Editor.doc !== doc) return;
        }
        const prev = found.get(page);
        if (onlyObj && prev) items = prev.items.filter((it) => !items.some((n) => sameBox(n.imgBox, it.imgBox))).concat(items);
        found.set(page, { state: 'done', items });
        total += items.length;
      }
    } catch (e) {
      console.warn('scan text', e);
    } finally {
      UI.busy(null);
    }
    Editor.emit('scan-text');
    if (total && !toldOnce) {
      toldOnce = true;
      UI.toast(Host.mobile ? 'Poți edita textul scanat: atinge de două ori un rând.' : 'Poți edita textul scanat: dublu-click pe un rând.', { duration: 6000 });
    }
  }
  /** One page (or one picture) on request: from the menu or the picture's bar. */
  function read(page, onlyObj) {
    if (onlyObj || state(page) !== 'done') return prepare([page], onlyObj);
    return Promise.resolve();
  }
  const sameBox = (a, b) => Math.abs(a.l - b.l) < 0.002 && Math.abs(a.t - b.t) < 0.002 && Math.abs(a.r - b.r) < 0.002 && Math.abs(a.b - b.b) < 0.002;

  /** Lines of [page] that can be edited, minus those already replaced by real text. */
  function itemsFor(page, pdfItems) {
    const f = found.get(page);
    if (!f || !f.items.length) return [];
    const texts = (pdfItems || []).filter((i) => i.kind === 'text' && !i.scan);
    const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    return f.items.filter((it) => {
      const area = (it.box.r - it.box.l) * (it.box.b - it.box.t);
      return !texts.some((t) => overlap(it.box, t.box) > area * 0.4);
    });
  }
  const state = (page) => (found.get(page) || {}).state || null;
  const pages = () => [...found.keys()];

  /** Search inside the text read from the scans: {page, rects} like the PDF's own search. */
  function search(q, pdfItemsOf, skipPages) {
    const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq = norm(q);
    const out = [];
    if (!nq) return out;
    for (const page of [...found.keys()].sort((a, b) => a - b)) {
      if (skipPages && skipPages.has(page)) continue; // the scanner's hidden text already answers there
      for (const it of itemsFor(page, pdfItemsOf(page))) {
        const t = norm(it.text);
        for (let i = t.indexOf(nq); i >= 0; i = t.indexOf(nq, i + 1)) {
          const k0 = i / t.length, k1 = (i + nq.length) / t.length, w = it.box.r - it.box.l;
          out.push({ page, rects: [{ l: it.box.l + w * k0, t: it.box.t, r: it.box.l + w * k1, b: it.box.b }] });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Replacing one line
  // ---------------------------------------------------------------------------

  /** The scanned line [item] becomes [lines] of real text (empty: the line is only removed). */
  async function replace(page, item, write) {
    const doc = Editor.doc;
    const img = doc.images(page).find((i) => i.upright && item.imgBox && sameBox(i.box, item.imgBox));
    if (!img) throw new Error('Nu mai găsesc poza din care e textul.');
    const px = doc.imagePixels(page, img.obj);
    for (const w of item.words) {
      const x0 = Math.floor(w.a.x * px.width), y0 = Math.floor(w.a.y * px.height), x1 = Math.ceil(w.b.x * px.width), y1 = Math.ceil(w.b.y * px.height);
      const pad = Math.max(1, Math.round((y1 - y0) * 0.1));
      eraseInk(px, x0 - pad - 1, y0 - pad, x1 + pad + 1, y1 + pad);
    }
    const jpegBytes = px.jpeg && !px.transparent ? await encode(toCanvas(px), 'image/jpeg', 0.92) : null;
    if (Editor.doc !== doc) return null;
    let created = null;
    const hidden = doc.hiddenTextIn(page, item.box);
    // a page read just now keeps its text, invisible, in the PDF: searchable everywhere, and editable at
    // once the next time it is opened (no reading again)
    let layer = null;
    if (!hasLayer(page)) {
      const font = Editor.fontFor({ family: 'Arial', bold: false, italic: false }, (found.get(page) || { items: [] }).items.map((i) => i.text).join(' ').slice(0, 4000));
      const words = [];
      for (const it of (found.get(page) || { items: [] }).items) {
        if (it === item) continue;
        const bb = it.imgBox, bw = bb.r - bb.l;
        for (const w of it.words) words.push({ text: w.text, l: bb.l + w.a.x * bw, r: bb.l + w.b.x * bw, base: it.firstBaseline, size: it.style.size });
      }
      if (words.length) layer = { words, font };
    }
    Editor.change([page], (d) => {
      if (layer) d.writeHiddenText(page, layer.words, layer.font.key, layer.font.bytes);
      d.replaceImage(page, img.obj, px, jpegBytes);
      if (hidden.length) d.deleteObjects(page, hidden); // the old words, kept invisible for search, go too
      if (write && write.lines.length) created = d.writeText(page, { remove: [], lines: write.lines, topLeft: write.topLeft, fontKey: write.font.key, fontBytes: write.font.bytes, size: write.size, argb: write.argb });
    });
    if (created && created.length) Editor.selectObject(page, created[0]); else Editor.select(null);
    return created;
  }

  /** Pages that look scanned: a big picture and no real text. */
  function scannedPages() {
    const out = [];
    const n = Editor.sizes.length;
    for (let p = 0; p < n; p++) {
      if (p >= 40) break;
      const big = Editor.doc.images(p).some((i) => i.upright && (i.box.r - i.box.l) * (i.box.b - i.box.t) > 0.35);
      if (!big) continue;
      let texts = [];
      try { texts = Editor.items(p).filter((i) => i.kind === 'text' && !i.scan); } catch (e) {}
      if (texts.length <= 3) out.push(p); // no real (visible) text: a scan
    }
    return out;
  }

  /** A document was opened: its scanned pages are read in the background, the first one first. */
  async function start() {
    found.clear();
    let list = [];
    try { list = scannedPages(); } catch (e) {}
    if (handoff && handoff.path === Editor.path && !handoff.pages) { handoff = null; return; } // scanned without text recognition
    // only what is ready at once (the scanner's text, or a text layer saved in the PDF): nothing is read
    // when the document opens; a page without text is read when one of its lines is first edited
    const fromScan = handoff && handoff.path === Editor.path;
    await prepare(list.filter((p) => fromScan || hasLayer(p)));
  }

  if (typeof Editor !== 'undefined') {
    // pages added, removed, moved or rotated: what was read no longer matches; undo / redo keep it
    // (the text written over a line hides that line, so an undone edit shows the scanned line again)
    let pageCount = 0;
    Editor.on('doc', (info) => {
      const n = Editor.sizes ? Editor.sizes.length : 0;
      if (info && info.history && n === pageCount) return;
      pageCount = n;
      found.clear();
    });
  }

  return { start, read, fromScanner, hasLayer, itemsFor, state, pages, search, replace, scannedPages };
})();
