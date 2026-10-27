'use strict';
// PDF engine on top of PDFium (WebAssembly).
// Everything the editor does to a document happens here: reading items
// (paragraphs, images, drawings), form fields, moving/resizing/deleting page
// objects, writing text with real fonts, drawing, page operations and saving.

const PDF = (() => {
  const W = () => Pdfium.wasmExports;
  const u8 = () => new Uint8Array(Pdfium.memory.buffer);
  const f32 = (p) => new Float32Array(Pdfium.memory.buffer, p, 1)[0];
  const f64 = (p) => new Float64Array(Pdfium.memory.buffer, p, 1)[0];
  const i32 = (p) => new Int32Array(Pdfium.memory.buffer, p, 1)[0];
  const u32 = (p) => new Uint32Array(Pdfium.memory.buffer, p, 1)[0];

  const ERR_PASSWORD = 4;
  const FPDF_ANNOT = 1;
  const FPDF_REVERSE_BYTE_ORDER = 0x10;
  const OBJ_TEXT = 1, OBJ_PATH = 2, OBJ_IMAGE = 3, OBJ_SHADING = 4, OBJ_FORM = 5;
  // drawings made in the app carry this name, so the eraser can find exactly them
  const DRAW_MARK = 'ACMDraw';
  function tagDrawing(w, obj, a) { try { if (w.FPDFPageObj_AddMark) w.FPDFPageObj_AddMark(obj, a.utf8(DRAW_MARK)); } catch (e) { /* older engine */ } }
  const ANNOT_WIDGET = 20;
  const K = 20; // device units per point for coordinate conversion

  class Alloc {
    constructor() { this.ptrs = []; }
    bytes(n) {
      const p = W().malloc(Math.max(8, n));
      if (!p) throw new Error('Memorie insuficientă');
      u8().fill(0, p, p + Math.max(8, n));
      this.ptrs.push(p);
      return p;
    }
    utf8(str) {
      const n = StringUtils.lengthBytesUTF8(str) + 1;
      const p = this.bytes(n);
      StringUtils.stringToUtf8Bytes(str, new Uint8Array(Pdfium.memory.buffer, p, n));
      return p;
    }
    wide(str) {
      const p = this.bytes((str.length + 1) * 2);
      const v = new Uint16Array(Pdfium.memory.buffer, p, str.length + 1);
      for (let i = 0; i < str.length; i++) v[i] = str.charCodeAt(i);
      v[str.length] = 0;
      return p;
    }
    free() {
      for (const p of this.ptrs) W().free(p);
      this.ptrs = [];
    }
  }

  function withAlloc(fn) {
    const a = new Alloc();
    try {
      return fn(a);
    } finally {
      a.free();
    }
  }

  /** Calls a PDFium "get UTF-16 string" function (size query, then read). */
  function wideString(getter) {
    const bytes = getter(0, 0);
    if (!bytes || bytes <= 2) return '';
    const p = W().malloc(bytes);
    try {
      getter(p, bytes);
      const units = new Uint16Array(Pdfium.memory.buffer.slice(p, p + bytes));
      let end = units.length;
      while (end > 0 && units[end - 1] === 0) end--;
      return String.fromCharCode.apply(null, Array.from(units.subarray(0, end)));
    } finally {
      W().free(p);
    }
  }

  function byteString(getter) {
    const n = getter(0, 0);
    if (!n || n <= 1) return '';
    const p = W().malloc(n);
    try {
      getter(p, n);
      return StringUtils.utf8BytesToString(new Uint8Array(Pdfium.memory.buffer, p, n));
    } finally {
      W().free(p);
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization & font mapping
  // ---------------------------------------------------------------------------

  let ready = false;
  let fontMapper = null;

  async function init(wasmBytes) {
    if (ready) return;
    const result = await WebAssembly.instantiate(wasmBytes, { env: emEnv, wasi_snapshot_preview1: wasi });
    Pdfium.initWith(result.instance.exports);
    W().FPDF_InitLibrary();
    try {
      fontMapper = new SysFontMapper();
      fontMapper.install();
      W().FPDF_SetSystemFontInfo(fontMapper.ptr);
    } catch (e) {
      console.warn('font mapper', e);
    }
    ready = true;
  }

  /** Supplies installed Windows fonts to PDFium for fonts that PDFs do not embed. */
  class SysFontMapper {
    constructor() {
      this.ptr = W().malloc(9 * 4);
      new Int32Array(Pdfium.memory.buffer, this.ptr, 9).fill(0);
      new Int32Array(Pdfium.memory.buffer, this.ptr, 1)[0] = 1;
      this.fonts = {};
      this.next = 1;
      this.byFace = {};
    }

    install() {
      const v = new Int32Array(Pdfium.memory.buffer, this.ptr, 9);
      v[3] = Pdfium.addFunction((pThis, weight, italic, charset, pitch, face, exact) => this.map(weight, italic, charset, face, exact), 'iiiiiiii');
      v[5] = Pdfium.addFunction((pThis, h, table, buf, size) => this.data(h, table, buf, size), 'iiiiii');
      v[6] = Pdfium.addFunction((pThis, h, buf, size) => this.faceName(h, buf, size), 'iiiii');
      v[7] = Pdfium.addFunction((pThis, h) => (this.fonts[h] ? this.fonts[h].charset : 1), 'iii');
      v[8] = Pdfium.addFunction((pThis, h) => { delete this.fonts[h]; }, 'vii');
    }

    map(weight, italic, charset, facePtr, exactPtr) {
      try {
        const face = StringUtils.utf8BytesToString(new Uint8Array(Pdfium.memory.buffer, facePtr));
        const key = `${face}|${weight}|${italic ? 1 : 0}`;
        let found = this.byFace[key];
        if (found === undefined) {
          found = SystemFonts.findForDisplay(face, weight, !!italic);
          this.byFace[key] = found;
        }
        if (!found) return 0;
        if (exactPtr) new Int32Array(Pdfium.memory.buffer, exactPtr, 1)[0] = 1;
        const h = this.next++;
        this.fonts[h] = { data: found.data, face: found.face, charset };
        return h;
      } catch (e) {
        return 0;
      }
    }

    data(h, table, buf, size) {
      const f = this.fonts[h];
      if (!f) return 0;
      const d = table === 0 ? f.data : fontTable(f.data, table);
      if (!d) return 0;
      if (!buf || size < d.byteLength) return d.byteLength;
      new Uint8Array(Pdfium.memory.buffer, buf, d.byteLength).set(d);
      return d.byteLength;
    }

    faceName(h, buf, size) {
      const f = this.fonts[h];
      if (!f) return 0;
      const n = StringUtils.lengthBytesUTF8(f.face) + 1;
      if (!buf || size < n) return n;
      StringUtils.stringToUtf8Bytes(f.face, new Uint8Array(Pdfium.memory.buffer, buf, n));
      return n;
    }
  }

  function fontTable(data, table) {
    const rd16 = (o) => (data[o] << 8) | data[o + 1];
    const rd32 = (o) => ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0;
    if (data.byteLength < 12) return null;
    let off = 0;
    if (rd32(0) === 0x74746366) off = rd32(12);
    const n = rd16(off + 4);
    let rec = off + 12;
    for (let i = 0; i < n; i++) {
      if (rec + 16 > data.byteLength) return null;
      if (rd32(rec) === table >>> 0) {
        const o = rd32(rec + 8), l = rd32(rec + 12);
        if (o + l > data.byteLength) return null;
        return data.subarray(o, o + l);
      }
      rec += 16;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  class PdfError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  function errorText(code) {
    switch (code) {
      case 2: return 'Fișierul nu poate fi citit.';
      case 3: return 'Fișierul nu este un PDF valid sau este deteriorat.';
      case 4: return 'Parolă greșită.';
      case 5: return 'Documentul folosește o protecție care nu este suportată.';
      case 6: return 'Pagina nu a fost găsită sau conține erori.';
      default: return `Eroare necunoscută la deschiderea PDF-ului (cod ${code}).`;
    }
  }

  // ---------------------------------------------------------------------------
  // Document
  // ---------------------------------------------------------------------------

  class Doc {
    /** Opens [bytes] (Uint8Array). Throws PdfError(code 4) when a password is needed. */
    static open(bytes, password) {
      const w = W();
      const buf = w.malloc(Math.max(1, bytes.length));
      u8().set(bytes, buf);
      const pw = password ? StringUtils.allocateUTF8(password) : 0;
      const doc = w.FPDF_LoadMemDocument64(buf, bytes.length, pw);
      if (pw) StringUtils.freeUTF8(pw);
      if (!doc) {
        const err = w.FPDF_GetLastError();
        w.free(buf);
        throw new PdfError(err === ERR_PASSWORD ? 'Documentul este protejat cu parolă.' : errorText(err), err);
      }
      return new Doc(doc, buf, password || null);
    }

    static createBlank(pageW = 595.28, pageH = 841.89) {
      const w = W();
      const doc = w.FPDF_CreateNewDocument();
      if (!doc) throw new PdfError('Nu am putut crea documentul PDF.', -1);
      const page = w.FPDFPage_New(doc, 0, pageW, pageH);
      w.FPDF_ClosePage(page);
      return new Doc(doc, 0, null);
    }

    static createFromImage(rgba, width, height, pageW, pageH) {
      const w = W();
      const doc = w.FPDF_CreateNewDocument();
      if (!doc) throw new PdfError('Nu am putut crea documentul PDF.', -1);
      const d = new Doc(doc, 0, null);
      const page = w.FPDFPage_New(doc, 0, pageW, pageH);
      w.FPDF_ClosePage(page);
      d.insertImage(0, rgba, width, height, { l: 0, t: 0, r: 1, b: 1 });
      return d;
    }

    constructor(doc, buf, password) {
      this.doc = doc;
      this.buf = buf;
      this.password = password;
      this.formInfo = W().malloc(35 * 4);
      new Uint32Array(Pdfium.memory.buffer, this.formInfo, 35).fill(0);
      new Uint32Array(Pdfium.memory.buffer, this.formInfo, 1)[0] = 1;
      this.form = W().FPDFDOC_InitFormFillEnvironment(doc, this.formInfo);
      this.pages = new Map();
      this.fonts = new Map();
      this.dirty = new Set();
      this.hidden = new Set(); // drawings erased or undone (kept, so they can come back at once)
      this.closed = false;
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      const w = W();
      this._closePages();
      if (this.form) w.FPDFDOC_ExitFormFillEnvironment(this.form);
      w.FPDF_CloseDocument(this.doc);
      for (const f of this.fonts.values()) {
        w.FPDFFont_Close(f.font);
        w.free(f.data);
      }
      this.fonts.clear();
      w.free(this.formInfo);
      if (this.buf) w.free(this.buf);
    }

    _closePages() {
      const w = W();
      for (const [i, page] of this.pages) {
        if (this.dirty.has(i)) w.FPDFPage_GenerateContent(page);
        if (this.form) w.FORM_OnBeforeClosePage(page, this.form);
        w.FPDF_ClosePage(page);
      }
      this.pages.clear();
    }

    get pageCount() {
      return W().FPDF_GetPageCount(this.doc);
    }

    page(i) {
      let p = this.pages.get(i);
      if (p) return p;
      if (i < 0 || i >= this.pageCount) throw new PdfError('Pagina nu există.', 6);
      p = W().FPDF_LoadPage(this.doc, i);
      if (!p) throw new PdfError('Pagina nu poate fi încărcată.', 6);
      if (this.form) W().FORM_OnAfterLoadPage(p, this.form);
      this.pages.set(i, p);
      return p;
    }

    /** Displayed size in points (page rotation applied). */
    pageSize(i) {
      const p = this.page(i);
      let w = W().FPDF_GetPageWidthF(p), h = W().FPDF_GetPageHeightF(p);
      if (!(w > 1 && h > 1)) { w = 595.28; h = 841.89; }
      return { w, h };
    }

    pageSizes() {
      const out = [];
      for (let i = 0; i < this.pageCount; i++) out.push(this.pageSize(i));
      return out;
    }

    // ---- coordinates -----------------------------------------------------------

    _dev(p) {
      return { sx: Math.max(1, Math.round(W().FPDF_GetPageWidthF(p) * K)), sy: Math.max(1, Math.round(W().FPDF_GetPageHeightF(p) * K)) };
    }

    normToPage(p, nx, ny, a) {
      const d = this._dev(p);
      const px = a.bytes(8), py = a.bytes(8);
      W().FPDF_DeviceToPage(p, 0, 0, d.sx, d.sy, 0, Math.round(nx * d.sx), Math.round(ny * d.sy), px, py);
      return { x: f64(px), y: f64(py) };
    }

    pageToNorm(p, x, y, a) {
      const d = this._dev(p);
      const dx = a.bytes(4), dy = a.bytes(4);
      W().FPDF_PageToDevice(p, 0, 0, d.sx, d.sy, 0, x, y, dx, dy);
      return { x: i32(dx) / d.sx, y: i32(dy) / d.sy };
    }

    _normRect(p, l, b, r, t, a) {
      const pts = [this.pageToNorm(p, l, t, a), this.pageToNorm(p, r, t, a), this.pageToNorm(p, l, b, a), this.pageToNorm(p, r, b, a)];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of pts) {
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      }
      return { l: x0, t: y0, r: x1, b: y1 };
    }

    // ---- rendering ---------------------------------------------------------------

    /** RGBA pixels of [region] of page [i] drawn at fullW x fullH. */
    render(i, fullW, fullH, region) {
      const w = W();
      const p = this.page(i);
      const x = region ? region.x : 0, y = region ? region.y : 0;
      const bw = Math.max(1, region ? region.w : fullW), bh = Math.max(1, region ? region.h : fullH);
      const bmp = w.FPDFBitmap_Create(bw, bh, 1);
      if (!bmp) throw new PdfError('Memorie insuficientă pentru afișare.', -1);
      try {
        w.FPDFBitmap_FillRect(bmp, 0, 0, bw, bh, 0xffffffff);
        const flags = FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER;
        w.FPDF_RenderPageBitmap(bmp, p, -x, -y, fullW, fullH, 0, flags);
        if (this.form) w.FPDF_FFLDraw(this.form, bmp, p, -x, -y, fullW, fullH, 0, flags);
        const stride = w.FPDFBitmap_GetStride(bmp);
        const ptr = w.FPDFBitmap_GetBuffer(bmp);
        const out = new Uint8ClampedArray(bw * bh * 4);
        const src = u8();
        if (stride === bw * 4) out.set(src.subarray(ptr, ptr + bw * bh * 4));
        else for (let row = 0; row < bh; row++) out.set(src.subarray(ptr + row * stride, ptr + row * stride + bw * 4), row * bw * 4);
        return { data: out, width: bw, height: bh };
      } finally {
        w.FPDFBitmap_Destroy(bmp);
      }
    }

    // ---- items -------------------------------------------------------------------

    items(pageIndex) {
      return withAlloc((a) => this._items(pageIndex, a));
    }

    _items(pageIndex, a) {
      const w = W();
      const page = this.page(pageIndex);
      const rotation = w.FPDFPage_GetRotation(page);
      const pageArea = Math.max(1, w.FPDF_GetPageWidthF(page) * w.FPDF_GetPageHeightF(page));
      const count = w.FPDFPage_CountObjects(page);
      const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
      const mx = a.bytes(24), fs = a.bytes(4);
      const cr = a.bytes(4), cg = a.bytes(4), cb = a.bytes(4), ca = a.bytes(4);
      const frags = [], result = [], paths = [];
      let seq = 0;
      const textPage = w.FPDFText_LoadPage(page);
      try {
        for (let i = 0; i < count; i++) {
          const obj = w.FPDFPage_GetObject(page, i);
          if (!obj) continue;
          if (this.hidden.has(obj)) continue; // erased / undone drawing
          if (!w.FPDFPageObj_GetBounds(obj, lp, bp, rp, tp)) continue;
          const l = Math.min(f32(lp), f32(rp)), r = Math.max(f32(lp), f32(rp));
          const b = Math.min(f32(bp), f32(tp)), t = Math.max(f32(bp), f32(tp));
          if (![l, r, b, t].every(Number.isFinite)) continue;
          const area = (r - l) * (t - b);
          const type = w.FPDFPageObj_GetType(obj);
          if (type === OBJ_TEXT) {
            const mode = w.FPDFTextObj_GetTextRenderMode(obj);
            if (mode === 3) continue; // invisible OCR text
            const text = textPage ? wideString((buf, len) => w.FPDFTextObj_GetText(obj, textPage, buf, len)) : '';
            if (!text.trim()) continue;
            let size = w.FPDFTextObj_GetFontSize(obj, fs) ? f32(fs) : 0;
            let upright = false, baseY = b;
            if (w.FPDFPageObj_GetMatrix(obj, mx)) {
              const m = new Float32Array(Pdfium.memory.buffer, mx, 6);
              upright = m[0] > 0 && m[3] > 0 && Math.abs(m[1]) < Math.abs(m[0]) * 0.02 && Math.abs(m[2]) < Math.abs(m[3]) * 0.02;
              baseY = m[5];
              const scaled = size * Math.abs(m[3]);
              const h = t - b;
              if (h > 0) {
                const r1 = size > 0 ? Math.abs(h / size - 0.95) : 99;
                const r2 = scaled > 0 ? Math.abs(h / scaled - 0.95) : 99;
                if (r2 < r1) size = scaled;
              }
            }
            if (!(size > 0.5 && size < 500)) size = Math.max(1, (t - b) / 0.95);
            if (baseY < b - size || baseY > t + size) baseY = b + size * 0.2;
            let fontName = '', weight = -1, flags = 0;
            const font = w.FPDFTextObj_GetFont(obj);
            if (font) {
              fontName = byteString((buf, len) => w.FPDFFont_GetBaseFontName(font, buf, len));
              weight = w.FPDFFont_GetWeight(font);
              flags = w.FPDFFont_GetFlags(font);
            }
            let argb = 0xff000000;
            if (w.FPDFPageObj_GetFillColor(obj, cr, cg, cb, ca)) argb = (0xff000000 | ((u32(cr) & 255) << 16) | ((u32(cg) & 255) << 8) | (u32(cb) & 255)) >>> 0;
            // Text only joins text that looks the same: same letters (font), thickness, slant, color.
            const fm = FontMatch.match(fontName, weight, flags);
            const bold = fm.bold || mode === 2;
            const look = `${fm.family.toLowerCase()}|${bold ? 1 : 0}|${fm.italic ? 1 : 0}|${argb}`;
            frags.push({ addr: obj, text, l, b, r, t, baseY, size, fontName, weight, flags, argb, look, fauxBold: mode === 2, upright: upright && rotation === 0 });
          } else if (type === OBJ_IMAGE) {
            if (area / pageArea > 0.85) continue;
            result.push({ id: `p${pageIndex}-i${seq++}`, page: pageIndex, kind: 'image', box: this._normRect(page, l, b, r, t, a), objects: [obj] });
          } else if (type === OBJ_PATH || type === OBJ_SHADING) {
            if (area / pageArea > 0.6) continue;
            paths.push({ addr: obj, l, b, r, t });
          } else if (type === OBJ_FORM) {
            if (area / pageArea > 0.85) continue;
            result.push({ id: `p${pageIndex}-g${seq++}`, page: pageIndex, kind: 'group', box: this._normRect(page, l, b, r, t, a), objects: [obj] });
          }
        }
      } finally {
        if (textPage) w.FPDFText_ClosePage(textPage);
      }

      // Drawings: shapes that touch each other form one item.
      if (paths.length && paths.length <= 2500) {
        const parent = paths.map((_, i) => i);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const order = paths.map((_, i) => i).sort((x, y) => paths[x].l - paths[y].l);
        const m = 2;
        for (let oi = 0; oi < order.length; oi++) {
          const p1 = paths[order[oi]];
          for (let oj = oi + 1; oj < order.length; oj++) {
            const p2 = paths[order[oj]];
            if (p2.l > p1.r + m) break;
            if (p2.b <= p1.t + m && p2.t >= p1.b - m) {
              const ra = find(order[oi]), rb = find(order[oj]);
              if (ra !== rb) parent[ra] = rb;
            }
          }
        }
        const groups = new Map();
        paths.forEach((_, i) => { const r0 = find(i); if (!groups.has(r0)) groups.set(r0, []); groups.get(r0).push(i); });
        for (const g of groups.values()) {
          let l = Infinity, b = Infinity, r = -Infinity, t = -Infinity;
          for (const i of g) { l = Math.min(l, paths[i].l); b = Math.min(b, paths[i].b); r = Math.max(r, paths[i].r); t = Math.max(t, paths[i].t); }
          if (r - l < 1.5 && t - b < 1.5) continue;
          result.push({ id: `p${pageIndex}-d${seq++}`, page: pageIndex, kind: 'drawing', box: this._normRect(page, l, b, r, t, a), objects: g.map((i) => paths[i].addr) });
        }
      }

      for (const it of this._textBlocks(pageIndex, page, frags, rotation, a, () => seq++)) result.push(it);
      return result;
    }

    _textBlocks(pageIndex, page, frags, rotation, a, nextSeq) {
      const out = [];
      for (const f of frags.filter((x) => !x.upright)) {
        out.push({ id: `p${pageIndex}-r${nextSeq()}`, page: pageIndex, kind: 'text', box: this._normRect(page, f.l, f.b, f.r, f.t, a), objects: [f.addr], text: f.text, editable: false });
      }
      const sameSize = (x, y) => Math.abs(x - y) < Math.max(0.35, Math.max(x, y) * 0.05);
      const ups = frags.filter((x) => x.upright).sort((x, y) => (y.baseY - x.baseY) || (x.l - y.l));
      const lines = [];
      for (const f of ups) {
        let target = null;
        for (let i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
          const ln = lines[i];
          if (Math.abs(ln.baseY - f.baseY) < ln.size * 0.35 && sameSize(ln.size, f.size) &&
              ln.look === f.look && f.l - ln.r < ln.size * 1.8 && f.r > ln.l - ln.size * 0.5) { target = ln; break; }
        }
        if (!target) lines.push({ frags: [f], l: f.l, r: f.r, b: f.b, t: f.t, baseY: f.baseY, size: f.size, argb: f.argb, look: f.look });
        else { target.frags.push(f); target.l = Math.min(target.l, f.l); target.r = Math.max(target.r, f.r); target.b = Math.min(target.b, f.b); target.t = Math.max(target.t, f.t); }
      }
      const lineText = (ln) => {
        ln.frags.sort((x, y) => x.l - y.l);
        let s = '', prev = null;
        for (const f of ln.frags) {
          if (prev && f.l - prev.r > ln.size * 0.18 && !prev.text.endsWith(' ') && !f.text.startsWith(' ')) s += ' ';
          s += f.text;
          prev = f;
        }
        return s;
      };
      const blocks = [];
      for (const ln of lines) {
        let target = null;
        for (let i = blocks.length - 1; i >= 0 && i >= blocks.length - 4; i--) {
          const blk = blocks[i], last = blk[blk.length - 1];
          const gap = last.baseY - ln.baseY;
          const same = sameSize(last.size, ln.size) && last.look === ln.look;
          const overlap = ln.l < last.r && ln.r > last.l;
          const left = Math.abs(ln.l - blk[0].l) < ln.size * 1.2;
          const center = Math.abs((ln.l + ln.r) / 2 - (last.l + last.r) / 2) < ln.size;
          let gapOk = gap > ln.size * 0.9 && gap < ln.size * 1.9;
          if (gapOk && blk.length >= 2) gapOk = Math.abs(gap - (blk[blk.length - 2].baseY - last.baseY)) < ln.size * 0.3;
          if (same && overlap && gapOk && (left || center)) { target = blk; break; }
        }
        if (!target) blocks.push([ln]); else target.push(ln);
      }
      for (const blk of blocks) {
        let l = Infinity, b = Infinity, r = -Infinity, t = -Infinity;
        const all = [];
        for (const ln of blk) { l = Math.min(l, ln.l); b = Math.min(b, ln.b); r = Math.max(r, ln.r); t = Math.max(t, ln.t); all.push(...ln.frags); }
        const width = r - l;
        let text = '';
        const lt = blk.map((ln) => lineText(ln).replace(/\s+$/, ''));
        blk.forEach((ln, i) => {
          if (i > 0) {
            // A wide line flows on into the next one, unless the next looks like a new entry
            // (previous line ends a sentence/number and the next starts with a capital).
            const prev = lt[i - 1], cur = lt[i];
            const wide = (blk[i - 1].r - blk[i - 1].l) > width * 0.72;
            const newEntry = /^[\p{Lu}\p{N}•\-–]/u.test(cur.trim()) && !/[\p{Ll},]$/u.test(prev);
            text += wide && !newEntry ? ' ' : '\n';
          }
          text += lt[i];
        });
        const byFont = new Map();
        let sample = all[0], best = -1;
        for (const f of all) {
          const n = (byFont.get(f.fontName) || 0) + f.text.length;
          byFont.set(f.fontName, n);
          if (n > best) { best = n; sample = f; }
        }
        const m = FontMatch.match(sample.fontName, sample.weight, sample.flags);
        if (sample.fauxBold) m.bold = true;
        let lineGap = blk[0].size * 1.2;
        if (blk.length >= 2) lineGap = (blk[0].baseY - blk[blk.length - 1].baseY) / (blk.length - 1);
        let align = 0;
        if (blk.length >= 2) {
          const spread = (vals) => { const mean = vals.reduce((x, y) => x + y, 0) / vals.length; return Math.max(...vals.map((v) => Math.abs(v - mean))); };
          const ls = spread(blk.map((x) => x.l)), cs = spread(blk.map((x) => (x.l + x.r) / 2)), rs = spread(blk.map((x) => x.r));
          if (cs < ls * 0.5 && cs < blk[0].size) align = 1;
          if (rs < ls * 0.5 && rs < cs && rs < blk[0].size) align = 2;
        }
        const bad = (text.match(/�/g) || []).length;
        out.push({
          id: `p${pageIndex}-t${nextSeq()}`,
          page: pageIndex,
          kind: 'text',
          box: this._normRect(page, l, b, r, t, a),
          objects: all.map((f) => f.addr),
          text,
          editable: rotation === 0 && text.length > 0 && bad <= text.length * 0.1,
          style: { fontName: sample.fontName, family: m.family, size: Math.round(blk[0].size * 10) / 10, argb: sample.argb, bold: m.bold, italic: m.italic, lineGap, align },
          firstBaseline: this.pageToNorm(page, l, blk[0].baseY, a).y,
        });
      }
      return out;
    }

    // ---- text runs (font of the text near a point) ---------------------------------

    textRuns(pageIndex) {
      return withAlloc((a) => {
        const w = W();
        const page = this.page(pageIndex);
        const upright = w.FPDFPage_GetRotation(page) === 0;
        const tp = w.FPDFText_LoadPage(page);
        if (!tp) return [];
        try {
          const n = Math.min(w.FPDFText_CountChars(tp), 30000);
          const nameBuf = a.bytes(256), flagsP = a.bytes(4), box = a.bytes(16), ox = a.bytes(8), oy = a.bytes(8);
          const cr = a.bytes(4), cg = a.bytes(4), cb = a.bytes(4), ca = a.bytes(4);
          const built = [];
          let cur = null;
          for (let i = 0; i < n; i++) {
            const u = w.FPDFText_GetUnicode(tp, i);
            if (u <= 32 || u === 0xa0 || u >= 0xfffe) continue;
            if (w.FPDFText_IsGenerated(tp, i) === 1) continue;
            if (!w.FPDFText_GetLooseCharBox(tp, i, box)) continue;
            const bx = new Float32Array(Pdfium.memory.buffer, box, 4);
            const l = Math.min(bx[0], bx[2]), r = Math.max(bx[0], bx[2]), b = Math.min(bx[1], bx[3]), t = Math.max(bx[1], bx[3]);
            const lh = t - b;
            let size = w.FPDFText_GetFontSize(tp, i);
            if (size <= 0 || (lh > 0 && (lh / size > 3 || lh / size < 0.33))) size = lh / 1.15;
            if (!(size >= 1 && size <= 400)) continue;
            const nl = w.FPDFText_GetFontInfo(tp, i, nameBuf, 256, flagsP);
            const name = nl > 1 && nl <= 256 ? StringUtils.utf8BytesToString(new Uint8Array(Pdfium.memory.buffer, nameBuf, nl)) : '';
            const flags = nl > 0 ? i32(flagsP) : 0;
            const weight = w.FPDFText_GetFontWeight(tp, i);
            let argb = 0xff000000;
            if (w.FPDFText_GetFillColor(tp, i, cr, cg, cb, ca)) argb = (0xff000000 | ((u32(cr) & 255) << 16) | ((u32(cg) & 255) << 8) | (u32(cb) & 255)) >>> 0;
            w.FPDFText_GetCharOrigin(tp, i, ox, oy);
            const baseY = f64(oy);
            const key = `${name}|${size.toFixed(1)}|${argb}|${weight}`;
            if (cur && cur.key === key && Math.abs(baseY - cur.baseY) < size * 0.35 && l - cur.r < size * 2.5 && l > cur.l - size) {
              cur.l = Math.min(cur.l, l); cur.r = Math.max(cur.r, r); cur.b = Math.min(cur.b, b); cur.t = Math.max(cur.t, t); cur.chars++;
            } else {
              cur = { key, l, b, r, t, baseY, size, name, weight, flags, argb, chars: 1 };
              built.push(cur);
            }
          }
          return built.map((rb) => ({
            box: this._normRect(page, rb.l, rb.b, rb.r, rb.t, a),
            baseline: upright ? this.pageToNorm(page, rb.l, rb.baseY, a).y : null,
            size: rb.size, fontName: rb.name, weight: rb.weight, flags: rb.flags, argb: rb.argb, chars: rb.chars,
          }));
        } finally {
          w.FPDFText_ClosePage(tp);
        }
      });
    }

    // ---- search -----------------------------------------------------------------------

    search(query) {
      const results = [];
      if (!query) return results;
      return withAlloc((a) => {
        const w = W();
        const q = a.wide(query);
        const rect = { l: a.bytes(8), t: a.bytes(8), r: a.bytes(8), b: a.bytes(8) };
        for (let i = 0; i < this.pageCount && results.length < 2000; i++) {
          const page = this.page(i);
          const tp = w.FPDFText_LoadPage(page);
          if (!tp) continue;
          try {
            const sh = w.FPDFText_FindStart(tp, q, 0, 0);
            if (!sh) continue;
            try {
              while (w.FPDFText_FindNext(sh)) {
                const start = w.FPDFText_GetSchResultIndex(sh);
                const cnt = w.FPDFText_GetSchCount(sh);
                const nr = w.FPDFText_CountRects(tp, start, cnt);
                const rects = [];
                for (let k = 0; k < nr; k++) {
                  if (!w.FPDFText_GetRect(tp, k, rect.l, rect.t, rect.r, rect.b)) continue;
                  rects.push(this._normRect(page, f64(rect.l), f64(rect.b), f64(rect.r), f64(rect.t), a));
                }
                if (rects.length) results.push({ page: i, rects });
              }
            } finally {
              w.FPDFText_FindClose(sh);
            }
          } finally {
            w.FPDFText_ClosePage(tp);
          }
        }
        return results;
      });
    }

    // ---- form fields --------------------------------------------------------------------

    fields(pageIndex) {
      if (!this.form || W().FPDF_GetFormType(this.doc) === 0) return [];
      return withAlloc((a) => {
        const w = W();
        const page = this.page(pageIndex);
        const out = [];
        const n = w.FPDFPage_GetAnnotCount(page);
        const rect = a.bytes(16);
        for (let i = 0; i < n; i++) {
          const annot = w.FPDFPage_GetAnnot(page, i);
          if (!annot) continue;
          try {
            if (w.FPDFAnnot_GetSubtype(annot) !== ANNOT_WIDGET) continue;
            const type = w.FPDFAnnot_GetFormFieldType(this.form, annot);
            const kind = { 6: 'text', 2: 'checkbox', 3: 'radio', 4: 'combo', 5: 'list' }[type];
            if (!kind) continue;
            if (!w.FPDFAnnot_GetRect(annot, rect)) continue;
            const rv = new Float32Array(Pdfium.memory.buffer, rect, 4);
            const l = Math.min(rv[0], rv[2]), r = Math.max(rv[0], rv[2]), b = Math.min(rv[1], rv[3]), t = Math.max(rv[1], rv[3]);
            const box = this._normRect(page, l, b, r, t, a);
            if (box.r - box.l <= 0 || box.b - box.t <= 0) continue;
            const flags = w.FPDFAnnot_GetFormFieldFlags(this.form, annot);
            const options = [];
            let selected = -1;
            if (kind === 'combo' || kind === 'list') {
              const oc = w.FPDFAnnot_GetOptionCount(this.form, annot);
              for (let o = 0; o < oc; o++) {
                options.push(wideString((buf, len) => w.FPDFAnnot_GetOptionLabel(this.form, annot, o, buf, len)));
                if (selected < 0 && w.FPDFAnnot_IsOptionSelected(this.form, annot, o)) selected = o;
              }
            }
            // Font from the default appearance
            const keyDA = a.utf8('DA');
            const da = FontMatch.parseDA(wideString((buf, len) => w.FPDFAnnot_GetStringValue(annot, keyDA, buf, len)));
            let size = da.size && da.size > 0 ? da.size : null;
            const fsz = a.bytes(4);
            if (w.FPDFAnnot_GetFontSize(this.form, annot, fsz) && f32(fsz) > 0) size = f32(fsz);
            let argb = da.argb || 0xff000000;
            const cr = a.bytes(4), cg = a.bytes(4), cb = a.bytes(4);
            if (w.FPDFAnnot_GetFontColor(this.form, annot, cr, cg, cb)) argb = (0xff000000 | ((u32(cr) & 255) << 16) | ((u32(cg) & 255) << 8) | (u32(cb) & 255)) >>> 0;
            const qk = a.utf8('Q'), qv = a.bytes(4);
            const align = w.FPDFAnnot_GetNumberValue(annot, qk, qv) ? Math.max(0, Math.min(2, Math.round(f32(qv)))) : 0;
            const multiline = (flags & (1 << 12)) !== 0;
            const h = t - b;
            if (!size) size = multiline ? 10 : Math.max(4, Math.min(24, h * 0.66));
            const fm = FontMatch.match(da.font || 'Helv');
            out.push({
              key: `${pageIndex}:${i}`, page: pageIndex, annotIndex: i, kind,
              name: wideString((buf, len) => w.FPDFAnnot_GetFormFieldName(this.form, annot, buf, len)),
              value: wideString((buf, len) => w.FPDFAnnot_GetFormFieldValue(this.form, annot, buf, len)),
              checked: (kind === 'checkbox' || kind === 'radio') && !!w.FPDFAnnot_IsChecked(this.form, annot),
              options, selected, box,
              readOnly: (flags & 1) !== 0, multiline, password: (flags & (1 << 13)) !== 0,
              size, family: fm.family, bold: fm.bold, italic: fm.italic, argb, align,
            });
          } finally {
            w.FPDFPage_CloseAnnot(annot);
          }
        }
        return out;
      });
    }

    /** Writes a form value (PDFium regenerates the field's appearance). */
    setField(field, value) {
      if (!this.form) return;
      withAlloc((a) => {
        const w = W();
        const page = this.page(field.page);
        const annot = w.FPDFPage_GetAnnot(page, field.annotIndex);
        if (!annot) return;
        try {
          if (field.kind === 'text') {
            if (!w.FORM_SetFocusedAnnot(this.form, annot)) return;
            w.FORM_SelectAllText(this.form, page);
            w.FORM_ReplaceSelection(this.form, page, a.wide(String(value)));
            w.FORM_ForceToKillFocus(this.form);
          } else if (field.kind === 'checkbox' || field.kind === 'radio') {
            const isOn = !!w.FPDFAnnot_IsChecked(this.form, annot);
            if (isOn === !!value) return;
            const rect = a.bytes(16);
            if (!w.FPDFAnnot_GetRect(annot, rect)) return;
            const rv = new Float32Array(Pdfium.memory.buffer, rect, 4);
            const cx = (rv[0] + rv[2]) / 2, cy = (rv[1] + rv[3]) / 2;
            w.FORM_OnLButtonDown(this.form, page, 0, cx, cy);
            w.FORM_OnLButtonUp(this.form, page, 0, cx, cy);
            w.FORM_ForceToKillFocus(this.form);
          } else if (field.kind === 'combo' || field.kind === 'list') {
            if (value < 0) return;
            if (!w.FORM_SetFocusedAnnot(this.form, annot)) return;
            w.FORM_SetIndexSelected(this.form, page, value, 1);
            w.FORM_ForceToKillFocus(this.form);
          }
        } finally {
          w.FPDFPage_CloseAnnot(annot);
        }
      });
    }

    // ---- changing page objects -------------------------------------------------------

    setActive(pageIndex, objs, active) {
      this.page(pageIndex);
      for (const o of objs) W().FPDFPageObj_SetIsActive(o, active ? 1 : 0);
      this.dirty.add(pageIndex);
    }

    /** Moves/resizes objects so that rectangle [from] (normalized) lands on [to]. */
    transform(pageIndex, objs, from, to) {
      withAlloc((a) => {
        const p = this.page(pageIndex);
        const a0 = this.normToPage(p, from.l, from.t, a), a1 = this.normToPage(p, from.r, from.t, a), a2 = this.normToPage(p, from.l, from.b, a);
        const b0 = this.normToPage(p, to.l, to.t, a), b1 = this.normToPage(p, to.r, to.t, a), b2 = this.normToPage(p, to.l, to.b, a);
        const m = affine(a0, a1, a2, b0, b1, b2);
        for (const o of objs) {
          if (m) W().FPDFPageObj_Transform(o, m.a, m.b, m.c, m.d, m.e, m.f);
          W().FPDFPageObj_SetIsActive(o, 1);
        }
        this.dirty.add(pageIndex);
      });
    }

    /** Invisible (scanned-page) text objects whose middle lies inside the normalized [box]. */
    hiddenTextIn(pageIndex, box) {
      return withAlloc((a) => {
        const w = W();
        const page = this.page(pageIndex);
        const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
        const out = [];
        for (let i = 0, n = w.FPDFPage_CountObjects(page); i < n; i++) {
          const o = w.FPDFPage_GetObject(page, i);
          if (!o || w.FPDFPageObj_GetType(o) !== OBJ_TEXT || w.FPDFTextObj_GetTextRenderMode(o) !== 3) continue;
          if (!w.FPDFPageObj_GetBounds(o, lp, bp, rp, tp)) continue;
          const r = this._normRect(page, f32(lp), f32(bp), f32(rp), f32(tp), a);
          const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
          if (cx >= box.l && cx <= box.r && cy >= box.t && cy <= box.b) out.push(o);
        }
        return out;
      });
    }

    deleteObjects(pageIndex, objs) {
      const p = this.page(pageIndex);
      for (const o of objs) if (W().FPDFPage_RemoveObject(p, o)) W().FPDFPageObj_Destroy(o);
      this.dirty.add(pageIndex);
    }

    setTextColor(pageIndex, objs, argb) {
      this.page(pageIndex);
      for (const o of objs) {
        if (W().FPDFPageObj_GetType(o) !== OBJ_TEXT) continue;
        W().FPDFPageObj_SetFillColor(o, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, 255);
      }
      this.dirty.add(pageIndex);
    }

    _font(key, bytes) {
      const f = this.fonts.get(key);
      if (f) return f.font;
      const data = W().malloc(bytes.length);
      u8().set(bytes, data);
      const font = W().FPDFText_LoadFont(this.doc, data, bytes.length, 2, 1);
      if (!font) {
        W().free(data);
        throw new PdfError('Fontul nu poate fi folosit.', -1);
      }
      this.fonts.set(key, { font, data });
      return font;
    }

    /**
     * Writes text lines ({text, dx, baseline} in points from the box's top-left
     * corner [topLeft], normalized) and removes [remove]. Returns the new objects.
     */
    writeText(pageIndex, { remove = [], lines, topLeft, fontKey, fontBytes, size, argb }) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const font = this._font(fontKey, fontBytes);
        const pw = w.FPDF_GetPageWidthF(p), ph = w.FPDF_GetPageHeightF(p);
        const created = [];
        for (const ln of lines) {
          if (!ln.text.trim()) continue;
          const nx = topLeft.x + ln.dx / pw, ny = topLeft.y + ln.baseline / ph;
          const o = this.normToPage(p, nx, ny, a);
          const ox = this.normToPage(p, nx + 10 / pw, ny, a);
          const oy = this.normToPage(p, nx, ny - 10 / ph, a);
          let ax = (ox.x - o.x) / 10, ay = (ox.y - o.y) / 10, bx = (oy.x - o.x) / 10, by = (oy.y - o.y) / 10;
          if (![ax, ay, bx, by].every(Number.isFinite)) { ax = 1; ay = 0; bx = 0; by = 1; }
          const obj = w.FPDFPageObj_CreateTextObj(this.doc, font, size);
          if (!obj) throw new PdfError('Nu am putut crea textul.', -1);
          if (!w.FPDFText_SetText(obj, a.wide(ln.text))) {
            w.FPDFPageObj_Destroy(obj);
            throw new PdfError('Nu am putut scrie textul.', -1);
          }
          w.FPDFPageObj_SetFillColor(obj, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, 255);
          w.FPDFPageObj_Transform(obj, ax, ay, bx, by, o.x, o.y);
          w.FPDFPage_InsertObject(p, obj);
          created.push(obj);
        }
        for (const ob of remove) if (w.FPDFPage_RemoveObject(p, ob)) w.FPDFPageObj_Destroy(ob);
        this.dirty.add(pageIndex);
        return created;
      });
    }

    /**
     * Hidden text over a scanned picture (like a scanner's "searchable PDF"): the words
     * can be found, selected and copied, but the picture stays exactly as it was.
     * words: [{text, l, r, base, size}] with l/r/base as fractions of the page, size in points.
     */
    writeHiddenText(pageIndex, words, fontKey, fontBytes) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const font = this._font(fontKey, fontBytes);
        const pw = w.FPDF_GetPageWidthF(p), ph = w.FPDF_GetPageHeightF(p);
        const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
        let n = 0;
        for (const wd of words) {
          if (!wd.text || !wd.text.trim()) continue;
          const size = Math.max(1, wd.size);
          const obj = w.FPDFPageObj_CreateTextObj(this.doc, font, size);
          if (!obj) continue;
          if (!w.FPDFText_SetText(obj, a.wide(wd.text))) { w.FPDFPageObj_Destroy(obj); continue; }
          let tw = 0;
          if (w.FPDFPageObj_GetBounds(obj, lp, bp, rp, tp)) tw = Math.abs(f32(rp) - f32(lp));
          const target = Math.max(1, (wd.r - wd.l) * pw);
          const sx = tw > 0 ? Math.max(0.2, Math.min(5, target / tw)) : 1;
          if (w.FPDFTextObj_SetTextRenderMode) w.FPDFTextObj_SetTextRenderMode(obj, 3); // invisible
          w.FPDFPageObj_Transform(obj, sx, 0, 0, 1, wd.l * pw, (1 - wd.base) * ph);
          w.FPDFPage_InsertObject(p, obj);
          n++;
        }
        this.dirty.add(pageIndex);
        return n;
      });
    }

    /** Inserts straight-RGBA pixels as an image covering [rect] (normalized). */
    insertImage(pageIndex, rgba, width, height, rect) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const bmp = w.FPDFBitmap_Create(width, height, 1);
        if (!bmp) throw new PdfError('Memorie insuficientă pentru imagine.', -1);
        try {
          const stride = w.FPDFBitmap_GetStride(bmp);
          const ptr = w.FPDFBitmap_GetBuffer(bmp);
          const dst = u8();
          for (let y = 0; y < height; y++) {
            let s = y * width * 4, d = ptr + y * stride;
            for (let x = 0; x < width; x++, s += 4, d += 4) {
              dst[d] = rgba[s + 2]; dst[d + 1] = rgba[s + 1]; dst[d + 2] = rgba[s]; dst[d + 3] = rgba[s + 3];
            }
          }
          const img = w.FPDFPageObj_NewImageObj(this.doc);
          if (!img) throw new PdfError('Nu am putut adăuga imaginea.', -1);
          if (!w.FPDFImageObj_SetBitmap(0, 0, img, bmp)) {
            w.FPDFPageObj_Destroy(img);
            throw new PdfError('Nu am putut adăuga imaginea.', -1);
          }
          const bl = this.normToPage(p, rect.l, rect.b, a), br = this.normToPage(p, rect.r, rect.b, a), tl = this.normToPage(p, rect.l, rect.t, a);
          w.FPDFImageObj_SetMatrix(img, br.x - bl.x, br.y - bl.y, tl.x - bl.x, tl.y - bl.y, bl.x, bl.y);
          w.FPDFPage_InsertObject(p, img);
          this.dirty.add(pageIndex);
          return img;
        } finally {
          w.FPDFBitmap_Destroy(bmp);
        }
      });
    }

    /** Inserts a JPEG file (kept compressed, small PDFs) covering [rect] (normalized). */
    insertJpeg(pageIndex, jpegBytes, rect) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const img = w.FPDFPageObj_NewImageObj(this.doc);
        if (!img) throw new PdfError('Nu am putut adăuga imaginea.', -1);
        const pages = a.bytes(4);
        new Uint32Array(Pdfium.memory.buffer, pages, 1)[0] = p;
        const data = w.malloc(jpegBytes.length);
        u8().set(jpegBytes, data);
        const fa = a.bytes(12);
        const cb = Pdfium.addFunction((param, pos, buf, size) => {
          if (pos + size > jpegBytes.length) return 0;
          u8().copyWithin(buf, data + pos, data + pos + size);
          return 1;
        }, 'iiiii');
        try {
          const v = new Uint32Array(Pdfium.memory.buffer, fa, 3);
          v[0] = jpegBytes.length; v[1] = cb; v[2] = 0;
          if (!w.FPDFImageObj_LoadJpegFileInline(pages, 1, img, fa)) { w.FPDFPageObj_Destroy(img); throw new PdfError('Nu am putut adăuga imaginea.', -1); }
        } finally {
          Pdfium.removeFunction(cb);
          w.free(data);
        }
        const bl = this.normToPage(p, rect.l, rect.b, a), br = this.normToPage(p, rect.r, rect.b, a), tl = this.normToPage(p, rect.l, rect.t, a);
        w.FPDFImageObj_SetMatrix(img, br.x - bl.x, br.y - bl.y, tl.x - bl.x, tl.y - bl.y, bl.x, bl.y);
        w.FPDFPage_InsertObject(p, img);
        this.dirty.add(pageIndex);
        return img;
      });
    }

    /** New PDF from pictures: one JPEG per page, each page [ptW]x[ptH]. pages: [{jpeg, ptW, ptH}] */
    static fromJpegs(pages) {
      const d = Doc.createBlank(pages[0].ptW, pages[0].ptH);
      pages.forEach((pg, i) => {
        if (i > 0) d.insertBlankPage(i, pg.ptW, pg.ptH);
        d.insertJpeg(i, pg.jpeg, { l: 0, t: 0, r: 1, b: 1 });
      });
      return d;
    }

    // ---- pictures: pixels in / out (used to make the text inside pictures editable) ----

    /** Page point (PDF units) -> normalized page position. */
    pointToNorm(pageIndex, x, y) {
      return withAlloc((a) => this.pageToNorm(this.page(pageIndex), x, y, a));
    }

    /** Every picture on page [pageIndex], also full-page scans. */
    images(pageIndex) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const rot = w.FPDFPage_GetRotation(p);
        const n = w.FPDFPage_CountObjects(p);
        const mx = a.bytes(24), pw = a.bytes(4), ph = a.bytes(4);
        const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
        const out = [];
        for (let i = 0; i < n; i++) {
          const o = w.FPDFPage_GetObject(p, i);
          if (!o || w.FPDFPageObj_GetType(o) !== OBJ_IMAGE) continue;
          if (!w.FPDFPageObj_GetMatrix(o, mx) || !w.FPDFImageObj_GetImagePixelSize(o, pw, ph)) continue;
          if (!w.FPDFPageObj_GetBounds(o, lp, bp, rp, tp)) continue;
          const m = Array.from(new Float32Array(Pdfium.memory.buffer, mx, 6));
          const upright = rot === 0 && m[0] > 0 && m[3] > 0 && Math.abs(m[1]) < m[0] * 0.02 && Math.abs(m[2]) < m[3] * 0.02;
          out.push({ obj: o, m, width: u32(pw), height: u32(ph), upright, box: this._normRect(p, f32(lp), f32(bp), f32(rp), f32(tp), a) });
        }
        return out;
      });
    }

    /** Decoded pixels of a picture as straight RGBA (transparency kept). */
    imagePixels(pageIndex, obj) {
      const w = W();
      const p = this.page(pageIndex);
      const bmp = w.FPDFImageObj_GetBitmap(obj);
      if (!bmp) throw new PdfError('Nu pot citi imaginea.', -1);
      let width, height, rgba;
      try {
        const fmt = w.FPDFBitmap_GetFormat(bmp);
        width = w.FPDFBitmap_GetWidth(bmp);
        height = w.FPDFBitmap_GetHeight(bmp);
        const stride = w.FPDFBitmap_GetStride(bmp);
        const ptr = w.FPDFBitmap_GetBuffer(bmp);
        const bpp = { 1: 1, 2: 3, 3: 4, 4: 4 }[fmt];
        if (!bpp || !width || !height) throw new PdfError('Formatul imaginii nu este suportat.', -1);
        rgba = new Uint8ClampedArray(width * height * 4);
        const src = u8();
        for (let y = 0; y < height; y++) {
          let s = ptr + y * stride, d = y * width * 4;
          for (let x = 0; x < width; x++, s += bpp, d += 4) {
            if (bpp === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = src[s]; } else { rgba[d] = src[s + 2]; rgba[d + 1] = src[s + 1]; rgba[d + 2] = src[s]; }
            rgba[d + 3] = 255;
          }
        }
      } finally {
        w.FPDFBitmap_Destroy(bmp);
      }
      // Transparency (soft mask) only shows in the rendered version: copy its alpha over.
      let transparent = false;
      const rb = w.FPDFImageObj_GetRenderedBitmap(this.doc, p, obj);
      if (rb) {
        try {
          if (w.FPDFBitmap_GetFormat(rb) === 4) {
            const rw = w.FPDFBitmap_GetWidth(rb), rh = w.FPDFBitmap_GetHeight(rb), rs = w.FPDFBitmap_GetStride(rb), rp = w.FPDFBitmap_GetBuffer(rb);
            const src = u8();
            for (let y = 0; y < rh && !transparent; y++) for (let x = 0; x < rw; x++) if (src[rp + y * rs + x * 4 + 3] < 250) { transparent = true; break; }
            if (transparent) {
              for (let y = 0; y < height; y++) {
                const sy = Math.min(rh - 1, Math.floor((y + 0.5) * rh / height));
                for (let x = 0; x < width; x++) {
                  const sx = Math.min(rw - 1, Math.floor((x + 0.5) * rw / width));
                  rgba[(y * width + x) * 4 + 3] = src[rp + sy * rs + sx * 4 + 3];
                }
              }
            }
          }
        } finally {
          w.FPDFBitmap_Destroy(rb);
        }
      }
      let jpeg = false;
      withAlloc((a) => {
        const n = w.FPDFImageObj_GetImageFilterCount(obj);
        for (let i = 0; i < n; i++) {
          const name = byteString((buf, len) => w.FPDFImageObj_GetImageFilter(obj, i, buf, len));
          if (name === 'DCTDecode') jpeg = true;
        }
      });
      return { rgba, width, height, transparent, jpeg };
    }

    /** Replaces the pixels of a picture (same place and size). [jpegBytes]: store as JPEG. */
    replaceImage(pageIndex, obj, { rgba, width, height, transparent }, jpegBytes) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const pages = a.bytes(4);
        new Uint32Array(Pdfium.memory.buffer, pages, 1)[0] = p;
        if (jpegBytes && !transparent) {
          const data = w.malloc(jpegBytes.length);
          u8().set(jpegBytes, data);
          const fa = a.bytes(12);
          const cb = Pdfium.addFunction((param, pos, buf, size) => {
            if (pos + size > jpegBytes.length) return 0;
            u8().copyWithin(buf, data + pos, data + pos + size);
            return 1;
          }, 'iiiii');
          try {
            const v = new Uint32Array(Pdfium.memory.buffer, fa, 3);
            v[0] = jpegBytes.length; v[1] = cb; v[2] = 0;
            if (!w.FPDFImageObj_LoadJpegFileInline(pages, 1, obj, fa)) throw new PdfError('Nu am putut actualiza imaginea.', -1);
          } finally {
            Pdfium.removeFunction(cb);
            w.free(data);
          }
        } else {
          const bmp = w.FPDFBitmap_Create(width, height, transparent ? 1 : 0);
          if (!bmp) throw new PdfError('Memorie insuficientă pentru imagine.', -1);
          try {
            const stride = w.FPDFBitmap_GetStride(bmp);
            const ptr = w.FPDFBitmap_GetBuffer(bmp);
            const dst = u8();
            for (let y = 0; y < height; y++) {
              let s = y * width * 4, d = ptr + y * stride;
              for (let x = 0; x < width; x++, s += 4, d += 4) {
                dst[d] = rgba[s + 2]; dst[d + 1] = rgba[s + 1]; dst[d + 2] = rgba[s]; dst[d + 3] = transparent ? rgba[s + 3] : 255;
              }
            }
            if (!w.FPDFImageObj_SetBitmap(pages, 1, obj, bmp)) throw new PdfError('Nu am putut actualiza imaginea.', -1);
          } finally {
            w.FPDFBitmap_Destroy(bmp);
          }
        }
        this.dirty.add(pageIndex);
        return obj;
      });
    }

    /** Width in points of [text] written with a font at [size]. */
    textWidth(fontKey, fontBytes, size, text) {
      return withAlloc((a) => {
        const w = W();
        const font = this._font(fontKey, fontBytes);
        const o = w.FPDFPageObj_CreateTextObj(this.doc, font, size);
        try {
          w.FPDFText_SetText(o, a.wide(text));
          const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
          if (!w.FPDFPageObj_GetBounds(o, lp, bp, rp, tp)) return 0;
          return Math.abs(f32(rp) - f32(lp));
        } finally {
          w.FPDFPageObj_Destroy(o);
        }
      });
    }

    /** Freehand stroke through normalized points. */
    addInk(pageIndex, points, argb, widthPt) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const pts = points.map((q) => this.normToPage(p, q.x, q.y, a));
        const path = w.FPDFPageObj_CreateNewPath(pts[0].x, pts[0].y);
        if (pts.length === 1) {
          w.FPDFPath_LineTo(path, pts[0].x + 0.01, pts[0].y);
        } else {
          for (let i = 1; i < pts.length - 1; i++) {
            const c = pts[i], n = pts[i + 1];
            const mx = (c.x + n.x) / 2, my = (c.y + n.y) / 2;
            // Quadratic through the midpoint, as a cubic
            const prev = i === 1 ? pts[0] : { x: (pts[i - 1].x + c.x) / 2, y: (pts[i - 1].y + c.y) / 2 };
            w.FPDFPath_BezierTo(path, prev.x + (2 / 3) * (c.x - prev.x), prev.y + (2 / 3) * (c.y - prev.y), mx + (2 / 3) * (c.x - mx), my + (2 / 3) * (c.y - my), mx, my);
          }
          const last = pts[pts.length - 1];
          w.FPDFPath_LineTo(path, last.x, last.y);
        }
        w.FPDFPageObj_SetStrokeColor(path, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, 255);
        w.FPDFPageObj_SetStrokeWidth(path, widthPt);
        w.FPDFPageObj_SetLineCap(path, 1);
        w.FPDFPageObj_SetLineJoin(path, 1);
        w.FPDFPath_SetDrawMode(path, 0, 1);
        tagDrawing(w, path, a);
        w.FPDFPage_InsertObject(p, path);
        this.dirty.add(pageIndex);
        return path;
      });
    }

    /** Filled rectangle (whiteout, highlight). */
    addRect(pageIndex, rect, argb, alpha = 255, multiply = false) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const q1 = this.normToPage(p, rect.l, rect.t, a), q2 = this.normToPage(p, rect.r, rect.b, a);
        const obj = w.FPDFPageObj_CreateNewRect(Math.min(q1.x, q2.x), Math.min(q1.y, q2.y), Math.abs(q1.x - q2.x), Math.abs(q1.y - q2.y));
        w.FPDFPageObj_SetFillColor(obj, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, alpha);
        w.FPDFPath_SetDrawMode(obj, 2, 0);
        if (multiply) w.FPDFPageObj_SetBlendMode(obj, a.utf8('Multiply'));
        tagDrawing(w, obj, a);
        w.FPDFPage_InsertObject(p, obj);
        this.dirty.add(pageIndex);
        return obj;
      });
    }

    /** Check mark or X inside [rect]. */
    addMark(pageIndex, rect, kind, argb) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const at = (x, y) => this.normToPage(p, rect.l + (rect.r - rect.l) * x, rect.t + (rect.b - rect.t) * y, a);
        const segs = kind === 'check' ? [[[0.14, 0.55], [0.4, 0.8], [0.86, 0.2]]] : [[[0.18, 0.18], [0.82, 0.82]], [[0.82, 0.18], [0.18, 0.82]]];
        const q0 = at(0, 0), q1 = at(1, 1);
        const side = Math.min(Math.abs(q1.x - q0.x), Math.abs(q1.y - q0.y));
        const s0 = at(...segs[0][0]);
        const path = w.FPDFPageObj_CreateNewPath(s0.x, s0.y);
        segs.forEach((seg, si) => {
          seg.forEach((pt, pi) => {
            const q = at(pt[0], pt[1]);
            if (pi === 0) { if (si > 0) w.FPDFPath_MoveTo(path, q.x, q.y); } else w.FPDFPath_LineTo(path, q.x, q.y);
          });
        });
        w.FPDFPageObj_SetStrokeColor(path, (argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, 255);
        w.FPDFPageObj_SetStrokeWidth(path, Math.max(0.8, side * 0.14));
        w.FPDFPageObj_SetLineCap(path, 1);
        w.FPDFPageObj_SetLineJoin(path, 1);
        w.FPDFPath_SetDrawMode(path, 0, 1);
        tagDrawing(w, path, a);
        w.FPDFPage_InsertObject(p, path);
        this.dirty.add(pageIndex);
        return path;
      });
    }

    /**
     * Drawings the eraser can remove: what was drawn with the pen, marker, cover,
     * tick and X (also by older versions: free-hand curves and see-through marks).
     * [{obj, fill, pts: [[x, y]] (page fractions), width (fraction of page width), box}]
     */
    erasables(pageIndex) {
      return withAlloc((a) => {
        const w = W();
        const p = this.page(pageIndex);
        const pw = w.FPDF_GetPageWidthF(p);
        const n = w.FPDFPage_CountObjects(p);
        const out = [];
        const fx = a.bytes(4), fy = a.bytes(4), fm = a.bytes(4), st = a.bytes(4), mx = a.bytes(24);
        const nb = a.bytes(128), nl = a.bytes(4), cr = a.bytes(4), cg = a.bytes(4), cb = a.bytes(4), ca = a.bytes(4), sw = a.bytes(4);
        const lp = a.bytes(4), bp = a.bytes(4), rp = a.bytes(4), tp = a.bytes(4);
        for (let i = 0; i < n; i++) {
          const o = w.FPDFPage_GetObject(p, i);
          if (!o || w.FPDFPageObj_GetType(o) !== OBJ_PATH) continue;
          if (this.hidden.has(o)) continue;
          let ours = false;
          const marks = w.FPDFPageObj_CountMarks ? w.FPDFPageObj_CountMarks(o) : 0;
          for (let k = 0; k < marks && !ours; k++) {
            const mk = w.FPDFPageObj_GetMark(o, k);
            new Uint32Array(Pdfium.memory.buffer, nl, 1)[0] = 0;
            if (mk && w.FPDFPageObjMark_GetName(mk, nb, 128, nl)) {
              const len = Math.min(128, new Uint32Array(Pdfium.memory.buffer, nl, 1)[0]);
              const u = new Uint16Array(Pdfium.memory.buffer.slice(nb, nb + len));
              ours = String.fromCharCode(...u).replace(/\0+$/, '') === DRAW_MARK;
            }
          }
          w.FPDFPath_GetDrawMode(o, fm, st);
          const fill = new Int32Array(Pdfium.memory.buffer, fm, 1)[0] !== 0, stroke = new Int32Array(Pdfium.memory.buffer, st, 1)[0] !== 0;
          const segs = w.FPDFPath_CountSegments(o);
          if (!ours) {
            let curve = false;
            for (let k = 0; k < segs && !curve; k++) if (w.FPDFPathSegment_GetType(w.FPDFPath_GetPathSegment(o, k)) === 1) curve = true;
            const see = fill && w.FPDFPageObj_GetFillColor(o, cr, cg, cb, ca) && (new Uint32Array(Pdfium.memory.buffer, ca, 1)[0] & 255) < 255;
            if (!((stroke && !fill && curve && segs >= 4) || (fill && !stroke && see && segs <= 6))) continue;
          }
          const m = w.FPDFPageObj_GetMatrix(o, mx) ? new Float32Array(Pdfium.memory.buffer.slice(mx, mx + 24)) : [1, 0, 0, 1, 0, 0];
          const pts = [];
          for (let k = 0; k < segs; k++) {
            if (!w.FPDFPathSegment_GetPoint(w.FPDFPath_GetPathSegment(o, k), fx, fy)) continue;
            const x = f32(fx), y = f32(fy);
            const q = this.pageToNorm(p, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], a);
            pts.push([q.x, q.y]);
          }
          let width = 0;
          if (stroke && w.FPDFPageObj_GetStrokeWidth(o, sw)) width = f32(sw) / pw;
          if (!w.FPDFPageObj_GetBounds(o, lp, bp, rp, tp)) continue;
          const box = this._normRect(p, Math.min(f32(lp), f32(rp)), Math.min(f32(bp), f32(tp)), Math.max(f32(lp), f32(rp)), Math.max(f32(bp), f32(tp)), a);
          out.push({ obj: o, fill: fill && !stroke, pts, width, box });
        }
        return out;
      });
    }

    /** Hides [objs]; returns the page without them and a transparent sprite of them. */
    lift(pageIndex, objs, box, fullW, fullH) {
      const pad = 2;
      const x = Math.floor(box.l * fullW) - pad, y = Math.floor(box.t * fullH) - pad;
      const w = Math.max(1, Math.ceil(box.r * fullW) + pad - x), h = Math.max(1, Math.ceil(box.b * fullH) + pad - y);
      const canSprite = w * h <= 16e6;
      const withIt = canSprite ? this.render(pageIndex, fullW, fullH, { x, y, w, h }) : null;
      this.setActive(pageIndex, objs, false);
      const background = this.render(pageIndex, fullW, fullH);
      let sprite = null;
      if (withIt) {
        const without = this.render(pageIndex, fullW, fullH, { x, y, w, h });
        const out = new Uint8ClampedArray(w * h * 4);
        const pa = withIt.data, pb = without.data;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
          if (d > 18) { out[i] = pa[i]; out[i + 1] = pa[i + 1]; out[i + 2] = pa[i + 2]; out[i + 3] = 255; }
        }
        sprite = { data: out, width: w, height: h };
      }
      return { background, sprite, spriteBox: { l: x / fullW, t: y / fullH, r: (x + w) / fullW, b: (y + h) / fullH } };
    }

    // ---- pages ------------------------------------------------------------------------

    _flushPages() {
      this._closePages();
      this.dirty.clear();
    }

    rotatePage(i, quarterTurns) {
      const p = this.page(i);
      const cur = W().FPDFPage_GetRotation(p);
      W().FPDFPage_SetRotation(p, (((cur + quarterTurns) % 4) + 4) % 4);
      this.dirty.add(i);
      this._flushPages();
    }

    deletePage(i) {
      if (this.pageCount <= 1) throw new PdfError('Documentul trebuie să aibă cel puțin o pagină.', -1);
      this._flushPages();
      W().FPDFPage_Delete(this.doc, i);
    }

    movePage(from, to) {
      this._flushPages();
      withAlloc((a) => {
        const idx = a.bytes(4);
        new Int32Array(Pdfium.memory.buffer, idx, 1)[0] = from;
        if (!W().FPDF_MovePages(this.doc, idx, 1, to)) throw new PdfError('Mutarea paginii a eșuat.', -1);
      });
    }

    insertBlankPage(at, widthPt, heightPt) {
      this._flushPages();
      const p = W().FPDFPage_New(this.doc, Math.max(0, Math.min(at, this.pageCount)), widthPt, heightPt);
      if (!p) throw new PdfError('Nu am putut insera pagina.', -1);
      W().FPDF_ClosePage(p);
    }

    appendDocument(other) {
      this._flushPages();
      if (!W().FPDF_ImportPages(this.doc, other.doc, 0, this.pageCount)) throw new PdfError('Nu am putut adăuga paginile.', -1);
    }

    // ---- saving -------------------------------------------------------------------------

    save() {
      const w = W();
      for (const i of this.dirty) {
        const p = this.pages.get(i);
        if (p && !w.FPDFPage_GenerateContent(p)) throw new PdfError(`Nu am putut scrie pagina ${i + 1}.`, -1);
      }
      this.dirty.clear();
      let buffer = new Uint8Array(1 << 20);
      let size = 0;
      const cb = Pdfium.addFunction((pThis, pData, len) => {
        if (size + len > buffer.length) {
          const nb = new Uint8Array(Math.max(buffer.length * 2, size + len));
          nb.set(buffer.subarray(0, size));
          buffer = nb;
        }
        buffer.set(new Uint8Array(Pdfium.memory.buffer, pData, len), size);
        size += len;
        return 1;
      }, 'iiii');
      try {
        const fw = w.malloc(8);
        new Int32Array(Pdfium.memory.buffer, fw, 2).set([1, cb]);
        const ok = w.FPDF_SaveAsCopy(this.doc, fw, 2);
        w.free(fw);
        if (!ok) throw new PdfError('Salvarea PDF-ului a eșuat.', -1);
        return buffer.slice(0, size);
      } finally {
        Pdfium.removeFunction(cb);
      }
    }
  }

  function affine(p0, p1, p2, q0, q1, q2) {
    const ux = p1.x - p0.x, uy = p1.y - p0.y, vx = p2.x - p0.x, vy = p2.y - p0.y;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-9) return { a: 1, b: 0, c: 0, d: 1, e: q0.x - p0.x, f: q0.y - p0.y };
    const sx = q1.x - q0.x, sy = q1.y - q0.y, tx = q2.x - q0.x, ty = q2.y - q0.y;
    const i00 = vy / det, i01 = -vx / det, i10 = -uy / det, i11 = ux / det;
    const a = sx * i00 + tx * i10, c = sx * i01 + tx * i11, b = sy * i00 + ty * i10, d = sy * i01 + ty * i11;
    const e = q0.x - (a * p0.x + c * p0.y), f = q0.y - (b * p0.x + d * p0.y);
    return [a, b, c, d, e, f].every(Number.isFinite) ? { a, b, c, d, e, f } : null;
  }

  return { init, Doc, PdfError, get ready() { return ready; } };
})();

if (typeof module !== 'undefined') module.exports = { PDF };
