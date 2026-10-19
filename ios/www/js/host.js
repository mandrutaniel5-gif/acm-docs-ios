'use strict';
// Bridge to the device: files, dialogs, fonts, PDF printing.
// Two shells run the same app:
//   - Windows: Electron (Node available in this window, the app only shows its own pages)
//   - Android: a WebView with a small Java bridge (window.AndroidBridge)

const Host = (() => {
  // Windows: the page is isolated from Node.js; it talks to the computer only through the small
  // ElectronHost bridge (preload.js). Phones: window.AndroidBridge (Android) / its iOS twin.
  const EH = typeof window !== 'undefined' ? window.ElectronHost : null;
  const AB = typeof window !== 'undefined' ? window.AndroidBridge : null;
  const platform = AB ? 'android' : EH ? 'electron' : 'web';
  const fs = EH ? EH.fs : null;
  const pathMod = EH ? EH.path : null;
  const ipc = EH ? { invoke: (...a) => EH.invoke(...a), on: (ch, cb) => EH.on(ch, (...args) => cb(null, ...args)) } : null;

  // ---------------------------------------------------------------- base64
  function toB64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64 || '');
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // ---------------------------------------------------------------- Android async calls
  let seq = 0;
  const pending = new Map();
  if (AB) {
    window.__bridgeCb = (id, err, result) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (err) p.reject(new Error(err));
      else p.resolve(result);
    };
  }
  function call(op, args) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      try {
        AB.request(id, op, JSON.stringify(args || {}));
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  }
  const info = AB ? JSON.parse(AB.info()) : {};

  // ---------------------------------------------------------------- paths
  function baseName(p) {
    return pathMod ? pathMod.basename(p) : String(p).split(/[\\/]/).pop();
  }
  function dirName(p) {
    if (pathMod) return pathMod.dirname(p);
    const s = String(p);
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return i > 0 ? s.slice(0, i) : '/';
  }
  function join(...parts) {
    if (pathMod) return pathMod.join(...parts);
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  }
  function ext(p) { const m = /\.([^.\\/]+)$/.exec(p || ''); return m ? m[1].toLowerCase() : ''; }

  // ---------------------------------------------------------------- files
  function readFile(p) {
    if (AB) return fromB64(String(p).startsWith('asset:') ? AB.readAsset(String(p).slice(6)) : AB.readB64(p));
    return fs.readFile(p);
  }

  /** Same as readFile, without freezing the screen (the phone streams the file instead of copying it as text). */
  async function readFileAsync(p) {
    if (AB && !String(p).startsWith('asset:')) {
      try {
        const r = await fetch('/~file' + encodeURI(String(p)).replace(/#/g, '%23').replace(/\?/g, '%3F'));
        if (r.ok) return new Uint8Array(await r.arrayBuffer());
      } catch (e) { /* older app: read it the slow way */ }
      return readFile(p);
    }
    if (!AB && fs) return fs.readFileAsync(p);
    return readFile(p);
  }

  function writeFile(p, bytes) {
    if (AB) {
      if (!AB.writeB64(p, toB64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)))) throw new Error('Nu pot scrie fișierul ' + baseName(p));
      return;
    }
    fs.writeFile(p, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); // atomic (preload)
  }

  function exists(p) {
    if (!p) return false;
    if (AB) return AB.isFile(p);
    return fs.isFile(p);
  }
  function listDir(d) {
    if (AB) { try { return JSON.parse(AB.listDir(d)); } catch (e) { return []; } }
    return fs.readdir(d);
  }
  function mkdirp(d) {
    if (AB) return AB.mkdirs(d);
    return fs.mkdirp(d);
  }
  function mtime(p) {
    if (AB) return AB.mtime(p);
    return fs.mtime(p);
  }
  function remove(p) {
    if (AB) return AB.remove(p);
    return fs.remove(p);
  }

  // ---------------------------------------------------------------- dialogs
  const MIMES = {
    pdf: ['application/pdf', 'image/*', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'text/plain', 'application/rtf', 'application/x-acm', 'application/octet-stream'],
    image: ['image/*'],
    word: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/rtf'],
    sheet: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', 'application/vnd.oasis.opendocument.spreadsheet'],
    slides: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  };

  async function openDialog(kind) {
    if (AB) return (await call('open', { mimes: MIMES[kind] || MIMES.pdf, kind })) || null;
    if (!ipc) return null;
    return ipc.invoke('dialog-open', kind, typeof I18n !== 'undefined' ? I18n.lang : 'ro');
  }

  /** Photos chosen from the gallery / disk (several at once). Returns a list of paths (maybe empty). */
  async function pickImages() {
    if (AB) {
      try {
        const r = await call('images', {});
        return r ? JSON.parse(r) : [];
      } catch (e) {
        if (/op images/.test(String(e && e.message))) { const one = await openDialog('image'); return one ? [one] : []; } // older app
        throw e;
      }
    }
    if (!ipc) return [];
    const r = await ipc.invoke('dialog-open', 'images', typeof I18n !== 'undefined' ? I18n.lang : 'ro');
    return Array.isArray(r) ? r : r ? [r] : [];
  }

  /** Photo from the camera (Android) — returns a file path or null. */
  async function camera() {
    if (AB) return (await call('camera', {})) || null;
    return openDialog('image');
  }

  async function saveDialog(suggestedName, defaultDir, ext) {
    if (AB) {
      // No file dialogs on the phone: files live in the app's document folder.
      return join(defaultDir || info.docs, suggestedName);
    }
    if (!ipc) return null;
    return ipc.invoke('dialog-save', suggestedName, defaultDir, ext || 'pdf', typeof I18n !== 'undefined' ? I18n.lang : 'ro');
  }

  async function startupFile() {
    if (AB) return (await call('startup', {})) || null;
    if (!ipc) return null;
    return ipc.invoke('startup-file');
  }

  function onOpenFile(cb) {
    if (AB) window.__onOpenFile = (p) => cb(p);
    else if (ipc) ipc.on('open-file', (_e, p) => cb(p));
  }

  function setTitle(t) {
    document.title = t;
  }

  async function wasmBytes() {
    if (AB || platform === 'web') {
      const r = await fetch('pdfium/pdfium.wasm');
      return new Uint8Array(await r.arrayBuffer());
    }
    return EH.appFile('pdfium/pdfium.wasm');
  }

  // ---------------------------------------------------------------- fonts
  function listFonts() {
    if (AB) {
      try { return JSON.parse(AB.fonts()); } catch (e) { return []; }
    }
    return EH ? EH.listFonts() : [];
  }

  // ---------------------------------------------------------------- OCR
  let ocrProgress = null;
  if (ipc) ipc.on('ocr-progress', (_e, status, p) => { if (ocrProgress) ocrProgress(status, p); });
  let webWorker = null;
  function webOcrWorker() {
    if (!webWorker) {
      webWorker = (async () => {
        await Lib.script('vendor/tesseract/tesseract.min.js');
        const base = new URL('vendor/tesseract/', location.href).href;
        const w = await window.Tesseract.createWorker('ron', 1, {
          workerPath: base + 'worker.min.js',
          corePath: base,
          langPath: new URL('ocr/', location.href).href,
          cacheMethod: 'none',
          gzip: true,
          workerBlobURL: false,
          logger: (m) => { if (ocrProgress && m && typeof m.progress === 'number') ocrProgress(m.status, m.progress); },
        });
        await w.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
        return w;
      })().catch((e) => { webWorker = null; throw e; });
    }
    return webWorker;
  }
  const bb = (b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
  /** Starts the text reader early (it takes a few seconds to wake up the first time). */
  function ocrWarm() {
    try {
      if (ipc) ipc.invoke('ocr-warm').catch(() => {});
      else webOcrWorker().catch(() => {});
    } catch (e) {}
  }
  async function ocr(bytes, onProgress, opts) {
    ocrProgress = onProgress || null;
    try {
      if (ipc) return await ipc.invoke('ocr', bytes, opts || null);
      const w = await webOcrWorker();
      await w.setParameters({ tessedit_pageseg_mode: opts && opts.page ? '3' : opts && opts.line ? '7' : '6' });
      const { data } = await w.recognize(new Blob([bytes], { type: 'image/png' }), {}, { blocks: true, text: false, hocr: false, tsv: false });
      const paragraphs = [];
      for (const block of data.blocks || []) {
        for (const par of block.paragraphs || []) {
          const lines = [];
          for (const line of par.lines || []) {
            const words = (line.words || []).map((wd) => ({ text: wd.text, conf: wd.confidence, bbox: bb(wd.bbox) }));
            if (!words.length) continue;
            lines.push({
              text: line.text.replace(/\s+$/, ''), conf: line.confidence, bbox: bb(line.bbox),
              baseline: line.baseline ? bb(line.baseline) : null,
              rowHeight: line.rowAttributes ? line.rowAttributes.row_height : null, words,
            });
          }
          if (lines.length) paragraphs.push({ bbox: bb(par.bbox), lines });
        }
      }
      return { paragraphs };
    } finally {
      ocrProgress = null;
    }
  }

  // ---------------------------------------------------------------- PDF from HTML, screenshots
  /** Paper size and margins (thousandths of an inch) from the page's @page rule and [opts]. */
  function pageSetup(html, opts) {
    const rule = (/@page\s*\{([^}]*)\}/i.exec(html) || [])[1] || '';
    const inch = (v) => {
      const m = /^(-?[\d.]+)\s*(px|mm|cm|in|pt)?$/i.exec(String(v).trim());
      if (!m) return 0;
      const n = parseFloat(m[1]);
      return { px: n / 96, mm: n / 25.4, cm: n / 2.54, in: n, pt: n / 72 }[(m[2] || 'px').toLowerCase()];
    };
    let w = 8.2677, h = 11.6929; // A4
    const size = (/size\s*:\s*([^;]+)/i.exec(rule) || [])[1] || '';
    const parts = size.trim().split(/\s+/);
    if (parts.length >= 2 && /\d/.test(parts[0]) && /\d/.test(parts[1])) { w = inch(parts[0]) || w; h = inch(parts[1]) || h; }
    if (/landscape/i.test(size) || (opts && opts.landscape)) { if (w < h) [w, h] = [h, w]; }
    let mg = [0, 0, 0, 0]; // top right bottom left
    const mcss = (/margin\s*:\s*([^;]+)/i.exec(rule) || [])[1];
    if (mcss) {
      const v = mcss.trim().split(/\s+/).map(inch);
      mg = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v.slice(0, 4);
    }
    const om = opts && opts.margins;
    if (om && typeof om === 'object') mg = [om.top || 0, om.right || 0, om.bottom || 0, om.left || 0];
    else if (typeof om === 'number' && om > 0) mg = [om, om, om, om];
    const mils = (x) => Math.max(0, Math.round(x * 1000));
    return { width: mils(w), height: mils(h), top: mils(mg[0]), right: mils(mg[1]), bottom: mils(mg[2]), left: mils(mg[3]) };
  }

  async function htmlToPdf(html, opts) {
    if (AB || platform === 'web') {
      const setup = pageSetup(html, opts);
      // 1) Android's own printing (sharp, selectable text) — unless it already failed on this phone
      let native = true;
      try { native = localStorage.getItem('acm.print') !== 'image'; } catch (e) {}
      if (AB && native) {
        let timer;
        const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('NATIVE_TIMEOUT')), 15000); });
        try {
          return fromB64(await Promise.race([call('pdf', { html, ...setup }), limit]));
        } catch (e) {
          console.warn('native pdf failed', e && e.message);
          try { localStorage.setItem('acm.print', 'image'); } catch (x) {}
        } finally { clearTimeout(timer); }
      }
      // 2) Draw the page ourselves and put it in a PDF (works on every phone)
      return rasterPdf(html, setup);
    }
    if (!ipc) throw new Error('Crearea PDF-ului nu este disponibilă.');
    return new Uint8Array(await ipc.invoke('html-to-pdf', html, opts || null));
  }

  // ---------------------------------------------------------------- PDF made by drawing the page (phone fallback)
  // Text uses the phone's own fonts both when measuring (iframe) and when drawing, so pages break the same way.
  function loadFrame(html, widthPx) {
    return new Promise((resolve) => {
      const fr = document.createElement('iframe');
      fr.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:600px;border:0;visibility:hidden`;
      fr.onload = () => setTimeout(() => resolve(fr), 60);
      fr.srcdoc = html;
      document.body.append(fr);
    });
  }
  // Where each page ends: never through the middle of a line of text, a table row or a picture.
  function pageCuts(d, total, ch) {
    const boxes = [];
    const w = d.createTreeWalker(d.body || d.documentElement, NodeFilter.SHOW_TEXT);
    const r = d.createRange();
    for (let n = w.nextNode(); n && boxes.length < 20000; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.height > 0) boxes.push([b.top, b.bottom]);
    }
    for (const e of d.querySelectorAll('img, svg, canvas, tr, .avoid')) {
      const b = e.getBoundingClientRect();
      if (b.height > 0 && b.height < ch * 0.8) boxes.push([b.top, b.bottom]);
    }
    const cuts = [0];
    let y = 0;
    while (y + ch < total - 2 && cuts.length < 31) {
      let cut = y + ch;
      for (let again = true, guard = 0; again && guard < 50; guard++) {
        again = false;
        for (const [t, b] of boxes) if (t < cut - 0.5 && b > cut + 0.5 && t > y + ch * 0.25) { cut = Math.floor(t); again = true; }
      }
      cuts.push(cut);
      y = cut;
    }
    cuts.push(Math.min(total, y + ch));
    return cuts;
  }
  async function rasterPdf(html, setup) {
    const dpi = 200, k = dpi / 96;
    const px = (mils) => (mils / 1000) * 96;
    const pageW = px(setup.width), pageH = px(setup.height);
    const ml = px(setup.left), mt = px(setup.top), mr = px(setup.right), mb = px(setup.bottom);
    const cw = Math.round(pageW - ml - mr), ch = Math.round(pageH - mt - mb);
    const fr = await loadFrame(html, cw);
    try {
      const d = fr.contentDocument;
      const total = Math.max(ch, d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0);
      const cuts = pageCuts(d, total, ch);
      let css = [...d.querySelectorAll('style')].map((st) => st.textContent).join('\n');
      css = css.replace(/@page\s*\{[^}]*\}/g, '').replace(/(^|[\s,{}])html(?=[\s,{.:#\[])/g, '$1.__root').replace(/(^|[\s,{}])body(?=[\s,{.:#\[])/g, '$1.__body');
      const bodyAttr = d.body ? d.body.getAttribute('style') || '' : '';
      const inner = d.body ? d.body.innerHTML : '';
      const wrap = document.implementation.createHTMLDocument('');
      const root = wrap.createElement('div');
      root.setAttribute('class', '__root');
      root.innerHTML = `<style>${css}</style><div class="__body" style="${bodyAttr.replace(/"/g, '&quot;')}">${inner}</div>`;
      let xhtml = new XMLSerializer().serializeToString(root);
      if (!/^<div[^>]*xmlns=/.test(xhtml)) xhtml = xhtml.replace('<div ', '<div xmlns="http://www.w3.org/1999/xhtml" ');
      const out = [];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const y0 = cuts[i], hh = Math.max(1, cuts[i + 1] - y0);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(cw * k)}" height="${Math.round(hh * k)}" viewBox="0 ${y0} ${cw} ${hh}"><foreignObject x="0" y="0" width="${cw}" height="${total}">${xhtml}</foreignObject></svg>`;
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const c = document.createElement('canvas');
        c.width = Math.round(pageW * k); c.height = Math.round(pageH * k);
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, Math.round(ml * k), Math.round(mt * k), Math.round(cw * k), Math.round(hh * k));
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
        out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), ptW: (setup.width / 1000) * 72, ptH: (setup.height / 1000) * 72 });
        c.width = c.height = 1;
      }
      const doc = PDF.Doc.fromJpegs(out);
      try { return doc.save(); } finally { doc.close(); }
    } finally {
      fr.remove();
    }
  }

  async function capture(rect) {
    if (AB) {
      try {
        const b64 = await call('capture', { x: rect.x, y: rect.y, w: rect.w || rect.width, h: rect.h || rect.height });
        return b64 ? 'data:image/jpeg;base64,' + b64 : null;
      } catch (e) { return null; }
    }
    if (!ipc) return null;
    const b64 = await ipc.invoke('capture', rect);
    return b64 ? 'data:image/jpeg;base64,' + b64 : null;
  }

  // ---------------------------------------------------------------- outside the app
  function showInFolder(p) {
    if (AB) { share(p); return; }
    if (ipc) ipc.invoke('show-in-folder', p);
  }
  function openPath(p) {
    if (AB) { call('view', { path: p }).catch((e) => UI.toast(e.message, { error: true })); return; }
    if (ipc) ipc.invoke('open-path', p);
  }
  /** Send a file to another app (WhatsApp, e-mail, Drive…). */
  function share(p, text) {
    if (AB) return call('share', { path: p, text: text || '' }).catch((e) => UI.toast(e.message, { error: true }));
    showInFolder(p);
    return Promise.resolve();
  }
  /** Copy a file to a place the user picks (Downloads, Drive…). Android only. */
  function exportCopy(p) {
    if (AB) return call('export', { path: p }).then((ok) => { if (ok) UI.toast('Copia a fost salvată.'); }).catch((e) => UI.toast(e.message, { error: true }));
    return Promise.resolve();
  }
  async function specialDir(name) {
    if (AB) return name === 'private' && info.priv ? info.priv : info.docs;
    return ipc ? ipc.invoke('special-dir', name) : null;
  }
  function setTheme(dark, bar, pref) {
    if (AB) { try { AB.setTheme(!!dark, bar || ''); } catch (e) {} }
    else if (ipc) ipc.invoke('set-theme', pref || 'auto').catch(() => {});
  }
  /** Text from the internet (only a few trusted addresses, e.g. the BNR exchange rate). */
  async function fetchText(url) {
    if (AB) return call('fetch', { url });
    if (ipc) return ipc.invoke('fetch-text', url);
    const r = await fetch(url);
    return r.text();
  }
  /** E-mail (mailto:) or a web page, in the user's own app. */
  function openExternal(url) {
    if (!/^(mailto:|https?:)/i.test(url)) return;
    if (AB) { call('external', { url }).catch((e) => UI.toast(e.message, { error: true })); return; }
    if (ipc) ipc.invoke('open-external', url);
    else window.open(url, '_blank');
  }
  function exitApp() { if (AB) AB.exit(); else window.close(); }
  function appVersion() {
    if (AB) return info.version || '';
    try {
      return EH ? EH.appVersion() : '';
    } catch (e) { return ''; }
  }

  // ---------------------------------------------------------------- secure storage
  // Account keys and the 24 recovery words. iPhone: Keychain, opened only with Face ID / Touch ID
  // (or the phone's code); Android: Keystore + the phone's lock; Windows: encrypted for the Windows user.
  const SECURE_WEB = 'acm.secure.'; // browser preview only (not secure, never used by the apps)
  async function secureSet(name, bytes, opts) {
    const data = toB64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (AB) { await call('secureSet', { name, data, quiet: !!(opts && opts.quiet) }); return true; }
    if (ipc) return ipc.invoke('secure', 'set', { name, data });
    localStorage.setItem(SECURE_WEB + name, data); return true;
  }
  /** null = nothing saved; throws Error('cancel') when the person cancels Face ID. */
  async function secureGet(name, reason, opts) {
    let r = null;
    if (AB) r = await call('secureGet', { name, reason: reason || '', quiet: !!(opts && opts.quiet) });
    else if (ipc) r = await ipc.invoke('secure', 'get', { name, reason });
    else r = localStorage.getItem(SECURE_WEB + name);
    return r ? fromB64(r) : null;
  }
  async function secureHas(name) {
    if (AB) return (await call('secureHas', { name, quiet: !!(arguments[1] && arguments[1].quiet) })) === 'true';
    if (ipc) return !!(await ipc.invoke('secure', 'has', { name }));
    return localStorage.getItem(SECURE_WEB + name) != null;
  }
  async function secureDelete(name) {
    if (AB) { await call('secureDelete', { name, quiet: !!(arguments[1] && arguments[1].quiet) }); return true; }
    if (ipc) return ipc.invoke('secure', 'delete', { name });
    localStorage.removeItem(SECURE_WEB + name); return true;
  }
  /** Face ID / fingerprint / phone code before something important (delete the account…). */
  async function confirmOwner(reason) {
    if (AB) { try { return (await call('confirmOwner', { reason: reason || '' })) === 'true'; } catch (e) { return false; } }
    if (ipc) return !!(await ipc.invoke('secure', 'confirm', { reason }));
    return true;
  }
  /** Can this device confirm the owner with biometrics / Windows Hello / the phone's lock? */
  async function biometricsAvailable() {
    if (AB) return true; // Face ID / Touch ID / fingerprint or the phone's code
    if (ipc) { try { return !!(await ipc.invoke('secure', 'hello', {})); } catch (e) { return false; } }
    return false;
  }

  /** Live QR scanner of the phone (iOS); null = cancelled, undefined = not available here */
  async function scanQR(title) {
    if (AB && info.platform === 'ios') return (await call('scanqr', { title: title || '' })) || null;
    return undefined;
  }

  /** Sensitive content on screen: block screenshots / recording where the system allows it. */
  async function privacy(on) {
    try {
      if (AB) await call('privacy', { on: !!on });
      else if (ipc) await ipc.invoke('privacy', !!on);
    } catch (e) { /* older app */ }
  }
  /** Signs of a jailbroken / rooted device: { risk, signs[] } */
  async function integrity() {
    try { if (AB) return JSON.parse(await call('integrity', {})); } catch (e) {}
    return { risk: false, signs: [] };
  }

  const available = platform !== 'web';
  const mobile = platform === 'android';

  return {
    platform, mobile, available, info, readFile, readFileAsync, writeFile, exists, baseName, dirName, openDialog, pickImages, camera, saveDialog, startupFile, onOpenFile, setTitle, wasmBytes, listFonts,
    ocr, ocrWarm, htmlToPdf, capture, ext, showInFolder, openPath, openExternal, fetchText, share, exportCopy, specialDir, listDir, mkdirp, join, mtime, remove, setTheme, exitApp, appVersion, toB64, fromB64,
    secureSet, secureGet, secureHas, secureDelete, confirmOwner, scanQR, privacy, integrity, biometricsAvailable,
  };
})();

/** Third-party libraries: Node modules on Windows, pre-built bundles on the phone. */
const Lib = (() => {
  const nodeRequire = null; // no Node.js in the page anywhere: every platform loads the same bundles
  const BUNDLE = { jszip: 'zip', 'docx-preview': 'docx', docx: 'docx', 'word-extractor': 'docx', 'xlsx-js-style': 'xlsx', pptxgenjs: 'pptx' };
  const scripts = new Map();
  function script(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { scripts.delete(src); reject(new Error('Nu am putut încărca ' + src)); };
        document.head.append(s);
      }));
    }
    return scripts.get(src);
  }
  /** Makes sure the libraries are ready (no-op on Windows). */
  async function load(...names) {
    if (nodeRequire) return;
    for (const n of names) await script('vendor/' + BUNDLE[n] + '.js');
  }
  function get(name) {
    if (nodeRequire) return nodeRequire(name);
    const v = window.__lib && window.__lib[name];
    if (!v) throw new Error('Componenta „' + name + '” nu este încărcată.');
    return v;
  }
  // Clipboard: Electron's when there, otherwise the browser's (kept in memory as backup).
  let memText = '';
  const clipboard = {
    writeText(t) {
      memText = String(t || '');
      if (window.ElectronHost) { try { window.ElectronHost.clipboard.writeText(memText); return; } catch (e) {} }
      try { navigator.clipboard.writeText(memText).catch(() => {}); } catch (e) {}
    },
    readText() {
      if (window.ElectronHost) { try { return window.ElectronHost.clipboard.readText(); } catch (e) {} }
      return memText;
    },
    async readTextAsync() {
      if (window.ElectronHost) return clipboard.readText();
      try { return (await navigator.clipboard.readText()) || memText; } catch (e) { return memText; }
    },
  };
  return { load, get, script, clipboard };
})();

SystemFonts.provider = {
  list: () => Host.listFonts(),
  read: (p) => Host.readFile(p),
};
