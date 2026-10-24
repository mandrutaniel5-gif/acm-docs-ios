// How the app feels in the hand (2.6): haptics, the Create sheet that grows out of its button,
// one message at a time, and "First steps" for new people. Everything here is on when <html> has the
// class "v26"; the classic look keeps working without it.
const Feel = (() => {
  const root = document.documentElement;
  const on = () => root.classList.contains('v26');

  // ---------------------------------------------------------------- haptics
  // light: a tap that changes something · medium: something opens · selection: picking from a set
  // success / warning / error: the outcome of an action
  const PATTERN = { light: 8, medium: 14, heavy: 22, selection: 5, success: [10, 60, 14], warning: [16, 80, 16], error: [20, 60, 20, 60, 20] };
  let last = 0;
  function haptic(kind = 'light') {
    if (!on()) return;
    const now = performance.now();
    if (now - last < 40) return; // never a buzz
    last = now;
    try {
      if (window.AndroidBridge && typeof AndroidBridge.haptic === 'function') { AndroidBridge.haptic(kind); return; }
    } catch (e) {}
    try { if (navigator.vibrate && Host.mobile) navigator.vibrate(PATTERN[kind] || 8); } catch (e) {}
  }

  // ---------------------------------------------------------------- Create sheet
  let sheet = null, back = null;
  function closeCreate(then) {
    if (!sheet) return false;
    const s = sheet, b = back;
    sheet = back = null;
    root.classList.remove('create-open');
    s.classList.add('closing'); b.classList.add('closing');
    setTimeout(() => { s.remove(); b.remove(); if (then) then(); }, 230);
    return true;
  }
  function openCreate() {
    if (sheet) { closeCreate(); return; }
    haptic('medium');
    const b = Biz.active();
    const I = Biz.industry(b && b.industry);
    const go = (fn) => () => { haptic('light'); closeCreate(fn); };
    const office = (E) => async () => { if (await Office.ensureSaved()) E.open(null); };
    const tile = (cls, icon, label, fn) => el('button', { class: 'cs-tile', type: 'button', onclick: go(fn) }, [el('span', { class: 'qi ' + cls, html: svg(icon) }), el('span', { text: label })]);
    const item = (icon, label, fn) => el('button', { type: 'button', onclick: go(fn), html: svg(icon) + `<span>${I18n.t(label)}</span>` });
    back = el('div', { class: 'cs-back', onclick: () => closeCreate() });
    sheet = el('div', { class: 'create-sheet', role: 'dialog', 'aria-label': I18n.t('Creează') }, [
      el('div', { class: 'cs-title', text: 'Creează' }),
      el('div', { class: 'cs-tiles' }, [
        tile('blue', 'camera', 'Scanează', () => App.scan()),
        tile('green', 'receipt', 'Factură', () => Invoice.open({ type: 'invoice' })),
        tile('pdf', 'pdf', 'Deschide', () => App.openDialog()),
      ]),
      el('div', { class: 'cs-list' }, [
        item('doc', 'Proformă', () => Invoice.open({ type: 'proforma' })),
        item('edit', I.quote ? 'Deviz' : 'Ofertă de preț', () => Invoice.open({ type: 'quote' })),
        el('hr'),
        item('wordapp', 'Document (Word)', office(Writer)),
        item('sheetapp', 'Tabel (Excel)', office(Sheet)),
        item('slidesapp', 'Prezentare (PowerPoint)', office(Slides)),
        item('pdf', 'PDF gol', () => App.newBlank()),
      ]),
    ]);
    document.body.append(back, sheet);
    root.classList.add('create-open');
  }

  // ---------------------------------------------------------------- First steps
  const DISMISS = 'acm.firstSteps.hidden';
  function steps() {
    const acc = typeof Account !== 'undefined' && Account.current && Account.current();
    const biz = Biz.active();
    const made = (App.recentFiles ? App.recentFiles() : []).length > 0;
    return [
      { done: !!acc, t: 'Creează-ți contul', s: 'Documentele tale rămân criptate și le găsești pe toate dispozitivele.', run: () => AccountUI.show('signup') },
      { done: !!biz, t: 'Adaugă datele firmei', s: 'O singură dată. Apoi emiți o factură în câteva secunde.', run: () => Invoice.open() },
      { done: made, t: 'Primul document', s: 'Scanează o foaie, deschide un PDF sau începe o factură.', run: () => openCreate() },
    ];
  }
  function renderSteps() {
    const home = document.querySelector('#v-home .vwrap');
    if (!home) return;
    let box = document.getElementById('first-steps');
    let hidden = false;
    try { hidden = localStorage.getItem(DISMISS) === '1'; } catch (e) {}
    const list = steps();
    const left = list.filter((x) => !x.done).length;
    home.classList.toggle('first-run', on() && !hidden && left > 0 && !Biz.active());
    if (!on() || hidden || !left) { if (box) box.remove(); return; }
    if (!box) {
      box = el('section', { id: 'first-steps', class: 'first-steps', 'aria-label': I18n.t('Primii pași') });
      document.getElementById('quick').after(box);
    }
    box.innerHTML = '';
    const doneN = list.length - left;
    const nextI = list.findIndex((x) => !x.done);
    box.append(
      el('div', { class: 'fs-head' }, [el('b', { text: 'Primii pași' }), el('small', { text: `${doneN} ${I18n.t('din')} ${list.length}` })]),
      el('div', { class: 'fs-bar' }, [el('i', { style: { width: `${Math.max(6, (doneN / list.length) * 100)}%` } })]),
      ...list.map((x, i) => el('button', { class: 'fs-step' + (x.done ? ' done' : '') + (i === nextI ? ' next' : ''), type: 'button', disabled: x.done, onclick: () => { haptic('light'); x.run(); } }, [
        el('span', { class: 'fs-n', html: x.done ? svg('check') : String(i + 1) }),
        el('span', { class: 'fs-t' }, [el('b', { text: x.t }), el('small', { text: x.s })]),
        x.done ? null : el('span', { class: 'chev', html: svg('right') }),
      ].filter(Boolean))),
    );
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    try { if (localStorage.getItem('acm.look') === 'v26') root.classList.add('v26'); } catch (e) {}
    try { if (Host.info && Host.info.platform === 'ios') root.classList.add('ios'); } catch (e) {}
    // Create: on the phone it grows out of its button
    const plus = document.getElementById('tab-new');
    plus.addEventListener('click', (e) => { if (!on()) return; e.stopImmediatePropagation(); openCreate(); }, true);
    // tabs, segments: a light tick
    document.addEventListener('click', (e) => {
      const t = e.target.closest('#tabbar button:not(.tb-plus), .seg button, .chip');
      if (t) haptic('selection');
    }, true);
    // one message at a time; saved = a soft "done" in the hand
    const toast0 = UI.toast;
    UI.toast = (msg, opts = {}) => {
      if (on()) {
        document.querySelectorAll('#toasts .toast').forEach((x) => { x.classList.add('leaving'); setTimeout(() => x.remove(), 200); });
        haptic(opts.error ? 'error' : /^(Salvat|Saved)/.test(String(msg)) ? 'success' : 'light');
      }
      return toast0(msg, opts);
    };
    // Back closes the Create sheet first
    const back0 = UI.back;
    UI.back = () => closeCreate() || back0();
    // First steps follow the home screen
    const rl = document.getElementById('recent-list');
    if (rl) new MutationObserver(() => renderSteps()).observe(rl, { childList: true });
  }
  document.addEventListener('DOMContentLoaded', init);

  return { haptic, openCreate, closeCreate, renderSteps, get on() { return on(); } };
})();
