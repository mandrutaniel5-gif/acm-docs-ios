'use strict';
// ACM Docs (by ACM Code SRL) — Electron main process (current Electron, Windows 10/11 64-bit).
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;

// Only the app's own page — the main frame of the main window, loaded from the app's folder — may
// ask the main process for anything. Frames inside it (invoice previews) and other windows (the
// invisible PDF printer) are refused, whatever they send.
const APP_INDEX = require('path').join(__dirname, 'app', 'index.html').replace(/\\/g, '/').toLowerCase();
/** file:///C:/x/app/index.html → c:/x/app/index.html (and file:///home/x → /home/x) */
const urlPath = (u) => decodeURI(String(u || '')).split(/[?#]/)[0].replace(/^file:\/\//i, '').replace(/^\/([a-z]:)/i, '$1').toLowerCase();
function trusted(e) {
  try {
    if (!win || e.sender !== win.webContents) return false;
    const f = e.senderFrame;
    if (!f || f !== win.webContents.mainFrame) return false;
    return urlPath(f.url) === APP_INDEX;
  } catch (x) { return false; }
}
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!trusted(e)) throw new Error('blocked'); return fn(e, ...a); });
let pendingFile = null;

function fileFromArgs(argv) {
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue;
    const p = path.resolve(a);
    try {
      if (fs.statSync(p).isFile() && p !== process.execPath && !/\.(exe|asar)$/i.test(p) && !p.endsWith('main.js')) return p;
    } catch (e) {}
  }
  return null;
}

// Old laptops (Windows 7) often have video drivers that make Chromium show blank
// pages. Everything here is drawn by the PDF engine anyway, so the graphics card
// is not needed: plain software drawing always works.
app.disableHardwareAcceleration();
// Romanian dates and number formats everywhere (date picker: zi.lună.an).
app.commandLine.appendSwitch('lang', 'ro');
// The app was called "PDF Editor" before: keep its data folder so nothing is lost.
app.setPath('userData', process.env.ACM_USERDATA || path.join(app.getPath('appData'), 'PDF Editor'));

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileFromArgs(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send('open-file', f);
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    pendingFile = fileFromArgs(process.argv);
    win = new BrowserWindow({
      width: 1360,
      height: 880,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#F2F2F7',
      title: 'ACM Docs',
      icon: path.join(__dirname, 'app', 'icon.png'),
      show: false,
      webPreferences: {
        // the page never gets Node.js: it is isolated and talks to the computer only through
        // the few functions in preload.js
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true, // even the preload has no Node.js: files go through the checked handlers below
        preload: path.join(__dirname, 'preload.js'),
        webviewTag: false,
        spellcheck: false,
        devTools: !app.isPackaged, // the installed app has no developer console (it would bypass the app lock)
      },
    });
    win.once('ready-to-show', () => {
      win.maximize();
      win.show();
    });
    win.loadFile(path.join(__dirname, 'app', 'index.html'));
    // Never navigate away from the app; open web links in the browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    if (!app.isPackaged) {
      win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
      });
    }
    // only what the app uses: the camera (scanning) and the clipboard; nothing else is ever granted
    const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  });

  app.on('window-all-closed', () => app.quit());
}

handle('startup-file', () => {
  const f = pendingFile;
  pendingFile = null;
  return f;
});

const EXT = {
  pdf: ['pdf'], image: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'],
  word: ['docx', 'doc', 'txt', 'rtf'], sheet: ['xlsx', 'xls', 'xlsm', 'csv', 'ods'], slides: ['pptx', 'ppt'],
};
handle('dialog-open', async (_e, kind, lang) => {
  const en = !!lang && lang !== 'ro';
  const all = [...EXT.pdf, ...EXT.word, ...EXT.sheet, ...EXT.slides, ...EXT.image, 'acm'];
  const filters = kind === 'image' || kind === 'images'
    ? [{ name: en ? 'Images' : 'Imagini', extensions: EXT.image }]
    : [
        { name: en ? 'All documents' : 'Toate documentele', extensions: all },
        { name: 'PDF', extensions: EXT.pdf },
        { name: en ? 'Encrypted ACM Docs (.acm)' : 'Criptate ACM Docs (.acm)', extensions: ['acm'] },
        { name: en ? 'Word (documents)' : 'Word (documente)', extensions: EXT.word },
        { name: en ? 'Excel (spreadsheets)' : 'Excel (tabele)', extensions: EXT.sheet },
        { name: en ? 'PowerPoint (presentations)' : 'PowerPoint (prezentări)', extensions: EXT.slides },
        { name: en ? 'Images' : 'Imagini', extensions: EXT.image },
        { name: en ? 'All files' : 'Toate fișierele', extensions: ['*'] },
      ];
  const r = await dialog.showOpenDialog(win, { properties: kind === 'images' ? ['openFile', 'multiSelections'] : ['openFile'], filters });
  if (r.canceled || !r.filePaths.length) return null;
  return kind === 'images' ? r.filePaths : r.filePaths[0];
});

handle('dialog-save', async (_e, suggestedName, defaultDir, ext, lang) => {
  ext = (ext || 'pdf').toLowerCase();
  const names = lang && lang !== 'ro'
    ? { pdf: 'PDF documents', docx: 'Word document', xlsx: 'Excel workbook', pptx: 'PowerPoint presentation' }
    : { pdf: 'Documente PDF', docx: 'Document Word', xlsx: 'Registru Excel', pptx: 'Prezentare PowerPoint' };
  const r = await dialog.showSaveDialog(win, {
    defaultPath: defaultDir ? path.join(defaultDir, suggestedName) : suggestedName,
    filters: [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return null;
  return new RegExp('\\.' + ext + '$', 'i').test(r.filePath) ? r.filePath : r.filePath + '.' + ext;
});

// Reads the text inside pictures (offline). Loaded only when first used.
handle('ocr-warm', async () => { try { await require('./ocr').warm(); } catch (e) {} return true; });
handle('ocr', async (e, bytes, opts) => {
  const ocr = require('./ocr');
  return ocr.recognize(Buffer.from(bytes), (status, progress) => {
    if (!e.sender.isDestroyed()) e.sender.send('ocr-progress', status, progress);
  }, opts || null);
});

handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
handle('fetch-text', (_e, url) => new Promise((resolve, reject) => {
  if (!/^https:\/\/(www\.)?bnr\.ro\//.test(String(url))) { reject(new Error('blocked')); return; }
  const req = require('https').get(String(url), { timeout: 12000 }, (res) => {
    if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); res.resume(); return; }
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve(data));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
}));
handle('open-external', (_e, url) => { if (/^(mailto:|https?:)/i.test(String(url))) shell.openExternal(String(url)); });
// Opens a document in its own program (Word, Excel, a PDF reader…): never a program or a script.
handle('open-path', (_e, p) => {
  p = String(p || '');
  try { canon(p); } catch (e) { return 'blocked'; } // no device / UNC / alternate-data-stream paths
  let dir = false;
  try { dir = fs.statSync(p).isDirectory(); } catch (e) { return 'not found'; }
  if (!dir && !OPENABLE.test(effName(p))) return 'blocked';
  return shell.openPath(p);
});
handle('special-dir', (_e, name) => (name === 'private' ? path.join(app.getPath('userData'), 'private') : app.getPath(name)));
// Light / dark / like Windows (also colors the window frame on Windows 10/11).
handle('set-theme', (_e, pref) => { nativeTheme.themeSource = pref === 'dark' || pref === 'light' ? pref : 'system'; });

app.on('will-quit', () => {
  try { require('./ocr').shutdown(); } catch (e) {}
});


// ---------------------------------------------------------------- files, for the sandboxed page
// The page asks; these handlers decide. Reading is allowed (documents can be anywhere), except the
// app's key folder. Writing never creates programs or scripts and never touches the places Windows
// starts programs from, the app's own folder or its key folder.
const PROGRAM = /\.(exe|com|bat|cmd|ps1|psm1|psd1|ps1xml|vbs|vbe|js|jse|mjs|cjs|wsf|wsh|wsc|msi|msp|mst|msix|appx|scr|pif|lnk|url|hta|cpl|dll|sys|drv|ocx|reg|jar|appref-ms|application|settingcontent-ms|inf|scf|library-ms|search-ms|msc|gadget|xll|chm|iso|img|vhd|vhdx|sh|py|pyw|asar|node)$/i;
const OPENABLE = /\.(pdf|docx|doc|rtf|odt|txt|md|xlsx|xls|xlsm|csv|tsv|ods|pptx|ppt|odp|png|jpe?g|gif|bmp|webp|tiff?|heic|acm)$/i;
// Windows plays tricks with names: a trailing dot or space is dropped ("evil.bat." runs as
// "evil.bat"), a colon opens an alternate data stream ("ok.pdf:evil.bat"), and the \\?\, \\.\ and
// \\server\ prefixes reach the same files past a naive folder check. So every path from the page is
// canonicalized first, device and network paths are refused, and the type is checked on the real name.
const isWin = process.platform === 'win32';
function canon(p) {
  let s = String(p || '');
  if (isWin) {
    s = s.replace(/\//g, '\\');
    // device / long-path / UNC prefixes are not valid document paths
    if (/^\\\\[?.]\\/.test(s) || /^\\\\[^\\]/.test(s)) throw new Error('blocked path');
    // a colon only right after a single drive letter (C:) is legitimate; anywhere else = ADS
    if (/:/.test(s.replace(/^[A-Za-z]:/, ''))) throw new Error('blocked path');
    const r = path.win32.resolve(s);
    if (/^\\\\/.test(r)) throw new Error('blocked path'); // resolved to UNC
    return r;
  }
  return path.resolve(s);
}
/** The effective Windows file name: trailing dots and spaces on the last segment are ignored by the OS. */
const effName = (p) => (isWin ? path.win32.basename(canon(p)).replace(/[. ]+$/, '') : path.posix.basename(canon(p)));
const norm = (p) => { const r = canon(p); return isWin ? r.toLowerCase() : r; };
const under = (p, dir) => { const a = norm(p), b = norm(dir); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };
function noWrite() {
  const list = [path.join(app.getPath('userData'), 'secure'), path.dirname(process.execPath), process.resourcesPath, __dirname,
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu')];
  if (process.env.WINDIR) list.push(process.env.WINDIR);
  for (const k of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData']) if (process.env[k]) list.push(k === 'ProgramData' ? path.join(process.env[k], 'Microsoft', 'Windows', 'Start Menu') : process.env[k]);
  return list.filter(Boolean);
}
function checkRead(p) {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) throw new Error('bad path');
  canon(p); // refuses device / UNC / alternate-data-stream paths (throws)
  if (under(p, path.join(app.getPath('userData'), 'secure'))) throw new Error('blocked path');
  return p;
}
function checkWrite(p, isDir) {
  checkRead(p);
  if (!isDir && PROGRAM.test(effName(p).replace(/\.tmp-acmdocs$/i, ''))) throw new Error('blocked file type');
  if (noWrite().some((d) => under(p, d))) throw new Error('blocked path');
  return p;
}
let fontCache = null;
function listFonts() {
  if (fontCache) return fontCache;
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
  // the names Windows itself uses (HKLM / HKCU …\Fonts)
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
  if (!out.length) {
    add(fontsDir, 0);
    const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts');
    if (local) add(local, 0);
    for (const d of ['/usr/share/fonts', '/usr/local/share/fonts']) add(d, 0);
  }
  fontCache = out;
  return out;
}
const APP_DIR = path.join(__dirname, 'app');
const HOST = {
  readFile: (p) => fs.readFileSync(checkRead(p)),
  writeFile: (p, data) => {
    checkWrite(p);
    // next to the target first, then replace: a crash never leaves half a file
    const tmp = p + '.tmp-acmdocs';
    const buf = Buffer.from(data && data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data || []);
    fs.writeFileSync(tmp, buf);
    try { fs.renameSync(tmp, p); } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} fs.writeFileSync(p, buf); }
    return true;
  },
  isFile: (p) => { try { return fs.statSync(checkRead(p)).isFile(); } catch (e) { return false; } },
  readdir: (d) => { try { return fs.readdirSync(checkRead(d)); } catch (e) { return []; } },
  mkdirp: (d) => { try { fs.mkdirSync(checkWrite(d, true), { recursive: true }); return true; } catch (e) { return false; } },
  mtime: (p) => { try { return fs.statSync(checkRead(p)).mtimeMs; } catch (e) { return 0; } },
  remove: (p) => { try { checkWrite(p); fs.unlinkSync(p); return true; } catch (e) { return false; } },
  basename: (p) => path.basename(String(p)),
  dirname: (p) => path.dirname(String(p)),
  join: (parts) => path.join(...(Array.isArray(parts) ? parts : []).map(String)),
  appFile: (rel) => {
    const p = path.normalize(path.join(APP_DIR, String(rel)));
    if (!p.startsWith(APP_DIR + path.sep)) throw new Error('outside the app');
    return fs.readFileSync(p);
  },
  appVersion: () => app.getVersion(),
  listFonts,
  clipRead: () => clipboard.readText(),
  clipWrite: (t) => { clipboard.writeText(String(t || '')); return true; },
  clipImage: () => { const img = clipboard.readImage(); if (!img || img.isEmpty()) return null; const sz = img.getSize(); return { url: img.toDataURL(), width: sz.width, height: sz.height }; },
};
ipcMain.on('host', (e, op, ...args) => {
  if (!trusted(e)) { e.returnValue = { err: 'blocked' }; return; }
  const f = Object.prototype.hasOwnProperty.call(HOST, op) ? HOST[op] : null;
  if (!f) { e.returnValue = { err: 'unknown ' + op }; return; }
  try { e.returnValue = { v: f(...args) }; } catch (err) { e.returnValue = { err: err.message || String(err) }; }
});
handle('fs-read', async (_e, p) => fs.promises.readFile(checkRead(String(p))));

// Turns an HTML page (the invoice) into a PDF, invisibly.
handle('html-to-pdf', async (_e, html, opts) => {
  const m = (opts && opts.margins) || 0;
  const os = require('os');
  const tmp = path.join(os.tmpdir(), `acmdocs-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { javascript: false, sandbox: true, offscreen: false, devTools: false } });
  w.webContents.on('will-navigate', (ev) => ev.preventDefault());
  try {
    await w.loadFile(tmp);
    const pdf = await w.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
      margins: typeof m === 'object' ? { top: m.top || 0, bottom: m.bottom || 0, left: m.left || 0, right: m.right || 0 } : { top: m, bottom: m, left: m, right: m },
      landscape: !!(opts && opts.landscape),
    });
    return new Uint8Array(pdf);
  } finally {
    w.destroy();
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
});

// Picture of part of the window (thumbnails for the start screen).
handle('capture', async (e, rect) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return null;
  const img = await w.webContents.capturePage({ x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.max(1, Math.round(rect.w)), height: Math.max(1, Math.round(rect.h)) });
  if (img.isEmpty()) return null;
  return img.resize({ width: 220, quality: 'good' }).toJPEG(72).toString('base64');
});


// ---------------------------------------------------------------- account keys (Windows)
// Encrypted with the Windows user's key (DPAPI, via Electron safeStorage): another Windows
// account or another computer cannot read them. Kept in userData/secure/<name>.bin.
const secureDir = () => path.join(app.getPath('userData'), 'secure');
const secureFile = (name) => path.join(secureDir(), String(name).replace(/[^a-z0-9_.-]/gi, '_') + '.bin');
// sensitive screens (recovery words, a decrypted .acm): invisible to screenshots and screen sharing
handle('privacy', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setContentProtection(!!on);
  return true;
});
/** Windows Hello through the Windows Runtime (PowerShell). 'check' → Available | …; 'verify' → Verified | Canceled | … */
function windowsHello(mode, message) {
  if (process.platform !== 'win32') return Promise.resolve('NotSupported');
  const msg = String(message || '').replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
    'function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }',
    '[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null',
    mode === 'check'
      ? '$r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])'
      : `$r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${msg}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])`,
    'Write-Output $r',
  ].join('; ');
  return new Promise((resolve) => {
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: mode === 'check' ? 15000 : 120000 }, (err, out) => resolve(err ? 'Error' : String(out || '').trim()));
  });
}

handle('secure', async (e, op, args) => {
  const { safeStorage } = require('electron');
  const a = args || {};
  if (op === 'set') {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptarea Windows nu este disponibilă pe acest calculator.');
    fs.mkdirSync(secureDir(), { recursive: true });
    fs.writeFileSync(secureFile(a.name), safeStorage.encryptString(String(a.data)));
    return true;
  }
  if (op === 'get') {
    const f = secureFile(a.name);
    if (!fs.existsSync(f)) return null;
    return safeStorage.decryptString(fs.readFileSync(f));
  }
  if (op === 'has') return fs.existsSync(secureFile(a.name));
  if (op === 'delete') { try { fs.unlinkSync(secureFile(a.name)); } catch (err) {} return true; }
  if (op === 'hello') return (await windowsHello('check')) === 'Available';
  if (op === 'confirm') {
    // Windows Hello (face, fingerprint or PIN) when the PC has it; otherwise a plain confirmation
    const r = await windowsHello('verify', String(a.reason || 'Confirmă că ești tu'));
    if (r === 'Verified') return true;
    if (r === 'Canceled' || r === 'RetriesExhausted') return false;
    const win = BrowserWindow.fromWebContents(e.sender);
    const d = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Anulează', 'Confirm'], defaultId: 0, cancelId: 0, message: String(a.reason || 'Confirmă că ești tu') });
    return d.response === 1;
  }
  throw new Error('secure ' + op);
});

