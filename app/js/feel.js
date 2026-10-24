// How the app feels in the hand (2.6): haptics, the Create sheet that grows out of its button,
// one message at a time,  Everything here is on when <html> has the
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


  // ---------------------------------------------------------------- liquid glass motion
  const SPRING = 'linear(0, 0.034, 0.1184, 0.2311, 0.3555, 0.4799, 0.5962, 0.6998, 0.7883, 0.8609, 0.9184, 0.962, 0.9937, 1.0152, 1.0287, 1.0358, 1.0383, 1.0376, 1.0347, 1.0305, 1.0258, 1.021, 1.0164, 1.0123, 1.0088, 1.0059, 1.0036, 1.0018, 1.0005, 0.9996, 0.999, 0.9987, 0.9985, 0.9986, 0.9988, 0.9994, 1)';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // glass controls swell under the finger, light up where it touches and settle back like a gel
  const LIQUID = '.hero-acts button, .hero-acts .ib, #tabbar .tb-plus, .cs-tile, .otop .ib, .otop .tb, #topbar .ib, #topbar .tb, #inv-top .ib, #inv-top .tb, .vhead .ib, .vhead .pill, .pill, .btn, .modal .ib, .seg button';
  function lightAt(el, e) {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lx', ((e.clientX - r.left) / r.width) * 100 + '%');
    el.style.setProperty('--ly', ((e.clientY - r.top) / r.height) * 100 + '%');
  }
  function press(el, e) {
    if (reduced()) return;
    lightAt(el, e);
    el.classList.add('lit', 'held');
    if (el._la) el._la.cancel();
    const big = el.matches('.btn, .pill, .seg button') ? 1.05 : el.matches('.cs-tile') ? 1.06 : 1.14;
    el._big = big;
    el._la = el.animate([{ transform: 'scale(1)' }, { transform: `scale(${big})` }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'forwards' });
    const move = (ev) => lightAt(el, ev);
    const up = () => {
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      el.classList.remove('held');
      setTimeout(() => el.classList.remove('lit'), 700);
      const b = el._big;
      if (el._la) el._la.cancel();
      el._la = el.animate([
        { transform: `scale(${b})` },
        { transform: `scale(${1 - (b - 1) * 0.55}, ${1 + (b - 1) * 0.45})`, offset: 0.28 },
        { transform: `scale(${1 + (b - 1) * 0.3}, ${1 - (b - 1) * 0.22})`, offset: 0.56 },
        { transform: `scale(${1 - (b - 1) * 0.08}, ${1 + (b - 1) * 0.06})`, offset: 0.8 },
        { transform: 'scale(1)' },
      ], { duration: 620, easing: 'ease-out' });
    };
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // the bar: a glass capsule and a bubble that flows from place to place (and follows a finger)
  let lens = null, glass = null, lensAt = null;
  const tabs = () => [...document.querySelectorAll('#tabbar button[data-view]')];
  const slot = (b) => ({ l: b.offsetLeft + 2, w: b.offsetWidth - 4 });
  function placeLens(to, animate) {
    if (!lens || !to) return;
    const b = slot(to);
    if (!animate || !lensAt || reduced() || !lens.offsetParent) {
      Object.assign(lens.style, { left: b.l + 'px', width: b.w + 'px' });
      lensAt = b;
      return;
    }
    const a = lensAt;
    const far = Math.abs(b.l - a.l) / Math.max(1, a.w);
    const lo = Math.min(a.l, b.l), hi = Math.max(a.l + a.w, b.l + b.w);
    lens.classList.add('moving');
    lens.getAnimations().forEach((x) => x.cancel());
    const an = lens.animate([
      { left: a.l + 'px', width: a.w + 'px', transform: 'scale(1)' },
      { left: lo + (hi - lo) * 0.08 + 'px', width: (hi - lo) * 0.84 + 'px', transform: `scale(1.06, ${0.86 - Math.min(0.08, far * 0.02)})`, offset: 0.42 },
      { left: b.l + 'px', width: b.w + 'px', transform: 'scale(1.1, .94)', offset: 0.72 },
      { left: b.l + 'px', width: b.w + 'px', transform: 'scale(1)' },
    ], { duration: 560 + Math.min(200, far * 50), easing: SPRING });
    Object.assign(lens.style, { left: b.l + 'px', width: b.w + 'px' });
    lensAt = b;
    an.onfinish = () => lens.classList.remove('moving');
  }
  function buildBar() {
    const bar = document.getElementById('tabbar');
    if (!bar || document.getElementById('tab-glass')) return;
    glass = el('div', { id: 'tab-glass' });
    lens = el('div', { id: 'tab-lens' });
    bar.prepend(glass, lens);
    let current = null;
    const sync = () => {
      const now = tabs().find((b) => b.classList.contains('on'));
      if (now === current) return;
      current = now;
      if (on()) placeLens(now, true);
    };
    for (const b of tabs()) new MutationObserver(sync).observe(b, { attributes: true, attributeFilter: ['class'] });
    const ro = new ResizeObserver(() => { if (!on()) return; lensAt = null; placeLens(tabs().find((b) => b.classList.contains('on')), false); });
    ro.observe(bar);
    // dragging along the bar: the bubble follows the finger, magnified; letting go picks the place
    let drag = null;
    const start = (e) => {
      if (!on() || e.target.closest('.tb-plus')) return;
      drag = { x0: e.clientX, moved: false };
    };
    const move = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x0) < 10) return;
      if (!drag.moved) { drag.moved = true; lens.classList.add('moving'); lens.getAnimations().forEach((x) => x.cancel()); haptic('light'); }
      const r = bar.getBoundingClientRect(), list = tabs();
      const min = slot(list[0]).l, max = slot(list[list.length - 1]).l;
      const w = lensAt ? lensAt.w : 70;
      const l = Math.max(min - 6, Math.min(max + 6, e.clientX - r.left - w / 2));
      lens.style.left = l + 'px';
      lens.style.transform = 'scale(1.16, 1.1)';
      const near = list.reduce((best, b) => (Math.abs(slot(b).l - l) < Math.abs(slot(best).l - l) ? b : best), list[0]);
      if (drag.near !== near) { if (drag.near) haptic('selection'); drag.near = near; }
    };
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.moved) return;
      lensAt = { l: parseFloat(lens.style.left), w: lensAt ? lensAt.w : 70 };
      lens.style.transform = '';
      const target = d.near || tabs()[0];
      d.suppress = true;
      window.__acmTabDrag = Date.now();
      if (target.classList.contains('on')) placeLens(target, true); else App.showView(target.dataset.view);
    };
    bar.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    bar.addEventListener('click', (e) => { if (window.__acmTabDrag && Date.now() - window.__acmTabDrag < 300) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    requestAnimationFrame(() => placeLens(tabs().find((b) => b.classList.contains('on')), false));
  }

  // the big title moves into a small glass bar as the page scrolls
  function scrollHeads() {
    for (const v of document.querySelectorAll('#views > .view')) {
      const sc = v.querySelector('.vscroll');
      if (!sc || v.querySelector('.scroll-head')) continue;
      const head = el('div', { class: 'scroll-head' });
      v.prepend(head);
      const title = () => { const h = v.querySelector('.hero-brand span, .vhead h1, h1'); return h ? h.textContent.trim() : ''; };
      sc.addEventListener('scroll', () => {
        const s = sc.scrollTop > 46;
        if (s !== v.classList.contains('scrolled')) { if (s) head.textContent = title(); v.classList.toggle('scrolled', s); }
      }, { passive: true });
    }
  }

  // a page that appears arrives softly
  function viewEntrances() {
    for (const v of document.querySelectorAll('#views > .view')) {
      let was = v.classList.contains('hidden');
      new MutationObserver(() => {
        const now = v.classList.contains('hidden');
        if (was && !now && on() && !reduced()) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); setTimeout(() => v.classList.remove('enter'), 600); }
        was = now;
      }).observe(v, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // the amount counts up to its value when it changes
  function countUp() {
    const n = document.getElementById('mc-amount');
    if (!n) return;
    let last = '';
    new MutationObserver(() => {
      const html = n.innerHTML;
      if (html === last || n.dataset.counting) return;
      last = html;
      const m = n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : '';
      const val = parseFloat(m.replace(/\./g, '').replace(',', '.'));
      if (!on() || reduced() || !(val > 0)) return;
      const node = n.firstChild, fmt = (x) => x.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const t0 = performance.now(), dur = 900;
      n.dataset.counting = '1';
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        node.textContent = fmt(val * e);
        if (k < 1) requestAnimationFrame(step); else { node.textContent = m; delete n.dataset.counting; last = n.innerHTML; }
      };
      requestAnimationFrame(step);
    }).observe(n, { childList: true, characterData: true, subtree: true });
  }


  // ---------------------------------------------------------------- the money card, under liquid glass
  // The blue card lies under a layer of clear liquid glass. Slow, even rings come from the bottom-right
  // corner and travel across; through them the card's floor shows the light they gather (caustics), and
  // their crests catch a soft highlight. Nothing random, nothing fast. Drawn on a small grid that the
  // screen smooths, about 24 times a second, only while the card is visible and the app is in front.
  function water(card) {
    if (!card || card.querySelector('.water')) return;
    const W = 160, H = 66;
    const cv = el('canvas', { class: 'water', width: W, height: H, 'aria-hidden': 'true' });
    card.prepend(cv);
    const ctx = cv.getContext('2d', { alpha: false });
    const img = ctx.createImageData(W, H), px = img.data;
    // the floor: the card's blue, deeper towards the edges (it lies below the surface)
    const floor = new Float32Array(W * H * 3), dist = new Float32Array(W * H), fall = new Float32Array(W * H);
    const C = [[22, 140, 255], [0, 98, 222], [54, 60, 210]];
    const SX = W + 6, SY = H + 8; // the source sits just outside the bottom-right corner
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = Math.min(1, (x / W) * 0.6 + (y / H) * 0.4);
      const [p, q, k] = t < 0.55 ? [C[0], C[1], t / 0.55] : [C[1], C[2], (t - 0.55) / 0.45];
      const ex = Math.min(x, W - 1 - x) / (W * 0.5), ey = Math.min(y, H - 1 - y) / (H * 0.5);
      const depth = 0.84 + 0.16 * Math.min(1, Math.min(ex * 3.2, ey * 2.4)); // edges sink into shadow
      for (let c = 0; c < 3; c++) floor[i * 3 + c] = (p[c] + (q[c] - p[c]) * k) * depth;
      const r = Math.hypot(x - SX, y - SY);
      dist[i] = r;
      fall[i] = 1 / (1 + r / 120); // even: the rings fade only a little as they travel
    }
    const K = (2 * Math.PI) / 34; // one ring every 34 grid cells (about 80 px on screen)
    const SPEED = 0.052;           // radians per frame at 24 fps: a new ring about every 5 s, calm
    let visible = false, running = false, last = 0, phase = 0;
    const reduce = reduced();
    function paint() {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x, r = dist[i], f = fall[i];
          const th = K * r - phase;
          const slope = Math.cos(th) * f;          // how steep the surface is here
          const curve = -Math.sin(th) * f;         // where it bends light together (caustic)
          // the light from the top-left meets slopes that face it; crests catch a narrow highlight
          const dx = (x - SX) / r, dy = (y - SY) / r;
          const face = -(dx * 0.7 + dy * 0.72) * slope;
          const hi = face > 0.32 ? (face - 0.32) * (face - 0.32) * 300 : 0;
          const caustic = curve > 0 ? curve * curve * curve * 52 : curve * 9;
          // refraction: the floor seen through the moving glass shifts a little along the slope
          const sx = Math.min(W - 1, Math.max(0, Math.round(x + dx * slope * 3))), sy = Math.min(H - 1, Math.max(0, Math.round(y + dy * slope * 3)));
          const k = (sy * W + sx) * 3, o = i * 4;
          px[o] = Math.min(255, floor[k] + caustic + hi);
          px[o + 1] = Math.min(255, floor[k + 1] + caustic * 1.05 + hi);
          px[o + 2] = Math.min(255, floor[k + 2] + caustic * 0.7 + hi);
          px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    function frame(t) {
      if (!running) return;
      if (t - last >= 41) { // ~24 frames a second: the water moves slowly, more would be wasted
        const dt = last ? Math.min(3, (t - last) / 41) : 1;
        last = t;
        phase += SPEED * dt;
        paint();
      }
      requestAnimationFrame(frame);
    }
    function start() { if (running || !visible || reduce || document.hidden) return; running = true; last = 0; requestAnimationFrame(frame); }
    function stop() { running = false; }
    paint();
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(card);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    return {};
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
    // liquid glass
    document.addEventListener('pointerdown', (e) => { if (!on()) return; const t = e.target.closest(LIQUID); if (t && !t.disabled) press(t, e); }, true);
    if (on()) { buildBar(); scrollHeads(); water(document.getElementById('home-money')); }
    viewEntrances(); countUp();
    // the first moment, once the splash goes
    if (on() && !reduced()) {
      const go = () => { root.classList.add('intro'); setTimeout(() => root.classList.remove('intro'), 1600); };
      const sp = document.getElementById('splash');
      if (!sp) go(); else { const mo = new MutationObserver(() => { if (!document.getElementById('splash') || sp.classList.contains('out')) { mo.disconnect(); go(); } }); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
    }
    // Back closes the Create sheet first
    const back0 = UI.back;
    UI.back = () => closeCreate() || back0();
  }
  document.addEventListener('DOMContentLoaded', init);

  return { haptic, openCreate, closeCreate, get on() { return on(); } };
})();
