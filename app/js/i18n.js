'use strict';
// Language of the app. The app is written in Romanian; in any other language every piece of text
// shown on screen is swapped from that language's dictionary (English: window.I18N_EN, the others:
// js/i18n/<code>.js, loaded only when chosen), also text that appears later (dialogs, menus, messages).
// Documents (invoices) have their own language, chosen per document.

const I18n = (() => {
  const KEY = 'acm.lang';
  // code, name in its own language, locale for dates and numbers, right-to-left
  const LANGS = [
    ['ro', 'Română', 'ro-RO'], ['en', 'English', 'en-GB'], ['de', 'Deutsch', 'de-DE'], ['fr', 'Français', 'fr-FR'],
    ['es', 'Español', 'es-ES'], ['it', 'Italiano', 'it-IT'], ['pt', 'Português', 'pt-PT'], ['hu', 'Magyar', 'hu-HU'],
    ['pl', 'Polski', 'pl-PL'], ['uk', 'Українська', 'uk-UA'], ['ru', 'Русский', 'ru-RU'], ['tr', 'Türkçe', 'tr-TR'],
    ['ar', 'العربية', 'ar', true], ['hi', 'हिन्दी', 'hi-IN'], ['zh', '中文（简体）', 'zh-CN'], ['ja', '日本語', 'ja-JP'], ['ko', '한국어', 'ko-KR'],
  ].map(([code, name, locale, rtl]) => ({ code, name, locale, rtl: !!rtl }));
  const known = (l) => LANGS.some((x) => x.code === l);
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  let lang = known(saved) ? saved : 'ro';
  if (lang !== 'ro') document.documentElement.classList.add('i18n-wait'); // hidden until the dictionary is in
  const exact = new Map();
  const lower = new Map();
  const patterns = []; // {re, out: [text, groupIndex, text, ...]}
  const listeners = [];
  const SKIP = '#wr-page, #sl-live, #sl-list, #sl-present, .text-edit, #sh-grid, datalist, .fname, .no-tr, #inv-preview-wrap, .page';
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  const dictOf = (l) => (l === 'en' ? window.I18N_EN : (window.I18N_DICT || {})[l]);
  function build() {
    exact.clear(); lower.clear(); patterns.length = 0;
    const D = dictOf(lang) || {};
    for (const [ro, en] of Object.entries(D)) {
      if (!ro || ro === en) continue;
      if (ro.includes('${')) {
        const parts = ro.split(/(\$\{[^}]*\})/);
        const holes = parts.filter((p, i) => i % 2 === 1);
        const literal = parts.filter((p, i) => i % 2 === 0).join('');
        if ((literal.match(/[A-Za-zĂÂÎȘȚăâîșț]/g) || []).length < 3 || /[<\n]/.test(ro)) continue;
        const num = (h) => /length|index|count|\bn\b|\.n\b|\+ 1|daysLate|Math\./.test(h);
        const re = new RegExp('^' + parts.map((p, i) => (i % 2 ? (num(p) ? '([\\d.,]+)' : '([\\s\\S]+?)') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
        const outParts = en.split(/(\$\{[^}]*\})/);
        let order = 0;
        const out = outParts.map((p, i) => {
          if (i % 2 === 0) return p;
          let k = holes.indexOf(p);
          if (k < 0) k = Math.min(order, holes.length - 1);
          order++;
          return k;
        });
        patterns.push({ re, out });
      } else {
        exact.set(ro, en);
        lower.set(ro.toLowerCase(), en);
      }
    }
  }

  function word(s) {
    const t = s.trim();
    if (!t) return s;
    const ex = exact.get(t);
    if (ex) return ex; // exact match: the dictionary already has the right case (German nouns stay capitalised)
    const e = lower.get(t.toLowerCase());
    if (!e) return s;
    if (t === t.toLowerCase() && t !== t.toUpperCase()) return e.toLocaleLowerCase(locale());
    return e;
  }

  /** English for a Romanian text, or null. */
  function tr(text) {
    const t = text.trim();
    if (!t || !/[A-Za-zĂÂÎȘȚăâîșț]/.test(t)) return null;
    const e = exact.get(t);
    if (e !== undefined) return text.replace(t, e);
    for (const p of patterns) {
      const m = p.re.exec(t);
      if (!m) continue;
      const out = p.out.map((x) => (typeof x === 'number' ? word(m[x + 1] || '') : x)).join('');
      return text.replace(t, out);
    }
    const n = /^([\d.,]+)\s+(.+)$/.exec(t); // "3 facturi"
    if (n) { const w = word(n[2]); if (w !== n[2]) return text.replace(t, n[1] + ' ' + w); }
    return null;
  }

  const orig = new WeakMap(); // node -> original Romanian text / attributes
  function skip(node) {
    const e = node.nodeType === 1 ? node : node.parentElement;
    return !e || !!e.closest(SKIP) || e.isContentEditable;
  }
  function doText(n) {
    if (skip(n)) return;
    const v = tr(n.data);
    if (v !== null && v !== n.data) { orig.set(n, n.data); n.data = v; }
  }
  function doEl(e) {
    if (skip(e)) return;
    for (const a of ATTRS) {
      const v0 = e.getAttribute(a);
      if (!v0) continue;
      const v = tr(v0);
      if (v !== null && v !== v0) {
        const o = orig.get(e) || {};
        o[a] = v0;
        orig.set(e, o);
        e.setAttribute(a, v);
      }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    if (skip(root)) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doEl(n);
    }
  }

  let obs = null;
  function start() {
    if (lang === 'ro' || obs) return;
    walk(document.body);
    obs = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) doEl(m.target);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    titleFix();
  }
  function stop() {
    if (obs) { obs.disconnect(); obs = null; }
    // put the Romanian text back
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      const o = orig.get(n);
      if (o === undefined) continue;
      if (n.nodeType === 3) n.data = o;
      else for (const [a, v] of Object.entries(o)) n.setAttribute(a, v);
      orig.delete(n);
    }
  }
  let titleObs = null;
  function titleFix() {
    const t = document.querySelector('title');
    if (!t || titleObs) return;
    const fix = () => { if (lang === 'ro') return; const v = tr(document.title); if (v && v !== document.title) document.title = v; };
    titleObs = new MutationObserver(fix);
    titleObs.observe(t, { childList: true, characterData: true, subtree: true });
    fix();
  }

  /** Loads the dictionary of a language (once). */
  function load(l) {
    if (l === 'ro' || dictOf(l)) return Promise.resolve();
    return new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = 'js/i18n/' + l + '.js';
      sc.onload = sc.onerror = () => resolve();
      document.head.appendChild(sc);
    });
  }
  function applyDir() {
    const L = LANGS.find((x) => x.code === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = L && L.rtl ? 'rtl' : 'ltr';
  }

  /** Changes the language; {save: false} only shows it (the first start, before the person picks). */
  async function set(l, opts) {
    if (!known(l)) l = 'ro';
    if (!opts || opts.save !== false) { try { localStorage.setItem(KEY, l); } catch (e) {} saved = l; }
    if (l === lang && (l === 'ro' || obs)) return;
    await load(l);
    stop();
    lang = l;
    build();
    applyDir();
    start();
    for (const f of listeners) { try { f(l); } catch (e) {} }
  }

  async function init() {
    applyDir();
    if (lang === 'ro') return;
    // the screen waits (briefly) for the dictionary, so it never flashes in another language
    const done = () => document.documentElement.classList.remove('i18n-wait');
    const guard = setTimeout(done, 2500);
    await load(lang);
    build();
    start();
    clearTimeout(guard);
    done();
  }

  /** The language the device is set to, if the app has it. */
  function deviceLang() {
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ro']).map((x) => String(x).toLowerCase());
    for (const p of prefs) { const c = p.split(/[-_]/)[0]; if (known(c)) return c; }
    return 'en';
  }

  /** Text in the app's language (for strings built in code). */
  const t = (ro) => (lang === 'ro' ? ro : (tr(ro) || ro));
  const locale = () => (LANGS.find((x) => x.code === lang) || LANGS[0]).locale;

  return {
    init, set, t, tr, load, deviceLang, LANGS,
    get lang() { return lang; },
    /** false until the person picks a language the first time */
    get chosen() { return known(saved); },
    get name() { return (LANGS.find((x) => x.code === lang) || LANGS[0]).name; },
    locale,
    onChange: (f) => listeners.push(f),
  };
})();
