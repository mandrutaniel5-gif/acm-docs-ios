'use strict';
// Toolbars, floating bars, thumbnails, search and the signature dialog.

// pen / text / marks: black, blue, light blue, red, green, orange, purple, gray, white
const COLORS = [0xff111111, 0xff1c3faa, 0xff0288d1, 0xffc62828, 0xff2e7d32, 0xffef6c00, 0xff7b1fa2, 0xff757575, 0xffffffff];
const HIGHLIGHTS = [0xffffe629, 0xff39e27a, 0xffff6fb5, 0xff48b4ff, 0xffffa94d, 0xffc49bff];
const cssColor = (argb) => `rgb(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255})`;

// -----------------------------------------------------------------------------
// Floating bar above a selected item / the text editor
// -----------------------------------------------------------------------------

const Bars = (() => {
  function button(icon, label, title, onClick, active) {
    const b = el('button', { class: 'fb' + (active ? ' active' : ''), title: title || label || '', html: svg(icon) + (label ? `<span>${label}</span>` : '') });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function dot(argb, active, onClick) {
    const b = el('button', { class: 'dot' + (active ? ' active' : ''), html: `<i style="background:${cssColor(argb)}"></i>` });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function position(bar, r, view) {
    const W = view.el.offsetWidth, H = view.el.offsetHeight;
    // Measure after attaching
    requestAnimationFrame(() => {
      const bw = bar.offsetWidth || 380, bh = bar.offsetHeight || 38;
      let top = r.top - bh - 12;
      if (top < 4) top = r.top + r.height + 12;
      top = Math.max(4, Math.min(H - bh - 4, top));
      const left = Math.max(4, Math.min(W - bw - 4, r.left));
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    });
  }

  function styleControls(bar, style, apply) {
    bar.append(
      button('minus', null, 'Mai mic', () => apply({ size: Math.max(4, Math.round((style.size - 1) * 10) / 10) })),
      el('span', { class: 'fsz', text: String(Math.round(style.size * 10) / 10) }),
      button('plus', null, 'Mai mare', () => apply({ size: Math.min(144, Math.round((style.size + 1) * 10) / 10) })),
      el('div', { class: 'fdiv' }),
      button('bold', null, 'Îngroșat', () => apply({ bold: !style.bold }), style.bold),
      ...COLORS.map((c) => dot(c, ((style.argb | 0xff000000) >>> 0) === c, () => apply({ argb: c }))),
      el('div', { class: 'fdiv' }),
    );
  }

  function forItem(item, view, r) {
    const bar = el('div', { class: 'fbar' });
    bar.style.pointerEvents = 'auto';
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (item.kind === 'text') {
      if (item.editable) {
        bar.append(button('edit', 'Editează', 'Editează textul (Enter)', () => Pages.beginEdit(item)));
        if (item.style && !item.scan) styleControls(bar, item.style, (ch) => Pages.restyleItem(item, ch));
      }
      bar.append(button('copy', null, 'Copiază textul (Ctrl+C)', () => Pages.copyText(item)));
    }
    if (item.kind === 'image') {
      bar.append(button('text', 'Text editabil', 'Citește textul din poză: apoi editezi orice rând', () => ImageText.read(item.page, item.objects[0])));
    }
    bar.append(button('del', item.kind === 'text' ? null : 'Șterge', 'Șterge (Delete)', () => Pages.guard(() => Editor.deleteItem(item))));
    position(bar, r, view);
    return bar;
  }

  function forEditor(edit) {
    const bar = el('div', { class: 'fbar' });
    bar.style.pointerEvents = 'auto';
    bar.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    fillEditor(bar, edit);
    return bar;
  }

  function fillEditor(bar, edit) {
    bar.innerHTML = '';
    styleControls(bar, edit.style, (ch) => Pages.restyleEditor(ch));
    bar.append(el('span', { class: 'fsz', style: { width: 'auto', padding: '0 6px', color: '#8c8c96' }, text: edit.style.family }));
    bar.append(button('done', 'Gata', 'Gata (Ctrl+Enter)', () => Pages.closeEditor(true)));
  }

  function refreshEditor(edit) {
    if (edit.bar) fillEditor(edit.bar, edit);
  }

  return { forItem, forEditor, refreshEditor, position };
})();

// -----------------------------------------------------------------------------
// Main toolbar
// -----------------------------------------------------------------------------

const Toolbar = (() => {
  const TOOLS = [
    ['select', 'select', 'Selectează', 'Click pe orice din pagină (text, poze, semnături): trage ca să muți, click din nou pe text ca să-l editezi (V)'],
    ['text', 'text', 'Text', 'Click pe un text ca să-l modifici sau oriunde ca să scrii text nou (T)'],
    ['sign', 'sign', 'Semnătură', 'Desenează sau alege semnătura (S)'],
    ['image', 'image', 'Imagine', 'Adaugă o imagine: ștampilă, logo, poză'],
    ['pen', 'pen', 'Desen', 'Desen liber cu mouse-ul (P)'],
    ['eraser', 'eraser', 'Radieră', 'Șterge desenele, marcajele, acoperirile și bifele: trage peste ele (E)'],
    ['highlight', 'highlight', 'Evidențiere', 'Marchează cu marker (H)'],
    ['whiteout', 'whiteout', 'Acoperă', 'Acoperă cu alb (W)'],
    ['check', 'check', 'Bifă', 'Pune o bifă (C)'],
    ['cross', 'cross', 'X', 'Pune un X (X)'],
  ];

  function build() {
    const box = document.getElementById('tools');
    box.innerHTML = '';
    for (const [id, icon, label, title] of TOOLS) {
      const b = el('button', { class: 'tool', title, 'data-tool': id, html: svg(icon) + `<span>${label}</span>` });
      b.addEventListener('click', () => App.chooseTool(id));
      box.append(b);
    }
    refresh();
  }

  function refresh() {
    const t = Editor.tool;
    document.querySelectorAll('#tools .tool').forEach((b) => {
      const id = b.dataset.tool;
      const active = id === t || (t === 'place' && Editor.pending && ((id === 'sign') === !!Editor.pending.isSignature));
      b.classList.toggle('active', active);
    });
    const sc = document.getElementById('style-controls');
    // phone: the colors and sizes sit in their own row right above the tools, not at the far end
    // of the scrolling tool row
    const tb = document.getElementById('toolbar');
    if (Host.mobile && sc.parentNode === tb) { tb.before(sc); sc.classList.add('mob'); }
    sc.innerHTML = '';
    const s = Editor.style;
    const addDots = (list, current, set) => list.forEach((c) => {
      const b = el('button', { class: 'dot' + (((current | 0xff000000) >>> 0) === c ? ' active' : ''), html: `<i style="background:${cssColor(c)}"></i>` });
      b.addEventListener('click', () => { set(c); refresh(); });
      sc.append(b);
    });
    const stepper = (value, min, max, step, dec, set, title) => {
      const wrap = el('div', { class: 'stepper', title });
      const minus = el('button', { html: svg('minus') }), plus = el('button', { html: svg('plus') });
      minus.onclick = () => { set(Math.max(min, Math.round((value - step) * 10) / 10)); refresh(); };
      plus.onclick = () => { set(Math.min(max, Math.round((value + step) * 10) / 10)); refresh(); };
      wrap.append(minus, el('span', { text: value.toFixed(dec) }), plus);
      sc.append(wrap);
    };
    if (t === 'text') {
      addDots(COLORS, s.color, (c) => { s.color = c; });
      sc.append(el('div', { style: { width: '8px' } }));
      stepper(s.size, 4, 144, 1, 0, (v) => { s.size = v; }, 'Mărimea textului nou (pt)');
      const bold = el('button', { class: 'ib' + (s.bold ? ' active' : ''), title: 'Îngroșat', html: svg('bold') });
      bold.onclick = () => { s.bold = !s.bold; refresh(); };
      const auto = el('button', {
        class: 'ib' + (s.auto ? ' active' : ''),
        title: s.auto ? 'Automat: textul nou ia fontul, mărimea și culoarea textului din jur (click pentru oprire)' : 'Automat oprit: textul nou folosește setările de aici',
        html: svg('auto'),
      });
      auto.onclick = () => { s.auto = !s.auto; refresh(); };
      sc.append(bold, auto);
    } else if (t === 'pen') {
      addDots(COLORS, s.pen, (c) => { s.pen = c; });
      sc.append(el('div', { style: { width: '8px' } }));
      stepper(s.penWidth, 0.5, 12, 0.5, 1, (v) => { s.penWidth = v; }, 'Grosimea liniei (pt)');
    } else if (t === 'highlight') {
      addDots(HIGHLIGHTS, s.highlight, (c) => { s.highlight = c; });
    } else if (t === 'check' || t === 'cross') {
      addDots(COLORS, s.mark, (c) => { s.mark = c; });
      sc.append(el('div', { style: { width: '8px' } }));
      stepper(s.size, 6, 72, 1, 0, (v) => { s.size = v; }, 'Mărimea semnului');
    }
  }

  return { build, refresh };
})();

// -----------------------------------------------------------------------------
// Thumbnails
// -----------------------------------------------------------------------------

const Thumbs = (() => {
  const W = 118;
  let nodes = [];
  let observer = null;
  const pending = new Set();
  let timer = 0;

  function build() {
    const box = document.getElementById('thumbs');
    box.innerHTML = '';
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) queue(+e.target.dataset.page);
    }, { root: box, rootMargin: '300px 0px' });
    nodes = Editor.sizes.map((s, i) => {
      const h = Math.max(40, Math.min(220, W * s.h / s.w));
      const w = h * s.w / s.h;
      const canvas = el('canvas', { style: { width: w + 'px', height: h + 'px' } });
      const more = el('button', { class: 'tmore', html: svg('morez'), title: 'Acțiuni pagină' });
      const node = el('div', { class: 'thumb', 'data-page': i }, [el('div', { class: 'tframe' }, [canvas]), el('div', { class: 'tnum', text: String(i + 1) }), more]);
      node.addEventListener('click', () => Pages.scrollToPage(i));
      node.addEventListener('contextmenu', (e) => { e.preventDefault(); menuFor(i, e.clientX, e.clientY); });
      more.addEventListener('click', (e) => { e.stopPropagation(); const r = more.getBoundingClientRect(); menuFor(i, r.left, r.bottom); });
      box.append(node);
      observer.observe(node);
      return { node, canvas, w, h, done: false };
    });
    setCurrent(Pages.current);
  }

  function queue(i) {
    pending.add(i);
    if (!timer) timer = setTimeout(flush, 30);
  }

  function flush() {
    timer = 0;
    const i = pending.values().next().value;
    if (i === undefined) return;
    pending.delete(i);
    const n = nodes[i];
    if (n && Editor.doc) {
      try {
        const k = window.devicePixelRatio || 1;
        const img = Editor.doc.render(i, Math.round(n.w * k), Math.round(n.h * k));
        n.canvas.width = img.width;
        n.canvas.height = img.height;
        n.canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
        n.done = true;
      } catch (e) {
        console.warn('thumb', e);
      }
    }
    if (pending.size) timer = setTimeout(flush, 10);
  }

  function refresh(i) {
    if (nodes[i]) queue(i);
  }

  function setCurrent(i) {
    nodes.forEach((n, k) => n.node.classList.toggle('current', k === i));
    const n = nodes[i];
    if (n) {
      const box = document.getElementById('thumbs');
      const top = n.node.offsetTop, bottom = top + n.node.offsetHeight;
      if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTop = top - 20;
    }
  }

  function menuFor(i, x, y) {
    const count = Editor.sizes.length;
    const g = (fn) => () => Pages.guard(fn);
    UI.menu(x, y, [
      { label: 'Rotește la stânga', icon: 'rotl', run: g(() => Editor.rotatePage(i, -1)) },
      { label: 'Rotește la dreapta', icon: 'rotr', run: g(() => Editor.rotatePage(i, 1)) },
      '-',
      { label: 'Mută mai sus', icon: 'up', disabled: i === 0, run: g(() => Editor.movePage(i, i - 1)) },
      { label: 'Mută mai jos', icon: 'down', disabled: i >= count - 1, run: g(() => Editor.movePage(i, i + 1)) },
      { label: 'Inserează pagină goală după', icon: 'addpage', run: g(() => Editor.insertBlank(i + 1)) },
      '-',
      {
        label: 'Șterge pagina', icon: 'del', disabled: count <= 1,
        run: async () => { if (await UI.confirm(`Ștergi pagina ${i + 1}?`, 'Poți anula cu Ctrl+Z.', 'Șterge')) Pages.guard(() => Editor.deletePage(i)); },
      },
    ]);
  }

  return { build, refresh, setCurrent };
})();

// -----------------------------------------------------------------------------
// Search
// -----------------------------------------------------------------------------

const Search = (() => {
  let results = [];
  let index = -1;
  let timer = 0;

  function open() {
    document.getElementById('searchbar').classList.remove('hidden');
    document.getElementById('btn-search').classList.add('active');
    const input = document.getElementById('search-input');
    input.focus();
    input.select();
  }

  function close() {
    document.getElementById('searchbar').classList.add('hidden');
    document.getElementById('btn-search').classList.remove('active');
    results = [];
    index = -1;
    info();
    Pages.refreshAll();
  }

  function isOpen() {
    return !document.getElementById('searchbar').classList.contains('hidden');
  }

  function run(q) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        results = q.trim() ? Editor.doc.search(q.trim()) : [];
        // and the text read from scans
        if (q.trim() && typeof ImageText !== 'undefined') results = results.concat(ImageText.search(q.trim(), (p) => Editor.items(p), new Set(results.map((r) => r.page)))).sort((a, b) => a.page - b.page || a.rects[0].t - b.rects[0].t);
      } catch (e) {
        results = [];
      }
      index = results.length ? 0 : -1;
      info();
      Pages.refreshAll();
      go(0);
    }, 250);
  }

  function go(delta) {
    if (!results.length) return;
    index = (index + delta + results.length) % results.length;
    const r = results[index];
    Pages.scrollToRect(r.page, r.rects[0]);
    info();
    Pages.refreshAll();
  }

  function info() {
    const q = document.getElementById('search-input').value.trim();
    document.getElementById('search-info').textContent = !q ? '' : results.length ? `${index + 1} din ${results.length}` : 'Niciun rezultat';
  }

  function hitsFor(page) {
    if (!isOpen()) return [];
    return results.map((r, i) => ({ ...r, current: i === index })).filter((r) => r.page === page);
  }

  function init() {
    const input = document.getElementById('search-input');
    input.addEventListener('input', () => run(input.value));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') go(e.shiftKey ? -1 : 1);
      if (e.key === 'Escape') close();
    });
    document.getElementById('search-next').onclick = () => go(1);
    document.getElementById('search-prev').onclick = () => go(-1);
    document.getElementById('search-close').onclick = close;
  }

  function reset() {
    results = [];
    index = -1;
    if (isOpen()) run(document.getElementById('search-input').value);
  }

  return { init, open, close, isOpen, hitsFor, reset };
})();

// -----------------------------------------------------------------------------
// Signature dialog
// -----------------------------------------------------------------------------

const Signature = (() => {
  const KEY = 'pdfeditor.signatures';

  function saved() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 4))); } catch (e) {}
  }

  /** Returns {rgba, width, height, isSignature, url} or null. */
  function open() {
    return UI.modal((box, close) => {
      box.style.width = '572px';
      const pad = el('canvas', { class: 'sig-pad', width: 1040, height: 380 });
      const ctx = pad.getContext('2d');
      let ink = '#14213d';
      let strokes = [];
      let cur = null;
      const redraw = () => {
        ctx.clearRect(0, 0, pad.width, pad.height);
        ctx.strokeStyle = 'rgba(0,0,0,.12)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(48, 296); ctx.lineTo(992, 296); ctx.stroke();
        drawStrokes(ctx, strokes, ink, 2, 5.2);
        useBtn.disabled = !strokes.length;
      };
      const pos = (e) => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * (pad.width / r.width) / 2, y: (e.clientY - r.top) * (pad.height / r.height) / 2 }; };
      pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); redraw(); });
      pad.addEventListener('pointermove', (e) => { if (!cur) return; cur.push(pos(e)); redraw(); });
      pad.addEventListener('pointerup', () => { cur = null; });

      const inks = ['#14213d', '#111111', '#1c3faa'];
      const dots = inks.map((c) => {
        const b = el('button', { class: 'dot' + (c === ink ? ' active' : ''), html: `<i style="background:${c}"></i>` });
        b.onclick = () => { ink = c; dots.forEach((d) => d.classList.remove('active')); b.classList.add('active'); redraw(); };
        return b;
      });
      const clearBtn = el('button', { class: 'btn', html: svg('refresh') + ' Șterge', style: { display: 'flex', alignItems: 'center', gap: '6px' } });
      clearBtn.onclick = () => { strokes = []; redraw(); };
      const remember = el('input', { type: 'checkbox', checked: true });
      const useBtn = el('button', { class: 'btn primary', text: 'Folosește semnătura' });
      useBtn.onclick = async () => {
        const out = renderTrimmed(strokes, ink);
        if (!out) return;
        if (remember.checked) {
          const list = saved().filter((u) => u !== out.url);
          list.unshift(out.url);
          save(list);
        }
        close({ ...out, isSignature: true });
      };
      const fromFile = el('button', { class: 'btn', text: 'Din imagine…' });
      fromFile.onclick = async () => {
        const img = await App.pickImage();
        if (img) close({ ...img, isSignature: true });
      };

      const savedBox = el('div', { class: 'sig-saved' });
      const fillSaved = () => {
        savedBox.innerHTML = '';
        saved().forEach((url, i) => {
          const x = el('button', { class: 'x', html: svg('close'), title: 'Șterge' });
          x.onclick = (e) => { e.stopPropagation(); const l = saved(); l.splice(i, 1); save(l); fillSaved(); };
          const s = el('div', { class: 's', title: 'Folosește' }, [el('img', { src: url }), x]);
          s.onclick = async () => close({ ...(await decodeUrl(url)), url, isSignature: true });
          savedBox.append(s);
        });
      };
      fillSaved();

      box.append(...[
        el('h2', { text: 'Semnătură' }),
        el('p', { text: 'Semnează cu mouse-ul în chenarul de mai jos.' }),
        pad,
        el('div', { class: 'sig-row' }, [...dots, clearBtn, el('div', { class: 'spacer' }), el('label', { class: 'chk' }, [remember, 'Păstrează pentru data viitoare'])]),
        saved().length ? el('p', { text: 'Semnături salvate', style: { marginTop: '14px', marginBottom: '0' } }) : null,
        savedBox,
        el('div', { class: 'actions' }, [fromFile, el('div', { class: 'spacer' }), el('button', { class: 'btn', text: 'Anulează', onclick: () => close(null) }), useBtn]),
      ].filter(Boolean));
      redraw();
    });
  }

  function drawStrokes(ctx, strokes, color, scale, width) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width / scale * 1.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      if (!s.length) continue;
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length - 1; i++) {
        const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
        ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my);
      }
      ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderTrimmed(strokes, color) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const s of strokes) for (const p of s) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); }
    if (!isFinite(l)) return null;
    const pad = 6, k = 3;
    const w = Math.ceil((r - l + pad * 2) * k), h = Math.ceil((b - t + pad * 2) * k);
    const c = el('canvas', { width: w, height: h });
    const ctx = c.getContext('2d');
    ctx.translate(-(l - pad) * k, -(t - pad) * k);
    drawStrokes(ctx, strokes, color, k, 2.6 * k);
    const data = ctx.getImageData(0, 0, w, h);
    return { rgba: data.data, width: w, height: h, url: c.toDataURL('image/png') };
  }

  async function decodeUrl(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = el('canvas', { width: img.naturalWidth, height: img.naturalHeight });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { rgba: d.data, width: c.width, height: c.height };
  }

  return { open, decodeUrl };
})();
