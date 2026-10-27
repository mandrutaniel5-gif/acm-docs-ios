'use strict';
// Makes the text inside pictures editable: reads it (OCR, offline), paints the
// letters over with the colors around them, and writes real text in the same
// place, size and color. One undo step.

const ImageText = (() => {
  const FIX = { 'ţ': 'ț', 'ş': 'ș', 'Ţ': 'Ț', 'Ş': 'Ș' };
  const fixText = (t) => t.replace(/[ţşŢŞ]/g, (c) => FIX[c]).replace(/\s+/g, ' ').trim();
  let running = false;

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
  // One picture
  // ---------------------------------------------------------------------------

  async function readPicture(page, img, onProgress) {
    const doc = Editor.doc;
    const px = doc.imagePixels(page, img.obj);
    // a picture that covers most of the page is a scanned page: let the reader find titles and columns
    const page0 = img.box && (img.box.r - img.box.l) * (img.box.b - img.box.t) > 0.35;
    // The reader needs letters about 30 px tall: a scanned page is read at ~300 dpi, a small picture enlarged.
    const longest = Math.max(px.width, px.height);
    const want = page0 ? 3300 : 1600;
    let scale = longest < want ? Math.min(page0 ? 4 : 3, want / longest) : 1;
    if (px.width * px.height * scale * scale > 16e6) scale = Math.sqrt(16e6 / (px.width * px.height));
    const png = await encode(toCanvas(px, scale, true), 'image/png');
    const res = await Host.ocr(png, onProgress, { page: !!page0 });
    if (window.__ACM_TEST) window.__ocrDebug = { res, scale };

    const m = img.m; // [a b c d e f]: picture square -> page
    const ptX = m[0] / px.width, ptY = m[3] / px.height;
    const toPage = (x, y) => ({ x: m[4] + m[0] * (x / px.width), y: m[5] + m[3] * (1 - y / px.height) });
    const S = (v) => v / scale;

    // Pieces of text that are read well: runs of good words on one line. Words read badly, dotted
    // lines and check boxes are left in the picture as they are (nothing is erased that is not rewritten).
    const pieces = [];
    for (const par of res.paragraphs) {
      for (const ln of par.lines) {
        const lx0 = S(ln.bbox.x0), lx1 = S(ln.bbox.x1), ly0 = S(ln.bbox.y0), ly1 = S(ln.bbox.y1);
        const lineH = ly1 - ly0;
        const bl = ln.baseline;
        const baseAt = (x) => {
          if (!bl || bl.x1 === bl.x0) return null;
          return S(bl.y0 + (bl.y1 - bl.y0) * ((x * scale - bl.x0) / (bl.x1 - bl.x0)));
        };
        const words = (ln.words || []).map((w) => ({
          text: fixText(w.text || ''), conf: w.conf,
          x0: Math.floor(S(w.bbox.x0)), y0: Math.floor(S(w.bbox.y0)), x1: Math.ceil(S(w.bbox.x1)) - 1, y1: Math.ceil(S(w.bbox.y1)) - 1,
        })).filter((w) => w.text);
        const good = (w) => w.conf >= 70 && /[\p{L}\p{N}]/u.test(w.text) && !LEADER.test(w.text) && w.x1 - w.x0 >= 2 && w.y1 - w.y0 >= 3 && !isBox(px, w);
        let cur = null;
        const close = () => { if (cur) pieces.push(cur); cur = null; };
        for (const w of words) {
          if (!good(w)) { close(); continue; }
          const h = w.y1 - w.y0 + 1;
          if (cur && w.x0 - cur.x1 > Math.max(h * 1.6, (cur.y1 - cur.y0) * 1.6)) close(); // a wide gap: two separate fields
          if (!cur) cur = { words: [], x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, line: ln, lineAll: words.length };
          cur.words.push(w);
          cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1);
        }
        close();
        for (const pc of pieces) {
          if (pc.base != null || pc.line !== ln) continue;
          pc.text = pc.words.map((w) => w.text).join(' ');
          const chars = pc.text.replace(/[^\p{L}\p{N}]/gu, '').length;
          if (chars < 2 && !/\d/.test(pc.text)) { pc.drop = true; continue; }
          if (chars === 2 && Math.min(...pc.words.map((w) => w.conf)) < 80) { pc.drop = true; continue; }
          pc.y0 = Math.round(median(pc.words.map((w) => w.y0)));
          let base = baseAt((pc.x0 + pc.x1) / 2);
          if (!(base > pc.y0 + (pc.y1 - pc.y0) * 0.4 && base <= pc.y1 + 2)) base = pc.y1 - (/[gjpqyșț,;]/.test(pc.text) ? (pc.y1 - pc.y0) * 0.22 : 0);
          pc.base = base;
          pc.whole = pc.words.length === pc.lineAll; // the whole line of the reader is in this piece
          pc.x0Line = lx0; pc.x1Line = lx1;
        }
      }
    }
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].drop) pieces.splice(i, 1);
    if (!pieces.length) return null;

    // Letter size of every piece. The width of the words is the surest measure (the reader's boxes are
    // sometimes much taller than the letters, reaching into the line above); the height is the fallback.
    const fontR = Editor.fontFor({ family: 'Arial', bold: false, italic: false }, pieces.map((pc) => pc.text).join(' '));
    for (const pc of pieces) {
      pc.sizeH = Math.max(2, (pc.base - pc.y0) / topOf(pc.text)); // picture pixels
      const w10 = doc.textWidth(fontR.key, fontR.bytes, 10, pc.text);
      if (w10 > 0 && pc.text.replace(/\s/g, '').length >= 6) pc.sizeW = (10 * (pc.x1 - pc.x0 + 1) * ptX) / w10 / ptY;
    }
    const medSize = median(pieces.map((pc) => pc.sizeW || pc.sizeH));
    for (const pc of pieces) {
      // the height is believed only near the usual size; otherwise the usual size is the reference
      const ref = pc.sizeH > medSize * 0.8 && pc.sizeH < medSize * 1.25 ? pc.sizeH : medSize;
      pc.size = pc.sizeW ? Math.max(ref * 0.75, Math.min(ref * 1.3, pc.sizeW)) : ref;
    }
    // pieces of one line written in one size (short words alone cannot be measured well)
    const byLine = new Map();
    for (const pc of pieces) { if (!byLine.has(pc.line)) byLine.set(pc.line, []); byLine.get(pc.line).push(pc); }
    for (const list of byLine.values()) {
      const measured = list.filter((pc) => pc.sizeW);
      if (!measured.length) continue;
      const ls = median(measured.map((pc) => pc.size));
      for (const pc of list) if (!pc.sizeW || Math.abs(pc.size - ls) < ls * 0.25) pc.size = ls;
    }
    // the letters' own band: from just above the capitals to just under the descenders
    for (const pc of pieces) {
      pc.y0 = Math.max(pc.y0, Math.floor(pc.base - pc.size * 0.98));
      pc.y1 = Math.min(pc.y1, Math.ceil(pc.base + pc.size * 0.3));
      for (const w of pc.words) { w.y0 = Math.max(w.y0, pc.y0); w.y1 = Math.min(w.y1, pc.y1); }
      pc.ink = measureInk(px, pc.x0, pc.y0, pc.x1, pc.y1, pc.base);
    }
    const real = pieces.filter((pc) => pc.ink.contrast >= 40);
    if (!real.length) return null;
    // most text is regular, so a blurry scan does not make everything bold
    const medStem = median(real.map((pc) => pc.ink.stem / pc.size));

    // Lines of a paragraph become one text (easier to edit): same left edge, size, color, regular spacing.
    const blocks = [];
    for (const pc of real) {
      const blk = blocks.length ? blocks[blocks.length - 1] : null;
      const prev = blk && blk[blk.length - 1];
      const sameRun = prev && prev.whole && pc.whole && Math.abs(prev.x0 - pc.x0) < Math.max(4, prev.size * 0.6)
        && Math.abs(prev.size - pc.size) < prev.size * 0.15 && colorClose(prev.ink.argb, pc.ink.argb)
        && pc.base > prev.base && pc.base - prev.base < prev.size * 1.8
        && (blk.length < 2 || Math.abs((pc.base - prev.base) - (prev.base - blk[blk.length - 2].base)) < prev.size * 0.25);
      if (sameRun) blk.push(pc); else blocks.push([pc]);
    }

    // Erase the letters that will be rewritten (only the letters, word by word).
    for (const pc of real) for (const w of pc.words) {
      const pad = Math.max(1, Math.round(pc.size * 0.08));
      eraseInk(px, w.x0 - pad - 1, w.y0 - pad, w.x1 + pad + 1, w.y1 + pad);
    }

    const writes = [];
    for (const blk of blocks) {
      const bold = median(blk.map((l) => l.ink.stem / l.size)) > Math.max(0.118, medStem * 1.3);
      const argb = blk[Math.floor(blk.length / 2)].ink.argb;
      const font = Editor.fontFor({ family: 'Arial', bold, italic: false }, blk.map((l) => l.text).join(' '));
      // a bold font is wider: measured again so each line keeps its width
      const sizes = blk.map((ln) => {
        if (!ln.sizeW || !bold) return ln.size * ptY;
        const w10 = doc.textWidth(font.key, font.bytes, 10, ln.text);
        return w10 > 0 ? Math.min(ln.size * ptY, (10 * (ln.x1 - ln.x0 + 1) * ptX) / w10) : ln.size * ptY;
      });
      const size = Math.max(3, Math.round(Math.min(...sizes) * 10) / 10);
      const first = blk[0];
      const tl = toPage(Math.min(...blk.map((l) => l.x0)), first.y0);
      const topLeft = doc.pointToNorm(page, tl.x, tl.y);
      const lines = blk.map((ln) => {
        const o = toPage(ln.x0, ln.base);
        return { text: ln.text, dx: o.x - tl.x, baseline: tl.y - o.y };
      });
      writes.push({ lines, topLeft, font, size, argb });
    }

    const jpegBytes = px.jpeg && !px.transparent ? await encode(toCanvas(px), 'image/jpeg', 0.92) : null;
    return { img, px, jpegBytes, writes, count: real.length };
  }

  function colorClose(a, b) {
    const d = (s) => Math.abs(((a >>> s) & 255) - ((b >>> s) & 255));
    return d(16) + d(8) + d(0) < 60;
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  function candidates(page, onlyObj) {
    const list = Editor.doc.images(page).filter((i) => (!onlyObj || i.obj === onlyObj));
    return list.filter((i) => i.upright && i.width >= 40 && i.height >= 14);
  }

  /** Makes text in one picture (or all pictures of [pages]) editable. */
  async function run(page, onlyObj, pages) {
    if (running || !Editor.doc) return;
    Pages.closeEditor(true);
    const list = pages || [page];
    running = true;
    let total = 0, skipped = 0;
    try {
      for (let pi = 0; pi < list.length; pi++) {
        const p = list[pi];
        const imgs = candidates(p, onlyObj);
        if (onlyObj && !imgs.length) {
          const any = Editor.doc.images(p).find((i) => i.obj === onlyObj);
          if (any && !any.upright) { UI.toast('Poza este rotită; pot citi doar text drept.', { error: true }); return; }
        }
        const plans = [];
        for (let ii = 0; ii < imgs.length; ii++) {
          const label = (list.length > 1 ? `Pagina ${pi + 1} din ${list.length} · ` : '') + 'Citesc textul din poză…';
          UI.busy(label);
          const plan = await readPicture(p, imgs[ii], (status, prog) => {
            if (/recogniz/i.test(status)) UI.busy(`${label} ${Math.round(prog * 100)}%`);
            else if (/load|init/i.test(status)) UI.busy((list.length > 1 ? `Pagina ${pi + 1} din ${list.length} · ` : '') + 'Pornesc cititorul de text…');
          });
          if (plan) plans.push(plan); else skipped++;
        }
        if (!plans.length) continue;
        UI.busy('Scriu textul…');
        Editor.change([p], (d) => {
          for (const plan of plans) {
            d.replaceImage(p, plan.img.obj, plan.px, plan.jpegBytes);
            for (const wr of plan.writes) {
              d.writeText(p, { remove: [], lines: wr.lines, topLeft: wr.topLeft, fontKey: wr.font.key, fontBytes: wr.font.bytes, size: wr.size, argb: wr.argb });
            }
            total += plan.count;
          }
        });
      }
      Editor.select(null);
      if (total) UI.toast(`Gata: ${total} ${total === 1 ? 'rând de text a devenit editabil' : 'rânduri de text au devenit editabile'}. Dublu-click pe text ca să-l modifici.`, { duration: 6000 });
      else UI.toast('Nu am găsit text clar în poză.');
    } catch (e) {
      console.error(e);
      UI.errorDetails('Nu am putut citi textul din poză', e);
    } finally {
      running = false;
      UI.busy(null);
    }
  }

  /** Pages that look scanned: a big picture and no real text. */
  function scannedPages() {
    const out = [];
    const n = Editor.sizes.length;
    for (let p = 0; p < n; p++) {
      if (p >= 40) break;
      let runs = [];
      try { runs = Editor.runs(p); } catch (e) {}
      if (runs.length > 3) continue;
      const big = Editor.doc.images(p).some((i) => i.upright && (i.box.r - i.box.l) * (i.box.b - i.box.t) > 0.35);
      if (big) out.push(p);
    }
    return out;
  }

  return { run, scannedPages, get running() { return running; } };
})();
