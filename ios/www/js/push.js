'use strict';
// Notifications of new chat messages.
//  - phones: the device's push address (Android: Firebase, iPhone: Apple) is kept on this device's record of the
//    account, so the server can say "a new message from <name>" even when the app is closed;
//  - Windows (and a phone while the app is open in the background): the app itself shows the notification.
const Push = (() => {
  const LS = 'acm.push.sent';
  let started = false;

  /** The device's push address from the phone app, or null (Windows, an older app, notifications refused). */
  async function nativeToken() {
    if (!window.AndroidBridge || !window.AndroidBridge.request) return null;
    try {
      const r = await Host.call('pushToken', { ask: true });
      const o = typeof r === 'string' ? JSON.parse(r) : r;
      return o && o.token ? o : null;
    } catch (e) { return null; }
  }

  /** Writes the address on this device's record (only when it changed). */
  async function register() {
    const u = Account.current && Account.current();
    const dev = typeof Devices !== 'undefined' && Devices.myDevice();
    if (!u || !dev) return;
    const t = await nativeToken();
    if (!t) return;
    const push = { kind: t.kind, token: t.token, lang: I18n.lang || 'ro', ...(t.env ? { env: t.env } : {}) };
    const key = JSON.stringify([u.uid, dev, push]);
    try { if (localStorage.getItem(LS) === key) return; } catch (e) {}
    try {
      const { F: f, db } = Account.internals();
      await f.firestore.updateDoc(f.firestore.doc(db, 'accounts', u.uid, 'devices', dev), { push });
      try { localStorage.setItem(LS, key); } catch (e) {}
    } catch (e) { console.warn('push register', e && (e.code || e.message)); }
  }

  // ---------------------------------------------------------------- shown by the app itself
  let asked = false;
  function canShow() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'default' && !asked) { asked = true; Notification.requestPermission().catch(() => {}); }
    return false;
  }
  /** A new message while the window is not looked at. */
  function show(title, body, onClick) {
    // phones with a push address get the system's notification from the server
    if (window.AndroidBridge || (document.hasFocus() && !document.hidden) || !canShow()) return;
    try {
      const n = new Notification(title, { body, icon: 'icon.png', silent: false });
      n.onclick = () => {
        try { if (window.ElectronHost) window.ElectronHost.invoke('focus-window'); else window.focus(); } catch (e) {}
        try { onClick && onClick(); } catch (e) {}
        n.close();
      };
    } catch (e) { console.warn('notification', e); }
  }

  // a notification was tapped (phones): its conversation opens
  window.__onPushOpen = (cid) => { try { if (typeof Chat !== 'undefined') { Chat.show(); setTimeout(() => Chat.openChat(cid), 700); } } catch (e) {} };

  function start() {
    if (started) return;
    started = true;
    const go = () => register().catch(() => {});
    setTimeout(go, 5000);
    if (typeof Account !== 'undefined' && Account.onChange) Account.onChange(() => setTimeout(go, 3000));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  }
  document.addEventListener('DOMContentLoaded', start);
  return { register, show };
})();
