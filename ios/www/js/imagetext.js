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

  /** Colors along one edge just outside the rectangle (smoothed). null when outside the picture. */
  function edge(px, x0, y0, x1, y1, side) {
    const { rgba, width: W, height: H } = px;
    const out = [];
    const horizontal = side === 'top' || side === 'bottom';
    const fixed = side === 'top' ? y0 - 2 : side === 'bottom' ? y1 + 2 : side === 'left' ? x0 - 2 : x1 + 2;
    if (fixed < 0 || (horizontal ? fixed >= H : fixed >= W)) return null;
    const from = horizontal ? x0 : y0, to = horizontal ? x1 : y1;
    const raw = [];
    for (let k = from; k <= to; k++) {
      const x = horizontal ? k : fixed, y = horizontal ? fixed : k;
      const i = (y * W + x) * 4;
      raw.push([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]);
    }
    // median over a small window removes stray dots of neighbouring letters
    const r = 3;
    for (let k = 0; k < raw.length; k++) {
      const win = raw.slice(Math.max(0, k - r), Math.min(raw.length, k + r + 1));
      out.push([0, 1, 2, 3].map((c) => median(win.map((p) => p[c]))));
    }
    return out;
  }

  /** Paints the rectangle with the colors around it (smooth blend between the four sides). */
  function inpaint(px, x0, y0, x1, y1) {
    const { rgba, width: W } = px;
    const T = edge(px, x0, y0, x1, y1, 'top'), B = edge(px, x0, y0, x1, y1, 'bottom');
    const L = edge(px, x0, y0, x1, y1, 'left'), R = edge(px, x0, y0, x1, y1, 'right');
    if (!T && !B && !L && !R) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0 + 1) / (h + 1);
      for (let x = x0; x <= x1; x++) {
        const s = (x - x0 + 1) / (w + 1);
        const i = (y * W + x) * 4;
        for (let c = 0; c < 4; c++) {
          let sum = 0, wt = 0;
          if (T && B) { sum += ((1 - t) * T[x - x0][c] + t * B[x - x0][c]) * 2; wt += 2; } else if (T) { sum += T[x - x0][c]; wt += 1; } else if (B) { sum += B[x - x0][c]; wt += 1; }
          if (L && R) { sum += (1 - s) * L[y - y0][c] + s * R[y - y0][c]; wt += 1; } else if (L) { sum += L[y - y0][c] * 0.5; wt += 0.5; } else if (R) { sum += R[y - y0][c] * 0.5; wt += 0.5; }
          rgba[i + c] = sum / wt;
        }
      }
    }
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

  // ---------------------------------------------------------------------------
  // One picture
  // ---------------------------------------------------------------------------

  async function readPicture(page, img, onProgress) {
    const doc = Editor.doc;
    const px = doc.imagePixels(page, img.obj);
    // Small pictures are enlarged: the reader needs letters at least ~20 px tall.
    const longest = Math.max(px.width, px.height);
    let scale = longest < 1600 ? Math.min(3, 1600 / longest) : 1;
    if (px.width * px.height * scale * scale > 16e6) scale = Math.sqrt(16e6 / (px.width * px.height));
    const png = await encode(toCanvas(px, scale, true), 'image/png');
    // a picture that covers most of the page is a scanned page: let the reader find titles and columns
    const page0 = img.box && (img.box.r - img.box.l) * (img.box.b - img.box.t) > 0.35;
    const res = await Host.ocr(png, onProgress, { page: !!page0 });

    const m = img.m; // [a b c d e f]: picture square -> page
    const ptX = m[0] / px.width, ptY = m[3] / px.height;
    const toPage = (x, y) => ({ x: m[4] + m[0] * (x / px.width), y: m[5] + m[3] * (1 - y / px.height) });

    const lines = [];
    for (const par of res.paragraphs) {
      const group = [];
      for (const ln of par.lines) {
        const text = fixText(ln.text || '');
        if (!text || !/[\p{L}\p{N}]/u.test(text) || ln.conf < 50) continue;
        const x0 = Math.floor(ln.bbox.x0 / scale), y0 = Math.floor(ln.bbox.y0 / scale);
        const x1 = Math.ceil(ln.bbox.x1 / scale) - 1, y1 = Math.ceil(ln.bbox.y1 / scale) - 1;
        if (x1 - x0 < 3 || y1 - y0 < 4) continue;
        let base = ln.baseline ? ln.baseline.y0 / scale : y1 - (y1 - y0) * 0.2;
        if (!(base > y0 && base <= y1 + 2)) base = y1 - (y1 - y0) * 0.2;
        const rowPx = ln.rowHeight ? ln.rowHeight / scale : (y1 - y0);
        const sizePx = Math.max(rowPx / 0.93, (base - y0) / 0.95);
        const ink = measureInk(px, x0, y0, x1, y1, base);
        if (ink.contrast < 40) continue; // too faint to be real text
        group.push({ text, x0, y0, x1, y1, base, sizePx, ink });
      }
      if (group.length) lines.push(group);
    }
    if (!lines.length) return null;

    // Paint the letters over, then measure the real text to write.
    const paras = [];
    for (const group of lines) {
      // Lines of very different size are separate blocks (a title above a paragraph).
      const blocks = [];
      for (const ln of group) {
        const last = blocks.length ? blocks[blocks.length - 1] : null;
        const prev = last && last[last.length - 1];
        if (prev && Math.abs(prev.sizePx - ln.sizePx) < prev.sizePx * 0.18 && prev.ink.argb === ln.ink.argb) last.push(ln);
        else if (prev && Math.abs(prev.sizePx - ln.sizePx) < prev.sizePx * 0.18 && colorClose(prev.ink.argb, ln.ink.argb)) last.push(ln);
        else blocks.push([ln]);
      }
      for (const blk of blocks) paras.push(blk);
    }
    for (const blk of paras) {
      for (const ln of blk) {
        const pad = Math.max(2, Math.round(ln.sizePx * 0.14));
        inpaint(px, Math.max(0, ln.x0 - pad), Math.max(0, ln.y0 - pad), Math.min(px.width - 1, ln.x1 + pad), Math.min(px.height - 1, ln.y1 + pad));
      }
    }

    const writes = [];
    for (const blk of paras) {
      const sizePxMed = median(blk.map((l) => l.sizePx));
      const bold = median(blk.map((l) => l.ink.stem)) / sizePxMed > 0.118;
      const argb = blk[Math.floor(blk.length / 2)].ink.argb;
      const style = { family: 'Arial', bold, italic: false };
      const allText = blk.map((l) => l.text).join(' ');
      const font = Editor.fontFor(style, allText);
      // Size: from the letter height, corrected so each line keeps its width.
      const ks = [];
      for (const ln of blk) {
        const sz = sizePxMed * ptY;
        const wPt = doc.textWidth(font.key, font.bytes, sz, ln.text);
        const target = (ln.x1 - ln.x0 + 1) * ptX;
        if (wPt > 0 && ln.text.length >= 3) ks.push(target / wPt);
      }
      let k = ks.length ? median(ks) : 1;
      k = Math.max(0.75, Math.min(1.3, k));
      const size = Math.max(3, Math.round(sizePxMed * ptY * k * 10) / 10);
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
    return { img, px, jpegBytes, writes, count: paras.reduce((n, b) => n + b.length, 0) };
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
