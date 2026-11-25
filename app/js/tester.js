'use strict';
// Testers before the launch. An account marked as tester in the control panel gets a floating button over the whole
// app: it can be dragged out of the way (it stays where it was left), and a tap takes a screenshot of the app, lets
// the tester mark the problem on it with a finger, pick a category and describe it. The report goes to the panel,
// with what the app knows about itself (version, device, screen, the last errors).
const Tester = (() => {
  const POS = 'acm.tester.pos';
  const MARK = (uid) => 'acm.tester.' + uid;
  const CATS = {
    visual: ['Vizuală', [['layout', 'Aliniere / aspect'], ['text', 'Text / traducere / diacritice'], ['colors', 'Culori / temă întunecată'], ['animation', 'Animații / derulare'], ['other', 'Altceva vizual']]],
    technical: ['Tehnică', [['broken', 'Nu funcționează / eroare'], ['crash', 'Se blochează / se închide'], ['slow', 'Merge greu'], ['data', 'Date greșite sau pierdute'], ['sync', 'Sincronizare / cont'], ['other', 'Altceva tehnic']]],
    idea: ['Idee', [['idea', 'Sugestie']]],
  };
  const SEV = [['low', 'Mică'], ['medium', 'Medie'], ['high', 'Gravă']];
  const BUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8h-2.81a5.98 5.98 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17a6 6 0 0 0-2.83 0L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81A5.99 5.99 0 0 0 12 21a5.99 5.99 0 0 0 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/></svg>';

  let btn = null, on = false, busy = false;

  // ---------------------------------------------------------------- is this account a tester?
  async function check() {
    const u = Account.current && Account.current();
    if (!u) return set(false);
    try { if (localStorage.getItem(MARK(u.uid)) === '1') set(true); } catch (e) {}
    try {
      const { F: f, db } = Account.internals();
      const s = await f.firestore.getDoc(f.firestore.doc(db, 'testers', u.uid));
      const yes = s.exists() && s.data().active !== false;
      try { if (yes) localStorage.setItem(MARK(u.uid), '1'); else localStorage.removeItem(MARK(u.uid)); } catch (e) {}
      set(yes);
    } catch (e) { /* offline: what we knew */ }
  }
  function set(yes) {
    on = yes;
    if (yes && !btn) make();
    if (btn) btn.hidden = !yes || busy; // hidden while its own dialog is open
  }

  // ---------------------------------------------------------------- the floating button
  function load() { try { return JSON.parse(localStorage.getItem(POS)) || { side: 'r', y: 0.62 }; } catch (e) { return { side: 'r', y: 0.62 }; } }
  function place(p) {
    const s = 52, m = 10;
    const top = Math.round(Math.min(Math.max(p.y * innerHeight, 60), innerHeight - s - 90));
    btn.style.top = top + 'px';
    btn.style.left = p.side === 'l' ? m + 'px' : 'auto';
    btn.style.right = p.side === 'r' ? m + 'px' : 'auto';
  }
  function make() {
    btn = el('button', { class: 'tester-fab', type: 'button', 'aria-label': 'Raportează o problemă', title: 'Raportează o problemă (tester)' });
    btn.innerHTML = BUG;
    document.body.append(btn);
    let pos = load();
    place(pos);
    let start = null, moved = false;
    btn.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, l: btn.getBoundingClientRect().left, t: btn.getBoundingClientRect().top };
      moved = false;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 8) return;
      moved = true;
      btn.classList.add('drag');
      btn.style.left = Math.min(Math.max(start.l + dx, 0), innerWidth - 52) + 'px';
      btn.style.right = 'auto';
      btn.style.top = Math.min(Math.max(start.t + dy, 0), innerHeight - 52) + 'px';
    });
    const end = (e) => {
      if (!start) return;
      start = null;
      btn.classList.remove('drag');
      if (!moved) { report(); return; }
      // it sticks to the nearest side, where it was let go
      const r = btn.getBoundingClientRect();
      pos = { side: r.left + 26 < innerWidth / 2 ? 'l' : 'r', y: r.top / innerHeight };
      try { localStorage.setItem(POS, JSON.stringify(pos)); } catch (x) {}
      place(pos);
      e.preventDefault();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', () => { start = null; btn.classList.remove('drag'); place(pos); });
    addEventListener('resize', () => place(pos));
  }

  // ---------------------------------------------------------------- what the app knows about itself
  function where() {
    const top = [...document.querySelectorAll('#modal-root .modal h2')].pop();
    const editor = document.getElementById('home') && document.getElementById('home').classList.contains('hidden');
    const v = ['home', 'files', 'invoices', 'settings'].find((id) => { const n = document.getElementById('v-' + id); return n && !n.classList.contains('hidden'); });
    return [editor ? 'editor' : v || '?', top ? 'dialog: ' + top.textContent.slice(0, 40) : ''].filter(Boolean).join(' · ');
  }
  function meta() {
    let model = '', errors = [];
    try { if (window.AndroidBridge) model = JSON.parse(window.AndroidBridge.info()).model || ''; } catch (e) {}
    try { errors = JSON.parse(localStorage.getItem('acm.errlog') || '[]').slice(-25).map((x) => `${x.at} ${x.v || ''} ${x.e}`); } catch (e) {}
    let platform = Host.platform;
    try { if (window.AndroidBridge && JSON.parse(window.AndroidBridge.info()).platform === 'ios') platform = 'ios'; } catch (e) {}
    return {
      version: Host.appVersion(), platform, model: model || navigator.userAgent.slice(0, 120),
      screen: `${innerWidth}×${innerHeight}@${devicePixelRatio}`, view: where(), lang: (window.I18n && I18n.lang) || 'ro',
      theme: document.documentElement.dataset.theme || 'auto', online: navigator.onLine, errors,
    };
  }

  // ---------------------------------------------------------------- the screenshot, marked with a finger
  async function shoot() {
    btn.hidden = true;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let url = null;
    try { url = await Host.capture({ x: 0, y: 0, w: innerWidth, h: innerHeight, max: 1400 }); } catch (e) {}
    btn.hidden = !on;
    if (!url) return null;
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.onerror = r; img.src = url; });
    if (!img.naturalWidth) return null;
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function markable(c) {
    const x = c.getContext('2d');
    x.strokeStyle = '#ff2d55'; x.lineWidth = Math.max(4, c.width / 160); x.lineCap = 'round'; x.lineJoin = 'round';
    const at = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    let down = false;
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...at(e)); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => { if (!down) return; x.lineTo(...at(e)); x.stroke(); });
    c.addEventListener('pointerup', () => { down = false; });
  }

  // ---------------------------------------------------------------- the report
  async function report() {
    if (busy) return;
    busy = true;
    try {
      const canvas = await shoot();
      const clean = canvas ? (() => { const k = document.createElement('canvas'); k.width = canvas.width; k.height = canvas.height; k.getContext('2d').drawImage(canvas, 0, 0); return k; })() : null;
      if (canvas) markable(canvas);
      const info = meta();
      btn.hidden = true; // not over its own dialog
      await UI.modal((box, close) => {
        box.classList.add('tester-dlg');
        box.dataset.sticky = '1';
        let cat = 'visual', sub = 'layout', sev = 'medium';
        const chips = (list, get, setv) => {
          const row = el('div', { class: 'tester-chips' });
          const draw = () => {
            row.replaceChildren(...list().map(([id, label]) => el('button', { type: 'button', class: 'chip' + (get() === id ? ' on' : ''), text: label, onclick: () => { setv(id); draw(); redraw(); } })));
          };
          draw();
          return { row, draw };
        };
        let subs;
        const redraw = () => subs && subs.draw();
        const cats = chips(() => Object.entries(CATS).map(([id, [label]]) => [id, label]), () => cat, (v) => { cat = v; sub = CATS[v][1][0][0]; });
        subs = chips(() => CATS[cat][1], () => sub, (v) => { sub = v; });
        const sevs = chips(() => SEV, () => sev, (v) => { sev = v; });
        const text = el('textarea', { rows: '4', placeholder: 'Ce s-a întâmplat? Ce te așteptai să se întâmple? Pașii, dacă îi știi.' });
        const withShot = el('input', { type: 'checkbox', checked: true });
        const send = el('button', { class: 'btn primary', text: 'Trimite raportul' });
        send.addEventListener('click', async () => {
          if (text.value.trim().length < 3) { text.focus(); UI.toast('Scrie pe scurt care e problema.', { error: true }); return; }
          send.disabled = true; send.textContent = 'Se trimite…';
          try {
            const shot = canvas && withShot.checked ? canvas.toDataURL('image/jpeg', 0.82) : null;
            await Account.call('bugReport', { cat, sub, sev, text: text.value.trim(), meta: info, shot });
            close(true);
            UI.toast('Mulțumim! Raportul a ajuns.');
          } catch (e) {
            send.disabled = false; send.textContent = 'Trimite raportul';
            UI.toast(navigator.onLine ? 'Raportul nu a putut fi trimis: ' + (e.message || e) : 'Fără internet. Încearcă din nou când ai conexiune.', { error: true });
          }
        });
        box.append(
          el('h2', { text: 'Raportează o problemă' }),
          canvas ? el('div', { class: 'tester-shot' }, [
            canvas,
            el('div', { class: 'tester-shot-bar' }, [
              el('small', { class: 'muted', text: 'Încercuiește cu degetul (sau mouse-ul) ce nu e în regulă.' }),
              el('button', { type: 'button', class: 'btn small', text: 'Șterge marcajele', onclick: () => canvas.getContext('2d').drawImage(clean, 0, 0) }),
            ]),
            el('label', { class: 'tester-check' }, [withShot, el('span', { text: 'Trimite și captura de ecran' })]),
          ]) : el('p', { class: 'muted', text: 'Captura de ecran nu e disponibilă aici; descrie problema cât mai exact.' }),
          el('div', { class: 'tester-label', text: 'Tipul problemei' }), cats.row, subs.row,
          el('div', { class: 'tester-label', text: 'Cât de gravă e' }), sevs.row,
          el('div', { class: 'tester-label', text: 'Descriere' }), text,
          el('small', { class: 'muted tester-meta', text: `Se trimit automat: versiunea ${info.version || '?'}, ${info.platform}, ecranul ${info.screen}, unde erai (${info.view}) și ultimele erori ale aplicației.` }),
          el('div', { class: 'actions' }, [el('button', { class: 'btn', text: 'Renunță', onclick: () => close(false) }), send]),
        );
      });
    } finally { busy = false; if (btn) btn.hidden = !on; }
  }

  function start() {
    check();
    if (Account.onChange) Account.onChange(() => setTimeout(check, 1500));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(start, 3000));
  return { report, check };
})();
