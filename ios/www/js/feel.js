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
  const reduced = () => root.classList.contains('lowfx') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Glass controls behave like a piston in a thick liquid: pressed, the button sinks in, slowed by the
  // liquid; let go, it is pushed back up quickly and settles with one small, damped overshoot. On Home,
  // an icon coming back up sends waves over the shelf (see shelfWater).
  const LIQUID = '.q, .hero-acts button, .hero-acts .ib, #tabbar .tb-plus, .cs-tile, .otop .ib, .otop .tb, #topbar .ib, #topbar .tb, #inv-top .ib, #inv-top .tb, .vhead .ib, .vhead .pill, .pill, .btn, .modal .ib, .seg button';
  const surfaceOf = (el) => (el.matches('.q, .cs-tile') && el.querySelector('.qi')) || el;
  let shelf = null;
  function press(el) {
    if (reduced()) return;
    const s = surfaceOf(el);
    const deep = el.matches('.btn, .pill, .seg button, .otop .tb, #topbar .tb, #inv-top .tb') ? 0.96 : 0.88;
    const sink = el.matches('.q, .cs-tile') ? 2 : 1;
    if (s._la) s._la.cancel();
    s._la = s.animate([{ transform: 'none' }, { transform: `translateY(${sink}px) scale(${deep})` }], { duration: 190, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' });
    const up = (ev) => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (s._la) s._la.cancel();
      const k = 1 - deep;
      s._la = s.animate([
        { transform: `translateY(${sink}px) scale(${deep})` },
        { transform: `translateY(${-sink * 0.6}px) scale(${1 + k * 0.32})`, offset: 0.34 },
        { transform: `translateY(0) scale(${1 - k * 0.06})`, offset: 0.68 },
        { transform: 'none' },
      ], { duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)' });
      if (ev.type === 'pointerup' && shelf && el.matches('#quick .q')) shelf.wave(s);
    };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // ---------------------------------------------------------------- the icon shelf, same water as the money card
  // A thin layer of the same liquid glass lies on the shelf. When an icon comes back up, waves leave its
  // edge: close to it they have its shape (a square with round corners), further out they round off,
  // because each wave is a line at equal distance from the icon. Only the surface's shading shows them —
  // a soft shade on the slopes turned from the light, a faint glint on those facing it — over the glass.
  function shelfWater(box) {
    if (!box || box.querySelector('.shelf-water')) return null;
    const cv = el('canvas', { class: 'shelf-water', 'aria-hidden': 'true' });
    box.prepend(cv);
    let W = 0, H = 0, ctx = null, img = null, px = null, scale = 1;
    function size() {
      const r = box.getBoundingClientRect();
      if (!r.width) return false;
      scale = Math.min(1, 380 / r.width);
      W = Math.round(r.width * scale); H = Math.round(r.height * scale);
      cv.width = W; cv.height = H;
      ctx = cv.getContext('2d'); img = ctx.createImageData(W, H); px = img.data;
      return true;
    }
    const L = [-0.42, -0.5, 0.76], Ln = Math.hypot(...L); L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
    const Hv = [L[0], L[1], L[2] + 1], Hn = Math.hypot(...Hv); Hv[0] /= Hn; Hv[1] /= Hn; Hv[2] /= Hn;
    const waves = [];
    let running = false, last = 0;
    const LIFE = 2000;
    function wave(icon) {
      if (!W && !size()) return;
      const br = box.getBoundingClientRect(), ir = icon.getBoundingClientRect();
      const cx = ((ir.left + ir.right) / 2 - br.left) * scale, cy = ((ir.top + ir.bottom) / 2 - br.top) * scale;
      const hx = (ir.width / 2) * scale, hy = (ir.height / 2) * scale, rr = parseFloat(getComputedStyle(icon).borderRadius) * scale || hx * 0.28;
      // distance from the icon's rounded-square edge, and the direction away from it, for every point
      const N = W * H, d = new Float32Array(N), ux = new Float32Array(N), uy = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, px0 = x - cx, py0 = y - cy;
        const qx = Math.abs(px0) - (hx - rr), qy = Math.abs(py0) - (hy - rr);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), o = Math.hypot(ox, oy);
        d[i] = Math.max(0, o + Math.min(Math.max(qx, qy), 0) - rr);
        let gx, gy;
        if (o > 0) { gx = ox / o; gy = oy / o; } else if (qx > qy) { gx = 1; gy = 0; } else { gx = 0; gy = 1; }
        ux[i] = gx * Math.sign(px0 || 1); uy[i] = gy * Math.sign(py0 || 1);
      }
      waves.push({ d, ux, uy, t0: null, reach: Math.hypot(W, H) * 0.75 });
      if (waves.length > 3) waves.shift();
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
    }
    function paint(now) {
      for (const w of waves) if (w.t0 == null) w.t0 = now;
      for (let i = waves.length - 1; i >= 0; i--) if (now - waves[i].t0 > LIFE) waves.splice(i, 1);
      const lam = Math.max(14, W * 0.075), K = (2 * Math.PI) / lam, A = 0.22;
      const tv = waves.map((w) => {
        const k = (now - w.t0) / LIFE;
        return { w, front: lam * 0.4 + w.reach * (1 - Math.pow(1 - k, 2.4)), amp: A * Math.min(1, k * 20) * Math.pow(1 - k, 1.4) };
      });
      const N = W * H;
      for (let i = 0, o = 0; i < N; i++, o += 4) {
        let gx = 0, gy = 0;
        for (const t of tv) {
          const di = t.w.d[i];
          if (di <= 0) continue;
          const behind = t.front - di;
          if (behind < 0 || behind > lam * 3) continue;
          const env = Math.sin((Math.PI * behind) / (lam * 3));
          const sl = -t.amp * env * Math.sin(K * behind) / (1 + di / W);
          gx += sl * t.w.ux[i]; gy += sl * t.w.uy[i];
        }
        if (gx === 0 && gy === 0) { px[o + 3] = 0; continue; }
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;
        let sp = nx * Hv[0] + ny * Hv[1] + nz * Hv[2];
        sp = sp > 0 ? sp : 0; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
        const lit = (nx * L[0] + ny * L[1] + nz * L[2]) / L[2] - 1; // <0 turned away, >0 towards the light
        if (lit < 0) { // a soft, cool shade
          px[o] = 30; px[o + 1] = 52; px[o + 2] = 96; px[o + 3] = Math.min(150, -lit * 420 + sp * 40);
        } else {        // a faint glint
          px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; px[o + 3] = Math.min(170, lit * 480 + sp * 110);
        }
      }
      ctx.putImageData(img, 0, 0);
      return waves.length > 0;
    }
    function frame(t) {
      if (t - last >= 33) { last = t; if (!paint(t)) { running = false; ctx.clearRect(0, 0, W, H); return; } }
      requestAnimationFrame(frame);
    }
    new ResizeObserver(() => { if (!running) size(); }).observe(box);
    return { wave };
  }

  // the icons on Home open their screen a moment later, so the jump back is seen
  document.addEventListener('click', (e) => {
    const q = on() && !reduced() && e.target.closest('#quick .q');
    if (!q || q._go) return;
    e.stopImmediatePropagation(); e.preventDefault();
    setTimeout(() => { q._go = true; q.click(); q._go = false; }, 200);
  }, true);

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
  // A layer of water rests on the blue card the way a drop rests on a water-repellent surface: surface
  // tension holds it, so it has thickness and a rounded edge all around and does not spread. At rest it is
  // still. Where a finger touches, a few perfect rings rise and travel out slowly, then fade, and the
  // card opens a moment later. One height field (layer + rings) gives the normals, light and refraction;
  // it is drawn only while rings are moving.
  function water(card) {
    if (!card || card.querySelector('.water')) return;
    const box = card.getBoundingClientRect();
    const W = Math.round(Math.min(640, Math.max(240, box.width || 362))), H = Math.round(W * Math.max(0.3, Math.min(0.6, (box.height || 150) / (box.width || 362))));
    const cv = el('canvas', { class: 'water', width: W, height: H, 'aria-hidden': 'true' });
    card.prepend(cv);
    const ctx = cv.getContext('2d', { alpha: false });
    const img = ctx.createImageData(W, H), px = img.data;
    const N = W * H;
    const floor = new Float32Array(N * 3);
    const dgx = new Float32Array(N), dgy = new Float32Array(N), rim = new Float32Array(N);
    const dist = new Float32Array(N), ux = new Float32Array(N), uy = new Float32Array(N), fall = new Float32Array(N);
    // the card under the water
    const C = [[20, 136, 255], [0, 100, 226], [50, 62, 214]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = Math.min(1, (x / W) * 0.6 + (y / H) * 0.4);
      const [p, q, k] = t < 0.55 ? [C[0], C[1], t / 0.55] : [C[1], C[2], (t - 0.55) / 0.45];
      for (let c = 0; c < 3; c++) floor[i * 3 + c] = p[c] + (q[c] - p[c]) * k;
    }
    // the water layer: flat on top, rounding down to the card at the edge (a rounded rectangle)
    const R = 26 * (W / (box.width || W)), E = 12 * (W / (box.width || W)); // corner radius, width of the rounded edge
    const height = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - W / 2) - (W / 2 - R), qy = Math.abs(y + 0.5 - H / 2) - (H / 2 - R);
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R; // < 0 inside
      const d = Math.min(1, Math.max(0, -out / E));           // 0 at the edge, 1 where the top is flat
      height[y * W + x] = Math.sqrt(1 - (1 - d) * (1 - d));     // a circular profile: the meniscus
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const l = height[x > 0 ? i - 1 : i], r = height[x < W - 1 ? i + 1 : i], u = height[y > 0 ? i - W : i], d = height[y < H - 1 ? i + W : i];
      dgx[i] = (r - l) * 0.5 * E * 0.55; dgy[i] = (d - u) * 0.5 * E * 0.55; // slope of the layer
      rim[i] = 1 - height[i];
    }
    // light from the top-left and above; the eye straight above
    const L = [-0.42, -0.5, 0.76], Ln = Math.hypot(...L); L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
    const Hv = [L[0], L[1], L[2] + 1], Hn = Math.hypot(...Hv); Hv[0] /= Hn; Hv[1] /= Hn; Hv[2] /= Hn;
    // rings from touches: each spreads at a calm, slowing pace and fades within ~2.6 s
    const flat = new Float32Array(N);
    for (let i = 0; i < N; i++) { const f = Math.min(1, Math.max(0, (height[i] - 0.96) / 0.04)); flat[i] = f * f * (3 - 2 * f); }
    const LAMBDA = W * 0.085, K = (2 * Math.PI) / LAMBDA, LIFE = 2400, A = 0.24;
    const touches = [];
    let running = false;
    function paint(now) {
      for (const t of touches) if (t.t0 == null) t.t0 = now;
      const live = touches.filter((t) => now - t.t0 < LIFE);
      touches.length = 0; touches.push(...live);
      const tv = live.map((t) => {
        const k = (now - t.t0) / LIFE;                       // 0..1
        const front = LAMBDA * 0.6 + W * 0.62 * (1 - Math.pow(1 - k, 2.4)); // leaves fast, then slows like real water
        return { x: t.x, y: t.y, front, amp: A * Math.min(1, k * 22) * Math.pow(1 - k, 1.3) };
      });
      for (let i = 0, o = 0; i < N; i++, o += 4) {
        let gx = dgx[i], gy = dgy[i];
        if (tv.length && flat[i] > 0) {
          const x0 = i % W, y0 = (i - x0) / W;
          for (const t of tv) {
            const dx = x0 - t.x, dy = y0 - t.y, r = Math.sqrt(dx * dx + dy * dy) || 1;
            const behind = t.front - r;                      // the rings live just behind the front
            if (behind < 0 || behind > LAMBDA * 3) continue;
            const env = Math.sin((Math.PI * behind) / (LAMBDA * 3)); // smooth: 0 at the front and at the last ring
            const s = -t.amp * env * Math.sin(K * behind) * flat[i] / (1 + r / W);
            gx += (s * dx) / r; gy += (s * dy) / r;
          }
        }
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;
        let sp = nx * Hv[0] + ny * Hv[1] + nz * Hv[2];
        sp = sp > 0 ? sp : 0; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
        const lit = (nx * L[0] + ny * L[1] + nz * L[2]) / L[2];
        const exitGlow = rim[i] * Math.max(0, gx * 0.6 + gy * 0.75) * 20;
        const x = i % W, y = (i - x) / W;
        let sx = (x - gx * 5) | 0, sy = (y - gy * 5) | 0;
        if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
        if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;
        const k = (sy * W + sx) * 3, m = 0.92 + 0.08 * lit;
        px[o] = Math.min(255, floor[k] * m + sp * 150 + exitGlow * 0.7);
        px[o + 1] = Math.min(255, floor[k + 1] * m + sp * 155 + exitGlow * 0.9);
        px[o + 2] = Math.min(255, floor[k + 2] * m + sp * 160 + exitGlow);
        px[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return live.length > 0;
    }
    let last = 0;
    function frame(t) {
      if (t - last >= 33) { last = t; if (!paint(t)) { running = false; return; } }
      requestAnimationFrame(frame);
    }
    paint(0);
    card.addEventListener('pointerdown', (e) => {
      if (reduced()) return;
      const r = card.getBoundingClientRect();
      touches.push({ x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, t0: null });
      if (touches.length > 3) touches.shift();
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
    });
    // the card opens a moment after the touch, so the drop is seen
    card.addEventListener('click', (e) => {
      if (card._go || reduced()) return;
      e.stopImmediatePropagation(); e.preventDefault();
      setTimeout(() => { card._go = true; card.click(); card._go = false; }, 520);
    }, true);
    return {};
  }

  // ---------------------------------------------------------------- light mode
  // On a computer that draws without a graphics card (or cannot keep up), the glass blur and the water
  // animations make everything slow: they are turned off there, the rest looks the same.
  function lightMode() {
    const set = (why) => { root.classList.add('lowfx'); try { localStorage.setItem('acm.lowfx', why); } catch (e) {} };
    let saved = null;
    try { saved = localStorage.getItem('acm.lowfx'); } catch (e) {}
    if (saved === 'gpu' || saved === 'slow') root.classList.add('lowfx');
    if (window.ElectronHost && window.ElectronHost.invoke) {
      window.ElectronHost.invoke('gpu-info').then((g) => {
        if (g && (g.off || /disabled|software/.test(String(g.compositing || '')))) set('gpu');
        else if (saved === 'gpu') { root.classList.remove('lowfx'); try { localStorage.removeItem('acm.lowfx'); } catch (e) {} }
      }).catch(() => {});
    }
    if (saved === 'slow') return;
    // a short measurement after start: frames that take far too long mean the computer cannot keep up
    setTimeout(() => {
      if (document.visibilityState !== 'visible' || root.classList.contains('lowfx')) return;
      const gaps = [];
      let prev = 0;
      const tick = (t) => {
        if (prev) gaps.push(t - prev);
        prev = t;
        if (gaps.length < 90) requestAnimationFrame(tick);
        else {
          gaps.sort((a, b) => a - b);
          const p50 = gaps[gaps.length >> 1];
          if (p50 > 34 && document.visibilityState === 'visible') set('slow');
        }
      };
      requestAnimationFrame(tick);
    }, 4000);
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    lightMode();
    // the 2.6 look is the default; "classic" keeps the previous one
    let look = null;
    try { look = localStorage.getItem('acm.look'); } catch (e) {}
    if (look !== 'classic') root.classList.add('v26');
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
    document.addEventListener('pointerdown', (e) => { if (!on()) return; const t = e.target.closest(LIQUID); if (t && !t.disabled) press(t); }, true);
    if (on()) { buildBar(); scrollHeads(); water(document.getElementById('home-money')); shelf = shelfWater(document.getElementById('quick')); }
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
