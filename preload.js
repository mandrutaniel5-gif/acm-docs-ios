// ACM Docs for Windows: the only door between the app's page and the computer.
// The page runs isolated and sandboxed (contextIsolation + sandbox, no Node.js): it can use exactly
// these functions and nothing else. Even this script has no file access of its own: every file
// operation goes to the main process, which checks it (no program files written or opened, no
// writes into the system's start-up or the app's key folders).
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set(['gpu-info', 'startup-file', 'dialog-open', 'dialog-save', 'ocr-warm', 'ocr', 'show-in-folder', 'fetch-text', 'open-external',
  'open-path', 'special-dir', 'set-theme', 'html-to-pdf', 'capture', 'privacy', 'secure', 'fs-read', 'net-request']);
const EVENTS = new Set(['open-file', 'ocr-progress']);

/** A synchronous call into the main process; errors come back as errors. */
function host(op, ...args) {
  const r = ipcRenderer.sendSync('host', op, ...args);
  if (r && r.err) throw new Error(r.err);
  return r ? r.v : undefined;
}
const bytes = (v) => (v == null ? v : v instanceof Uint8Array ? v : new Uint8Array(v));

contextBridge.exposeInMainWorld('ElectronHost', {
  fs: {
    readFile: (p) => bytes(host('readFile', String(p))),
    readFileAsync: async (p) => bytes(await ipcRenderer.invoke('fs-read', String(p))),
    writeFile: (p, data) => host('writeFile', String(p), bytes(data)),
    isFile: (p) => host('isFile', String(p)),
    readdir: (d) => host('readdir', String(d)),
    mkdirp: (d) => host('mkdirp', String(d)),
    mtime: (p) => host('mtime', String(p)),
    remove: (p) => host('remove', String(p)),
  },
  path: {
    basename: (p) => host('basename', String(p)),
    dirname: (p) => host('dirname', String(p)),
    join: (...parts) => host('join', parts.map(String)),
  },
  /** a file shipped inside the app (e.g. pdfium.wasm), never outside its folder */
  appFile: (rel) => bytes(host('appFile', String(rel))),
  appVersion: () => host('appVersion'),
  /** where a file dropped on the window lives on disk */
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || null; } catch (e) { return null; } },
  listFonts: () => host('listFonts'),
  clipboard: {
    readText: () => host('clipRead'),
    writeText: (t) => host('clipWrite', String(t || '')),
    readImage: () => host('clipImage'),
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
