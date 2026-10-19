'use strict';
// ACM Docs (by ACM Code SRL) — Electron main process (Electron 22: the last version that runs on Windows 7).
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
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
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        spellcheck: false,
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
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('startup-file', () => {
  const f = pendingFile;
  pendingFile = null;
  return f;
});

const EXT = {
  pdf: ['pdf'], image: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'],
  word: ['docx', 'doc', 'txt', 'rtf'], sheet: ['xlsx', 'xls', 'xlsm', 'csv', 'ods'], slides: ['pptx', 'ppt'],
};
ipcMain.handle('dialog-open', async (_e, kind, lang) => {
  const en = lang === 'en';
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

ipcMain.handle('dialog-save', async (_e, suggestedName, defaultDir, ext, lang) => {
  ext = (ext || 'pdf').toLowerCase();
  const names = lang === 'en'
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
ipcMain.handle('ocr-warm', async () => { try { await require('./ocr').warm(); } catch (e) {} return true; });
ipcMain.handle('ocr', async (e, bytes, opts) => {
  const ocr = require('./ocr');
  return ocr.recognize(Buffer.from(bytes), (status, progress) => {
    if (!e.sender.isDestroyed()) e.sender.send('ocr-progress', status, progress);
  }, opts || null);
});

ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('fetch-text', (_e, url) => new Promise((resolve, reject) => {
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
ipcMain.handle('open-external', (_e, url) => { if (/^(mailto:|https?:)/i.test(String(url))) shell.openExternal(String(url)); });
ipcMain.handle('open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('special-dir', (_e, name) => app.getPath(name));
// Light / dark / like Windows (also colors the window frame on Windows 10/11).
ipcMain.handle('set-theme', (_e, pref) => { nativeTheme.themeSource = pref === 'dark' || pref === 'light' ? pref : 'system'; });

app.on('will-quit', () => {
  try { require('./ocr').shutdown(); } catch (e) {}
});


// Turns an HTML page (the invoice) into a PDF, invisibly.
ipcMain.handle('html-to-pdf', async (_e, html, opts) => {
  const m = (opts && opts.margins) || 0;
  const os = require('os');
  const tmp = path.join(os.tmpdir(), `acmdocs-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { javascript: false, offscreen: false } });
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
ipcMain.handle('capture', async (e, rect) => {
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
ipcMain.handle('privacy', (e, on) => {
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

ipcMain.handle('secure', async (e, op, args) => {
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

// Google sign-in in the system browser, back through a one-time local address (127.0.0.1).
// The page builds the sign-in URL with "{REDIRECT}" where the local address goes.
ipcMain.handle('oauth', (_e, args) => new Promise((resolve, reject) => {
  const http = require('http');
  const server = http.createServer((req, res) => {
    const port = server.address().port;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">Gata. Te poți întoarce în ACM Docs.</body>');
    server.close();
    clearTimeout(timer);
    resolve(`http://127.0.0.1:${port}${req.url}`);
  });
  const timer = setTimeout(() => { server.close(); reject(new Error('cancel')); }, 5 * 60 * 1000);
  server.listen(0, '127.0.0.1', () => {
    const redirect = `http://127.0.0.1:${server.address().port}`;
    shell.openExternal(String(args && args.url || '').replace(/\{REDIRECT\}/g, encodeURIComponent(redirect)));
  });
}));

// Google sign-in, step 2 (Windows): the one-time code for the ID token. Only Google's token address.
ipcMain.handle('google-token', (_e, body) => new Promise((resolve, reject) => {
  const data = Buffer.from(String(body || ''));
  const req = require('https').request({ host: 'oauth2.googleapis.com', path: '/token', method: 'POST', timeout: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } }, (res) => {
    let out = ''; res.setEncoding('utf8'); res.on('data', (c) => { out += c; }); res.on('end', () => resolve(out));
  });
  req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
  req.end(data);
}));
