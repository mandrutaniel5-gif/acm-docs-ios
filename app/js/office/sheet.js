'use strict';
// "Tabel": a spreadsheet editor (like Excel). Opens .xlsx .xls .ods .csv, saves .xlsx.
// The grid is drawn on a canvas (fast on old laptops); a native scroll area on top
// gives the always-visible scrollbars and receives the mouse.

const Sheet = (() => {
  const $ = (id) => document.getElementById(id);
  const XL = () => Lib.get('xlsx-js-style');
  const F = Formula;
  const HW = 46, HH = 24, DEFW = 96, DEFH = 22, MAXC = 16384;
  const K = (r, c) => r * MAXC + c;
  const RC = (k) => ({ r: Math.floor(k / MAXC), c: k % MAXC });

  let wb = null; // { sheets: [sheet], active }
  let st = null; // file state {source, copyPath, dirty, name}
  let sel = { r0: 0, c0: 0, r1: 0, c1: 0 }, cur = { r: 0, c: 0 }, anchor = { r: 0, c: 0 };
  let editing = null; // { r, c, mode: 'enter'|'edit', orig }
  let history = [], future = [];
  let clip = null; // {text, cells:[[{in,s}]], r0, c0, cut, sheet}
  let geom = null;
  let drag = null;
  let ctx2d = null;
  let rafPending = false;
  let toolsBuilt = false;

  const sheet = () => wb.sheets[wb.active];

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------

  function newSheet(name) {
    return { name, cells: new Map(), colW: {}, rowH: {}, merges: [] };
  }

  function newWorkbook() {
    return { sheets: [newSheet('Foaie1')], active: 0 };
  }

  function cell(s, r, c) { return s.cells.get(K(r, c)); }

  function used(s) {
    let r1 = -1, c1 = -1;
    for (const [k, cl] of s.cells) {
      if (cl.in === '' && !cl.s) continue;
      const { r, c } = RC(k);
      if (r > r1) r1 = r;
      if (c > c1) c1 = c;
    }
    for (const m of s.merges) { r1 = Math.max(r1, m.r1); c1 = Math.max(c1, m.c1); }
    return { r1, c1 };
  }

  /** Text typed by the user -> stored input (+ suggested format). */
  function parseTyped(text) {
    if (text === null || text === undefined) return { in: '' };
    const t = String(text);
    if (t === '') return { in: '' };
    if (t[0] === "'") return { in: t.slice(1), forceText: true };
    if (t[0] === '=' && t.length > 1) return { in: '=' + t.slice(1).trim() };
    const s = t.trim();
    if (/^[+-]?[\d.,\s]+%$/.test(s)) { const n = F.parseNumber(s.slice(0, -1)); if (n !== null) return { in: n / 100, fmt: 'pct' }; }
    if (/lei$/i.test(s)) { const n = F.parseNumber(s); if (n !== null) return { in: n, fmt: 'lei' }; }
    const d = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    if (d) {
      const dt = Date.UTC(+d[3], +d[2] - 1, +d[1]);
      if (!isNaN(dt) && +d[2] <= 12 && +d[1] <= 31) return { in: Math.floor(dt / 86400000 + 25569), fmt: 'date' };
    }
    // phone numbers, codes: a leading zero means text (0740123456 stays as written)
    if (/^0\d{2,}$/.test(s)) return { in: t };
    const n = F.parseNumber(s);
    if (n !== null && /\d/.test(s)) return { in: n };
    if (/^(true|adevărat|adevarat)$/i.test(s)) return { in: true };
    if (/^(false|fals)$/i.test(s)) return { in: false };
    return { in: t };
  }

  function setInput(s, r, c, text) {
    const p = parseTyped(text);
    let cl = cell(s, r, c);
    if (p.in === '' && (!cl || !cl.s)) { s.cells.delete(K(r, c)); return; }
    if (!cl) { cl = { in: '' }; s.cells.set(K(r, c), cl); }
    cl.in = p.in;
    if (p.fmt && (!cl.s || !cl.s.fmt)) cl.s = { ...(cl.s || {}), fmt: p.fmt };
    if (p.forceText) cl.s = { ...(cl.s || {}), fmt: 'text' };
  }

  // ---------------------------------------------------------------------------
  // Calculation
  // ---------------------------------------------------------------------------

  function recalc() {
    const memo = new Map(), visiting = new Set();
    const byName = new Map(wb.sheets.map((s, i) => [s.name.toLowerCase(), i]));
    const val = (si, r, c) => {
      const s = wb.sheets[si];
      const cl = s.cells.get(K(r, c));
      if (!cl) return null;
      if (typeof cl.in !== 'string' || cl.in[0] !== '=' || (cl.s && cl.s.fmt === 'text')) return cl.in === '' ? null : cl.in;
      const mk = si * 1e9 + K(r, c);
      if (memo.has(mk)) return memo.get(mk);
      if (visiting.has(mk)) return F.E.CIRC;
      visiting.add(mk);
      const v = F.evaluate(cl.in.slice(1), {
        get: (name, rr, cc) => {
          if (!name) return val(si, rr, cc);
          const idx = byName.get(String(name).toLowerCase());
          return idx === undefined ? F.E.REF : val(idx, rr, cc);
        },
      });
      visiting.delete(mk);
      memo.set(mk, v);
      return v;
    };
    wb.sheets.forEach((s, si) => {
      for (const [k, cl] of s.cells) {
        const { r, c } = RC(k);
        cl.v = typeof cl.in === 'string' && cl.in[0] === '=' && !(cl.s && cl.s.fmt === 'text') ? val(si, r, c) : cl.in;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Display
  // ---------------------------------------------------------------------------

  const ro = (v, d) => v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });

  function display(cl) {
    if (!cl) return '';
    const v = cl.v === undefined ? cl.in : cl.v;
    if (v === null || v === undefined || v === '') return '';
    if (F.isErr(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'ADEVĂRAT' : 'FALS';
    if (typeof v !== 'number') return String(v);
    const s = cl.s || {};
    const d = s.dec;
    switch (s.fmt) {
      case 'num': return ro(v, d === undefined ? 2 : d);
      case 'int': return ro(v, 0);
      case 'lei': return ro(v, d === undefined ? 2 : d) + ' lei';
      case 'pct': return ro(v * 100, d === undefined ? 0 : d) + '%';
      case 'date': { const dt = F.serialToDate(v); return `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${dt.getUTCFullYear()}`; }
      case 'custom': {
        try {
          const out = XL().SSF.format(s.code, v);
          return /[dmyhs]/i.test(String(s.code).replace(/"[^"]*"/g, '')) ? out : out.replace(/[,.]/g, (m) => (m === ',' ? '.' : ','));
        } catch (e) { return F.fmtGeneral(v); }
      }
      default:
        if (d !== undefined) return ro(v, d);
        return F.fmtGeneral(v);
    }
  }

  // ---------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------

  function colWidth(s, c) { return s.colW[c] || DEFW; }
  function rowHeight(s, r) { return s.rowH[r] || DEFH; }

  function layout() {
    const s = sheet();
    const u = used(s);
    const scr = $('sh-scroll');
    const want = geom ? geom : { nr: 0, nc: 0 };
    let nr = Math.max(200, u.r1 + 60, cur.r + 30, want.nr || 0);
    let nc = Math.max(26, u.c1 + 8, cur.c + 6, want.nc || 0);
    // grow while scrolling near the end
    if (geom && scr) {
      if (scr.scrollTop + scr.clientHeight > geom.rowY[geom.nr] - 400) nr = geom.nr + 100;
      if (scr.scrollLeft + scr.clientWidth > geom.colX[geom.nc] - 400) nc = Math.min(MAXC, geom.nc + 10);
    }
    const colX = new Float64Array(nc + 1), rowY = new Float64Array(nr + 1);
    for (let c = 0; c < nc; c++) colX[c + 1] = colX[c] + colWidth(s, c);
    for (let r = 0; r < nr; r++) rowY[r + 1] = rowY[r] + rowHeight(s, r);
    geom = { nr, nc, colX, rowY };
    const sp = $('sh-spacer');
    sp.style.width = HW + colX[nc] + 'px';
    sp.style.height = HH + rowY[nr] + 'px';
  }

  function bsearch(arr, n, x) {
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= x) lo = mid; else hi = mid - 1; }
    return lo;
  }

  /** Grid position under client point. part: 'cell'|'colh'|'rowh'|'corner' */
  function hit(clientX, clientY) {
    const g = $('sh-grid').getBoundingClientRect();
    const scr = $('sh-scroll');
    const x = clientX - g.left, y = clientY - g.top;
    const gx = x - HW + scr.scrollLeft, gy = y - HH + scr.scrollTop;
    const c = Math.max(0, Math.min(geom.nc - 1, bsearch(geom.colX, geom.nc, gx)));
    const r = Math.max(0, Math.min(geom.nr - 1, bsearch(geom.rowY, geom.nr, gy)));
    let part = 'cell';
    if (x < HW && y < HH) part = 'corner';
    else if (y < HH) part = 'colh';
    else if (x < HW) part = 'rowh';
    return { r, c, part, x, y, gx, gy };
  }

  function cellRect(r, c) {
    const scr = $('sh-scroll');
    return {
      x: HW + geom.colX[c] - scr.scrollLeft, y: HH + geom.rowY[r] - scr.scrollTop,
      w: geom.colX[c + 1] - geom.colX[c], h: geom.rowY[r + 1] - geom.rowY[r],
    };
  }

  function mergeAt(s, r, c) {
    for (const m of s.merges) if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return m;
    return null;
  }

  function rangeRect(r0, c0, r1, c1) {
    const a = cellRect(r0, c0), b = cellRect(r1, c1);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }

  function fontOf(s) {
    const pt = (s && s.fs) || 11;
    return `${s && s.i ? 'italic ' : ''}${s && s.b ? 'bold ' : ''}${(pt * 96) / 72}px "${(s && s.ff) || 'Calibri'}", Carlito, Arial, sans-serif`;
  }

  function draw() {
    if (!wb || $('sheet').classList.contains('hidden')) return;
    const canvas = $('sh-canvas'), scr = $('sh-scroll');
    const W = scr.clientWidth, H = scr.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    const g = ctx2d || (ctx2d = canvas.getContext('2d'));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    const s = sheet();
    const sl = scr.scrollLeft, stp = scr.scrollTop;
    const c0 = bsearch(geom.colX, geom.nc, sl), c1 = Math.min(geom.nc - 1, bsearch(geom.colX, geom.nc, sl + W - HW) + 1);
    const r0 = bsearch(geom.rowY, geom.nr, stp), r1 = Math.min(geom.nr - 1, bsearch(geom.rowY, geom.nr, stp + H - HH) + 1);
    const X = (c) => HW + geom.colX[c] - sl, Y = (r) => HH + geom.rowY[r] - stp;

    g.save();
    g.beginPath(); g.rect(HW, HH, W - HW, H - HH); g.clip();

    // fills
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cl = s.cells.get(K(r, c));
      if (cl && cl.s && cl.s.bg) { g.fillStyle = cl.s.bg; g.fillRect(X(c), Y(r), geom.colX[c + 1] - geom.colX[c], geom.rowY[r + 1] - geom.rowY[r]); }
    }
    // grid lines
    g.strokeStyle = '#e1e3e6';
    g.lineWidth = 1;
    g.beginPath();
    for (let c = c0; c <= c1 + 1; c++) { const x = Math.round(X(c)) + 0.5; g.moveTo(x, HH); g.lineTo(x, H); }
    for (let r = r0; r <= r1 + 1; r++) { const y = Math.round(Y(r)) + 0.5; g.moveTo(HW, y); g.lineTo(W, y); }
    g.stroke();
    // merged areas cover their inside lines
    for (const m of s.merges) {
      if (m.r1 < r0 || m.r0 > r1 || m.c1 < c0 || m.c0 > c1) continue;
      const a = s.cells.get(K(m.r0, m.c0));
      g.fillStyle = (a && a.s && a.s.bg) || '#fff';
      g.fillRect(X(m.c0) + 1, Y(m.r0) + 1, X(m.c1 + 1) - X(m.c0) - 1, Y(m.r1 + 1) - Y(m.r0) - 1);
    }
    // text
    g.textBaseline = 'alphabetic';
    const drawText = (r, c, cl, rect) => {
      const text = display(cl);
      if (!text) return;
      const st2 = cl.s || {};
      const v = cl.v;
      let align = st2.ha || (typeof v === 'number' && st2.fmt !== 'text' ? 'right' : typeof v === 'boolean' || F.isErr(v) ? 'center' : 'left');
      g.font = fontOf(st2);
      g.fillStyle = st2.fc || (F.isErr(v) ? '#c00000' : '#1b1b1f');
      const pad = 4;
      const lines = String(text).split('\n');
      const lh = ((st2.fs || 11) * 96) / 72 * 1.25;
      let clipW = rect.w;
      // text spills into empty cells on the right (like Excel)
      if (align === 'left' && lines.length === 1 && !st2.wrap && typeof v !== 'number') {
        const need = g.measureText(text).width + pad * 2;
        let cc = c + 1;
        while (clipW < need && cc < geom.nc && !s.cells.get(K(r, cc)) && !mergeAt(s, r, cc) && cc - c < 40) { clipW += geom.colX[cc + 1] - geom.colX[cc]; cc++; }
      }
      g.save();
      g.beginPath(); g.rect(rect.x + 1, rect.y + 1, clipW - 1, rect.h - 1); g.clip();
      let all = lines;
      if (st2.wrap) {
        all = [];
        for (const ln of lines) {
          let line = '';
          for (const w of ln.split(' ')) {
            const t2 = line ? line + ' ' + w : w;
            if (g.measureText(t2).width > rect.w - pad * 2 && line) { all.push(line); line = w; } else line = t2;
          }
          all.push(line);
        }
      }
      const totalH = all.length * lh;
      let y = st2.va === 'top' ? rect.y + lh * 0.82 + 2 : st2.va === 'center' || all.length > 1 ? rect.y + (rect.h - totalH) / 2 + lh * 0.8 : rect.y + rect.h - 5;
      for (const ln of all) {
        let x = align === 'right' ? rect.x + rect.w - pad : align === 'center' ? rect.x + rect.w / 2 : rect.x + pad;
        let txt = ln;
        if (typeof v === 'number' && align !== 'left' && g.measureText(txt).width > rect.w - pad * 2) txt = '#'.repeat(Math.max(1, Math.floor((rect.w - pad * 2) / g.measureText('#').width)));
        g.textAlign = align;
        g.fillText(txt, x, y);
        if (st2.u || st2.st) {
          const w = g.measureText(txt).width;
          const lx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
          g.fillRect(lx, st2.u ? y + 2 : y - lh * 0.28, w, 1);
        }
        y += lh;
      }
      g.restore();
    };
    for (let r = r0; r <= r1; r++) {
      // cells to the left of the view may spill text into it
      for (let c = Math.max(0, c0 - 6); c <= c1; c++) {
        const cl = s.cells.get(K(r, c));
        if (!cl) continue;
        const m = mergeAt(s, r, c);
        if (m) {
          if (m.r0 !== r || m.c0 !== c) continue;
          drawText(r, c, cl, rangeRect(m.r0, m.c0, m.r1, m.c1));
        } else drawText(r, c, cl, { x: X(c), y: Y(r), w: geom.colX[c + 1] - geom.colX[c], h: geom.rowY[r + 1] - geom.rowY[r] });
      }
    }
    // borders
    g.strokeStyle = '#222';
    g.beginPath();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cl = s.cells.get(K(r, c));
      const bd = cl && cl.s && cl.s.bd;
      if (!bd) continue;
      const x = Math.round(X(c)) + 0.5, y = Math.round(Y(r)) + 0.5, x2 = Math.round(X(c + 1)) + 0.5, y2 = Math.round(Y(r + 1)) + 0.5;
      if (bd.t) { g.moveTo(x, y); g.lineTo(x2, y); }
      if (bd.b) { g.moveTo(x, y2); g.lineTo(x2, y2); }
      if (bd.l) { g.moveTo(x, y); g.lineTo(x, y2); }
      if (bd.r) { g.moveTo(x2, y); g.lineTo(x2, y2); }
    }
    g.stroke();

    // formula references while editing
    if (editing && typeof editing.text === 'string' && editing.text[0] === '=') {
      const colors = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];
      F.refsIn(editing.text.slice(1)).forEach((rf, i) => {
        if (rf.sheet && rf.sheet.toLowerCase() !== s.name.toLowerCase()) return;
        if (rf.r0 === undefined) return;
        const rr = rangeRect(rf.r0, rf.c0, rf.r1, rf.c1);
        g.strokeStyle = colors[i % colors.length]; g.lineWidth = 2;
        g.setLineDash([]);
        g.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
        g.fillStyle = colors[i % colors.length] + '18';
        g.fillRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
      });
      g.lineWidth = 1;
    }
    // copy marquee
    if (clip && clip.sheet === wb.active && clip.show) {
      const rr = rangeRect(clip.r0, clip.c0, clip.r0 + clip.cells.length - 1, clip.c0 + clip.cells[0].length - 1);
      g.setLineDash([5, 3]); g.strokeStyle = '#1d5b79'; g.lineWidth = 1.5;
      g.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
      g.setLineDash([]); g.lineWidth = 1;
    }
    // selection
    const sr = rangeRect(sel.r0, sel.c0, sel.r1, sel.c1);
    if (sel.r0 !== sel.r1 || sel.c0 !== sel.c1) {
      g.fillStyle = 'rgba(29, 91, 121, .10)';
      g.fillRect(sr.x, sr.y, sr.w, sr.h);
      const m = mergeAt(s, cur.r, cur.c);
      const ar = m ? rangeRect(m.r0, m.c0, m.r1, m.c1) : cellRect(cur.r, cur.c);
      const acl = s.cells.get(K(cur.r, cur.c));
      g.fillStyle = (acl && acl.s && acl.s.bg) || '#fff';
      g.globalAlpha = 0.85; g.fillRect(ar.x + 1, ar.y + 1, ar.w - 1, ar.h - 1); g.globalAlpha = 1;
      if (acl) drawText(cur.r, cur.c, acl, ar);
    }
    g.strokeStyle = '#1d6f42'; g.lineWidth = 2;
    g.strokeRect(sr.x + 0.5, sr.y + 0.5, sr.w - 1, sr.h - 1);
    // fill handle
    g.fillStyle = '#1d6f42';
    g.fillRect(sr.x + sr.w - 4, sr.y + sr.h - 4, 7, 7);
    g.fillStyle = '#fff';
    g.fillRect(sr.x + sr.w - 5, sr.y + sr.h - 5, 1, 9);
    g.fillRect(sr.x + sr.w - 5, sr.y + sr.h - 5, 9, 1);
    if (drag && drag.type === 'fill' && drag.to) {
      const t = drag.to;
      const fr = rangeRect(Math.min(sel.r0, t.r0), Math.min(sel.c0, t.c0), Math.max(sel.r1, t.r1), Math.max(sel.c1, t.c1));
      g.setLineDash([4, 3]); g.strokeStyle = '#1d6f42'; g.lineWidth = 1.5;
      g.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
      g.setLineDash([]);
    }
    g.lineWidth = 1;
    g.restore();

    // headers
    g.fillStyle = '#f3f4f6';
    g.fillRect(0, 0, W, HH);
    g.fillRect(0, 0, HW, H);
    g.font = '12px "Segoe UI", Tahoma, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    for (let c = c0; c <= c1; c++) {
      const x = X(c), w = geom.colX[c + 1] - geom.colX[c];
      if (x + w < HW) continue;
      const on = c >= sel.c0 && c <= sel.c1;
      if (on) { g.fillStyle = sel.r0 === 0 && sel.r1 === geom.nr - 1 ? '#c6dfd0' : '#dde8e2'; g.fillRect(Math.max(HW, x), 0, w, HH); }
      g.fillStyle = on ? '#1d6f42' : '#5f6368';
      g.fillText(F.colName(c), x + w / 2, HH / 2 + 5);
    }
    g.textAlign = 'right';
    for (let r = r0; r <= r1; r++) {
      const y = Y(r), h = geom.rowY[r + 1] - geom.rowY[r];
      if (y + h < HH) continue;
      const on = r >= sel.r0 && r <= sel.r1;
      if (on) { g.fillStyle = sel.c0 === 0 && sel.c1 === geom.nc - 1 ? '#c6dfd0' : '#dde8e2'; g.fillRect(0, Math.max(HH, y), HW, h); }
      g.fillStyle = on ? '#1d6f42' : '#5f6368';
      g.fillText(String(r + 1), HW - 8, y + h / 2 + 5);
    }
    g.strokeStyle = '#d0d3d8';
    g.beginPath();
    for (let c = c0; c <= c1 + 1; c++) { const x = Math.round(X(c)) + 0.5; if (x >= HW) { g.moveTo(x, 0); g.lineTo(x, HH); } }
    for (let r = r0; r <= r1 + 1; r++) { const y = Math.round(Y(r)) + 0.5; if (y >= HH) { g.moveTo(0, y); g.lineTo(HW, y); } }
    g.moveTo(0, HH + 0.5); g.lineTo(W, HH + 0.5);
    g.moveTo(HW + 0.5, 0); g.lineTo(HW + 0.5, H);
    g.stroke();
    g.fillStyle = '#e8eaed';
    g.fillRect(0, 0, HW, HH);
    // select-all triangle
    g.fillStyle = '#b9bdc3';
    g.beginPath(); g.moveTo(HW - 4, HH - 4); g.lineTo(HW - 4, HH - 14); g.lineTo(HW - 14, HH - 4); g.closePath(); g.fill();

    positionEditor();
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  function setSel(r0, c0, r1, c1, keepAnchor) {
    const s = sheet();
    let a = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
    // grow to include merged cells touched
    for (let pass = 0; pass < 3; pass++) {
      for (const m of s.merges) {
        if (m.r1 < a.r0 || m.r0 > a.r1 || m.c1 < a.c0 || m.c0 > a.c1) continue;
        a = { r0: Math.min(a.r0, m.r0), c0: Math.min(a.c0, m.c0), r1: Math.max(a.r1, m.r1), c1: Math.max(a.c1, m.c1) };
      }
    }
    sel = a;
    if (!keepAnchor) { cur = { r: r0, c: c0 }; anchor = { r: r0, c: c0 }; }
    syncBar();
    schedule();
  }

  function selectCell(r, c) {
    r = Math.max(0, r); c = Math.max(0, Math.min(MAXC - 1, c));
    const m = mergeAt(sheet(), r, c);
    if (m) { r = m.r0; c = m.c0; }
    cur = { r, c }; anchor = { r, c };
    setSel(r, c, m ? m.r1 : r, m ? m.c1 : c, true);
    scrollIntoView(r, c);
  }

  function extendTo(r, c) {
    r = Math.max(0, r); c = Math.max(0, c);
    setSel(anchor.r, anchor.c, r, c, true);
    scrollIntoView(r, c);
  }

  function scrollIntoView(r, c) {
    if (r >= geom.nr - 5 || c >= geom.nc - 3) layout();
    const scr = $('sh-scroll');
    const x = geom.colX[c], x2 = geom.colX[c + 1], y = geom.rowY[r], y2 = geom.rowY[r + 1];
    const vw = scr.clientWidth - HW, vh = scr.clientHeight - HH;
    if (x < scr.scrollLeft) scr.scrollLeft = x;
    else if (x2 > scr.scrollLeft + vw) scr.scrollLeft = x2 - vw;
    if (y < scr.scrollTop) scr.scrollTop = y;
    else if (y2 > scr.scrollTop + vh) scr.scrollTop = y2 - vh;
  }

  function selName() {
    const a = F.addr(sel.r0, sel.c0);
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) return a;
    const m = mergeAt(sheet(), sel.r0, sel.c0);
    if (m && m.r0 === sel.r0 && m.c0 === sel.c0 && m.r1 === sel.r1 && m.c1 === sel.c1) return a;
    return a + ':' + F.addr(sel.r1, sel.c1);
  }

  function syncBar() {
    if (!wb) return;
    $('sh-cellname').value = selName();
    if (!editing) {
      const cl = cell(sheet(), cur.r, cur.c);
      $('sh-input').value = cl ? inputText(cl) : '';
    }
    stats();
    refreshTools();
  }

  function inputText(cl) {
    if (typeof cl.in === 'number') {
      const f = cl.s && cl.s.fmt;
      if (f === 'date') return display(cl);
      if (f === 'pct') return F.fmtGeneral(cl.in * 100) + '%';
      return F.fmtGeneral(cl.in);
    }
    if (typeof cl.in === 'boolean') return cl.in ? 'TRUE' : 'FALSE';
    return String(cl.in == null ? '' : cl.in);
  }

  function stats() {
    const s = sheet();
    let sum = 0, n = 0, cnt = 0;
    const big = (sel.r1 - sel.r0 + 1) * (sel.c1 - sel.c0 + 1) > 200000;
    if (!big) {
      for (const [k, cl] of s.cells) {
        const { r, c } = RC(k);
        if (r < sel.r0 || r > sel.r1 || c < sel.c0 || c > sel.c1) continue;
        if (cl.v !== null && cl.v !== '' && cl.v !== undefined) cnt++;
        if (typeof cl.v === 'number') { sum += cl.v; n++; }
      }
    }
    const el2 = $('sh-stat');
    if (cnt > 1 || n > 1) el2.innerHTML = `Medie: <b>${n ? ro(sum / n, 2) : '—'}</b> &nbsp; Număr: <b>${cnt}</b> &nbsp; Sumă: <b>${ro(sum, 2)}</b>`;
    else el2.textContent = '';
  }

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------

  function serialize() {
    return JSON.stringify({
      active: wb.active,
      sheets: wb.sheets.map((s) => ({ name: s.name, colW: s.colW, rowH: s.rowH, merges: s.merges, cells: [...s.cells].map(([k, cl]) => [k, cl.in, cl.s || null]) })),
    });
  }
  function deserialize(json) {
    const o = JSON.parse(json);
    return {
      active: Math.min(o.active, o.sheets.length - 1),
      sheets: o.sheets.map((s) => ({ name: s.name, colW: s.colW || {}, rowH: s.rowH || {}, merges: s.merges || [], cells: new Map(s.cells.map(([k, i, st2]) => [k, st2 ? { in: i, s: st2 } : { in: i }])) })),
    };
  }

  function change(fn, { keepGeom } = {}) {
    history.push(serialize());
    if (history.length > 60) history.shift();
    future = [];
    fn();
    recalc();
    if (!keepGeom) layout();
    markDirty();
    syncBar();
    schedule();
  }

  function undo() {
    if (!history.length) return;
    future.push(serialize());
    wb = deserialize(history.pop());
    afterRestore();
  }
  function redo() {
    if (!future.length) return;
    history.push(serialize());
    wb = deserialize(future.pop());
    afterRestore();
  }
  function afterRestore() {
    geom = null;
    recalc();
    layout();
    renderTabs();
    markDirty();
    setSel(sel.r0, sel.c0, sel.r1, sel.c1, true);
  }

  function markDirty() {
    st.dirty = true;
    $('sh-dirty').classList.remove('hidden');
    $('sh-undo').disabled = !history.length;
    $('sh-redo').disabled = !future.length;
  }

  // ---------------------------------------------------------------------------
  // Editing a cell
  // ---------------------------------------------------------------------------

  function startEdit(mode, initial) {
    const s = sheet();
    const cl = cell(s, cur.r, cur.c);
    const text = initial !== undefined ? initial : cl ? inputText(cl) : '';
    editing = { r: cur.r, c: cur.c, mode, text, orig: cl ? inputText(cl) : '' };
    const ed = $('sh-edit');
    ed.classList.remove('hidden');
    ed.value = text;
    styleEditor();
    positionEditor();
    ed.focus();
    const n = ed.value.length;
    ed.setSelectionRange(n, n);
    $('sh-input').value = text;
    schedule();
  }

  function styleEditor() {
    const cl = cell(sheet(), editing.r, editing.c);
    const s = (cl && cl.s) || {};
    const ed = $('sh-edit');
    ed.style.font = fontOf(s);
    ed.style.color = s.fc || '#1b1b1f';
    ed.style.background = s.bg || '#fff';
    ed.style.textAlign = s.ha || 'left';
  }

  function positionEditor() {
    if (!editing) return;
    const ed = $('sh-edit');
    const m = mergeAt(sheet(), editing.r, editing.c);
    const r = m ? rangeRect(m.r0, m.c0, m.r1, m.c1) : cellRect(editing.r, editing.c);
    // grow to fit the text
    const g = ctx2d;
    let w = r.w;
    if (g) {
      g.font = ed.style.font;
      const tw = Math.max(...ed.value.split('\n').map((l) => g.measureText(l).width)) + 14;
      w = Math.max(r.w, Math.min(tw, 700));
    }
    const lines = Math.max(1, ed.value.split('\n').length);
    ed.style.left = r.x + 'px';
    ed.style.top = r.y + 'px';
    ed.style.width = w + 1 + 'px';
    ed.style.height = Math.max(r.h, lines * 20 + 4) + 1 + 'px';
  }

  function commitEdit(move) {
    if (!editing) return;
    const ed = $('sh-edit');
    const text = ed.value;
    const { r, c, orig } = editing;
    editing = null;
    ed.classList.add('hidden');
    $('sh-scroll').focus({ preventScroll: true });
    if (text !== orig) {
      const fixed = autoCloseParens(text);
      change(() => setInput(sheet(), r, c, fixed), { keepGeom: false });
      rememberWidth(r, c);
    } else schedule();
    if (move) {
      const [dr, dc] = move;
      if (sel.r0 !== sel.r1 || sel.c0 !== sel.c1) {
        // move inside the selection (Enter/Tab cycle like Excel)
        let nr = cur.r + dr, nc = cur.c + dc;
        if (nc > sel.c1) { nc = sel.c0; nr++; }
        if (nc < sel.c0) { nc = sel.c1; nr--; }
        if (nr > sel.r1) { nr = sel.r0; nc = dc ? nc : nc + 1 > sel.c1 ? sel.c0 : nc + 1; }
        if (nr < sel.r0) nr = sel.r1;
        cur = { r: nr, c: nc };
        syncBar(); schedule(); scrollIntoView(nr, nc);
      } else selectCell(r + dr, c + dc);
    } else syncBar();
  }

  function autoCloseParens(t) {
    if (t[0] !== '=') return t;
    let open = 0, q = false;
    for (const ch of t) { if (ch === '"') q = !q; else if (!q && ch === '(') open++; else if (!q && ch === ')') open--; }
    return open > 0 ? t + ')'.repeat(open) : t;
  }

  function cancelEdit() {
    if (!editing) return;
    editing = null;
    $('sh-edit').classList.add('hidden');
    $('sh-scroll').focus({ preventScroll: true });
    syncBar();
    schedule();
  }

  /** In a formula, clicking cells types their address (like Excel). */
  function pointMode() {
    if (!editing) return false;
    const ed = $('sh-edit');
    const v = ed.value;
    if (v[0] !== '=') return false;
    const before = v.slice(0, ed.selectionStart);
    return /[=+\-*/^&(,;:<>]\s*$/.test(before) || /[=+\-*/^&(,;:<>]\s*\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d+)?$/i.test(before);
  }

  function insertRef(r0, c0, r1, c1) {
    const ed = $('sh-edit');
    const v = ed.value;
    let pos = ed.selectionStart;
    let before = v.slice(0, pos);
    const after = v.slice(ed.selectionEnd);
    before = before.replace(/\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d+)?$/i, '');
    const ref = F.addr(r0, c0) + (r0 !== r1 || c0 !== c1 ? ':' + F.addr(r1, c1) : '');
    ed.value = before + ref + after;
    pos = before.length + ref.length;
    ed.setSelectionRange(pos, pos);
    editing.text = ed.value;
    $('sh-input').value = ed.value;
    positionEditor();
    schedule();
  }

  function rememberWidth(r, c) {
    // nothing for now: column widths stay as they are (like Excel)
  }

  // ---------------------------------------------------------------------------
  // Range operations
  // ---------------------------------------------------------------------------

  function eachSel(fn) {
    const lastR = Math.min(sel.r1, Math.max(used(sheet()).r1, sel.r0) + (sel.r1 - sel.r0 > 1000 ? 0 : sel.r1 - sel.r0));
    const lastC = Math.min(sel.c1, Math.max(used(sheet()).c1 + 1, sel.c0 + 50));
    for (let r = sel.r0; r <= Math.min(sel.r1, lastR, sel.r0 + 5000); r++) for (let c = sel.c0; c <= Math.min(sel.c1, lastC); c++) fn(r, c);
  }

  function applyStyle(patch) {
    change(() => {
      const s = sheet();
      eachSel((r, c) => {
        let cl = cell(s, r, c);
        if (!cl) { cl = { in: '' }; s.cells.set(K(r, c), cl); }
        const ns = { ...(cl.s || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete ns[k]; else ns[k] = v; }
        cl.s = Object.keys(ns).length ? ns : undefined;
        if (!cl.s) delete cl.s;
        if (cl.in === '' && !cl.s) s.cells.delete(K(r, c));
      });
    }, { keepGeom: true });
  }

  function curStyle() {
    const cl = cell(sheet(), cur.r, cur.c);
    return (cl && cl.s) || {};
  }

  function toggleStyle(k) { applyStyle({ [k]: curStyle()[k] ? null : true }); }

  function clearSel() {
    change(() => {
      const s = sheet();
      eachSel((r, c) => {
        const cl = cell(s, r, c);
        if (!cl) return;
        if (cl.s) cl.in = ''; else s.cells.delete(K(r, c));
      });
    });
  }

  function setBorders(kind) {
    change(() => {
      const s = sheet();
      eachSel((r, c) => {
        let cl = cell(s, r, c);
        if (!cl) { cl = { in: '' }; s.cells.set(K(r, c), cl); }
        const ns = { ...(cl.s || {}) };
        if (kind === 'none') delete ns.bd;
        else if (kind === 'all') ns.bd = { t: 1, b: 1, l: 1, r: 1 };
        else if (kind === 'outer') {
          const bd = { ...(ns.bd || {}) };
          if (r === sel.r0) bd.t = 1;
          if (r === sel.r1) bd.b = 1;
          if (c === sel.c0) bd.l = 1;
          if (c === sel.c1) bd.r = 1;
          ns.bd = bd;
        } else if (kind === 'bottom') {
          if (r === sel.r1) ns.bd = { ...(ns.bd || {}), b: 1 };
        }
        cl.s = ns;
        if (cl.in === '' && !Object.keys(cl.s).length) s.cells.delete(K(r, c));
      });
    }, { keepGeom: true });
  }

  function changeDecimals(d) {
    const s0 = curStyle();
    const cl = cell(sheet(), cur.r, cur.c);
    let dec = s0.dec;
    if (dec === undefined) {
      if (['num', 'lei'].includes(s0.fmt)) dec = 2;
      else if (s0.fmt === 'pct') dec = 0;
      else {
        const v = cl && typeof cl.v === 'number' ? cl.v : 0;
        const str = String(Math.round(v * 1e8) / 1e8);
        dec = str.includes('.') ? str.split('.')[1].length : 0;
      }
    }
    applyStyle({ dec: Math.max(0, Math.min(10, dec + d)) });
  }

  function toggleMerge() {
    const s = sheet();
    const one = sel.r0 === sel.r1 && sel.c0 === sel.c1;
    const exact = s.merges.findIndex((m) => m.r0 === sel.r0 && m.c0 === sel.c0 && m.r1 === sel.r1 && m.c1 === sel.c1);
    if (exact >= 0) { change(() => { s.merges.splice(exact, 1); }); return; }
    if (one) return;
    let others = 0;
    eachSel((r, c) => { if ((r !== sel.r0 || c !== sel.c0) && cell(s, r, c) && cell(s, r, c).in !== '') others++; });
    const go = () => change(() => {
      s.merges = s.merges.filter((m) => m.r1 < sel.r0 || m.r0 > sel.r1 || m.c1 < sel.c0 || m.c0 > sel.c1);
      eachSel((r, c) => { if (r !== sel.r0 || c !== sel.c0) s.cells.delete(K(r, c)); });
      s.merges.push({ ...sel });
      const cl = cell(s, sel.r0, sel.c0);
      if (cl) cl.s = { ...(cl.s || {}), ha: (cl.s && cl.s.ha) || 'center' };
    });
    if (others) UI.confirm('Îmbin celulele?', 'Rămâne doar valoarea din prima celulă (stânga sus); celelalte se șterg.', 'Îmbină').then((ok) => ok && go());
    else go();
  }

  function autoSum() {
    const s = sheet();
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) {
      const r = cur.r, c = cur.c;
      const num = (rr, cc) => { const x = cell(s, rr, cc); return x && typeof x.v === 'number'; };
      let r0 = r - 1;
      while (r0 >= 0 && num(r0, c)) r0--;
      if (r0 < r - 1) { change(() => setInput(s, r, c, `=SUM(${F.addr(r0 + 1, c)}:${F.addr(r - 1, c)})`)); selectCell(r, c); return; }
      let c0 = c - 1;
      while (c0 >= 0 && num(r, c0)) c0--;
      if (c0 < c - 1) { change(() => setInput(s, r, c, `=SUM(${F.addr(r, c0 + 1)}:${F.addr(r, c - 1)})`)); selectCell(r, c); return; }
      startEdit('enter', '=SUM()');
      const ed = $('sh-edit'); ed.setSelectionRange(5, 5);
      return;
    }
    // a range: the total of each column goes under it
    change(() => {
      for (let c = sel.c0; c <= sel.c1; c++) setInput(s, sel.r1 + 1, c, `=SUM(${F.addr(sel.r0, c)}:${F.addr(sel.r1, c)})`);
    });
  }

  function sortSel(desc) {
    const s = sheet();
    let { r0, c0, r1, c1 } = sel;
    if (r0 === r1 && c0 === c1) {
      // the block of data around the cell
      const u = used(s);
      const filled = (r, c) => { const x = cell(s, r, c); return x && x.in !== ''; };
      r0 = cur.r; r1 = cur.r; c0 = cur.c; c1 = cur.c;
      while (r0 > 0 && filled(r0 - 1, cur.c)) r0--;
      while (r1 < u.r1 && filled(r1 + 1, cur.c)) r1++;
      while (c0 > 0 && filled(r0, c0 - 1)) c0--;
      while (c1 < u.c1 && filled(r0, c1 + 1)) c1++;
      // first row is a header when it is text above numbers
      const h = cell(s, r0, cur.c), n2 = cell(s, r0 + 1, cur.c);
      if (h && typeof h.v === 'string' && n2 && typeof n2.v === 'number') r0++;
    }
    if (r1 <= r0) return;
    const key = sel.r0 === sel.r1 && sel.c0 === sel.c1 ? cur.c : c0;
    change(() => {
      const rows = [];
      for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(cell(s, r, c) || null); rows.push({ row, r }); }
      const cmp = (a, b) => {
        const va = a.row[key - c0] ? a.row[key - c0].v : null, vb = b.row[key - c0] ? b.row[key - c0].v : null;
        if (va === null || va === '' || va === undefined) return 1;
        if (vb === null || vb === '' || vb === undefined) return -1;
        let x;
        if (typeof va === 'number' && typeof vb === 'number') x = va - vb;
        else x = String(va).localeCompare(String(vb), 'ro', { sensitivity: 'base', numeric: true });
        return desc ? -x : x;
      };
      rows.sort(cmp);
      rows.forEach(({ row, r: from }, i) => {
        const r = r0 + i;
        for (let c = c0; c <= c1; c++) {
          const cl = row[c - c0];
          s.cells.delete(K(r, c));
          if (cl) {
            const copy = { ...cl };
            if (typeof copy.in === 'string' && copy.in[0] === '=') copy.in = '=' + F.shift(copy.in.slice(1), r - from, 0);
            s.cells.set(K(r, c), copy);
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Rows and columns
  // ---------------------------------------------------------------------------

  function insertDelete(rows, at, n) {
    change(() => {
      const s = sheet();
      const moved = new Map();
      for (const [k, cl] of s.cells) {
        const { r, c } = RC(k);
        const idx = rows ? r : c;
        if (n < 0 && idx >= at && idx < at - n) continue;
        const ni = idx >= at ? idx + n : idx;
        moved.set(rows ? K(ni, c) : K(r, ni), cl);
      }
      s.cells = moved;
      const shiftMap = (obj) => {
        const out = {};
        for (const [kk, v] of Object.entries(obj)) {
          const i = +kk;
          if (n < 0 && i >= at && i < at - n) continue;
          out[i >= at ? i + n : i] = v;
        }
        return out;
      };
      if (rows) s.rowH = shiftMap(s.rowH); else s.colW = shiftMap(s.colW);
      s.merges = s.merges.map((m) => {
        const a = rows ? 'r0' : 'c0', b = rows ? 'r1' : 'c1';
        const m2 = { ...m };
        if (n > 0) { if (m2[a] >= at) m2[a] += n; if (m2[b] >= at) m2[b] += n; }
        else {
          const del0 = at, del1 = at - n - 1;
          if (m2[b] < del0) return m2;
          if (m2[a] > del1) { m2[a] += n; m2[b] += n; return m2; }
          m2[b] = Math.max(m2[a], m2[b] + Math.max(n, -(Math.min(m2[b], del1) - Math.max(m2[a], del0) + 1)));
          if (m2[a] >= del0) m2[a] = del0;
          if (m2[b] < m2[a]) return null;
        }
        return m2;
      }).filter((m) => m && (m.r1 > m.r0 || m.c1 > m.c0));
      // formulas everywhere follow the move
      for (const s2 of wb.sheets) {
        for (const cl of s2.cells.values()) {
          if (typeof cl.in === 'string' && cl.in[0] === '=') cl.in = '=' + F.adjustStructure(cl.in.slice(1), { rows, at, n, sheet: s.name, ownSheet: s2.name });
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  const clipboard = () => Lib.clipboard;

  function copy(cut) {
    const s = sheet();
    const cells = [];
    const lines = [];
    for (let r = sel.r0; r <= sel.r1; r++) {
      const row = [], txt = [];
      for (let c = sel.c0; c <= sel.c1; c++) {
        const cl = cell(s, r, c);
        row.push(cl ? { in: cl.in, s: cl.s ? { ...cl.s } : undefined } : null);
        txt.push(cl ? display(cl).replace(/\t|\n/g, ' ') : '');
      }
      cells.push(row);
      lines.push(txt.join('\t'));
    }
    const text = lines.join('\r\n');
    try { clipboard().writeText(text); } catch (e) { navigator.clipboard.writeText(text); }
    clip = { text, cells, r0: sel.r0, c0: sel.c0, cut: !!cut, sheet: wb.active, show: true };
    schedule();
  }

  function paste() {
    let text = '';
    try { text = clipboard().readText(); } catch (e) {}
    const s = sheet();
    if (clip && text === clip.text) {
      const { cells } = clip;
      const h = cells.length, w = cells[0].length;
      // a bigger selection repeats what was copied
      const reps = (sel.r1 - sel.r0 + 1) % h === 0 && (sel.c1 - sel.c0 + 1) % w === 0 ? [(sel.r1 - sel.r0 + 1) / h, (sel.c1 - sel.c0 + 1) / w] : [1, 1];
      const src = wb.sheets[clip.sheet];
      change(() => {
        if (clip.cut) for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) src.cells.delete(K(clip.r0 + r, clip.c0 + c));
        for (let i = 0; i < reps[0]; i++) for (let j = 0; j < reps[1]; j++) {
          for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
            const tr = sel.r0 + i * h + r, tc = sel.c0 + j * w + c;
            const x = cells[r][c];
            if (!x) { s.cells.delete(K(tr, tc)); continue; }
            let input = x.in;
            if (typeof input === 'string' && input[0] === '=' && !clip.cut) input = '=' + F.shift(input.slice(1), tr - (clip.r0 + r), tc - (clip.c0 + c));
            s.cells.set(K(tr, tc), x.s ? { in: input, s: { ...x.s } } : { in: input });
          }
        }
      });
      setSel(sel.r0, sel.c0, sel.r0 + h * reps[0] - 1, sel.c0 + w * reps[1] - 1, true);
      if (clip.cut) clip = null;
      return;
    }
    if (!text) return;
    // text from elsewhere (Excel, a web page, Word): tabs and lines
    const rows = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    change(() => {
      rows.forEach((row, i) => row.forEach((v, j) => setInput(s, sel.r0 + i, sel.c0 + j, v)));
    });
    setSel(sel.r0, sel.c0, sel.r0 + rows.length - 1, sel.c0 + Math.max(...rows.map((r) => r.length)) - 1, true);
  }

  // ---------------------------------------------------------------------------
  // Fill handle (drag the small square to copy / continue a series)
  // ---------------------------------------------------------------------------

  function doFill(to) {
    const s = sheet();
    const src = { ...sel };
    const down = to.r1 > src.r1, up = to.r0 < src.r0, right = to.c1 > src.c1, left = to.c0 < src.c0;
    if (!down && !up && !right && !left) return;
    change(() => {
      if (down || up) {
        const h = src.r1 - src.r0 + 1;
        for (let c = src.c0; c <= src.c1; c++) {
          const vals = []; for (let r = src.r0; r <= src.r1; r++) vals.push(cell(s, r, c));
          const nums = vals.every((x) => x && typeof x.in === 'number');
          const step = nums && h >= 2 ? vals[h - 1].in - vals[h - 2].in : nums && h === 1 && false ? 1 : null;
          const targets = down ? range(src.r1 + 1, to.r1) : range(to.r0, src.r0 - 1).reverse();
          targets.forEach((r, i) => {
            const k = down ? i % h : (h - 1 - (i % h));
            const from = down ? src.r0 + k : src.r0 + k;
            const x = cell(s, from, c);
            if (!x) { s.cells.delete(K(r, c)); return; }
            let input = x.in;
            if (step !== null) input = down ? vals[h - 1].in + step * (i + 1) : vals[0].in - step * (i + 1);
            else if (typeof input === 'string' && input[0] === '=') input = '=' + F.shift(input.slice(1), r - from, 0);
            s.cells.set(K(r, c), x.s ? { in: input, s: { ...x.s } } : { in: input });
          });
        }
      } else {
        const w = src.c1 - src.c0 + 1;
        for (let r = src.r0; r <= src.r1; r++) {
          const vals = []; for (let c = src.c0; c <= src.c1; c++) vals.push(cell(s, r, c));
          const nums = vals.every((x) => x && typeof x.in === 'number');
          const step = nums && w >= 2 ? vals[w - 1].in - vals[w - 2].in : null;
          const targets = right ? range(src.c1 + 1, to.c1) : range(to.c0, src.c0 - 1).reverse();
          targets.forEach((c, i) => {
            const k = right ? i % w : (w - 1 - (i % w));
            const from = src.c0 + k;
            const x = cell(s, r, from);
            if (!x) { s.cells.delete(K(r, c)); return; }
            let input = x.in;
            if (step !== null) input = right ? vals[w - 1].in + step * (i + 1) : vals[0].in - step * (i + 1);
            else if (typeof input === 'string' && input[0] === '=') input = '=' + F.shift(input.slice(1), 0, c - from);
            s.cells.set(K(r, c), x.s ? { in: input, s: { ...x.s } } : { in: input });
          });
        }
      }
    });
    setSel(Math.min(src.r0, to.r0), Math.min(src.c0, to.c0), Math.max(src.r1, to.r1), Math.max(src.c1, to.c1), true);
  }
  const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };

  // ---------------------------------------------------------------------------
  // Mouse
  // ---------------------------------------------------------------------------

  function onDown(e) {
    if (e.button === 2) return;
    const scr = $('sh-scroll');
    // clicks on the scrollbars
    const rr = scr.getBoundingClientRect();
    if (e.clientX - rr.left > scr.clientWidth || e.clientY - rr.top > scr.clientHeight) return;
    const h = hit(e.clientX, e.clientY);
    Office.closePicker();
    // column / row resize
    if (h.part === 'colh') {
      const edgeC = nearColEdge(h);
      if (edgeC !== null) { e.preventDefault(); drag = { type: 'colw', c: edgeC, x0: e.clientX, w0: colWidth(sheet(), edgeC) }; capture(e); return; }
    }
    if (h.part === 'rowh') {
      const edgeR = nearRowEdge(h);
      if (edgeR !== null) { e.preventDefault(); drag = { type: 'rowh', r: edgeR, y0: e.clientY, h0: rowHeight(sheet(), edgeR) }; capture(e); return; }
    }
    if (editing) {
      if (h.part === 'cell' && pointMode()) {
        e.preventDefault();
        drag = { type: 'point', r: h.r, c: h.c };
        insertRef(h.r, h.c, h.r, h.c);
        capture(e);
        return;
      }
      commitEdit(null);
    }
    scr.focus({ preventScroll: true });
    if (h.part === 'corner') { setSel(0, 0, geom.nr - 1, geom.nc - 1, true); cur = { r: 0, c: 0 }; return; }
    if (h.part === 'colh') {
      if (e.shiftKey) setSel(0, anchor.c, geom.nr - 1, h.c, true);
      else { cur = { r: 0, c: h.c }; anchor = { r: 0, c: h.c }; setSel(0, h.c, geom.nr - 1, h.c, true); }
      drag = { type: 'cols' }; capture(e); return;
    }
    if (h.part === 'rowh') {
      if (e.shiftKey) setSel(anchor.r, 0, h.r, geom.nc - 1, true);
      else { cur = { r: h.r, c: 0 }; anchor = { r: h.r, c: 0 }; setSel(h.r, 0, h.r, geom.nc - 1, true); }
      drag = { type: 'rows' }; capture(e); return;
    }
    // fill handle
    const sr = rangeRect(sel.r0, sel.c0, sel.r1, sel.c1);
    if (Math.abs(h.x - (sr.x + sr.w)) < 6 && Math.abs(h.y - (sr.y + sr.h)) < 6) {
      drag = { type: 'fill', to: null }; capture(e); return;
    }
    if (e.shiftKey) extendTo(h.r, h.c);
    else selectCell(h.r, h.c);
    drag = { type: 'sel' };
    capture(e);
  }

  function capture(e) {
    const scr = $('sh-scroll');
    try { scr.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function nearColEdge(h) {
    const x = h.gx;
    const c = h.c;
    if (Math.abs(geom.colX[c + 1] - x) <= 4) return c;
    if (c > 0 && Math.abs(geom.colX[c] - x) <= 4) return c - 1;
    return null;
  }
  function nearRowEdge(h) {
    const y = h.gy;
    const r = h.r;
    if (Math.abs(geom.rowY[r + 1] - y) <= 3) return r;
    if (r > 0 && Math.abs(geom.rowY[r] - y) <= 3) return r - 1;
    return null;
  }

  let autoScrollTimer = 0;
  function onMove(e) {
    const scr = $('sh-scroll');
    if (!drag) {
      const h = hit(e.clientX, e.clientY);
      let cursor = 'cell';
      if (h.part === 'colh') cursor = nearColEdge(h) !== null ? 'col-resize' : 's-resize';
      else if (h.part === 'rowh') cursor = nearRowEdge(h) !== null ? 'row-resize' : 'e-resize';
      else if (h.part === 'cell') {
        const sr = rangeRect(sel.r0, sel.c0, sel.r1, sel.c1);
        if (Math.abs(h.x - (sr.x + sr.w)) < 6 && Math.abs(h.y - (sr.y + sr.h)) < 6) cursor = 'crosshair';
      }
      scr.dataset.cursor = cursor;
      return;
    }
    const h = hit(e.clientX, e.clientY);
    if (drag.type === 'colw') {
      const w = Math.max(18, drag.w0 + (e.clientX - drag.x0));
      sheet().colW[drag.c] = w;
      layout(); schedule(); return;
    }
    if (drag.type === 'rowh') {
      const hh = Math.max(12, drag.h0 + (e.clientY - drag.y0));
      sheet().rowH[drag.r] = hh;
      layout(); schedule(); return;
    }
    if (drag.type === 'sel') extendTo(h.r, h.c);
    else if (drag.type === 'cols') setSel(0, anchor.c, geom.nr - 1, h.c, true);
    else if (drag.type === 'rows') setSel(anchor.r, 0, h.r, geom.nc - 1, true);
    else if (drag.type === 'point') insertRef(Math.min(drag.r, h.r), Math.min(drag.c, h.c), Math.max(drag.r, h.r), Math.max(drag.c, h.c));
    else if (drag.type === 'fill') {
      const dr = h.r > sel.r1 ? h.r - sel.r1 : h.r < sel.r0 ? h.r - sel.r0 : 0;
      const dc = h.c > sel.c1 ? h.c - sel.c1 : h.c < sel.c0 ? h.c - sel.c0 : 0;
      if (Math.abs(dr) >= Math.abs(dc)) drag.to = dr > 0 ? { r0: sel.r0, c0: sel.c0, r1: h.r, c1: sel.c1 } : dr < 0 ? { r0: h.r, c0: sel.c0, r1: sel.r1, c1: sel.c1 } : null;
      else drag.to = dc > 0 ? { r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: h.c } : { r0: sel.r0, c0: h.c, r1: sel.r1, c1: sel.c1 };
      schedule();
    }
    // auto scroll at the edges
    const g = $('sh-grid').getBoundingClientRect();
    clearInterval(autoScrollTimer);
    const dx = e.clientX > g.left + scr.clientWidth - 10 ? 30 : e.clientX < g.left + HW ? -30 : 0;
    const dy = e.clientY > g.top + scr.clientHeight - 10 ? 30 : e.clientY < g.top + HH ? -30 : 0;
    if (dx || dy) autoScrollTimer = setInterval(() => { scr.scrollLeft += dx; scr.scrollTop += dy; }, 40);
  }

  function onUp() {
    clearInterval(autoScrollTimer);
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === 'colw' || d.type === 'rowh') {
      // make it an undoable change
      const s = sheet();
      const val = d.type === 'colw' ? s.colW[d.c] : s.rowH[d.r];
      if (d.type === 'colw') s.colW[d.c] = d.w0; else s.rowH[d.r] = d.h0;
      change(() => { if (d.type === 'colw') s.colW[d.c] = val; else s.rowH[d.r] = val; });
    } else if (d.type === 'fill' && d.to) doFill(d.to);
    else if (d.type === 'point') $('sh-edit').focus();
    schedule();
  }

  function onDbl(e) {
    const h = hit(e.clientX, e.clientY);
    if (h.part === 'colh') {
      const c = nearColEdge(h);
      if (c !== null) { autofit(c); return; }
    }
    if (h.part === 'cell') { selectCell(h.r, h.c); startEdit('edit'); }
  }

  function autofit(c) {
    const s = sheet();
    const g = ctx2d;
    let w = 30;
    for (const [k, cl] of s.cells) {
      const p = RC(k);
      if (p.c !== c || mergeAt(s, p.r, p.c)) continue;
      g.font = fontOf(cl.s);
      w = Math.max(w, g.measureText(display(cl)).width + 12);
    }
    change(() => { s.colW[c] = Math.min(600, Math.ceil(w)); });
  }

  function onContext(e) {
    e.preventDefault();
    const h = hit(e.clientX, e.clientY);
    if (h.part === 'cell' && (h.r < sel.r0 || h.r > sel.r1 || h.c < sel.c0 || h.c > sel.c1)) selectCell(h.r, h.c);
    const rows = sel.c0 === 0 && sel.c1 === geom.nc - 1, cols = sel.r0 === 0 && sel.r1 === geom.nr - 1;
    const nr = sel.r1 - sel.r0 + 1, nc = sel.c1 - sel.c0 + 1;
    const items = [
      { label: 'Taie', icon: 'copy', run: () => copy(true) },
      { label: 'Copiază', icon: 'copy', run: () => copy(false) },
      { label: 'Lipește', icon: 'copy', run: () => paste() },
      '-',
    ];
    if (!cols) items.push(
      { label: nr > 1 ? `Inserează ${nr} rânduri deasupra` : 'Inserează rând deasupra', icon: 'up', run: () => insertDelete(true, sel.r0, nr) },
      { label: nr > 1 ? `Inserează ${nr} rânduri dedesubt` : 'Inserează rând dedesubt', icon: 'down', run: () => insertDelete(true, sel.r1 + 1, nr) },
    );
    if (!rows) items.push(
      { label: nc > 1 ? `Inserează ${nc} coloane la stânga` : 'Inserează coloană la stânga', icon: 'left', run: () => insertDelete(false, sel.c0, nc) },
      { label: nc > 1 ? `Inserează ${nc} coloane la dreapta` : 'Inserează coloană la dreapta', icon: 'right', run: () => insertDelete(false, sel.c1 + 1, nc) },
    );
    items.push('-');
    if (!cols) items.push({ label: nr > 1 ? `Șterge ${nr} rânduri` : 'Șterge rândul', icon: 'del', run: () => insertDelete(true, sel.r0, -nr) });
    if (!rows) items.push({ label: nc > 1 ? `Șterge ${nc} coloane` : 'Șterge coloana', icon: 'del', run: () => insertDelete(false, sel.c0, -nc) });
    items.push({ label: 'Golește celulele', icon: 'close', run: () => clearSel() }, '-',
      { label: 'Sortează A → Z', icon: 'up', run: () => sortSel(false) },
      { label: 'Sortează Z → A', icon: 'down', run: () => sortSel(true) });
    UI.menu(e.clientX, e.clientY, items);
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function edgeJump(dr, dc) {
    // Ctrl+arrow: to the end of the data block
    const s = sheet();
    const filled = (r, c) => { const x = cell(s, r, c); return x && x.in !== ''; };
    let r = cur.r, c = cur.c;
    const u = used(s);
    const lim = (rr, cc) => rr >= 0 && cc >= 0 && rr <= Math.max(u.r1, cur.r) + 1 && cc <= Math.max(u.c1, cur.c) + 1;
    if (filled(r + dr, c + dc) && filled(r, c)) {
      while (lim(r + dr, c + dc) && filled(r + dr, c + dc)) { r += dr; c += dc; }
    } else {
      r += dr; c += dc;
      while (lim(r + dr, c + dc) && !filled(r, c)) { r += dr; c += dc; }
    }
    return { r: Math.max(0, r), c: Math.max(0, c) };
  }

  function onKey(e) {
    if ($('sheet').classList.contains('hidden') || document.querySelector('#modal-root .backdrop')) return;
    const t = e.target;
    const inFx = t === $('sh-input'), inName = t === $('sh-cellname');
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); if (editing) commitEdit(null); save(); return; }
    if (inName || (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && t !== $('sh-edit') && !inFx)) return;
    if (editing || inFx) {
      if (k === 'Enter' && e.altKey) {
        e.preventDefault();
        const ed = inFx ? $('sh-input') : $('sh-edit');
        const p = ed.selectionStart;
        ed.value = ed.value.slice(0, p) + '\n' + ed.value.slice(ed.selectionEnd);
        ed.setSelectionRange(p + 1, p + 1);
        ed.dispatchEvent(new Event('input'));
        return;
      }
      if (k === 'Enter') { e.preventDefault(); if (inFx && !editing) fxCommit(); commitEdit([e.shiftKey ? -1 : 1, 0]); return; }
      if (k === 'Tab') { e.preventDefault(); if (inFx && !editing) fxCommit(); commitEdit([0, e.shiftKey ? -1 : 1]); return; }
      if (k === 'Escape') { e.preventDefault(); cancelEdit(); return; }
      if (editing && editing.mode === 'enter' && k.startsWith('Arrow') && !pointMode()) {
        e.preventDefault();
        commitEdit({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]);
        return;
      }
      if (editing && pointMode() && k.startsWith('Arrow') && editing.mode === 'enter') {
        e.preventDefault();
        return;
      }
      return;
    }
    // not editing
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 'c') { e.preventDefault(); copy(false); return; }
      if (lk === 'x') { e.preventDefault(); copy(true); return; }
      if (lk === 'v') { e.preventDefault(); paste(); return; }
      if (lk === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (lk === 'y') { e.preventDefault(); redo(); return; }
      if (lk === 'a') { e.preventDefault(); setSel(0, 0, geom.nr - 1, geom.nc - 1, true); return; }
      if (lk === 'b') { e.preventDefault(); toggleStyle('b'); return; }
      if (lk === 'i') { e.preventDefault(); toggleStyle('i'); return; }
      if (lk === 'u') { e.preventDefault(); toggleStyle('u'); return; }
      if (k === 'Home') { e.preventDefault(); selectCell(0, 0); return; }
      if (k === 'End') { e.preventDefault(); const u = used(sheet()); selectCell(Math.max(0, u.r1), Math.max(0, u.c1)); return; }
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        const p = edgeJump(dr, dc);
        if (e.shiftKey) extendTo(p.r, p.c); else selectCell(p.r, p.c);
        return;
      }
      if (k === ';') { e.preventDefault(); const d = new Date(); change(() => setInput(sheet(), cur.r, cur.c, `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`)); return; }
      return;
    }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      const [dr, dc] = moves[k];
      if (e.shiftKey) {
        // move the far corner
        const far = { r: anchor.r === sel.r0 ? sel.r1 : sel.r0, c: anchor.c === sel.c0 ? sel.c1 : sel.c0 };
        extendTo(far.r + dr, far.c + dc);
      } else {
        const m = mergeAt(sheet(), cur.r, cur.c);
        const r = dr > 0 && m ? m.r1 + 1 : cur.r + dr, c = dc > 0 && m ? m.c1 + 1 : cur.c + dc;
        selectCell(r, c);
      }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); if (sel.r0 !== sel.r1 || sel.c0 !== sel.c1) { cur.r++; if (cur.r > sel.r1) { cur.r = sel.r0; cur.c = cur.c + 1 > sel.c1 ? sel.c0 : cur.c + 1; } syncBar(); schedule(); } else selectCell(cur.r + (e.shiftKey ? -1 : 1), cur.c); return; }
    if (k === 'Tab') { e.preventDefault(); selectCell(cur.r, cur.c + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Home') { e.preventDefault(); selectCell(cur.r, 0); return; }
    if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault();
      const rowsPer = Math.floor(($('sh-scroll').clientHeight - HH) / DEFH);
      selectCell(Math.max(0, cur.r + (k === 'PageDown' ? rowsPer : -rowsPer)), cur.c);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (k === 'Backspace' && sel.r0 === sel.r1 && sel.c0 === sel.c1) { startEdit('enter', ''); return; } clearSel(); return; }
    if (k === 'F2') { e.preventDefault(); startEdit('edit'); return; }
    if (k === 'Escape') { if (clip) { clip.show = false; schedule(); } return; }
    if (k.length === 1 && !e.altKey) {
      e.preventDefault();
      startEdit('enter', k);
    }
  }

  function fxCommit() {
    const v = $('sh-input').value;
    const cl = cell(sheet(), cur.r, cur.c);
    if (v !== (cl ? inputText(cl) : '')) change(() => setInput(sheet(), cur.r, cur.c, autoCloseParens(v)));
    $('sh-scroll').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  const tools = {};
  function buildTools() {
    if (toolsBuilt) return;
    toolsBuilt = true;
    const bar = $('sh-tools');
    const T = Office.tbtn;
    tools.font = Office.select(Office.FONTS, 'Calibri', (v) => applyStyle({ ff: v === 'Calibri' ? null : v }), 'font', 'Font');
    tools.size = Office.select([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36], 11, (v) => applyStyle({ fs: +v === 11 ? null : +v }), 'size', 'Mărimea textului');
    tools.b = T('bold', 'Îngroșat (Ctrl+B)', () => toggleStyle('b'));
    tools.i = T('italic', 'Cursiv (Ctrl+I)', () => toggleStyle('i'));
    tools.u = T('underline', 'Subliniat (Ctrl+U)', () => toggleStyle('u'));
    tools.fc = Office.colorBtn('fontcolor', 'Culoarea textului', () => curStyle().fc || '#000000', (c) => applyStyle({ fc: c }), true);
    tools.bg = Office.colorBtn('fill', 'Culoarea celulei', () => curStyle().bg || '', (c) => applyStyle({ bg: c }), true);
    tools.al = T('alignleft', 'Aliniază la stânga', () => applyStyle({ ha: curStyle().ha === 'left' ? null : 'left' }));
    tools.ac = T('aligncenter', 'Centrează', () => applyStyle({ ha: curStyle().ha === 'center' ? null : 'center' }));
    tools.ar = T('alignright', 'Aliniază la dreapta', () => applyStyle({ ha: curStyle().ha === 'right' ? null : 'right' }));
    tools.wrap = T('wrap', 'Încadrează textul pe mai multe rânduri', () => toggleStyle('wrap'));
    tools.merge = T('merge', 'Îmbină celulele / Anulează îmbinarea', () => toggleMerge(), { label: 'Îmbină' });
    tools.fmt = Office.select([['general', 'General'], ['num', 'Număr'], ['lei', 'Lei'], ['pct', 'Procent'], ['date', 'Dată'], ['text', 'Text']], 'general', (v) => applyStyle({ fmt: v === 'general' ? null : v, code: null, dec: null }), 'fmt', 'Formatul numerelor');
    tools.decm = T(null, 'Mai puține zecimale', () => changeDecimals(-1), { label: ',0 −' });
    tools.decp = T(null, 'Mai multe zecimale', () => changeDecimals(1), { label: ',00 +' });
    tools.bd = T('borders', 'Chenare', (b) => {
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'Toate chenarele', icon: 'borders', run: () => setBorders('all') },
        { label: 'Chenar exterior', icon: 'borders', run: () => setBorders('outer') },
        { label: 'Chenar jos', icon: 'borders', run: () => setBorders('bottom') },
        { label: 'Fără chenare', icon: 'close', run: () => setBorders('none') },
      ]);
    });
    tools.sum = T('sigma', 'Însumare automată (Σ)', () => autoSum(), { label: 'Sumă' });
    tools.sa = T('sortasc', 'Sortează A → Z', () => sortSel(false));
    tools.sd = T('sortdesc', 'Sortează Z → A', () => sortSel(true));
    tools.rows = T('rows', 'Rânduri și coloane', (b) => {
      const r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'Inserează rând deasupra', icon: 'up', run: () => insertDelete(true, sel.r0, sel.r1 - sel.r0 + 1) },
        { label: 'Inserează rând dedesubt', icon: 'down', run: () => insertDelete(true, sel.r1 + 1, sel.r1 - sel.r0 + 1) },
        { label: 'Inserează coloană la stânga', icon: 'left', run: () => insertDelete(false, sel.c0, sel.c1 - sel.c0 + 1) },
        { label: 'Inserează coloană la dreapta', icon: 'right', run: () => insertDelete(false, sel.c1 + 1, sel.c1 - sel.c0 + 1) },
        '-',
        { label: 'Șterge rândurile selectate', icon: 'del', run: () => insertDelete(true, sel.r0, -(sel.r1 - sel.r0 + 1)) },
        { label: 'Șterge coloanele selectate', icon: 'del', run: () => insertDelete(false, sel.c0, -(sel.c1 - sel.c0 + 1)) },
      ]);
    }, { label: 'Rânduri' });
    bar.append(
      T('undo', 'Anulează (Ctrl+Z)', () => undo()), T('redo', 'Refă (Ctrl+Y)', () => redo()), Office.sep(),
      tools.font, tools.size, Office.sep(), tools.b, tools.i, tools.u, tools.fc, tools.bg, Office.sep(),
      tools.al, tools.ac, tools.ar, tools.wrap, tools.merge, Office.sep(),
      tools.fmt, tools.decm, tools.decp, tools.bd, Office.sep(), tools.sum, tools.sa, tools.sd, tools.rows,
    );
    bar.children[0].id = 'sh-undo';
    bar.children[1].id = 'sh-redo';
  }

  function refreshTools() {
    if (!toolsBuilt) return;
    const s = curStyle();
    tools.b.classList.toggle('on', !!s.b);
    tools.i.classList.toggle('on', !!s.i);
    tools.u.classList.toggle('on', !!s.u);
    tools.wrap.classList.toggle('on', !!s.wrap);
    tools.al.classList.toggle('on', s.ha === 'left');
    tools.ac.classList.toggle('on', s.ha === 'center');
    tools.ar.classList.toggle('on', s.ha === 'right');
    tools.font.value = s.ff || 'Calibri';
    tools.size.value = String(s.fs || 11);
    tools.fmt.value = s.fmt && s.fmt !== 'custom' ? s.fmt : 'general';
    tools.fc.repaint(); tools.bg.repaint();
    $('sh-undo').disabled = !history.length;
    $('sh-redo').disabled = !future.length;
  }

  // ---------------------------------------------------------------------------
  // Sheet tabs
  // ---------------------------------------------------------------------------

  function renderTabs() {
    const box = $('sh-tabs');
    box.innerHTML = '';
    wb.sheets.forEach((s, i) => {
      const b = el('button', { class: 'stab' + (i === wb.active ? ' on' : ''), text: s.name, type: 'button' });
      b.addEventListener('click', () => switchSheet(i));
      b.addEventListener('dblclick', () => renameSheet(i));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        UI.menu(e.clientX, e.clientY - 150, [
          { label: 'Redenumește', icon: 'edit', run: () => renameSheet(i) },
          { label: 'Duplică foaia', icon: 'copy', run: () => duplicateSheet(i) },
          { label: 'Mută la stânga', icon: 'left', disabled: i === 0, run: () => moveSheet(i, -1) },
          { label: 'Mută la dreapta', icon: 'right', disabled: i === wb.sheets.length - 1, run: () => moveSheet(i, 1) },
          '-',
          { label: 'Șterge foaia', icon: 'del', disabled: wb.sheets.length <= 1, run: () => deleteSheet(i) },
        ]);
      });
      box.append(b);
    });
    const add = el('button', { class: 'stab add', title: 'Foaie nouă', html: svg('plus'), type: 'button' });
    add.addEventListener('click', () => {
      let n = wb.sheets.length + 1;
      while (wb.sheets.some((s) => s.name.toLowerCase() === `foaie${n}`)) n++;
      change(() => { wb.sheets.push(newSheet(`Foaie${n}`)); wb.active = wb.sheets.length - 1; });
      afterSheetSwitch();
    });
    box.append(add);
  }

  function switchSheet(i) {
    if (editing) commitEdit(null);
    wb.active = i;
    afterSheetSwitch();
  }

  function afterSheetSwitch() {
    geom = null;
    const scr = $('sh-scroll');
    scr.scrollLeft = 0; scr.scrollTop = 0;
    layout();
    renderTabs();
    selectCell(0, 0);
  }

  async function renameSheet(i) {
    const name = await UI.modal((box, close) => {
      const input = el('input', { type: 'text', value: wb.sheets[i].name, spellcheck: 'false' });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
      box.append(el('h2', { text: 'Redenumește foaia' }), input, el('div', { class: 'actions' }, [
        el('button', { class: 'btn', text: 'Anulează', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'OK', onclick: () => close(input.value) }),
      ]));
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
    const n = String(name || '').trim().replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    if (!n || n === wb.sheets[i].name) return;
    if (wb.sheets.some((s, j) => j !== i && s.name.toLowerCase() === n.toLowerCase())) { UI.toast('Există deja o foaie cu acest nume.', { error: true }); return; }
    const old = wb.sheets[i].name;
    change(() => {
      wb.sheets[i].name = n;
      // formulas pointing to the old name follow
      const re = new RegExp("('?)" + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\1!", 'gi');
      const ref = /\s/.test(n) ? `'${n}'!` : `${n}!`;
      for (const s of wb.sheets) for (const cl of s.cells.values()) if (typeof cl.in === 'string' && cl.in[0] === '=') cl.in = cl.in.replace(re, ref);
    });
    renderTabs();
  }

  function duplicateSheet(i) {
    const src = wb.sheets[i];
    let name = src.name + ' (2)', k = 2;
    while (wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name = `${src.name} (${++k})`;
    change(() => {
      const copy = newSheet(name);
      for (const [kk, cl] of src.cells) copy.cells.set(kk, cl.s ? { in: cl.in, s: { ...cl.s } } : { in: cl.in });
      copy.colW = { ...src.colW }; copy.rowH = { ...src.rowH }; copy.merges = src.merges.map((m) => ({ ...m }));
      wb.sheets.splice(i + 1, 0, copy);
      wb.active = i + 1;
    });
    afterSheetSwitch();
  }

  function moveSheet(i, d) {
    change(() => { const [s] = wb.sheets.splice(i, 1); wb.sheets.splice(i + d, 0, s); wb.active = i + d; });
    renderTabs();
  }

  async function deleteSheet(i) {
    if (!(await UI.confirm('Ștergi foaia?', `Foaia „${wb.sheets[i].name}” și tot ce e pe ea se șterg. Poți anula cu Ctrl+Z.`, 'Șterge'))) return;
    change(() => { wb.sheets.splice(i, 1); wb.active = Math.max(0, Math.min(wb.active, wb.sheets.length - 1)); });
    afterSheetSwitch();
  }

  // ---------------------------------------------------------------------------
  // Files: read
  // ---------------------------------------------------------------------------

  function fmtFromCode(z) {
    if (!z || z === 'General') return null;
    const plain = String(z).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    if (/lei|ron/i.test(z)) return { fmt: 'lei', dec: (/(?:0|#)\.(0+)/.exec(z) || [0, ''])[1].length };
    if (plain.includes('%')) return { fmt: 'pct', dec: (/0\.(0+)/.exec(plain) || [0, ''])[1].length };
    if (/[dmyhs]/i.test(plain)) {
      if (/^(dd|d)[./-](mm|m)[./-](yyyy|yy)$/i.test(plain.trim())) return { fmt: 'date' };
      return { fmt: 'custom', code: z };
    }
    if (/^#,##0$|^0$/.test(plain)) return { fmt: 'int' };
    if (/^(#,##0|0)\.(0+)$/.test(plain)) return { fmt: 'num', dec: /\.(0+)$/.exec(plain)[1].length };
    if (plain === '@') return { fmt: 'text' };
    return { fmt: 'custom', code: z };
  }

  const argb = (c) => {
    if (!c) return null;
    const v = c.rgb || c;
    if (typeof v !== 'string') return null;
    const h = v.length === 8 ? v.slice(2) : v;
    return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
  };

  /**
   * Excel files come from anywhere, so they are parsed in a separate worker: a file made to attack
   * the parser cannot reach the app. If workers are not available, the parse runs here and the app
   * checks that the built-in objects were not tampered with (and refuses the file if they were).
   */
  function readInWorker(bytes, opts) {
    return new Promise((resolve, reject) => {
      let wk;
      try { wk = new Worker('js/office/xlsx-worker.js'); } catch (e) { reject(Object.assign(new Error('worker'), { noWorker: true })); return; }
      const t = setTimeout(() => { wk.terminate(); reject(new Error('Fișierul Excel nu a putut fi citit: durează prea mult. Poate fi deteriorat.')); }, 90000);
      wk.onmessage = (e) => { clearTimeout(t); wk.terminate(); if (e.data && e.data.ok) resolve(e.data.w); else reject(new Error((e.data && e.data.error) || 'Excel')); };
      wk.onerror = (e) => { e.preventDefault(); clearTimeout(t); wk.terminate(); reject(Object.assign(new Error((e && e.message) || 'worker'), { noWorker: true })); };
      const copy = new Uint8Array(bytes).slice();
      wk.postMessage({ bytes: copy, opts }, [copy.buffer]);
    });
  }
  const PROTOS = [Object.prototype, Array.prototype, String.prototype, Number.prototype, Function.prototype];
  function guardedRead(X, bytes, opts) {
    const before = PROTOS.map((p) => new Set(Reflect.ownKeys(p)));
    let w, bad = false;
    try { w = X.read(bytes, opts); } finally {
      PROTOS.forEach((p, i) => { for (const k of Reflect.ownKeys(p)) if (!before[i].has(k)) { bad = true; try { delete p[k]; } catch (e) {} } });
    }
    if (bad) throw new Error('Fișierul Excel conține date care încearcă să modifice aplicația. Nu a fost deschis.');
    return w;
  }
  async function safeRead(X, bytes, opts) {
    try { return await readInWorker(bytes, opts); } catch (e) { if (!e.noWorker) throw e; console.warn('xlsx worker', e.message); }
    return guardedRead(X, bytes, opts);
  }

  async function readWorkbook(bytes, ext) {
    const X = XL();
    let w;
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      let txt = new TextDecoder('utf-8').decode(bytes);
      if (txt.includes('�')) txt = new TextDecoder('windows-1250').decode(bytes);
      const delim = (txt.split('\n')[0].match(/;/g) || []).length > (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ext === 'tsv' ? '\t' : ',';
      const rows = parseCsv(txt.replace(/^﻿/, ''), delim);
      const s = newSheet('Foaie1');
      rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') setInput(s, r, c, v); }));
      return { sheets: [s], active: 0 };
    }
    w = await safeRead(X, bytes, { type: 'buffer', cellFormula: true, cellStyles: true, cellNF: true, cellDates: false });
    const extra = ext === 'xlsx' || ext === 'xlsm' ? await xlsxStyles(bytes).catch((e) => { console.warn('styles', e); return null; }) : null;
    const out = { sheets: [], active: 0 };
    for (const name of w.SheetNames) {
      const ws = w.Sheets[name];
      const s = newSheet(name);
      const st2 = extra && extra[name];
      for (const a of Object.keys(ws)) {
        if (a[0] === '!') continue;
        const p = X.utils.decode_cell(a);
        const c = ws[a];
        let input;
        if (c.f) input = '=' + c.f;
        else if (c.t === 'n') input = c.v;
        else if (c.t === 'b') input = !!c.v;
        else if (c.t === 'e') input = c.w || '#N/A';
        else if (c.t === 'd') input = F.dateToSerial(new Date(c.v));
        else input = c.v == null ? '' : String(c.v);
        const sty = {};
        const fz = fmtFromCode(c.z);
        if (fz) Object.assign(sty, fz);
        if (c.s && c.s.fgColor && c.s.patternType === 'solid') { const col = argb(c.s.fgColor); if (col && col !== '#ffffff') sty.bg = col; }
        if (st2 && st2[a]) Object.assign(sty, st2[a]);
        if (input === '' && !Object.keys(sty).length) continue;
        const cl = { in: input };
        if (Object.keys(sty).length) cl.s = sty;
        s.cells.set(K(p.r, p.c), cl);
      }
      (ws['!cols'] || []).forEach((col, i) => { if (!col || col.hidden) return; const px = col.wpx || (col.wch ? col.wch * 7 + 5 : col.width ? col.width * 7 + 5 : 0); if (px) s.colW[i] = Math.round(px); });
      (ws['!rows'] || []).forEach((row, i) => { if (!row) return; const px = row.hpx || (row.hpt ? (row.hpt * 96) / 72 : 0); if (px) s.rowH[i] = Math.round(px); });
      s.merges = (ws['!merges'] || []).map((m) => ({ r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c }));
      out.sheets.push(s);
    }
    if (!out.sheets.length) out.sheets.push(newSheet('Foaie1'));
    return out;
  }

  function parseCsv(txt, d) {
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) {
        if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /** Fonts, alignment and borders of .xlsx cells (the free SheetJS reads only fills). */
  async function xlsxStyles(bytes) {
    await Lib.load('jszip');
    const JSZip = Lib.get('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
    const dp = new DOMParser();
    const xml = (s) => dp.parseFromString(s, 'application/xml');
    const [wbx, rels, stx, thx] = await Promise.all([read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'), read('xl/styles.xml'), read('xl/theme/theme1.xml')]);
    if (!wbx || !stx) return null;
    const theme = [];
    if (thx) {
      const t = xml(thx);
      const scheme = t.getElementsByTagName('a:clrScheme')[0];
      if (scheme) {
        const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
        for (const n of order) {
          const e = scheme.getElementsByTagName('a:' + n)[0];
          const v = e && (e.getElementsByTagName('a:srgbClr')[0] || e.getElementsByTagName('a:sysClr')[0]);
          theme.push(v ? '#' + (v.getAttribute('val') && v.tagName === 'a:srgbClr' ? v.getAttribute('val') : v.getAttribute('lastClr') || '000000').toLowerCase() : null);
        }
      }
    }
    const colorOf = (e) => {
      if (!e) return null;
      if (e.getAttribute('rgb')) return argb(e.getAttribute('rgb'));
      if (e.getAttribute('theme') !== null) return theme[+e.getAttribute('theme')] || null;
      if (e.getAttribute('indexed') === '10') return '#ff0000';
      return null;
    };
    const sx = xml(stx);
    const kids = (parent, tag) => (parent ? [...parent.children].filter((c) => c.tagName === tag) : []);
    const fonts = kids(sx.getElementsByTagName('fonts')[0], 'font').map((f) => {
      const o = {};
      if (kids(f, 'b').length && kids(f, 'b')[0].getAttribute('val') !== '0') o.b = true;
      if (kids(f, 'i').length && kids(f, 'i')[0].getAttribute('val') !== '0') o.i = true;
      if (kids(f, 'u').length) o.u = true;
      if (kids(f, 'strike').length) o.st = true;
      const sz = kids(f, 'sz')[0];
      if (sz && +sz.getAttribute('val') !== 11) o.fs = +sz.getAttribute('val');
      const col = colorOf(kids(f, 'color')[0]);
      if (col && col !== '#000000') o.fc = col;
      const nm = kids(f, 'name')[0];
      if (nm && nm.getAttribute('val') && !/^calibri$/i.test(nm.getAttribute('val'))) o.ff = nm.getAttribute('val');
      return o;
    });
    const fills = kids(sx.getElementsByTagName('fills')[0], 'fill').map((f) => {
      const p = kids(f, 'patternFill')[0];
      if (!p || p.getAttribute('patternType') !== 'solid') return null;
      return colorOf(kids(p, 'fgColor')[0]);
    });
    const borders = kids(sx.getElementsByTagName('borders')[0], 'border').map((b) => {
      const o = {};
      for (const [tag, k] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']]) {
        const e = kids(b, tag)[0];
        if (e && e.getAttribute('style') && e.getAttribute('style') !== 'none') o[k] = 1;
      }
      return Object.keys(o).length ? o : null;
    });
    const xfs = kids(sx.getElementsByTagName('cellXfs')[0], 'xf').map((x) => {
      const o = { ...(fonts[+x.getAttribute('fontId') || 0] || {}) };
      const fill = fills[+x.getAttribute('fillId') || 0];
      if (fill && fill !== '#ffffff') o.bg = fill;
      const bd = borders[+x.getAttribute('borderId') || 0];
      if (bd) o.bd = bd;
      const al = kids(x, 'alignment')[0];
      if (al) {
        const h = al.getAttribute('horizontal');
        if (['left', 'center', 'right'].includes(h)) o.ha = h;
        if (h === 'centerContinuous') o.ha = 'center';
        const v = al.getAttribute('vertical');
        if (v === 'top' || v === 'center') o.va = v;
        if (al.getAttribute('wrapText') === '1') o.wrap = true;
      }
      return o;
    });
    // sheet name -> file
    const W = xml(wbx), R = rels ? xml(rels) : null;
    const relMap = {};
    if (R) for (const r of R.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const out = {};
    for (const sh of W.getElementsByTagName('sheet')) {
      const name = sh.getAttribute('name');
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid];
      if (!target) continue;
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target;
      const sxml = await read(target);
      if (!sxml) continue;
      const map = {};
      const re = /<c\b([^>]*?)\/?>/g;
      let m;
      while ((m = re.exec(sxml))) {
        const attrs = m[1];
        const r = /\br="([A-Z]+\d+)"/.exec(attrs), s = /\bs="(\d+)"/.exec(attrs);
        if (r && s && xfs[+s[1]] && Object.keys(xfs[+s[1]]).length) map[r[1]] = xfs[+s[1]];
      }
      out[name] = map;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Files: write
  // ---------------------------------------------------------------------------

  function codeFor(s) {
    const d = s.dec;
    const z = (n) => (n ? '.' + '0'.repeat(n) : '');
    switch (s.fmt) {
      case 'num': return '#,##0' + z(d === undefined ? 2 : d);
      case 'int': return '#,##0';
      case 'lei': return '#,##0' + z(d === undefined ? 2 : d) + ' "lei"';
      case 'pct': return '0' + z(d || 0) + '%';
      case 'date': return 'dd.mm.yyyy';
      case 'text': return '@';
      case 'custom': return s.code;
      default: return d !== undefined ? '0' + z(d) : undefined;
    }
  }

  function xlsxBytes() {
    const X = XL();
    const out = X.utils.book_new();
    for (const s of wb.sheets) {
      const ws = {};
      const u = used(s);
      for (const [k, cl] of s.cells) {
        const { r, c } = RC(k);
        const a = X.utils.encode_cell({ r, c });
        const o = {};
        const v = cl.v;
        if (typeof cl.in === 'string' && cl.in[0] === '=' && !(cl.s && cl.s.fmt === 'text')) {
          o.f = cl.in.slice(1);
          if (typeof v === 'number') { o.t = 'n'; o.v = v; }
          else if (typeof v === 'boolean') { o.t = 'b'; o.v = v; }
          else if (F.isErr(v)) { o.t = 'e'; o.v = 0x0f; o.w = v.code; }
          else { o.t = 's'; o.v = v == null ? '' : String(v); }
        } else if (typeof cl.in === 'number') { o.t = 'n'; o.v = cl.in; }
        else if (typeof cl.in === 'boolean') { o.t = 'b'; o.v = cl.in; }
        else if (cl.in === '' || cl.in == null) { o.t = 'z'; }
        else { o.t = 's'; o.v = String(cl.in); }
        const sty = cl.s || {};
        const code = codeFor(sty);
        if (code) o.z = code;
        const xs = {};
        const font = {};
        if (sty.b) font.bold = true;
        if (sty.i) font.italic = true;
        if (sty.u) font.underline = true;
        if (sty.st) font.strike = true;
        if (sty.fs) font.sz = sty.fs;
        if (sty.ff) font.name = sty.ff;
        if (sty.fc) font.color = { rgb: sty.fc.replace('#', '').toUpperCase() };
        if (Object.keys(font).length) xs.font = font;
        if (sty.bg) xs.fill = { patternType: 'solid', fgColor: { rgb: sty.bg.replace('#', '').toUpperCase() } };
        const al = {};
        if (sty.ha) al.horizontal = sty.ha;
        if (sty.va) al.vertical = sty.va;
        if (sty.wrap) al.wrapText = true;
        if (Object.keys(al).length) xs.alignment = al;
        if (sty.bd) {
          const line = { style: 'thin', color: { rgb: '000000' } };
          xs.border = {};
          if (sty.bd.t) xs.border.top = line;
          if (sty.bd.b) xs.border.bottom = line;
          if (sty.bd.l) xs.border.left = line;
          if (sty.bd.r) xs.border.right = line;
        }
        if (code) xs.numFmt = code;
        if (Object.keys(xs).length) o.s = xs;
        ws[a] = o;
      }
      ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, u.r1), c: Math.max(0, u.c1) } });
      const maxC = Math.max(u.c1, ...Object.keys(s.colW).map(Number), 0);
      if (Object.keys(s.colW).length) ws['!cols'] = Array.from({ length: maxC + 1 }, (_, i) => (s.colW[i] ? { wpx: s.colW[i] } : { wpx: DEFW }));
      if (Object.keys(s.rowH).length) { const maxR = Math.max(...Object.keys(s.rowH).map(Number)); ws['!rows'] = Array.from({ length: maxR + 1 }, (_, i) => (s.rowH[i] ? { hpx: s.rowH[i] } : null)); }
      if (s.merges.length) ws['!merges'] = s.merges.map((m) => ({ s: { r: m.r0, c: m.c0 }, e: { r: m.r1, c: m.c1 } }));
      X.utils.book_append_sheet(out, ws, s.name);
    }
    return new Uint8Array(X.write(out, { type: 'buffer', bookType: 'xlsx', cellStyles: true }));
  }

  function pdfHtml() {
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let pages = '';
    let wide = false;
    for (const s of wb.sheets) {
      const u = used(s);
      if (u.r1 < 0) continue;
      let width = 0;
      for (let c = 0; c <= u.c1; c++) width += colWidth(s, c);
      if (width > 720) wide = true;
      const covered = new Set();
      let rows = '';
      for (let r = 0; r <= u.r1; r++) {
        let tds = '';
        for (let c = 0; c <= u.c1; c++) {
          if (covered.has(K(r, c))) continue;
          const m = s.merges.find((mm) => mm.r0 === r && mm.c0 === c);
          let span = '';
          if (m) { span = ` rowspan="${m.r1 - m.r0 + 1}" colspan="${m.c1 - m.c0 + 1}"`; for (let rr = m.r0; rr <= m.r1; rr++) for (let cc = m.c0; cc <= m.c1; cc++) if (rr !== r || cc !== c) covered.add(K(rr, cc)); }
          const cl = s.cells.get(K(r, c));
          const sty = (cl && cl.s) || {};
          const v = cl && cl.v;
          const align = sty.ha || (typeof v === 'number' ? 'right' : 'left');
          const css = [`text-align:${align}`];
          if (sty.b) css.push('font-weight:700');
          if (sty.i) css.push('font-style:italic');
          if (sty.u) css.push('text-decoration:underline');
          if (sty.fc) css.push('color:' + sty.fc);
          if (sty.bg) css.push('background:' + sty.bg);
          if (sty.fs) css.push(`font-size:${sty.fs}pt`);
          if (sty.ff) css.push(`font-family:"${sty.ff}"`);
          if (sty.wrap) css.push('white-space:pre-wrap');
          if (sty.bd) { if (sty.bd.t) css.push('border-top:1px solid #222'); if (sty.bd.b) css.push('border-bottom:1px solid #222'); if (sty.bd.l) css.push('border-left:1px solid #222'); if (sty.bd.r) css.push('border-right:1px solid #222'); }
          tds += `<td${span} style="${css.join(';')}">${cl ? esc(display(cl)).replace(/\n/g, '<br>') : ''}</td>`;
        }
        rows += `<tr style="height:${rowHeight(s, r)}px">${tds}</tr>`;
      }
      let colgroup = '';
      for (let c = 0; c <= u.c1; c++) colgroup += `<col style="width:${colWidth(s, c)}px">`;
      pages += `<section><h4>${esc(s.name)}</h4><table><colgroup>${colgroup}</colgroup>${rows}</table></section>`;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 12mm; }
body { margin: 0; font: 11pt Calibri, Carlito, Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; }
section + section { page-break-before: always; }
h4 { font: 600 9pt "Segoe UI", Arial; color: #777; margin: 0 0 4mm; }
table { border-collapse: collapse; table-layout: fixed; }
td { padding: 1px 4px; white-space: nowrap; overflow: hidden; vertical-align: bottom; border: 0.5px solid #e3e3e3; }
tr { page-break-inside: avoid; }
</style></head><body>${pages || '<p>Tabel gol</p>'}</body></html>`;
    return html;
  }

  // ---------------------------------------------------------------------------
  // Open / save
  // ---------------------------------------------------------------------------

  async function open(path, bytes) {
    try { await Lib.load('xlsx-js-style', 'jszip'); } catch (e) { UI.errorDetails('Nu am putut porni editorul', e); return; }
    show();
    UI.busy('Se deschide tabelul…');
    try {
      wb = path ? await readWorkbook(bytes, Host.ext(path)) : newWorkbook();
    } catch (e) {
      UI.busy(null);
      UI.errorDetails('Nu am putut deschide tabelul', e);
      App.showHome();
      return;
    }
    st = { source: path ? Office.sourceFor(path) : null, copyPath: null, dirty: false, name: path ? Host.baseName(path) : 'Tabel nou.xlsx' };
    history = []; future = []; clip = null; editing = null; geom = null;
    recalc();
    $('sh-name').textContent = st.name;
    $('sh-dirty').classList.add('hidden');
    Host.setTitle(st.name + ' — Tabel');
    buildTools();
    requestAnimationFrame(() => {
      layout();
      renderTabs();
      const scr = $('sh-scroll');
      scr.scrollLeft = 0; scr.scrollTop = 0;
      selectCell(0, 0);
      scr.focus({ preventScroll: true });
      UI.busy(null);
      if (path && /^(xls|ods|csv)$/.test(Host.ext(path))) UI.toast(`Se va salva ca .xlsx (formatul Excel modern); originalul rămâne neatins.`);
    });
  }

  function show() {
    for (const id of ['home', 'editor', 'invoice', 'writer', 'slides', 'sheet']) { const n = $(id); if (n) n.classList.toggle('hidden', id !== 'sheet'); }
  }

  async function save() {
    if (!wb) return false;
    if (editing) commitEdit(null);
    const p = await Office.target(st, 'xlsx', 'Tabel nou', 'Salvează tabelul');
    if (!p) return false;
    return writeTo(p);
  }

  async function saveAs() {
    if (editing) commitEdit(null);
    const p = await Office.saveAsDialog(st, 'xlsx', 'Tabel nou');
    if (p) return writeTo(p);
    return false;
  }

  async function writeTo(p) {
    let bytes;
    try { bytes = xlsxBytes(); } catch (e) { UI.errorDetails('Nu am putut pregăti fișierul', e); return false; }
    const ok = await Office.writeFile(st, p, bytes, $('sh-grid'));
    if (ok) {
      st.dirty = false;
      st.name = Host.baseName(p);
      $('sh-name').textContent = st.name;
      $('sh-dirty').classList.add('hidden');
      Host.setTitle(st.name + ' — Tabel');
    }
    return ok;
  }

  async function back() {
    if (editing) commitEdit(null);
    if (!(await Office.ensureSaved(api))) return;
    wb = null;
    App.showHome();
  }

  function more() {
    const r = $('sh-more').getBoundingClientRect();
    UI.menu(r.right - 240, r.bottom + 6, [
      { label: 'Salvează ca…', icon: 'save', run: () => saveAs() },
      { label: 'Exportă ca PDF', icon: 'pdf', run: () => exportPdf() },
      '-',
      { label: 'Funcții disponibile', icon: 'sigma', run: () => UI.confirm('Funcții', 'SUM (SUMA), AVERAGE (MEDIE), MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF, IF (DACĂ), IFERROR, AND, OR, NOT, ROUND, ROUNDUP, ROUNDDOWN, INT, ABS, SQRT, POWER, MOD, PRODUCT, CONCATENATE, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, TODAY (AZI), NOW, DATE, YEAR, MONTH, DAY, VLOOKUP. Exemplu: =SUM(B2:B10) sau =B2*C2.', 'OK', 'Închide') },
    ]);
  }

  function exportPdf() {
    if (editing) commitEdit(null);
    Office.exportPdf(st, pdfHtml(), 'Tabel nou', { margins: 0 });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init() {
    const scr = $('sh-scroll');
    scr.addEventListener('scroll', () => { if (geom) { layout(); schedule(); } }, { passive: true });
    scr.addEventListener('pointerdown', onDown);
    scr.addEventListener('pointermove', onMove);
    scr.addEventListener('pointerup', onUp);
    scr.addEventListener('pointercancel', onUp);
    scr.addEventListener('dblclick', onDbl);
    scr.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => schedule());
    const ed = $('sh-edit');
    ed.addEventListener('input', () => { if (editing) { editing.text = ed.value; $('sh-input').value = ed.value; positionEditor(); schedule(); } });
    const fx = $('sh-input');
    fx.addEventListener('focus', () => { if (!editing) { /* typing in the bar edits the cell */ } });
    fx.addEventListener('input', () => {
      if (!editing) { startEdit('edit', fx.value); fx.focus(); }
      const e2 = $('sh-edit');
      e2.value = fx.value;
      editing.text = fx.value;
      positionEditor(); schedule();
    });
    const nm = $('sh-cellname');
    nm.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const m = /^\s*([A-Za-z]{1,3}\d+)(?::([A-Za-z]{1,3}\d+))?\s*$/.exec(nm.value);
      if (!m) { nm.value = selName(); return; }
      const a = F.parseAddr(m[1]), b = m[2] ? F.parseAddr(m[2]) : a;
      cur = { r: a.r, c: a.c }; anchor = { ...cur };
      setSel(a.r, a.c, b.r, b.c, true);
      scrollIntoView(a.r, a.c);
      scr.focus();
    });
    $('sh-back').addEventListener('click', back);
    $('sh-save').addEventListener('click', save);
    $('sh-pdf').addEventListener('click', exportPdf);
    $('sh-more').addEventListener('click', more);
  }

  const api = {
    screen: 'sheet',
    isDirty: () => !!(wb && st && st.dirty),
    save,
    discard: () => { if (st) st.dirty = false; },
    name: () => (st ? st.name : 'Tabel'),
  };
  Office.register(api);

  return { init, open, save, api, _debug: () => ({ wb, sel, cur, display, xlsxBytes, recalc, setInput, sheet }) };
})();
