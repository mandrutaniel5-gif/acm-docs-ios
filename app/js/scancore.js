'use strict';
// Picture work for the document scanner: finds the sheet of paper in a photo,
// straightens it (as if it lay flat on a scanner) and cleans it up (white paper,
// dark crisp text, no shadows). Plain math on pixels, no libraries.
// Runs inside a background Worker when possible, so the screen never freezes.

const ScanCore = (() => {
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  /** Average over a (2r+1)² square, separable. src: any numeric array. Returns Float32Array. */
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / d;
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / d;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  function otsu(vals, n) {
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[vals[i]]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = -1, t = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }

  // mask grow / shrink by r pixels
  function dilate(m, w, h, r) { const b = boxBlur(m, w, h, r); const o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = b[i] > 0.001 ? 1 : 0; return o; }
  function erode(m, w, h, r) { const b = boxBlur(m, w, h, r); const o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = b[i] > 0.999 ? 1 : 0; return o; }

  function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
    return Math.abs(a) / 2;
  }

  function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  /** Four corners (tl, tr, br, bl) of the biggest four-sided shape inside a convex outline. */
  function quadOf(h) {
    let tl = h[0], tr = h[0], br = h[0], bl = h[0];
    for (const p of h) {
      if (p[0] + p[1] < tl[0] + tl[1]) tl = p;
      if (p[0] + p[1] > br[0] + br[1]) br = p;
      if (p[0] - p[1] > tr[0] - tr[1]) tr = p;
      if (p[1] - p[0] > bl[1] - bl[0]) bl = p;
    }
    const q = [tl, tr, br, bl];
    for (let it = 0; it < 3; it++) {
      let changed = false;
      for (let k = 0; k < 4; k++) {
        let best = polyArea(q), bp = q[k];
        for (const p of h) {
          const old = q[k]; q[k] = p;
          const a = polyArea(q);
          if (a > best + 0.5 && convex(q)) { best = a; bp = p; }
          q[k] = old;
        }
        if (bp !== q[k]) { q[k] = bp; changed = true; }
      }
      if (!changed) break;
    }
    return q;
  }

  function convex(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-9) return false;
      const s = z > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }

  function anglesOk(q) {
    for (let i = 0; i < 4; i++) {
      const p = q[(i + 3) % 4], c = q[i], n = q[(i + 1) % 4];
      const ax = p[0] - c[0], ay = p[1] - c[1], bx = n[0] - c[0], by = n[1] - c[1];
      const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
      const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      if (deg < 45 || deg > 135) return false;
    }
    return true;
  }

  /** Best paper-like region of a 0/1 mask -> {quad, score} or null. */
  function regionQuad(mask, w, h) {
    const n = w * h, lab = new Int32Array(n).fill(-1), stack = new Int32Array(n);
    let best = null;
    const cx = w / 2, cy = h / 2;
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || lab[s] >= 0) continue;
      let sp = 0, area = 0, center = false;
      const minX = new Int32Array(h).fill(w), maxX = new Int32Array(h).fill(-1);
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        area++;
        if (x < minX[y]) minX[y] = x;
        if (x > maxX[y]) maxX[y] = x;
        if (Math.abs(x - cx) < w * 0.12 && Math.abs(y - cy) < h * 0.12) center = true;
        if (x > 0 && mask[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] && lab[i - w] < 0) { lab[i - w] = id; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && lab[i + w] < 0) { lab[i + w] = id; stack[sp++] = i + w; }
      }
      id++;
      if (area < n * 0.1) continue;
      const pts = [];
      for (let y = 0; y < h; y++) if (maxX[y] >= 0) { pts.push([minX[y], y]); if (maxX[y] !== minX[y]) pts.push([maxX[y] + 1, y]); }
      if (pts.length < 8) continue;
      const hl = hull(pts);
      if (hl.length < 4) continue;
      const q = quadOf(hl);
      const qa = polyArea(q);
      if (!convex(q) || !anglesOk(q) || qa < n * 0.12) continue;
      const fill = Math.min(1, area / qa);
      if (fill < 0.82) continue;
      const score = qa * Math.pow(fill, 4) * (center ? 1.4 : 1) * (qa > n * 0.985 ? 0.5 : 1);
      if (!best || score > best.score) best = { quad: q, score };
    }
    return best;
  }

  // ---- straight edges of the paper (works on light tables too) ----

  function gradients(L, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = L[i - w - 1], b = L[i - w], c = L[i - w + 1], d = L[i - 1], f = L[i + 1], g = L[i + w - 1], hh = L[i + w], k = L[i + w + 1];
        const X = c + 2 * f + k - a - 2 * d - g, Y = g + 2 * hh + k - a - 2 * b - c;
        gx[i] = X; gy[i] = Y; mag[i] = Math.hypot(X, Y);
      }
    }
    return { gx, gy, mag };
  }

  function houghLines(G, w, h, thr) {
    const NT = 180, diag = Math.ceil(Math.hypot(w, h)), NR = diag * 2 + 1;
    const acc = new Float32Array(NT * NR);
    const cs = new Float32Array(NT), sn = new Float32Array(NT);
    for (let t = 0; t < NT; t++) { cs[t] = Math.cos((t * Math.PI) / NT); sn[t] = Math.sin((t * Math.PI) / NT); }
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x, m = G.mag[i];
        if (m < thr) continue;
        // only angles close to the edge direction vote (fast and clean)
        let t0 = Math.round((Math.atan2(G.gy[i], G.gx[i]) * NT) / Math.PI);
        for (let dt = -6; dt <= 6; dt++) {
          let t = t0 + dt;
          t = ((t % NT) + NT) % NT;
          const r = Math.round(x * cs[t] + y * sn[t]) + diag;
          acc[t * NR + r] += Math.min(m, thr * 3);
        }
      }
    }
    const peaks = [];
    const used = new Uint8Array(NT * NR);
    for (let k = 0; k < 24; k++) {
      let best = 0, bi = -1;
      for (let i = 0; i < acc.length; i++) if (!used[i] && acc[i] > best) { best = acc[i]; bi = i; }
      if (bi < 0 || best <= 0) break;
      const t = (bi / NR) | 0, r = (bi % NR) - diag;
      peaks.push({ t: (t * Math.PI) / NT, r, v: best });
      for (let dt = -7; dt <= 7; dt++) for (let dr = -10; dr <= 10; dr++) {
        let tt = t + dt, rr = r + diag + dr;
        if (tt < 0) { tt += NT; rr = 2 * diag - rr; } else if (tt >= NT) { tt -= NT; rr = 2 * diag - rr; }
        if (rr >= 0 && rr < NR) used[tt * NR + rr] = 1;
      }
    }
    return peaks;
  }

  function meet(a, b) {
    const c1 = Math.cos(a.t), s1 = Math.sin(a.t), c2 = Math.cos(b.t), s2 = Math.sin(b.t);
    const det = c1 * s2 - s1 * c2;
    if (Math.abs(det) < 1e-6) return null;
    return [(a.r * s2 - b.r * s1) / det, (c1 * b.r - c2 * a.r) / det];
  }

  /** Share of a quad's outline that lies on a strong edge (0..1). */
  function support(G, w, h, q, thr) {
    let hit = 0, all = 0;
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = q[k], [x1, y1] = q[(k + 1) % 4];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      const steps = Math.max(8, Math.round(len / 2));
      for (let s = 1; s < steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
        if (x < 2 || y < 2 || x > w - 3 || y > h - 3) continue; // paper cut by the photo border
        all++;
        let ok = false;
        for (let d = -2; d <= 2 && !ok; d++) {
          const i = Math.round(y + ny * d) * w + Math.round(x + nx * d);
          if (Math.abs(G.gx[i] * nx + G.gy[i] * ny) > thr) ok = true;
        }
        if (ok) hit++;
      }
    }
    return all ? hit / all : 0;
  }

  function lineQuads(G, w, h, thr) {
    const lines = houghLines(G, w, h, thr);
    const H = [], V = [];
    for (const l of lines) {
      const deg = (l.t * 180) / Math.PI;
      if (Math.abs(deg - 90) < 35) H.push(l); else if (deg < 35 || deg > 145) V.push(l);
    }
    const out = [];
    for (let a = 0; a < H.length; a++) for (let b = a + 1; b < H.length; b++) {
      for (let c = 0; c < V.length; c++) for (let d = c + 1; d < V.length; d++) {
        const p = [meet(H[a], V[c]), meet(H[a], V[d]), meet(H[b], V[d]), meet(H[b], V[c])];
        if (p.some((x) => !x || x[0] < -w * 0.05 || x[1] < -h * 0.05 || x[0] > w * 1.05 || x[1] > h * 1.05)) continue;
        out.push(order(p));
      }
    }
    return out;
  }

  /** tl, tr, br, bl order for any four corners. */
  function order(p) {
    const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
    const s = p.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    // start from the corner closest to top-left
    let k = 0, best = Infinity;
    for (let i = 0; i < 4; i++) { const v = s[i][0] + s[i][1]; if (v < best) { best = v; k = i; } }
    return [s[k], s[(k + 1) % 4], s[(k + 2) % 4], s[(k + 3) % 4]];
  }

  /**
   * Finds the sheet of paper. rgba: small picture (≈500 px). Returns corners
   * [[x,y] tl, tr, br, bl] as fractions of the picture, or null.
   */
  function detect(rgba, w, h) {
    const n = w * h;
    const L = new Float32Array(n), S = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      S[i] = L[i] - 1.2 * (mx - mn); // paper: bright and without color
    }
    const cands = [];
    for (const ch of [S, L]) {
      const bl = boxBlur(ch, w, h, 2);
      const u8 = new Uint8Array(n);
      for (let i = 0; i < n; i++) u8[i] = clamp(Math.round(bl[i]));
      const t = otsu(u8, n);
      let m = new Uint8Array(n);
      for (let i = 0; i < n; i++) m[i] = u8[i] > t ? 1 : 0;
      m = erode(dilate(m, w, h, 3), w, h, 3); // fill the text inside the paper
      m = dilate(erode(m, w, h, 2), w, h, 2); // cut thin bridges to the background
      const r = regionQuad(m, w, h);
      if (r) cands.push(r.quad);
    }
    // straight edges (blurred so the letters do not count)
    const G = gradients(boxBlur(boxBlur(L, w, h, 1), w, h, 1), w, h);
    const mags = [];
    for (let i = 0; i < n; i += 7) mags.push(G.mag[i]);
    mags.sort((a, b) => a - b);
    const thr = Math.max(14, mags[Math.floor(mags.length * 0.9)] || 0);
    for (const q of lineQuads(G, w, h, thr)) cands.push(q);
    let best = null;
    for (const q of cands) {
      if (!convex(q) || !anglesOk(q)) continue;
      const area = polyArea(q) / n;
      if (area < 0.12) continue;
      const sup = support(G, w, h, q, thr * 0.5);
      if (sup < 0.45) continue;
      const score = sup * sup * Math.sqrt(area);
      if (!best || score > best.score) best = { q, score };
    }
    if (!best) return null;
    return best.q.map(([x, y]) => [Math.max(0, Math.min(1, x / w)), Math.max(0, Math.min(1, y / h))]);
  }

  /** Projective map from the unit square to a quad (tl, tr, br, bl in pixels). */
  function squareToQuad(q) {
    const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
      a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = 0; hh = 0;
    } else {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den;
      hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0;
      d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    return { a, b, c, d, e, f, g, h: hh };
  }

  /**
   * True width/height of the paper from its corners in the photo (Zhang & He:
   * the camera's focal length is worked out from the perspective). null when the
   * photo was taken straight from above (then the plain side lengths are right).
   */
  function realRatio(q, cx, cy) {
    const m = (p) => [p[0] - cx, p[1] - cy, 1];
    const m1 = m(q[0]), m2 = m(q[1]), m3 = m(q[3]), m4 = m(q[2]); // tl, tr, bl, br
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
    const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    if (Math.abs(n2[2] * n3[2]) < 1e-9) return null;
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    if (!(f2 > 0)) return null;
    const f = Math.sqrt(f2), diag = Math.hypot(cx, cy) * 2;
    if (f < diag * 0.3 || f > diag * 4) return null; // not a believable phone camera
    const wh = Math.sqrt((n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2]) / Math.sqrt((n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2]);
    return wh > 0 && Number.isFinite(wh) ? 1 / wh : null; // height / width
  }

  /** Size of the straightened page (pixels), A4 / Letter shapes snapped. q in pixels of a sw x sh photo. */
  function outSize(q, maxLong, sw, sh) {
    const len = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    const w = Math.max(len(q[0], q[1]), len(q[3], q[2])), h = Math.max(len(q[0], q[3]), len(q[1], q[2]));
    let ratio = h / Math.max(1, w);
    const real = sw && sh ? realRatio(q, sw / 2, sh / 2) : null;
    if (real && real > 0.2 && real < 5) ratio = real;
    let snapped = false;
    for (const k of [Math.SQRT2, 11 / 8.5]) {
      if (!snapped && Math.abs(ratio - k) / k < 0.09) { ratio = k; snapped = true; }
      if (!snapped && Math.abs(1 / ratio - k) / k < 0.09) { ratio = 1 / k; snapped = true; }
    }
    const long = Math.min(maxLong, Math.max(1600, Math.max(w, h) * 1.15));
    return ratio >= 1 ? { w: Math.round(long / ratio), h: Math.round(long), ratio } : { w: Math.round(long), h: Math.round(long * ratio), ratio };
  }

  /** Straightens the page: pixels inside quad (fractions) -> a flat ow x oh picture. */
  function warp(src, sw, sh, quad, ow, oh) {
    const q = quad.map(([x, y]) => [x * sw, y * sh]);
    const { a, b, c, d, e, f, g, h } = squareToQuad(q);
    const out = new Uint8ClampedArray(ow * oh * 4);
    const W1 = sw - 1, H1 = sh - 1;
    let o = 0;
    for (let y = 0; y < oh; y++) {
      const v = (y + 0.5) / oh;
      const bv = b * v + c, ev = e * v + f, hv = h * v + 1;
      for (let x = 0; x < ow; x++, o += 4) {
        const u = (x + 0.5) / ow;
        const z = g * u + hv;
        let sx = (a * u + bv) / z - 0.5, sy = (d * u + ev) / z - 0.5;
        if (sx < 0) sx = 0; else if (sx > W1) sx = W1;
        if (sy < 0) sy = 0; else if (sy > H1) sy = H1;
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const x1 = x0 < W1 ? x0 + 1 : x0, y1 = y0 < H1 ? y0 + 1 : y0;
        const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
        out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
        out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
        out[o + 3] = 255;
      }
    }
    return cleanBorder(out, ow, oh);
  }

  /**
   * Strips of table / background left at the page border (corners placed a bit
   * outside the sheet) get the paper's own color. Changes [px] in place.
   */
  function cleanBorder(px, w, h) {
    const lum = (i) => (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    // how far in a strip of table / floor may reach (corners placed a bit outside the sheet)
    const mx = Math.round(w * 0.12), my = Math.round(h * 0.12);
    const run = (count, len, idx) => {
      // the paper's own brightness on this row: a bright value from the first quarter of the page
      // (the strip itself can be wide, so not just next to it)
      const reach = Math.min(Math.round(len * 2.5), 4 * len);
      const depth = new Int32Array(count);
      const hist = new Uint32Array(256);
      for (let a = 0; a < count; a++) {
        hist.fill(0);
        let n = 0;
        for (let d = 0; d < reach; d += 2) { hist[lum(idx(a, d))]++; n++; }
        let acc = 0, ref = 255;
        for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.15) { ref = v; break; } }
        const lim = ref * 0.8;
        let k = 0;
        while (k < len && lum(idx(a, k)) < lim) k++;
        depth[a] = k;
      }
      // smoothed over the neighbouring rows: no streaks, no single dark letter taken for a strip
      const R = 12;
      for (let a = 0; a < count; a++) {
        const win = [];
        for (let b = Math.max(0, a - R); b <= Math.min(count - 1, a + R); b++) win.push(depth[b]);
        win.sort((x, y) => x - y);
        const med = win[win.length >> 1];
        const k = med ? Math.min(len, Math.max(med, depth[a]) + 2) : 0;
        if (!k) continue;
        // paper color just inside (a few pixels averaged)
        let r = 0, g = 0, bl = 0;
        for (let d = k + 1; d < k + 5; d++) { const i = idx(a, Math.min(reach - 1, d)); r += px[i]; g += px[i + 1]; bl += px[i + 2]; }
        for (let j = 0; j < k; j++) { const i = idx(a, j); px[i] = r / 4; px[i + 1] = g / 4; px[i + 2] = bl / 4; }
      }
    };
    run(h, mx, (y, x) => (y * w + x) * 4);
    run(h, mx, (y, x) => (y * w + (w - 1 - x)) * 4);
    run(w, my, (x, y) => (y * w + x) * 4);
    run(w, my, (x, y) => ((h - 1 - y) * w + x) * 4);
    return px;
  }

  /** Turns the picture by quarter turns (clockwise). */
  function rotate(src, w, h, turns) {
    turns = ((turns % 4) + 4) % 4;
    if (!turns) return { data: src, w, h };
    const nw = turns % 2 ? h : w, nh = turns % 2 ? w : h;
    const out = new Uint8ClampedArray(nw * nh * 4);
    const s32 = new Uint32Array(src.buffer, src.byteOffset, w * h), o32 = new Uint32Array(out.buffer);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let nx, ny;
        if (turns === 1) { nx = h - 1 - y; ny = x; } else if (turns === 2) { nx = w - 1 - x; ny = h - 1 - y; } else { nx = y; ny = w - 1 - x; }
        o32[ny * nw + nx] = s32[y * w + x];
      }
    }
    return { data: out, w: nw, h: nh };
  }

  /** Light falling on the paper (per color), measured on a coarse grid. */
  function paperLight(src, w, h) {
    const f = Math.max(8, Math.round(Math.max(w, h) / 150));
    const bw = Math.ceil(w / f), bh = Math.ceil(h / f);
    let g = new Float32Array(bw * bh * 3);
    const keys = new Int32Array(f * f + 1);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        // the light of the block: a bright pixel (90th of 100 by brightness), not the very brightest:
        // single bright specks of camera noise would make blotches
        const ye = Math.min(h, (by + 1) * f), xe = Math.min(w, (bx + 1) * f);
        let cnt = 0;
        for (let y = by * f; y < ye; y++) {
          for (let x = bx * f, i = (y * w + x) * 4; x < xe; x++, i += 4) { keys[cnt] = (src[i] * 3 + src[i + 1] * 6 + src[i + 2]) * 4096 + cnt; cnt++; }
        }
        let mr = 0, mg = 0, mb = 0;
        if (cnt) {
          const kk = keys.subarray(0, cnt).sort();
          const pick = kk[Math.min(cnt - 1, Math.floor(cnt * 0.9))] & 4095;
          // back from "n-th pixel of the block" to its place in the picture
          const bwid = xe - bx * f, yy = by * f + Math.floor(pick / bwid), xx = bx * f + (pick % bwid);
          const i = (yy * w + xx) * 4;
          mr = src[i]; mg = src[i + 1]; mb = src[i + 2];
        }
        const k = (by * bw + bx) * 3;
        g[k] = mr; g[k + 1] = mg; g[k + 2] = mb;
      }
    }
    // blocks full of ink (big titles, thick lines) take the light of their neighbours
    const grow = (a, r) => {
      const o = new Float32Array(a.length);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let c = 0; c < 3; c++) {
        let m = 0;
        for (let yy = Math.max(0, y - r); yy <= Math.min(bh - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(bw - 1, x + r); xx++) m = Math.max(m, a[(yy * bw + xx) * 3 + c]);
        o[(y * bw + x) * 3 + c] = m;
      }
      return o;
    };
    g = grow(g, 1);
    // smooth
    for (let c = 0; c < 3; c++) {
      const ch = new Float32Array(bw * bh);
      for (let i = 0; i < ch.length; i++) ch[i] = g[i * 3 + c];
      const s = boxBlur(boxBlur(ch, bw, bh, 1), bw, bh, 1);
      for (let i = 0; i < ch.length; i++) g[i * 3 + c] = s[i];
    }
    // never treat a dark picture inside the page as "shadow"
    const lums = [];
    for (let i = 0; i < bw * bh; i++) lums.push(0.299 * g[i * 3] + 0.587 * g[i * 3 + 1] + 0.114 * g[i * 3 + 2]);
    lums.sort((x, y) => x - y);
    const paper = lums[Math.floor(lums.length * 0.9)] || 255;
    const floor = Math.max(40, paper * 0.45);
    for (let i = 0; i < bw * bh; i++) {
      const l = 0.299 * g[i * 3] + 0.587 * g[i * 3 + 1] + 0.114 * g[i * 3 + 2];
      if (l < floor) { const k = floor / Math.max(1, l); g[i * 3] *= k; g[i * 3 + 1] *= k; g[i * 3 + 2] *= k; }
    }
    return { g, f, bw, bh };
  }

  /**
   * Cleans the straightened page. mode: 'doc' (white paper, crisp text, colors kept),
   * 'gray', 'bw' (black and white), 'color' (even light, natural colors, for photos), 'original'.
   */
  function enhance(src, w, h, mode, clean = true) {
    const n = w * h;
    const out = new Uint8ClampedArray(n * 4);
    if (mode === 'original') { out.set(src); return out; }
    // 1) even light: divide by the light falling on the paper (removes shadows, yellow light).
    // It is measured on a small, averaged copy (≈1000 px): the same light for the quick look and
    // the full page, and camera noise does not count.
    const sc = Math.max(1, Math.round(Math.max(w, h) / 1000));
    let lightSrc = src, lw = w, lh = h;
    if (sc > 1) {
      lw = Math.ceil(w / sc); lh = Math.ceil(h / sc);
      lightSrc = new Uint8ClampedArray(lw * lh * 4);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        let r = 0, gg = 0, b = 0, c = 0;
        for (let yy = y * sc; yy < Math.min(h, (y + 1) * sc); yy++) for (let xx = x * sc, i = (yy * w + xx) * 4; xx < Math.min(w, (x + 1) * sc); xx++, i += 4) { r += src[i]; gg += src[i + 1]; b += src[i + 2]; c++; }
        const o = (y * lw + x) * 4;
        lightSrc[o] = r / c; lightSrc[o + 1] = gg / c; lightSrc[o + 2] = b / c; lightSrc[o + 3] = 255;
      }
    }
    const L0 = paperLight(lightSrc, lw, lh);
    const { g, bw, bh } = L0, f = L0.f * sc;
    const norm = new Uint8ClampedArray(n * 4);
    const lumHist = new Uint32Array(256);
    for (let y = 0; y < h; y++) {
      const gy = Math.max(0, Math.min(bh - 1.001, (y + 0.5) / f - 0.5));
      const y0 = gy | 0, fy = gy - y0, y1 = Math.min(bh - 1, y0 + 1);
      for (let x = 0; x < w; x++) {
        const gx = Math.max(0, Math.min(bw - 1.001, (x + 0.5) / f - 0.5));
        const x0 = gx | 0, fx = gx - x0, x1 = Math.min(bw - 1, x0 + 1);
        const k00 = (y0 * bw + x0) * 3, k10 = (y0 * bw + x1) * 3, k01 = (y1 * bw + x0) * 3, k11 = (y1 * bw + x1) * 3;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const bg = g[k00 + c] * w00 + g[k10 + c] * w10 + g[k01 + c] * w01 + g[k11 + c] * w11;
          norm[i + c] = (src[i + c] * 255) / Math.max(24, bg);
        }
        norm[i + 3] = 255;
        if (!(x & 3) && !(y & 3)) lumHist[(norm[i] * 77 + norm[i + 1] * 150 + norm[i + 2] * 29) >> 8]++;
      }
    }
    // 2) levels: paper pure white, ink deep and even
    let total = 0;
    for (let v = 0; v < 256; v++) total += lumHist[v];
    let s = 0, ink = 0;
    for (let v = 0; v < 256; v++) { s += lumHist[v]; if (s >= total * 0.005) { ink = v; break; } }
    const soft = mode === 'color';
    // paper: the bright majority; its darker grain (camera noise) still turns white
    let bright = 0;
    for (let v = 128; v < 256; v++) bright += lumHist[v];
    let acc = 0, paper = 236;
    for (let v = 255; v >= 128; v--) { acc += lumHist[v]; if (acc >= bright * 0.85) { paper = v; break; } }
    const lo = soft ? Math.min(50, ink * 0.4) : Math.min(90, Math.max(0, ink * 0.8));
    const hi = soft ? 248 : clean ? Math.max(200, Math.min(238, paper - 2)) : 236;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) { const x = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); lut[v] = 255 * Math.pow(x, soft ? 1.05 : 1.25); }
    // where the neighbourhood is (almost) paper, it becomes clean white: no camera grain on the page
    let paperMask = null;
    if (!soft && clean) {
      const L = new Float32Array(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = lut[(norm[j] * 77 + norm[j + 1] * 150 + norm[j + 2] * 29) >> 8];
      const B = boxBlur(L, w, h, 1);
      paperMask = new Float32Array(n);
      for (let i = 0; i < n; i++) paperMask[i] = B[i] >= 232 ? 1 : B[i] <= 212 ? 0 : (B[i] - 212) / 20;
    }
    if (mode === 'doc' || soft) {
      for (let i = 0; i < n * 4; i += 4) {
        const r = lut[norm[i]], gg = lut[norm[i + 1]], b = lut[norm[i + 2]];
        // a little more color for stamps and blue pen
        const m = (r + gg + b) / 3;
        // more color only where there is real color (stamps, blue pen), not on grey noise
        const chroma = Math.max(Math.abs(r - m), Math.abs(gg - m), Math.abs(b - m));
        const k = chroma < 10 ? (soft ? 1 : 0.6) : soft ? 1.12 : 1.25;
        out[i] = m + (r - m) * k; out[i + 1] = m + (gg - m) * k; out[i + 2] = m + (b - m) * k; out[i + 3] = 255;
        if (paperMask) { const t = paperMask[i >> 2]; if (t > 0) { out[i] += (255 - out[i]) * t; out[i + 1] += (255 - out[i + 1]) * t; out[i + 2] += (255 - out[i + 2]) * t; } }
      }
      return out;
    }
    for (let i = 0; i < n * 4; i += 4) {
      let v = lut[(norm[i] * 77 + norm[i + 1] * 150 + norm[i + 2] * 29) >> 8];
      if (paperMask) v += (255 - v) * paperMask[i >> 2];
      if (mode === 'bw') v = v < 150 ? 0 : v > 200 ? 255 : ((v - 150) / 50) * 255;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
    return out;
  }

  /**
   * For reading the text: grey, clean paper, and the lines of tables / boxes
   * painted away (the reader mistakes letters touching a line, e.g. 150 -> 130).
   */
  function ocrPrep(src, w, h) {
    const out = enhance(src, w, h, 'gray', false); // the reader wants every faint stroke, grain does not bother it
    const n = w * h;
    const dark = new Uint8Array(n);
    for (let i = 0; i < n; i++) dark[i] = out[i * 4] < 212 ? 1 : 0; // faint grey lines count too
    const kill = new Uint8Array(n);
    const minH = Math.max(80, Math.round(w * 0.035)), minV = Math.max(80, Math.round(h * 0.03));
    // long, thin straight runs of ink (tiny breaks allowed) are lines, not letters:
    // just above and below a real line the paper is white, inside a row of text it is not
    const o = Math.max(4, Math.round(Math.min(w, h) / 400));
    const scan = (len, count, at, min) => {
      for (let a = 0; a < count; a++) {
        let start = -1, last = -1;
        for (let b = 0; b <= len; b++) {
          const on = b < len && dark[at(a, b)];
          if (on) { if (start < 0) start = b; last = b; continue; }
          if (start >= 0 && (b === len || b - last > 2)) {
            if (last - start + 1 >= min && a >= o && a < count - o) {
              let near = 0;
              for (let k = start; k <= last; k++) near += dark[at(a - o, k)] + dark[at(a + o, k)];
              if (near / (2 * (last - start + 1)) < 0.18) for (let k = start; k <= last; k++) kill[at(a, k)] = 1;
            }
            start = -1;
          }
        }
      }
    };
    scan(w, h, (y, x) => y * w + x, minH);
    scan(h, w, (x, y) => y * w + x, minV);
    // a line is only removed where it is thin (letters touching it stay)
    for (let i = 0; i < n; i++) {
      if (!kill[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        out[j] = out[j + 1] = out[j + 2] = 255;
      }
    }
    // crisper letters (unsharp mask): the reader confuses soft 5 / 3, S / 5
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = out[i * 4];
    const b = boxBlur(boxBlur(g, w, h, 1), w, h, 1);
    for (let i = 0; i < n; i++) { const v = clamp(g[i] + 1.2 * (g[i] - b[i])); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; }
    return out;
  }

  /**
   * Which way up is the text? 0 = fine, 1 / 2 / 3 = needs that many quarter
   * turns clockwise. Rows of text make stripes; inside a line there is more ink
   * above the small letters (b d f h k l t, capitals) than below (g j p q y).
   */
  function orientation(src, w, h) {
    const g = ocrPrep(src, w, h); // grey, table lines removed (they would look like text stripes)
    const ink = new Uint8Array(w * h);
    // the border may hold bits of the table under the sheet: only the inside counts
    const mx = Math.round(w * 0.05), my = Math.round(h * 0.05);
    for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) { const i = y * w + x; ink[i] = g[i * 4] < 140 ? 1 : 0; }
    const prof = (m, W, H, byRow) => {
      const p = new Float64Array(byRow ? H : W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) p[byRow ? y : x]++;
      return p;
    };
    // stripes the size of a line of text (big layout blocks and single letters do not count)
    const box1 = (p, r) => { const o = new Float64Array(p.length); let acc = 0; const n = p.length; for (let i = -r; i <= r; i++) acc += p[Math.min(n - 1, Math.max(0, i))]; for (let i = 0; i < n; i++) { o[i] = acc / (2 * r + 1); acc += p[Math.min(n - 1, i + r + 1)] - p[Math.max(0, i - r)]; } return o; };
    const stripes = (p) => {
      const a = box1(p, 1), b = box1(a, 12);
      let e = 0, m = 0;
      for (let i = 0; i < a.length; i++) { e += (a[i] - b[i]) * (a[i] - b[i]); m += a[i]; }
      m /= a.length;
      return m > 0 ? e / a.length / (m * m) : 0;
    };
    const rows = prof(ink, w, h, true), cols = prof(ink, w, h, false);
    const rv = stripes(rows), cv = stripes(cols);
    if (rv < 0.3 && cv < 0.3) return { rot: 0, sure: false }; // hardly any text
    const sideways = cv > rv * 2.5;
    const lean = (m, W, H) => { // > 0: upright, < 0: upside down
      const R = prof(m, W, H, true);
      let max = 0; for (const v of R) max = Math.max(max, v);
      let A = 0, B = 0, y = 0;
      while (y < H) {
        if (R[y] <= max * 0.08) { y++; continue; }
        let e = y; while (e < H && R[e] > max * 0.08) e++;
        if (e - y >= 4) {
          let bm = 0; for (let k = y; k < e; k++) bm = Math.max(bm, R[k]);
          let c0 = y; while (c0 < e && R[c0] < bm * 0.5) c0++;
          let c1 = e - 1; while (c1 > c0 && R[c1] < bm * 0.5) c1--;
          for (let k = y; k < c0; k++) A += R[k];
          for (let k = c1 + 1; k < e; k++) B += R[k];
        }
        y = e;
      }
      return A + B > 0 ? (A - B) / (A + B) : 0;
    };
    if (sideways) {
      const r = rotate(toRgba(ink, w, h), w, h, 1);
      const m = new Uint8Array(r.w * r.h);
      for (let i = 0; i < m.length; i++) m[i] = r.data[i * 4];
      const s1 = lean(m, r.w, r.h);
      return { rot: s1 < -0.08 ? 3 : 1, sure: Math.abs(s1) > 0.08, sideways: true };
    }
    const s0 = lean(ink, w, h);
    return { rot: s0 < -0.12 ? 2 : 0, sure: Math.abs(s0) > 0.12, sideways: false };
  }
  function toRgba(m, w, h) { const o = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) o[i * 4] = m[i]; return o; }

  return { detect, warp, outSize, realRatio, rotate, cleanBorder, enhance, ocrPrep, orientation, boxBlur, otsu };
})();

// ---------------------------------------------------------------------------
// The scanner's pages, kept inside the worker: the photo is decoded once and
// every later step (preview, other look, rotation, full size, text reading)
// reuses what is already there. Only small JPEG/PNG files travel back.
// ---------------------------------------------------------------------------
const ScanPipe = (() => {
  const MAX_SRC = 4000, MID = 1500, PREVIEW = 1300, FULL = 3508;
  const pages = new Map(); // id -> {src, mid, prev, flat, ocr, used}
  const KEEP = 2; // photos kept decoded at the same time (memory on phones)
  const mk = (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };
  const ctx = (c) => c.getContext('2d', { willReadFrequently: true });
  async function bytesOf(c, type, q) {
    if (c.convertToBlob) { const b = await c.convertToBlob({ type, quality: q }); return new Uint8Array(await b.arrayBuffer()); }
    return new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((x) => res(new Uint8Array(x)), rej) : rej(new Error('encode'))), type, q));
  }
  function put(data, w, h) {
    const c = mk(w, h);
    ctx(c).putImageData(new ImageData(data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer), w, h), 0, 0);
    return c;
  }
  function drawn(bmp, maxSide) {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = mk(w, h), x = ctx(c);
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, w, h);
    return { data: x.getImageData(0, 0, w, h).data, w, h };
  }
  function get(id) {
    const P = pages.get(id);
    if (!P || !(P.src || P.mid)) throw new Error('NOPAGE');
    P.used = Date.now();
    return P;
  }
  function evict(keep) {
    // full photos are big (keep 2), small screen copies are cheap (keep 8)
    for (const [big, n] of [[true, KEEP], [false, 8]]) {
      const live = [...pages.entries()].filter(([, P]) => !!P.src === big).sort((a, b) => b[1].used - a[1].used);
      for (const [id] of live.slice(n)) if (id !== keep) pages.delete(id);
    }
  }
  // page size from the corners, measured on the photo at working size
  const sizeFor = (P, quad) => ScanCore.outSize(quad.map(([x, y]) => [x * P.dims.w, y * P.dims.h]), FULL, P.dims.w, P.dims.h);

  /**
   * New photo, decoded once. role 'u' (screen): small copy + finds the sheet;
   * role 'b' (background): the full photo for the final pages.
   */
  function load(id, bmp, detectToo, role) {
    const k = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
    const dims = { w: Math.max(1, Math.round(bmp.width * k)), h: Math.max(1, Math.round(bmp.height * k)) };
    const P = { dims, src: null, mid: null, prev: null, flat: null, ocr: null, used: Date.now() };
    if (role === 'u') P.mid = drawn(bmp, MID); else P.src = drawn(bmp, MAX_SRC);
    let quad = null;
    if (detectToo) {
      const small = drawn(bmp, 512);
      quad = ScanCore.detect(small.data, small.w, small.h);
      if (quad) { // a hair inside the edge: no table or shadow left at the border
        const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
        quad = quad.map(([x, y]) => [x + (cx - x) * 0.012, y + (cy - y) * 0.012]);
      }
    }
    if (bmp.close) bmp.close();
    pages.set(id, P);
    evict(id);
    // which way up is the text (a photo taken sideways is turned by itself)
    let rot = 0;
    if (detectToo && P.mid) {
      try {
        const q = quad || [[0, 0], [1, 0], [1, 1], [0, 1]];
        const size = sizeFor(P, q);
        const k = 900 / Math.max(size.w, size.h);
        const ow = Math.max(1, Math.round(size.w * k)), oh = Math.max(1, Math.round(size.h * k));
        const o = ScanCore.orientation(ScanCore.warp(P.mid.data, P.mid.w, P.mid.h, q, ow, oh), ow, oh);
        if (o.sure) rot = o.rot;
      } catch (e) { /* keep as taken */ }
    }
    return { quad, rot, w: dims.w, h: dims.h };
  }
  function has(id) { return pages.has(id); }

  const qkey = (quad) => quad.map((p) => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';');
  /** Turns a kept picture instead of straightening the photo again (rotation is cheap). */
  function turned(base, rot) {
    if (base.rot === rot) return base;
    const r = ScanCore.rotate(base.data, base.w, base.h, (rot - base.rot + 4) % 4);
    return { ...base, data: r.data, w: r.w, h: r.h, rot };
  }

  /** Quick look of the page (≈1300 px) with one of the looks. */
  async function preview(id, quad, rot, filter, ver) {
    const P = get(id);
    if (!P.prev || P.prev.ver !== ver) {
      const qk = qkey(quad);
      let base = P.prev && P.prev.qk === qk ? P.prev : null;
      if (!base) {
        const size = sizeFor(P, quad);
        const k = Math.min(1, PREVIEW / Math.max(size.w, size.h));
        const pw = Math.max(1, Math.round(size.w * k)), ph = Math.max(1, Math.round(size.h * k));
        const m = P.mid || P.src;
        base = { qk, rot: 0, data: ScanCore.warp(m.data, m.w, m.h, quad, pw, ph), w: pw, h: ph, sw: size.w, sh: size.h };
      }
      const o = turned(base, rot);
      P.prev = { ...o, ver, qk, fullW: rot % 2 ? o.sh : o.sw, fullH: rot % 2 ? o.sw : o.sh, out: {} };
    }
    const pv = P.prev;
    if (!pv.out[filter]) pv.out[filter] = await bytesOf(put(ScanCore.enhance(pv.data, pv.w, pv.h, filter), pv.w, pv.h), 'image/jpeg', 0.85);
    return { jpeg: pv.out[filter], w: pv.w, h: pv.h, fullW: pv.fullW, fullH: pv.fullH };
  }

  function flatOf(P, quad, rot, ver) {
    if (!P.src) throw new Error('NOPAGE');
    if (!P.flat || P.flat.ver !== ver) {
      const qk = qkey(quad);
      if (P.flat && P.flat.qk === qk) P.flat = { ...turned(P.flat, rot), ver, qk };
      else {
        const size = sizeFor(P, quad);
        const o = turned({ data: ScanCore.warp(P.src.data, P.src.w, P.src.h, quad, size.w, size.h), w: size.w, h: size.h, rot: 0 }, rot);
        P.flat = { ...o, ver, qk };
      }
      P.ocr = null;
    }
    return P.flat;
  }

  /** The page at full size, cleaned with [filter], as the JPEG that goes into the PDF. */
  async function full(id, quad, rot, filter, ver) {
    const P = get(id);
    const f = flatOf(P, quad, rot, ver);
    const jpeg = await bytesOf(put(ScanCore.enhance(f.data, f.w, f.h, filter), f.w, f.h), 'image/jpeg', filter === 'bw' ? 0.8 : 0.86);
    return { jpeg, w: f.w, h: f.h };
  }

  /** Picture prepared for the text reader (≈300 dpi, grey, lines removed, sharpened). */
  async function ocrImage(id, quad, rot, ver) {
    const P = get(id);
    const f = flatOf(P, quad, rot, ver);
    const k = Math.max(1, Math.min(2.2, 2480 / Math.min(f.w, f.h)));
    const W = Math.round(f.w * k), H = Math.round(f.h * k);
    let data = f.data;
    if (k > 1.02) {
      const big = mk(W, H), x = ctx(big);
      x.imageSmoothingQuality = 'high';
      x.drawImage(put(f.data, f.w, f.h), 0, 0, W, H);
      data = x.getImageData(0, 0, W, H).data;
    }
    const c = put(ScanCore.ocrPrep(data, W, H), W, H);
    const x = ctx(c), m = Math.round(Math.min(W, H) * 0.012);
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, m); x.fillRect(0, H - m, W, m); x.fillRect(0, 0, m, H); x.fillRect(W - m, 0, m, H);
    P.ocr = { ver, c };
    return { png: await bytesOf(c, 'image/jpeg', 0.94), W, H }; // JPEG: several times faster to make than PNG, same reading
  }

  /** Pieces of the prepared picture (for reading unsure lines again). */
  async function crops(id, ver, rects) {
    const P = pages.get(id);
    if (!P || !P.ocr || P.ocr.ver !== ver) throw new Error('NOPAGE');
    const out = [];
    for (const r of rects) {
      const w = Math.max(1, Math.round(r.x1 - r.x0)), h = Math.max(1, Math.round(r.y1 - r.y0));
      const c = mk(w, h);
      ctx(c).drawImage(P.ocr.c, r.x0, r.y0, w, h, 0, 0, w, h);
      out.push(await bytesOf(c, 'image/png'));
    }
    return out;
  }
  function doneOcr(id) { const P = pages.get(id); if (P) P.ocr = null; }
  function drop(id) { pages.delete(id); }
  function dropAll() { pages.clear(); }

  return { load, has, preview, full, ocrImage, crops, doneOcr, drop, dropAll };
})();

// Background worker: { id, op, args } -> { id, result } (pixel results are moved, not copied)
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof importScripts === 'function') {
  const moves = (r, list = []) => {
    if (!r) return list;
    if (r instanceof ArrayBuffer) list.push(r);
    else if (ArrayBuffer.isView(r)) list.push(r.buffer);
    else if (Array.isArray(r)) r.forEach((x) => moves(x, list));
    else if (typeof r === 'object') for (const k of Object.keys(r)) if (r[k] && (ArrayBuffer.isView(r[k]) || Array.isArray(r[k]))) moves(r[k], list);
    return list;
  };
  self.onmessage = async (e) => {
    const { id, op, args, pipe } = e.data;
    try {
      const result = await (pipe ? ScanPipe : ScanCore)[op](...args);
      // cached results are copied (they stay here), fresh ones are moved
      const keep = pipe && op === 'preview';
      self.postMessage({ id, result }, keep ? [] : [...new Set(moves(result))]);
    } catch (err) {
      self.postMessage({ id, error: String((err && err.message) || err) });
    }
  };
}
if (typeof module !== 'undefined') module.exports = { ScanCore, ScanPipe };
