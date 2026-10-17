'use strict';
// Language of the app (Română / English). The app is written in Romanian; in
// English every piece of text shown on screen is swapped from the dictionary
// (window.I18N_EN), also text that appears later (dialogs, menus, messages).
// Documents (invoices) have their own language, chosen per document.

const I18n = (() => {
  const KEY = 'acm.lang';
  let lang = 'ro';
  try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ro'; } catch (e) {}
  const exact = new Map();
  const lower = new Map();
  const patterns = []; // {re, out: [text, groupIndex, text, ...]}
  const listeners = [];
  const SKIP = '#wr-page, #sl-live, #sl-list, #sl-present, .text-edit, #sh-grid, datalist, .fname, .no-tr, #inv-preview-wrap, .page';
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  function build() {
    const D = window.I18N_EN || {};
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
    const e = exact.get(t) || lower.get(t.toLowerCase());
    if (!e) return s;
    if (t === t.toLowerCase()) return e.toLowerCase();
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
    if (lang !== 'en' || obs) return;
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
    const fix = () => { if (lang !== 'en') return; const v = tr(document.title); if (v && v !== document.title) document.title = v; };
    titleObs = new MutationObserver(fix);
    titleObs.observe(t, { childList: true, characterData: true, subtree: true });
    fix();
  }

  function set(l) {
    l = l === 'en' ? 'en' : 'ro';
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l;
    if (l === 'en') start(); else stop();
    for (const f of listeners) { try { f(l); } catch (e) {} }
  }

  function init() {
    build();
    document.documentElement.lang = lang;
    start();
  }

  /** Text in the app's language (for strings built in code). */
  const t = (ro) => (lang === 'en' ? (tr(ro) || ro) : ro);

  return {
    init, set, t, tr,
    get lang() { return lang; },
    locale: () => (lang === 'en' ? 'en-GB' : 'ro-RO'),
    onChange: (f) => listeners.push(f),
  };
})();
