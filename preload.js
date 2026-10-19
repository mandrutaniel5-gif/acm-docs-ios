// ACM Docs for Windows: the only door between the app's page and the computer.
// The page runs isolated (contextIsolation, no Node.js): it can use exactly these functions and
// nothing else — no shell commands, no arbitrary modules, only the app's own IPC channels.
'use strict';
const { contextBridge, ipcRenderer, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, 'app');
const INVOKE = new Set(['startup-file', 'dialog-open', 'dialog-save', 'ocr-warm', 'ocr', 'show-in-folder', 'fetch-text', 'open-external',
  'open-path', 'special-dir', 'set-theme', 'html-to-pdf', 'capture', 'privacy', 'secure']);
const EVENTS = new Set(['open-file', 'ocr-progress']);
const str = (p) => { if (typeof p !== 'string' || !p) throw new Error('bad path'); return p; };
const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));

/** Windows fonts from the registry (read-only, no shell): HKLM / HKCU …\Fonts */
function listFonts() {
  const out = [];
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const fontsDir = path.join(winDir, 'Fonts');
  const add = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) add(p, depth + 1);
      else if (/\.(ttf|otf|ttc)$/i.test(e.name)) {
        const base = e.name.replace(/\.(ttf|otf|ttc)$/i, '').replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        out.push({ name: base, path: p });
      }
    }
  };
  // the names Windows itself uses (HKLM / HKCU …\Fonts), read here, never by the page
  try {
    const cp = require('child_process');
    for (const hive of ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']) {
      try {
        const txt = cp.execFileSync('reg', ['query', hive], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        for (const line of txt.split(/\r?\n/)) {
          const parts = line.split(/\s+REG_(?:EXPAND_)?SZ\s+/);
          if (parts.length !== 2) continue;
          const name = parts[0].trim().replace(/\s*\(.*\)\s*$/, '');
          let file = parts[1].trim();
          if (!file.includes('\\')) file = path.join(fontsDir, file);
          for (const n of name.split('&')) if (n.trim()) out.push({ name: n.trim(), path: file });
        }
      } catch (e) { /* key missing */ }
    }
  } catch (e) {}
  if (out.length) return out;
  add(fontsDir, 0);
  const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts');
  if (local) add(local, 0);
  for (const d of ['/usr/share/fonts', '/usr/local/share/fonts']) add(d, 0);
  return out;
}

contextBridge.exposeInMainWorld('ElectronHost', {
  fs: {
    readFile: (p) => new Uint8Array(fs.readFileSync(str(p))),
    readFileAsync: async (p) => new Uint8Array(await fs.promises.readFile(str(p))),
    writeFile: (p, bytes) => {
      // next to the target first, then replace: a crash never leaves half a file
      const tmp = str(p) + '.tmp-acmdocs';
      fs.writeFileSync(tmp, u8(bytes));
      try { fs.renameSync(tmp, p); } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} fs.writeFileSync(p, u8(bytes)); }
    },
    isFile: (p) => { try { return fs.statSync(str(p)).isFile(); } catch (e) { return false; } },
    readdir: (d) => { try { return fs.readdirSync(str(d)); } catch (e) { return []; } },
    mkdirp: (d) => { try { fs.mkdirSync(str(d), { recursive: true }); return true; } catch (e) { return false; } },
    mtime: (p) => { try { return fs.statSync(str(p)).mtimeMs; } catch (e) { return 0; } },
    remove: (p) => { try { fs.unlinkSync(str(p)); return true; } catch (e) { return false; } },
  },
  path: {
    basename: (p) => path.basename(String(p)),
    dirname: (p) => path.dirname(String(p)),
    join: (...parts) => path.join(...parts.map(String)),
  },
  /** a file shipped inside the app (e.g. pdfium.wasm), never outside its folder */
  appFile: (rel) => {
    const p = path.normalize(path.join(APP_DIR, String(rel)));
    if (!p.startsWith(APP_DIR + path.sep)) throw new Error('outside the app');
    return new Uint8Array(fs.readFileSync(p));
  },
  appVersion: () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || ''; } catch (e) { return ''; } },
  listFonts,
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (t) => clipboard.writeText(String(t || '')),
    readImage: () => { const img = clipboard.readImage(); if (!img || img.isEmpty()) return null; const s = img.getSize(); return { url: img.toDataURL(), width: s.width, height: s.height }; },
  },
  invoke: (channel, ...args) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error('blocked: ' + channel));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, cb) => {
    if (!EVENTS.has(channel) || typeof cb !== 'function') return;
    ipcRenderer.on(channel, (_e, ...args) => cb(...args));
  },
});
