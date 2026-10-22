// ACM Docs Control: a dedicated window for the administration panel, and nothing else.
//  - opens only the panel's own address; any other page, link or popup is refused
//  - no Node.js in the page, sandboxed, context isolation, no developer tools
//  - everything lives in memory: closing the window ends the session, nothing is written to disk
//  - camera, microphone, location, notifications and other permissions are refused
// Sign-in, the authenticator code and every check stay on the server: this app adds no access.
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');

// (a local test address is accepted only when running from the source, never in the installed app)
const DEV = !app.isPackaged && process.env.ACM_CONTROL_URL;
const PANEL = DEV || 'https://acm-docs-52280.web.app/control';
const HOSTS = new Set([
  'acm-docs-52280.web.app', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'www.googleapis.com', 'europe-west1-acm-docs-52280.cloudfunctions.net',
]);
const allowedPage = (u) => { try { const x = new URL(u); if (DEV && u.startsWith(DEV)) return true; return x.protocol === 'https:' && x.host === 'acm-docs-52280.web.app' && /^\/control(\/|$)/.test(x.pathname); } catch (e) { return false; } };

app.commandLine.appendSwitch('disable-features', 'Autofill,AutofillServerCommunication,Translate,SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('disable-background-networking');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function create() {
  // in-memory session (no "persist:" prefix): no cookies, cache or storage on disk
  const ses = session.fromPartition('acm-control', { cache: false });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.webRequest.onBeforeRequest((d, cb) => {
    try {
      const u = new URL(d.url);
      if (u.protocol === 'file:' && d.url.endsWith('/offline.html')) return cb({});
      if (u.protocol === 'devtools:') return cb({ cancel: true });
      if (DEV && d.url.startsWith(new URL(DEV).origin)) return cb({});
      cb({ cancel: !(u.protocol === 'https:' && HOSTS.has(u.host)) });
    } catch (e) { cb({ cancel: true }); }
  });
  ses.setCertificateVerifyProc((req, cb) => cb(req.errorCode === 0 ? 0 : -2)); // only valid certificates
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 560, title: 'ACM Docs Control', backgroundColor: '#f4f5f7',
    autoHideMenuBar: true, show: false, icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
      devTools: false, spellcheck: false, navigateOnDragDrop: false, safeDialogs: true, enableWebSQL: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    // the panel opens no windows; an outside https link (e.g. Stripe) goes to the browser
    if (/^https:\/\/(dashboard\.)?stripe\.com\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!allowedPage(url) && !url.startsWith('file:')) e.preventDefault(); });
  win.webContents.on('will-redirect', (e, url) => { if (!allowedPage(url)) e.preventDefault(); });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.webContents.on('before-input-event', (e, input) => {
    // F5 / Ctrl+R: reload the panel (it signs out); nothing else (no dev tools shortcuts)
    if (input.type === 'keyDown' && (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r'))) { e.preventDefault(); win.loadURL(PANEL); }
  });
  win.webContents.on('ipc-message', () => {});
  win.loadURL(PANEL);
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
});
app.whenReady().then(() => { Menu.setApplicationMenu(null); create(); });
app.on('window-all-closed', () => app.quit());
