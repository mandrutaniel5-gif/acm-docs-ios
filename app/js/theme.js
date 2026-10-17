'use strict';
// Light / dark look. Runs before the page is drawn so it never flashes.
// Setting: 'light' (default), 'dark', 'auto' (follows the phone / Windows).
// On the phone: look-alike fonts for documents made on Windows.
if (window.AndroidBridge) document.write('<link rel="stylesheet" href="css/fonts-android.css">');

const Theme = (() => {
  const KEY = 'acm.theme';
  // Light until the user picks something else (it looks best).
  let pref = 'light';
  try { pref = localStorage.getItem(KEY) || 'light'; } catch (e) {}
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const listeners = [];

  function isDark() {
    return pref === 'dark' || (pref === 'auto' && !!(mq && mq.matches));
  }
  function apply() {
    const dark = isDark();
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.pref = pref;
    if (typeof Host !== 'undefined') Host.setTheme(dark, dark ? '#000000' : '#f2f2f7', pref);
    for (const f of listeners) { try { f(dark); } catch (e) {} }
  }
  function set(p) {
    pref = ['light', 'dark'].includes(p) ? p : 'auto';
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply();
  }
  if (mq) {
    const onSys = () => { if (pref === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
  }
  apply();
  return { get: () => pref, set, isDark, apply, onChange: (f) => listeners.push(f) };
})();
