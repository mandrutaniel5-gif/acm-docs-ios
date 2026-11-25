'use strict';
// ACM Docs control panel. Talks only to the server function "admin", which checks on every request
// that the caller holds the administrator right AND signed in with the authenticator app. The browser
// remembers the administrator: one sign-in (password + code) lasts 30 days, until Ieșire.
(() => {
  const F = window.__lib.firebase;
  const app = F.initializeApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: 'acm-docs-52280.firebaseapp.com', projectId: 'acm-docs-52280' }, 'control');
  const auth = F.auth.initializeAuth(app, { persistence: [F.auth.indexedDBLocalPersistence, F.auth.browserLocalPersistence] });
  const fns = F.functions.getFunctions(app, 'europe-west1');
  const adminFn = F.functions.httpsCallable(fns, 'admin', { timeout: 120000 });
  const root = document.getElementById('app');

  // ---------------------------------------------------------------- small helpers
  function h(tag, attrs, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v; // CSSOM: allowed by the page's strict CSP
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(kids || [])) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.firstChild.remove(); return n; };
  /** Empties the main area and puts the given nodes in it (null / false entries are skipped). */
  const fill = (...nodes) => clear(main).append(...nodes.filter((x) => x != null && x !== false));
  const dt = (t) => (t ? new Date(t).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
  const day = (t) => (t ? new Date(t).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');
  const MB = 1048576, GB = 1024 * MB;
  const size = (b) => (b >= GB ? (b / GB).toFixed(b % GB ? 2 : 0) + ' GB' : (b / MB).toFixed(b >= 10 * MB ? 0 : 1) + ' MB');
  const NAMES = { basic: 'Basic', personal: 'Personal', pro: 'Pro', family: 'Family', business: 'Business' };
  const ACT = { docs: 'Documente editate', scans: 'Scanări', invoices: 'Facturi', acmSend: '.acm trimise', acmOpen: '.acm deschise' };
  const FEAT = {
    signup: ['Conturi noi', 'Crearea de conturi noi în aplicație.'],
    signin: ['Conectare cu parola', 'Conectarea cu email și parolă. Dispozitivele deja conectate continuă.'],
    newDevice: ['Dispozitive noi', 'Adăugarea de dispozitive noi (parolă + 24 de cuvinte sau cod QR).'],
    sync: ['Sincronizare cloud', 'Încărcarea de date criptate în cloud. Datele existente rămân.'],
    docs: ['Editare documente', 'Salvarea documentelor editate (PDF, Word, Excel, PowerPoint).'],
    scans: ['Scanare', 'Scanarea documentelor.'],
    invoices: ['Facturi', 'Emiterea de facturi, proforme și oferte.'],
    acmSend: ['Trimitere .acm', 'Criptarea și trimiterea documentelor .acm.'],
    acmOpen: ['Deschidere .acm', 'Deschiderea documentelor .acm primite.'],
    payments: ['Plăți', 'Abonamente noi și schimbări de abonament.'],
    chat: ['Chat', 'Mesajele criptate (din versiunea 2.5.0).'],
  };
  const REASON = { spam: 'Spam', abuse: 'Abuz / hărțuire', fraud: 'Fraudă', impersonation: 'Se dă drept altcineva', illegal: 'Conținut ilegal', other: 'Altceva' };
  const KIND = { password: 'Parolă', create: 'Cont nou', 'device-first': 'Primul dispozitiv', 'device-new': 'Dispozitiv nou (parolă)', 'device-qr': 'Dispozitiv nou (QR)', session: 'Sesiune dispozitiv', admin: 'Panou de control' };
  const ERR = {
    'auth/invalid-credential': 'Email sau parolă greșită.', 'auth/wrong-password': 'Email sau parolă greșită.', 'auth/user-not-found': 'Email sau parolă greșită.',
    'auth/too-many-requests': 'Prea multe încercări. Așteaptă câteva minute.', 'auth/invalid-verification-code': 'Codul din aplicația de autentificare nu e corect.',
    'auth/email-already-in-use': 'Există deja un cont cu acest email.', 'auth/weak-password': 'Parola e prea slabă (minim 12 caractere recomandat).',
    'auth/requires-recent-login': 'Conectează-te din nou și reîncearcă.', 'auth/user-disabled': 'Contul este dezactivat.',
  };
  const say = (e) => ERR[e && e.code] || (e && e.message ? e.message.replace(/^Firebase: /, '') : String(e));

  function toast(msg, bad) {
    const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), bad ? 6000 : 2600);
  }
  /** A dialog with a body built by `build(box, close)`; resolves with what close() gets. */
  function dialog(build) {
    return new Promise((resolve) => {
      const box = h('div', { class: 'dlg', role: 'dialog' });
      const back = h('div', { class: 'dlg-back' }, [box]);
      const close = (v) => { back.remove(); resolve(v); };
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
      build(box, close);
      document.body.append(back);
      const f = box.querySelector('input,textarea,select'); if (f) f.focus();
    });
  }
  function confirmBox(title, text, okText, danger, withNote) {
    return dialog((box, close) => {
      const note = withNote ? h('textarea', { placeholder: withNote }) : null;
      box.append(h('h3', { text: title }), h('p', { text }), note,
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', text: 'Renunță', onclick: () => close(null) }),
          h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), text: okText, onclick: () => close({ note: note ? note.value : '' }) }),
        ]));
    });
  }
  async function call(op, data) {
    touch();
    try { return (await adminFn({ op, ...(data || {}) })).data; } catch (e) {
      const m = String(e.message || '');
      if (/admin sign in again|unauthenticated/.test(m) || e.code === 'functions/unauthenticated') { await F.auth.signOut(auth); gate('signin', 'Sesiunea a expirat. Conectează-te din nou.'); }
      throw e;
    }
  }
  async function act(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(say(e), true); return undefined; } finally { if (btn) btn.disabled = false; }
  }

  function touch() {}

  // ---------------------------------------------------------------- sign in / authenticator app
  function gate(kind, msg) {
    clear(root);
    const card = h('div', { class: 'gate-card' });
    root.append(h('div', { class: 'gate' }, [card]));
    const brand = h('div', { class: 'brand' }, [h('span', { class: 'brand-mark', text: 'ACM' }), 'ACM Docs · Control']);
    const err = h('div', { class: 'err', text: msg || '' });
    if (kind === 'signin') {
      const email = h('input', { type: 'email', autocomplete: 'username', required: true });
      const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
      const go = h('button', { class: 'btn primary block', type: 'submit', text: 'Continuă' });
      const form = h('form', {}, [h('label', { text: 'Email' }), email, h('label', { text: 'Parolă' }), pass, go, err]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); err.textContent = ''; go.disabled = true;
        try {
          await F.auth.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
          await enter();
        } catch (x) {
          if (x.code === 'auth/multi-factor-auth-required') return secondFactor(F.auth.getMultiFactorResolver(auth, x));
          err.textContent = say(x);
        } finally { go.disabled = false; }
      });
      card.append(brand, h('h1', { text: 'Conectare administrator' }), h('p', { text: 'Acces doar pentru administratorul ACM Docs. Fiecare conectare este trimisă pe email și înregistrată.' }), form,
        h('p', { class: 'sub' }, [h('button', { class: 'link', type: 'button', text: 'Creează contul de administrator', onclick: () => gate('create') })]));
    } else if (kind === 'create') {
      const email = h('input', { type: 'email', autocomplete: 'username', required: true });
      const pass = h('input', { type: 'password', autocomplete: 'new-password', minlength: '12', required: true });
      const go = h('button', { class: 'btn primary block', type: 'submit', text: 'Creează contul' });
      const form = h('form', {}, [h('label', { text: 'Email (separat de contul din aplicație)' }), email, h('label', { text: 'Parolă (minim 12 caractere)' }), pass, go, err]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); err.textContent = '';
        if (pass.value.length < 12) { err.textContent = 'Parola trebuie să aibă minim 12 caractere.'; return; }
        go.disabled = true;
        try {
          await F.auth.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
          await F.auth.signOut(auth);
          gate('made', email.value.trim());
        } catch (x) { err.textContent = say(x); } finally { go.disabled = false; }
      });
      card.append(brand, h('h1', { text: 'Cont de administrator' }), h('p', { text: 'Folosește un email care nu este cont în aplicația ACM Docs. Contul primește drepturile doar din GitHub.' }), form,
        h('p', { class: 'sub' }, [h('button', { class: 'link', type: 'button', text: 'Înapoi la conectare', onclick: () => gate('signin') })]));
    } else if (kind === 'made') {
      card.append(brand, h('h1', { text: 'Contul a fost creat' }),
        h('p', { text: 'Ca să devină administrator: GitHub → acm-docs-ios → Actions → Admin → Run workflow, alege „make-admin” și scrie emailul:' }),
        h('div', { class: 'secret', text: msg }),
        h('p', { text: 'După ce rulează, conectează-te aici. La prima conectare vei adăuga aplicația de autentificare.' }),
        h('button', { class: 'btn primary block', text: 'Mergi la conectare', onclick: () => gate('signin') }));
    } else if (kind === 'denied') {
      card.append(brand, h('h1', { text: 'Fără acces' }), h('p', { text: 'Acest cont nu are drept de administrator. Rulează în GitHub workflow-ul Admin cu „make-admin” pentru emailul lui, apoi conectează-te din nou.' }),
        h('button', { class: 'btn block', text: 'Înapoi', onclick: async () => { await F.auth.signOut(auth); gate('signin'); } }));
    }
  }

  function secondFactor(resolver) {
    const hint = resolver.hints.find((x) => x.factorId === 'totp');
    clear(root);
    const card = h('div', { class: 'gate-card' });
    root.append(h('div', { class: 'gate' }, [card]));
    const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', class: 'code-in', required: true });
    const err = h('div', { class: 'err' });
    const go = h('button', { class: 'btn primary block', type: 'submit', text: 'Verifică' });
    const form = h('form', {}, [h('label', { text: 'Codul din aplicația de autentificare' }), code, go, err]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; go.disabled = true;
      try {
        if (!hint) throw new Error('Contul nu are aplicație de autentificare.');
        await resolver.resolveSignIn(F.auth.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.value.trim()));
        await enter();
      } catch (x) { err.textContent = say(x); go.disabled = false; }
    });
    card.append(h('div', { class: 'brand' }, [h('span', { class: 'brand-mark', text: 'ACM' }), 'ACM Docs · Control']), h('h1', { text: 'Two-Factor Authentication' }), h('p', { text: 'Scrie codul de 6 cifre afișat acum în aplicația de autentificare.' }), form);
  }

  async function enrollTotp() {
    clear(root);
    const card = h('div', { class: 'gate-card' });
    root.append(h('div', { class: 'gate' }, [card]));
    const user = auth.currentUser;
    let secret;
    try { secret = await F.auth.TotpMultiFactorGenerator.generateSecret(await F.auth.multiFactor(user).getSession()); } catch (x) {
      card.append(h('h1', { text: 'Nu s-a putut porni configurarea' }), h('p', { text: say(x) }), h('button', { class: 'btn block', text: 'Înapoi', onclick: async () => { await F.auth.signOut(auth); gate('signin'); } }));
      return;
    }
    const url = secret.generateQrCodeUrl(user.email, 'ACM Docs Control');
    const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', class: 'code-in', required: true });
    const err = h('div', { class: 'err' });
    const go = h('button', { class: 'btn primary block', type: 'submit', text: 'Activează' });
    const form = h('form', {}, [h('label', { text: 'Codul afișat de aplicație' }), code, go, err]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; go.disabled = true;
      try {
        await F.auth.multiFactor(user).enroll(F.auth.TotpMultiFactorGenerator.assertionForEnrollment(secret, code.value.trim()), 'Authenticator');
        await F.auth.signOut(auth);
        gate('signin', 'Aplicația de autentificare a fost adăugată. Conectează-te din nou: parola, apoi codul.');
      } catch (x) { err.textContent = say(x); go.disabled = false; }
    });
    card.append(h('div', { class: 'brand' }, [h('span', { class: 'brand-mark', text: 'ACM' }), 'ACM Docs · Control']),
      h('h1', { text: 'Adaugă aplicația de autentificare' }),
      h('p', { text: 'Panoul de control cere obligatoriu Two-Factor Authentication. Scanează codul cu Google Authenticator, Microsoft Authenticator sau 1Password.' }),
      h('div', { class: 'qr', html: window.__lib.qr.svg(url) }), h('div', { class: 'secret', text: secret.secretKey }), form);
  }

  async function enter() {
    try { await call('whoami'); } catch (e) {
      const m = String(e.message || '');
      if (/admin needs totp/.test(m)) return enrollTotp();
      if (/not allowed|permission/.test(m)) return gate('denied');
      return gate('signin', say(e));
    }
    touch();
    shell();
  }

  // ---------------------------------------------------------------- the panel
  const ICON = {
    overview: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    accounts: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    switches: 'M17 7H7a5 5 0 0 0 0 10h10a5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
    reports: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
    promos: 'M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.84zM5.5 7A1.5 1.5 0 1 1 7 5.5 1.5 1.5 0 0 1 5.5 7z',
    stripe: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    anaf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h5v2H8v-2z',
    testers: 'M20 8h-2.81a5.98 5.98 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17a6 6 0 0 0-2.83 0L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81A5.99 5.99 0 0 0 12 21a5.99 5.99 0 0 0 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z',
    camera: 'M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8-3h-3.17L15 4H9L7.17 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-8 13a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z',
    log: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  };
  const VIEWS = [['overview', 'Prezentare'], ['accounts', 'Conturi'], ['switches', 'Kill switches'], ['testers', 'Testeri'], ['reports', 'Rapoarte'], ['promos', 'Promoții'], ['stripe', 'Stripe'], ['anaf', 'ANAF e-Factura'], ['log', 'Jurnal']];
  let main, nav, current = 'overview';
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  function shell() {
    clear(root);
    nav = h('nav', { class: 'nav' });
    for (const [id, label] of VIEWS) nav.append(h('button', { 'data-v': id, html: svg(ICON[id]) + `<span>${label}</span>`, onclick: () => show(id) }));
    main = h('main', { class: 'main' });
    root.append(h('div', { class: 'shell' }, [
      h('aside', { class: 'side' }, [
        h('div', { class: 'brand' }, [h('span', { class: 'brand-mark', text: 'ACM' }), 'Control']), nav,
        h('div', { class: 'side-foot' }, [h('div', { class: 'who', text: auth.currentUser.email }), h('button', { text: 'Ieșire', onclick: async () => { try { await call('signOut'); } catch (e) {} await F.auth.signOut(auth); gate('signin'); } })]),
      ]), main,
    ]));
    show('overview');
    call('bugReports', { status: 'new' }).then((x) => bugCount(x.length)).catch(() => {});
  }
  function show(id, arg) {
    current = id;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === id));
    fill(h('div', { class: 'sub', text: 'Se încarcă…' }));
    const run = { overview, accounts, testers, switches, reports, promos, stripe, anaf, log }[id];
    run(arg).catch((e) => { fill(h('div', { class: 'alert bad', text: say(e) })); });
  }
  function head(title, sub, right) {
    return h('div', { class: 'head' }, [h('div', {}, [h('h1', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null]), right || null]);
  }
  const table = (cols, rows, onRow) => {
    if (!rows.length) return h('div', { class: 'empty', text: 'Nimic de afișat.' });
    const tb = h('tbody');
    for (const r of rows) {
      const cell = (c) => (c == null ? '–' : typeof c === 'object' && 'node' in c ? c.node || '' : typeof c === 'object' && 'text' in c ? String(c.text) : String(c));
      const tr = h('tr', { class: onRow ? 'click' : '' }, r.cells.map((c) => h('td', {}, [cell(c)])));
      if (onRow) tr.addEventListener('click', (e) => { if (!e.target.closest('button')) onRow(r); });
      tb.append(tr);
    }
    return h('div', { class: 'tbl-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, cols.map((c) => h('th', { text: c })))]), tb])]);
  };
  const pill = (text, kind) => h('span', { class: 'pill ' + (kind || ''), text });
  const meter = (used, limit) => { const p = limit ? Math.min(100, (used / limit) * 100) : 0; return h('div', { class: 'meter' + (p >= 100 ? ' full' : p >= 80 ? ' high' : '') }, [h('i', { style: `width:${p.toFixed(1)}%` })]); };
  const who = (r) => (r.handle ? '@' + r.handle : '') + (r.email ? (r.handle ? ' · ' : '') + r.email : '') || r.uid;

  // ---------------------------------------------------------------- overview
  async function overview() {
    const o = await call('overview');
    const paused = o.switches.all ? 'Tot serviciul este oprit (mentenanță).' : Object.keys(o.switches.off).length ? 'Funcții oprite: ' + Object.keys(o.switches.off).map((k) => FEAT[k] ? FEAT[k][0] : k).join(', ') : null;
    const total = Object.values(o.byPlan).reduce((a, b) => a + b, 0) || 1;
    const ANOM = { 'cloud-over': 'Cloud peste limită', 'cloud-high': 'Cloud aproape plin', reports: 'Raportat de mai multe ori', suspended: 'Suspendat' };
    const rcount = nav.querySelector('[data-v=reports]');
    rcount.querySelector('.count') && rcount.querySelector('.count').remove();
    if (o.openReports) rcount.append(h('span', { class: 'count', text: String(o.openReports) }));
    fill(
      head('Prezentare', 'Starea serviciului ACM Docs acum'),
      paused ? h('div', { class: 'alert bad', text: paused }) : h('div', { class: 'alert ok', text: 'Toate funcțiile sunt pornite.' }),
      h('div', { class: 'grid' }, [
        h('div', { class: 'stat' }, [h('b', { text: String(o.accounts) }), h('span', { text: 'conturi' })]),
        h('div', { class: 'stat' }, [h('b', { text: String(o.new7) }), h('span', { text: 'noi în 7 zile' })]),
        h('div', { class: 'stat' }, [h('b', { text: String(o.new30) }), h('span', { text: 'noi în 30 de zile' })]),
        h('div', { class: 'stat' }, [h('b', { text: String(o.active30) }), h('span', { text: 'active în 30 de zile' })]),
        h('div', { class: 'stat' }, [h('b', { text: String(o.openReports) }), h('span', { text: 'rapoarte deschise' })]),
      ]),
      h('div', { class: 'cols' }, [
        h('div', { class: 'card' }, [h('h2', { text: 'Conturi pe planuri' }), h('div', { class: 'bars' }, Object.entries(o.byPlan).map(([p, n]) => h('div', { class: 'bar' }, [h('span', { text: NAMES[p] }), meter(n, total), h('span', { class: 'num', text: String(n) })])))]),
        h('div', { class: 'card' }, [h('h2', { text: 'Plăți' }), h('dl', { class: 'kv' }, [
          h('dt', { text: 'Stripe' }), h('dd', {}, [o.stripe.active ? pill(o.stripe.mode === 'live' ? 'Live' : 'Test', o.stripe.mode === 'live' ? 'ok' : 'warn') : pill('Neconfigurat', 'bad')]),
          h('dt', { text: 'Webhook' }), h('dd', {}, [o.stripe.webhook ? pill('Activ', 'ok') : pill('Lipsă', 'bad')]),
          h('dt', { text: 'Taxe automate' }), h('dd', { text: o.stripe.tax ? 'Da' : 'Nu' }),
        ])]),
      ]),
      h('div', { class: 'card' }, [h('h2', { text: 'Anomalii' }), table(['Tip', 'Cont', 'Detalii'], o.anomalies.map((a) => ({
        uid: a.uid, cells: [{ node: pill(ANOM[a.kind] || a.kind, a.kind === 'cloud-high' ? 'warn' : 'bad') }, who(a),
          a.kind.startsWith('cloud') ? `${size(a.used)} / ${size(a.limit)} · ${NAMES[a.plan] || a.plan}` : a.kind === 'reports' ? `${a.count} rapoarte deschise` : ''],
      })), (r) => show('accounts', r.uid))]),
    );
  }

  // ---------------------------------------------------------------- accounts
  async function accounts(uid) {
    if (uid) return accountView(uid);
    const q = h('input', { type: 'search', placeholder: 'Email, @nume sau ID de cont' });
    const out = h('div', {}, [h('div', { class: 'sub', text: 'Se încarcă…' })]);
    const run = async () => {
      clear(out).append(h('div', { class: 'sub', text: 'Se caută…' }));
      try {
        const rows = await call('search', { q: q.value });
        clear(out).append(table(['Cont', 'Plan', 'Creat', 'Ultima conectare', 'Stare'], rows.map((r) => ({
          uid: r.uid, cells: [who(r), NAMES[r.plan] || r.plan, day(r.created), dt(r.lastSignIn), { node: r.disabled ? pill('Suspendat', 'bad') : r.verified ? pill('Activ', 'ok') : pill('Email neconfirmat', 'warn') }],
        })), (r) => show('accounts', r.uid)));
      } catch (e) { clear(out).append(h('div', { class: 'alert bad', text: say(e) })); }
    };
    const form = h('form', { class: 'row' }, [q, h('button', { class: 'btn primary', type: 'submit', text: 'Caută' })]);
    form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    fill(head('Conturi', 'Fără căutare: ultimele 50 de conturi create'), h('div', { class: 'card' }, [form]), h('div', { class: 'card' }, [out]));
    run();
  }

  async function accountView(uid) {
    const a = await call('account', { uid });
    const u = a.user;
    const back = h('button', { class: 'btn', text: '← Conturi', onclick: () => show('accounts') });
    // plan
    const planSel = h('select', {}, ['pro', 'personal', 'basic'].map((p) => h('option', { value: p, text: NAMES[p] + (p === 'basic' ? ' (scoate planul manual)' : '') })));
    const days = h('input', { type: 'number', min: '1', max: '3650', value: '365' });
    const note = h('input', { type: 'text', maxlength: '200', placeholder: 'ex. familie, prieten, tester' });
    const force = h('input', { type: 'checkbox' });
    const apply = h('button', { class: 'btn primary', text: 'Aplică' });
    apply.addEventListener('click', () => act(apply, async () => {
      await call('setPlan', { uid, plan: planSel.value, days: Number(days.value), note: note.value, force: force.checked });
      toast('Planul a fost actualizat.'); show('accounts', uid);
    }));
    const suspendBtn = h('button', { class: 'btn ' + (u.disabled ? 'primary' : 'danger'), text: u.disabled ? 'Ridică suspendarea' : 'Suspendă contul' });
    suspendBtn.addEventListener('click', async () => {
      const r = u.disabled ? await confirmBox('Ridici suspendarea?', 'Contul se va putea conecta din nou, cu datele lui neatinse.', 'Ridică suspendarea')
        : await confirmBox('Suspenzi contul?', 'Contul nu se mai poate conecta și nu mai poate folosi aplicația până ridici suspendarea. Datele lui criptate rămân neatinse.', 'Suspendă', true, 'Motivul (rămâne în jurnal)');
      if (!r) return;
      act(suspendBtn, async () => { await call('suspend', { uid, on: !u.disabled, reason: r.note }); toast('Gata.'); show('accounts', uid); });
    });
    const testerBtn = h('button', { class: 'btn small ' + (a.tester ? 'danger' : 'primary'), text: a.tester ? 'Scoate din testeri' : 'Fă tester' });
    testerBtn.addEventListener('click', async () => {
      if (!a.tester) return makeTester(uid, testerBtn);
      if (!(await confirmBox('Scoți testerul?', 'Butonul de raportare dispare din aplicația lui. Rapoartele trimise rămân.', 'Scoate', true))) return;
      act(testerBtn, async () => { await call('setTester', { uid, on: false }); toast('Gata.'); show('accounts', uid); });
    });
    const devRows = a.devices.map((v) => {
      const b = v.status === 'active' ? h('button', { class: 'btn small danger', text: 'Blochează' }) : null;
      if (b) b.addEventListener('click', async () => {
        if (!(await confirmBox('Blochezi dispozitivul?', 'Dispozitivul se deconectează și uită cheile contului. Proprietarul îl poate adăuga din nou doar cu parola și cele 24 de cuvinte sau prin cod QR.', 'Blochează', true))) return;
        act(b, async () => { await call('blockDevice', { uid, dev: v.id }); toast('Dispozitiv blocat.'); show('accounts', uid); });
      });
      return { cells: [{ node: h('span', { class: 'mono', text: v.id.slice(0, 8) }) }, v.role === 'primary' ? 'Principal' : 'Membru', { node: pill(v.status === 'active' ? 'Activ' : v.status === 'blocked' ? 'Blocat' : 'Scos', v.status === 'active' ? 'ok' : 'bad') }, v.via || '–', day(v.created), dt(v.lastSeen), { node: h('span', { class: 'mono', text: v.ip || '–' }) }, v.agent || '–', { node: b }] };
    });
    fill(
      head(u.handle ? '@' + u.handle : u.email || u.uid, u.email || '', back),
      u.disabled ? h('div', { class: 'alert bad', text: 'Cont suspendat' + (a.billing.suspended && a.billing.suspended.reason ? ': ' + a.billing.suspended.reason : '') }) : null,
      h('div', { class: 'cols' }, [
        h('div', { class: 'card' }, [h('h2', {}, ['Cont', suspendBtn]), h('dl', { class: 'kv' }, [
          h('dt', { text: 'ID' }), h('dd', { class: 'mono', text: u.uid }),
          h('dt', { text: 'Email' }), h('dd', {}, [u.email || '–', ' ', u.verified ? pill('confirmat', 'ok') : pill('neconfirmat', 'warn')]),
          h('dt', { text: 'Nume afișat' }), h('dd', { text: u.name || '–' }),
          h('dt', { text: 'Creat' }), h('dd', { text: dt(u.created) }),
          h('dt', { text: 'Ultima conectare' }), h('dd', { text: dt(u.lastSignIn) }),
          h('dt', { text: 'Cod pe email' }), h('dd', {}, [a.security.emailCode ? pill('Activ', 'ok') : pill('Oprit', 'warn')]),
          h('dt', { text: 'Aplicație 2FA' }), h('dd', {}, [a.security.totp ? pill('Activă', 'ok') : pill('Nu', '')]),
          h('dt', { text: 'Rapoarte trimise' }), h('dd', { text: String(a.reportsBy) }),
          h('dt', { text: 'Tester' }), h('dd', {}, [testerBtn]),
        ])]),
        h('div', { class: 'card' }, [h('h2', { text: 'Plan' }), h('dl', { class: 'kv' }, [
          h('dt', { text: 'Plan' }), h('dd', {}, [pill(NAMES[a.plan.plan], a.plan.plan === 'basic' ? '' : 'acc')]),
          h('dt', { text: 'Sursă' }), h('dd', { text: { stripe: 'Stripe', manual: 'Manual' + (a.billing.note ? ' · ' + a.billing.note : ''), group: 'Grup (Family / Business)' }[a.plan.source] || '–' }),
          h('dt', { text: 'Până pe' }), h('dd', { text: a.plan.until ? day(a.plan.until) : '–' }),
          h('dt', { text: 'Perioadă' }), h('dd', { text: a.plan.period === 'year' ? 'Anual' : a.plan.period === 'month' ? 'Lunar' : '–' }),
          a.billing.customer ? h('dt', { text: 'Client Stripe' }) : null, a.billing.customer ? h('dd', { class: 'mono', text: a.billing.customer }) : null,
        ]),
        h('label', { text: 'Plan manual (familie, prieteni)' }), h('div', { class: 'row' }, [planSel, days, apply]), h('label', { text: 'Notă' }), note,
        a.billing.source === 'stripe' ? h('label', { class: 'check' }, [force, 'Înlocuiește abonamentul plătit prin Stripe']) : null]),
      ]),
      h('div', { class: 'card' }, [h('h2', { text: 'Utilizare luna aceasta' }), h('div', { class: 'bars' }, [
        ...Object.entries(a.usage).map(([k, v]) => h('div', { class: 'bar' }, [h('span', { text: ACT[k] }), meter(v.used, v.limit), h('span', { class: 'num', text: `${v.used}/${v.limit}` })])),
        h('div', { class: 'bar' }, [h('span', { text: 'Cloud' }), meter(a.cloud.used || 0, a.cloud.limit || 1), h('span', { class: 'num', text: size(a.cloud.used || 0) })]),
      ]), h('div', { class: 'sub', text: `Cloud: ${size(a.cloud.used || 0)} din ${size(a.cloud.limit || 0)}` })]),
      h('div', { class: 'card' }, [h('h2', { text: 'Dispozitive' }), table(['ID', 'Rol', 'Stare', 'Adăugat prin', 'Adăugat', 'Ultima activitate', 'IP', 'Aplicație', ''], devRows)]),
      h('div', { class: 'card' }, [h('h2', { text: 'Conectări (ultimele 90 de zile)' }), table(['Data', 'Tip', 'IP', 'Aplicație', 'Dispozitiv'], a.signins.map((s) => ({ cells: [dt(s.at), KIND[s.kind] || s.kind, { node: h('span', { class: 'mono', text: s.ip || '–' }) }, s.agent || '–', s.dev ? { node: h('span', { class: 'mono', text: s.dev.slice(0, 8) }) } : '–'] })))]),
      h('div', { class: 'card' }, [h('h2', { text: 'Rapoarte despre acest cont' }), table(['Data', 'Motiv', 'Detalii', 'Stare'], a.reportsOn.map((r) => ({ cells: [dt(r.at), REASON[r.reason] || r.reason, r.details || '–', { node: pill(r.status, r.status === 'open' ? 'warn' : '') }] })))]),
    );
  }

  // ---------------------------------------------------------------- testers (before the launch)
  const BCAT = { visual: ['Vizuală', 'vis'], technical: ['Tehnică', 'tech'], idea: ['Idee', 'idea'] };
  const BSUB = { layout: 'Aliniere / aspect', text: 'Text / traducere', colors: 'Culori / temă', animation: 'Animații / derulare', other: 'Altceva', broken: 'Nu funcționează', crash: 'Se blochează', slow: 'Merge greu', data: 'Date greșite / pierdute', sync: 'Sincronizare / cont', idea: 'Sugestie' };
  const BSEV = { low: ['Mică', ''], medium: ['Medie', 'warn'], high: ['Gravă', 'bad'] };
  const BST = [['new', 'Noi'], ['working', 'În lucru'], ['fixed', 'Rezolvate'], ['wontfix', 'Nu se repară'], ['all', 'Toate']];
  const PLAT = { ios: 'iPhone / iPad', android: 'Android', electron: 'Windows', web: 'Browser' };
  function bugCount(n) {
    const b = nav && nav.querySelector('[data-v=testers]');
    if (!b) return;
    b.querySelector('.count') && b.querySelector('.count').remove();
    if (n) b.append(h('span', { class: 'count', text: String(n) }));
  }
  async function testers(status) {
    status = status || 'new';
    const [rows, list, fresh] = await Promise.all([call('bugReports', { status: status === 'all' ? null : status }), call('testers'), status === 'new' ? null : call('bugReports', { status: 'new' })]);
    bugCount((fresh || rows).length);
    const tabs = h('div', { class: 'tabs' }, BST.map(([k, l]) => h('button', { class: k === status ? 'on' : '', text: l, onclick: () => show('testers', k) })));
    const cards = rows.length ? h('div', { class: 'bugs' }, rows.map((r) => {
      const [cl, ck] = BCAT[r.cat] || [r.cat, ''];
      const [sl, sk] = BSEV[r.sev] || ['–', ''];
      return h('button', { class: 'bug', onclick: () => bugView(r, status) }, [
        h('div', { class: 'bug-top' }, [h('span', { class: 'tag ' + ck, text: cl }), h('span', { class: 'bug-sub', text: BSUB[r.sub] || r.sub }), sk ? pill(sl, sk) : null, r.shot ? h('span', { class: 'bug-cam', title: 'Are captură de ecran', html: svg(ICON.camera) }) : null]),
        h('p', { class: 'bug-text', text: r.text }),
        h('div', { class: 'bug-foot' }, [
          h('span', { text: r.handle ? '@' + r.handle : r.from.slice(0, 8) }),
          h('span', { text: [PLAT[r.meta && r.meta.platform] || (r.meta && r.meta.platform), r.meta && r.meta.version].filter(Boolean).join(' · ') }),
          h('span', { text: dt(r.at) }),
        ]),
      ]);
    })) : h('div', { class: 'card' }, [h('div', { class: 'empty', text: status === 'new' ? 'Niciun raport nou. 🎉' : 'Nimic de afișat.' })]);

    // the testers themselves
    const q = h('input', { type: 'search', placeholder: 'Adaugă un tester: email, @nume sau ID de cont' });
    const found = h('div');
    const addForm = h('form', { class: 'row' }, [q, h('button', { class: 'btn primary', type: 'submit', text: 'Caută' })]);
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      act(addForm.querySelector('button'), async () => {
        const res = await call('search', { q: q.value });
        clear(found).append(table(['Cont', 'Plan', ''], res.slice(0, 8).map((r) => {
          const mine = list.some((t) => t.uid === r.uid);
          const b = mine ? pill('Deja tester', 'acc') : h('button', { class: 'btn small primary', text: 'Fă tester', onclick: () => makeTester(r.uid, b) });
          return { cells: [who(r), NAMES[r.plan] || r.plan, { node: b }] };
        })));
      });
    });
    const people = table(['Tester', 'Din', 'Rapoarte', 'Ultimul raport', ''], list.map((t) => {
      const rm = h('button', { class: 'btn small danger', text: 'Scoate' });
      rm.addEventListener('click', async () => {
        if (!(await confirmBox('Scoți testerul?', 'Butonul de raportare dispare din aplicația lui. Rapoartele trimise rămân.', 'Scoate', true))) return;
        act(rm, async () => { await call('setTester', { uid: t.uid, on: false }); toast('Gata.'); show('testers', status); });
      });
      return { uid: t.uid, cells: [(t.name ? t.name + ' · ' : '') + (t.handle ? '@' + t.handle : t.uid.slice(0, 10)), day(t.since), String(t.reports), t.lastReport ? dt(t.lastReport) : '–', { node: rm }] };
    }), (r) => show('accounts', r.uid));

    fill(
      head('Testeri', 'Rapoartele trimise din aplicație cu butonul plutitor', tabs),
      h('div', { class: 'grid' }, [
        stat(String((fresh || rows).length), 'rapoarte noi', 'bad'),
        stat(String(list.length), 'testeri', 'acc'),
        stat(String(list.reduce((a, t) => a + (t.reports || 0), 0)), 'rapoarte în total', 'ok'),
      ]),
      cards,
      h('div', { class: 'card' }, [h('h2', { text: 'Testeri' }), h('div', { class: 'sub', text: 'Un tester vede în aplicație un buton plutitor: captură de ecran, categorie și descriere, trimise aici.' }), addForm, found, people]),
    );
  }
  async function makeTester(uid, btn) {
    const r = await dialog((box, close) => {
      const give = h('input', { type: 'checkbox', checked: true });
      const days = h('input', { type: 'number', min: '1', max: '3650', value: '90' });
      box.append(h('h3', { text: 'Faci contul tester?' }),
        h('p', { text: 'În aplicație apare butonul plutitor de raportare (la următoarea pornire sau revenire în aplicație).' }),
        h('label', { class: 'check' }, [give, 'Dă-i și planul Pro gratuit, ca să poată testa tot']),
        h('label', { text: 'Pentru câte zile' }), days,
        h('div', { class: 'actions' }, [h('button', { class: 'btn', text: 'Renunță', onclick: () => close(null) }), h('button', { class: 'btn primary', text: 'Fă tester', onclick: () => close({ pro: give.checked, days: Number(days.value) || 90 }) })]));
    });
    if (!r) return false;
    return act(btn, async () => {
      await call('setTester', { uid, on: true });
      if (r.pro) { try { await call('setPlan', { uid, plan: 'pro', days: r.days, note: 'tester' }); } catch (e) { toast('Tester adăugat, dar planul nu: ' + say(e), true); } }
      toast('Contul este tester.');
      show(current === 'accounts' ? 'accounts' : 'testers', current === 'accounts' ? uid : undefined);
      return true;
    });
  }
  async function bugView(r, back) {
    const shotBox = h('div', { class: 'bug-shot' }, [r.shot ? h('div', { class: 'sub', text: 'Se încarcă captura…' }) : h('div', { class: 'sub', text: 'Fără captură de ecran.' })]);
    const m = r.meta || {};
    const [cl, ck] = BCAT[r.cat] || [r.cat, ''];
    const note = h('textarea', { placeholder: 'Notă (ce s-a făcut, în ce versiune)' });
    note.value = r.note || '';
    const done = dialog((box, close) => {
      box.classList.add('wide');
      const stBtns = h('div', { class: 'tabs' }, BST.filter(([k]) => k !== 'all').map(([k, l]) => h('button', { class: r.status === k ? 'on' : '', text: l, onclick: (e) => act(e.currentTarget, async () => { await call('bugStatus', { id: r.id, status: k, note: note.value }); toast('Salvat.'); close(true); }) })));
      const del = h('button', { class: 'btn danger', text: 'Șterge raportul' });
      del.addEventListener('click', async () => { if (await confirmBox('Ștergi raportul?', 'Raportul și captura lui dispar definitiv.', 'Șterge', true)) act(del, async () => { await call('bugDelete', { id: r.id }); close(true); }); });
      box.append(...[
        h('div', { class: 'bug-top' }, [h('span', { class: 'tag ' + ck, text: cl }), h('span', { class: 'bug-sub', text: BSUB[r.sub] || r.sub }), pill((BSEV[r.sev] || ['–'])[0], (BSEV[r.sev] || ['', ''])[1])]),
        h('p', { class: 'bug-full', text: r.text }),
        shotBox,
        h('dl', { class: 'kv' }, [
          h('dt', { text: 'Tester' }), h('dd', {}, [h('button', { class: 'link', text: (r.name ? r.name + ' · ' : '') + (r.handle ? '@' + r.handle : r.from), onclick: () => { close(false); show('accounts', r.from); } })]),
          h('dt', { text: 'Trimis' }), h('dd', { text: dt(r.at) }),
          h('dt', { text: 'Aplicație' }), h('dd', { text: [PLAT[m.platform] || m.platform, m.version].filter(Boolean).join(' · ') || '–' }),
          h('dt', { text: 'Dispozitiv' }), h('dd', { text: m.model || '–' }),
          h('dt', { text: 'Ecran' }), h('dd', { text: [m.screen, m.theme, m.lang, m.online === false ? 'fără internet' : null].filter(Boolean).join(' · ') || '–' }),
          h('dt', { text: 'Unde era' }), h('dd', { text: m.view || '–' }),
        ]),
        (m.errors || []).length ? h('details', { class: 'errs' }, [h('summary', { text: `Ultimele erori ale aplicației (${m.errors.length})` }), h('pre', { text: m.errors.join('\n\n') })]) : null,
        h('label', { text: 'Stare' }), stBtns, note,
        h('div', { class: 'actions' }, [del, h('span', { style: 'flex:1' }), h('button', { class: 'btn', text: 'Închide', onclick: () => close(false) })]),
      ].filter(Boolean));
    });
    if (r.shot) {
      call('bugShot', { id: r.id }).then((x) => {
        clear(shotBox);
        if (!x.shot) { shotBox.append(h('div', { class: 'sub', text: 'Captura nu mai există.' })); return; }
        const img = h('img', { src: x.shot, alt: 'Captura de ecran a testerului' });
        img.addEventListener('click', () => { const w = window.open(); if (w) { w.opener = null; w.document.title = 'Captură'; const i = w.document.createElement('img'); i.src = x.shot; i.style.maxWidth = '100%'; w.document.body.append(i); } });
        shotBox.append(img);
      }).catch((e) => { clear(shotBox).append(h('div', { class: 'sub', text: say(e) })); });
    }
    if (await done) show('testers', back);
  }
  const stat = (n, label, kind) => h('div', { class: 'stat ' + (kind || '') }, [h('b', { text: n }), h('span', { text: label })]);

  // ---------------------------------------------------------------- kill switches
  async function switches() {
    const s = await call('switches');
    const boxes = {};
    const all = h('input', { type: 'checkbox', checked: !s.all });
    const list = h('div', {}, Object.entries(FEAT).map(([k, [name, desc]]) => {
      boxes[k] = h('input', { type: 'checkbox', checked: !s.off[k], 'aria-label': name });
      return h('div', { class: 'sw' }, [h('div', { class: 'tx' }, [h('b', { text: name }), h('small', { text: desc })]), h('span', { class: 'toggle' }, [boxes[k], h('span')])]);
    }));
    const msg = h('textarea', { maxlength: '300', placeholder: 'ex. Lucrăm la o actualizare de securitate. Revenim în câteva minute.' });
    msg.value = s.msg || '';
    // "a new version is out": a note in the apps installed outside a store
    const vers = {};
    const verRow = (k, name) => {
      const cur = (s.latest && s.latest[k]) || {};
      vers[k] = { v: h('input', { placeholder: name + ': versiune, ex. 2.6.5', value: cur.v || '' }), url: h('input', { placeholder: 'Link de descărcare (https://…)', value: cur.url || '' }) };
      return h('div', { class: 'field' }, [vers[k].v, vers[k].url]);
    };
    const verBox = h('div', { class: 'card' }, [h('h2', { text: 'Versiune nouă' }), h('div', { class: 'sub', text: 'Dacă aplicația instalată e mai veche, utilizatorul vede o dată un anunț cu linkul de descărcare.' }), verRow('win', 'Windows'), verRow('android', 'Android'), verRow('ios', 'iOS')]);
    const save = h('button', { class: 'btn primary', text: 'Salvează' });
    save.addEventListener('click', async () => {
      const off = {}; for (const k of Object.keys(boxes)) if (!boxes[k].checked) off[k] = true;
      const stopping = !all.checked || Object.keys(off).length;
      if (stopping && !(await confirmBox('Aplici modificările?', !all.checked ? 'Tot serviciul se oprește pentru toți utilizatorii, în câteva secunde.' : 'Funcțiile oprite nu mai pot fi folosite de nimeni până le pornești din nou.', 'Aplică', true))) return;
      act(save, async () => { await call('switches.set', { off, all: !all.checked, msg: msg.value, latest: Object.fromEntries(Object.entries(vers).map(([k, x]) => [k, { v: x.v.value.trim(), url: x.url.value.trim() }])) }); toast('Salvat. Se aplică în cel mult 15 secunde.'); show('switches'); });
    });
    fill(
      head('Kill switches', 'Verde = pornit · Roșu = oprit. Se aplică pe server, în toate aplicațiile, în cel mult 15 secunde.'),
      s.all ? h('div', { class: 'alert bad', text: 'Mentenanță: tot serviciul este oprit.' }) : Object.keys(s.off).length ? h('div', { class: 'alert warn', text: 'Unele funcții sunt oprite.' }) : null,
      h('div', { class: 'card' }, [h('div', { class: 'sw' }, [h('div', { class: 'tx' }, [h('b', { text: 'Tot serviciul' }), h('small', { text: 'Oprit = mentenanță: nicio conectare, sesiune sau acțiune. Pentru atacuri în desfășurare.' })]), h('span', { class: 'toggle' }, [all, h('span')])])]),
      h('div', { class: 'card' }, [list]),
      verBox,
      h('div', { class: 'card' }, [h('h2', { text: 'Mesaj pentru utilizatori' }), h('div', { class: 'sub', text: 'Apare în aplicație cât timp ceva este oprit.' }), msg, h('div', { class: 'row' }, [h('div', { class: 'sub', text: s.at ? 'Ultima schimbare: ' + dt(s.at) : '' }), save])]),
    );
  }

  // ---------------------------------------------------------------- reports
  async function reports(status) {
    status = status || 'open';
    const rows = await call('reports', { status });
    const tabs = h('div', { class: 'tabs' }, [['open', 'Deschise'], ['resolved', 'Rezolvate'], ['dismissed', 'Respinse']].map(([k, l]) => h('button', { class: k === status ? 'on' : '', text: l, onclick: () => show('reports', k) })));
    fill(head('Rapoarte', 'Conturi raportate de alți utilizatori', tabs), h('div', { class: 'card' }, [table(['Data', 'Cont raportat', 'Motiv', 'Detalii', 'Raportat de', ''], rows.map((r) => {
      const actions = h('span', { class: 'row' });
      if (r.status === 'open') {
        for (const [st, label] of [['resolved', 'Rezolvat'], ['dismissed', 'Respinge']]) {
          const b = h('button', { class: 'btn small', text: label });
          b.addEventListener('click', async () => {
            const c = await confirmBox(label + '?', 'Raportul se mută în „' + (st === 'resolved' ? 'Rezolvate' : 'Respinse') + '”.', label, false, 'Notă (opțional)');
            if (c) act(b, async () => { await call('resolveReport', { id: r.id, status: st, note: c.note }); show('reports', status); });
          });
          actions.append(b);
        }
      } else if (r.note) actions.append(h('span', { class: 'sub', text: r.note }));
      return { uid: r.target, cells: ['' + dt(r.at), '@' + r.handle, REASON[r.reason] || r.reason, r.details || '–', r.fromHandle ? '@' + r.fromHandle : '–', { node: actions }] };
    }), (r) => show('accounts', r.uid))]));
  }

  // ---------------------------------------------------------------- promotions
  async function promos() {
    const list = await call('promos');
    const add = h('button', { class: 'btn primary', text: 'Promoție nouă', onclick: () => promoForm(null) });
    fill(head('Promoții', 'Reduceri și perioade de probă, aplicate automat la plata abonamentelor', add),
      h('div', { class: 'card' }, [table(['Titlu', 'Tip', 'Planuri', 'Interval', 'Folosiri', 'Stare', ''], list.map((p) => {
        const live = p.active && (p.start || 0) <= Date.now() && (!p.end || p.end > Date.now());
        const edit = h('button', { class: 'btn small', text: 'Editează', onclick: () => promoForm(p) });
        const del = h('button', { class: 'btn small danger', text: 'Șterge' });
        del.addEventListener('click', async () => { if (await confirmBox('Ștergi promoția?', p.title, 'Șterge', true)) act(del, async () => { await call('deletePromo', { id: p.id }); show('promos'); }); });
        return { cells: [p.title, p.kind === 'trial' ? `${p.trialDays} zile de probă` : `-${p.percent}% ` + (p.months === -1 ? 'permanent' : p.months > 0 ? `${p.months} luni` : 'prima plată'),
          p.plans.map((x) => NAMES[x]).join(', ') + ' · ' + p.periods.map((x) => (x === 'year' ? 'anual' : 'lunar')).join(', '),
          `${day(p.start)} → ${p.end ? day(p.end) : 'fără sfârșit'}`, `${p.used || 0}${p.maxUses ? ' / ' + p.maxUses : ''}`,
          { node: live ? pill('Activă', 'ok') : p.active ? pill('Programată / expirată', 'warn') : pill('Oprită', '') }, { node: h('span', { class: 'row' }, [edit, del]) }] };
      }))]),
      h('div', { class: 'sub', text: 'Perioada de probă și reducerile pentru „doar clienți noi” nu se aplică conturilor care au avut deja un abonament.' }));
  }
  function promoForm(p) {
    p = p || { kind: 'discount', title: '', percent: 20, months: 0, trialDays: 14, plans: ['personal', 'pro'], periods: ['month', 'year'], active: true, newOnly: true, start: Date.now(), end: null, maxUses: 0 };
    const iso = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
    return dialog((box, close) => {
      const kind = h('select', {}, [h('option', { value: 'discount', text: 'Reducere (%)' }), h('option', { value: 'trial', text: 'Perioadă de probă (zile)' })]);
      kind.value = p.kind;
      const title = h('input', { type: 'text', maxlength: '60', value: p.title, placeholder: 'ex. Black Friday' });
      const percent = h('input', { type: 'number', min: '1', max: '100', value: String(p.percent || 20) });
      const months = h('select', {}, [['0', 'Doar prima plată'], ['3', 'Primele 3 luni'], ['6', 'Primele 6 luni'], ['12', 'Primele 12 luni'], ['-1', 'Permanent']].map(([v, t]) => h('option', { value: v, text: t })));
      months.value = String(p.months || 0);
      const trial = h('input', { type: 'number', min: '1', max: '90', value: String(p.trialDays || 14) });
      const planBoxes = ['personal', 'pro', 'family', 'business'].map((x) => { const c = h('input', { type: 'checkbox', value: x, checked: p.plans.includes(x) }); return [c, h('label', { class: 'check' }, [c, NAMES[x]])]; });
      const perBoxes = [['month', 'Lunar'], ['year', 'Anual']].map(([x, t]) => { const c = h('input', { type: 'checkbox', value: x, checked: p.periods.includes(x) }); return [c, h('label', { class: 'check' }, [c, t])]; });
      const start = h('input', { type: 'date', value: iso(p.start) });
      const end = h('input', { type: 'date', value: iso(p.end) });
      const maxUses = h('input', { type: 'number', min: '0', value: String(p.maxUses || 0) });
      const active = h('input', { type: 'checkbox', checked: p.active });
      const newOnly = h('input', { type: 'checkbox', checked: p.newOnly !== false });
      const err = h('div', { class: 'err' });
      const dPart = h('div', {}, [h('label', { text: 'Reducere (%)' }), percent, h('label', { text: 'Se aplică' }), months]);
      const tPart = h('div', {}, [h('label', { text: 'Zile de probă' }), trial]);
      const sync = () => { dPart.hidden = kind.value !== 'discount'; tPart.hidden = kind.value !== 'trial'; };
      kind.addEventListener('change', sync); sync();
      const save = h('button', { class: 'btn primary', text: 'Salvează' });
      save.addEventListener('click', async () => {
        err.textContent = '';
        const body = {
          id: p.id, kind: kind.value, title: title.value, percent: Number(percent.value), months: Number(months.value), trialDays: Number(trial.value),
          plans: planBoxes.filter(([c]) => c.checked).map(([c]) => c.value), periods: perBoxes.filter(([c]) => c.checked).map(([c]) => c.value),
          start: start.value ? new Date(start.value + 'T00:00').getTime() : Date.now(), end: end.value ? new Date(end.value + 'T23:59:59').getTime() : null,
          maxUses: Number(maxUses.value) || 0, active: active.checked, newOnly: newOnly.checked,
        };
        save.disabled = true;
        try { await call('savePromo', { promo: body }); close(true); show('promos'); toast('Promoția a fost salvată.'); } catch (e) { err.textContent = say(e); save.disabled = false; }
      });
      box.append(h('h3', { text: p.id ? 'Editează promoția' : 'Promoție nouă' }),
        h('label', { text: 'Titlu (apare în aplicație)' }), title, h('label', { text: 'Tip' }), kind, dPart, tPart,
        h('label', { text: 'Planuri' }), h('div', {}, planBoxes.map(([, l]) => l)), h('label', { text: 'Facturare' }), h('div', {}, perBoxes.map(([, l]) => l)),
        h('div', { class: 'row' }, [h('div', {}, [h('label', { text: 'De la' }), start]), h('div', {}, [h('label', { text: 'Până la (opțional)' }), end])]),
        h('label', { text: 'Număr maxim de folosiri (0 = fără limită)' }), maxUses,
        h('label', { class: 'check' }, [newOnly, 'Doar pentru conturi fără abonament anterior']), h('label', { class: 'check' }, [active, 'Activă']), err,
        h('div', { class: 'actions' }, [h('button', { class: 'btn', text: 'Renunță', onclick: () => close(null) }), save]));
    });
  }

  // ---------------------------------------------------------------- Stripe
  async function stripe() {
    const s = await call('stripe');
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk_live_… sau sk_test_…' });
    const tax = h('input', { type: 'checkbox', checked: s.tax });
    const save = h('button', { class: 'btn primary', text: 'Salvează și conectează' });
    save.addEventListener('click', () => act(save, async () => {
      if (!key.value.trim()) throw new Error('Lipește cheia secretă din Stripe.');
      await call('stripeSet', { key: key.value.trim(), tax: tax.checked });
      key.value = '';
      toast('Stripe este conectat. Webhook-ul a fost creat automat.'); show('stripe');
    }));
    const taxBtn = h('button', { class: 'btn', text: s.tax ? 'Oprește taxele automate' : 'Pornește taxele automate' });
    taxBtn.addEventListener('click', () => act(taxBtn, async () => { await call('stripeTax', { on: !s.tax }); show('stripe'); }));
    const clearBtn = h('button', { class: 'btn danger', text: 'Deconectează Stripe' });
    clearBtn.addEventListener('click', async () => {
      if (!(await confirmBox('Deconectezi Stripe?', 'Cheile setate din panou se șterg și webhook-ul se elimină. Abonamentele existente rămân în Stripe, dar aplicația nu mai primește actualizări până conectezi din nou.', 'Deconectează', true))) return;
      act(clearBtn, async () => { await call('stripeClear'); show('stripe'); });
    });
    fill(
      head('Stripe', 'Plățile abonamentelor'),
      h('div', { class: 'card' }, [h('h2', { text: 'Stare' }), h('dl', { class: 'kv' }, [
        h('dt', { text: 'Plăți' }), h('dd', {}, [s.active ? pill('Active', 'ok') : pill('Neconfigurate', 'bad')]),
        h('dt', { text: 'Mod' }), h('dd', {}, [s.active ? (s.mode === 'live' ? pill('Live · plăți reale', 'ok') : pill('Test · fără bani reali', 'warn')) : '–']),
        h('dt', { text: 'Cheie' }), h('dd', { class: 'mono', text: s.keyEnd || '–' }),
        h('dt', { text: 'Setată din' }), h('dd', { text: s.source === 'panel' ? 'Panoul de control · ' + dt(s.setAt) : s.source === 'deploy' ? 'Secretele GitHub' : '–' }),
        h('dt', { text: 'Cont Stripe' }), h('dd', { text: s.account ? `${s.account.name || s.account.id} ${s.account.country ? '· ' + s.account.country : ''}` : '–' }),
        h('dt', { text: 'Webhook' }), h('dd', {}, [s.webhook ? pill('Activ', 'ok') : pill('Lipsă', 'bad'), s.webhookId ? h('span', { class: 'mono', text: ' ' + s.webhookId }) : null]),
        h('dt', { text: 'Taxe automate' }), h('dd', { text: s.tax ? 'Da (Stripe Tax)' : 'Nu' }),
      ]), s.source === 'panel' ? h('div', { class: 'row' }, [h('span'), taxBtn, clearBtn]) : null]),
      h('div', { class: 'card' }, [h('h2', { text: s.source === 'panel' ? 'Schimbă cheia' : 'Conectează Stripe' }),
        h('p', { class: 'sub', text: 'Stripe Dashboard → Developers → API keys → Secret key. Cheia se verifică, webhook-ul se creează automat, iar cheia se păstrează doar pe server: nu mai poate fi citită, nici din acest panou.' }),
        h('label', { text: 'Cheia secretă' }), key, h('label', { class: 'check' }, [tax, 'Taxe automate (Stripe Tax, trebuie activat în Stripe)']),
        h('div', { class: 'row' }, [h('span'), save])]),
    );
  }

  // ---------------------------------------------------------------- ANAF e-Factura
  async function anaf() {
    const s = await call('anaf');
    const id = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Client ID' });
    const secret = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Client Secret' });
    const env = h('select', {}, [h('option', { value: 'test', text: 'Test (facturi de probă, fără efect fiscal)' }), h('option', { value: 'prod', text: 'Producție (facturi reale)' })]);
    env.value = s.env || 'test';
    const save = h('button', { class: 'btn primary', text: 'Salvează și verifică' });
    save.addEventListener('click', () => act(save, async () => {
      if (!id.value.trim() || !secret.value.trim()) throw new Error('Completează Client ID și Client Secret din contul de dezvoltator ANAF.');
      await call('anafSet', { clientId: id.value.trim(), clientSecret: secret.value.trim(), env: env.value });
      id.value = ''; secret.value = '';
      toast('ANAF e-Factura este configurat.'); show('anaf');
    }));
    const envBtn = h('button', { class: 'btn', text: s.env === 'prod' ? 'Treci pe Test' : 'Treci pe Producție' });
    envBtn.addEventListener('click', async () => {
      const toProd = s.env !== 'prod';
      if (toProd && !(await confirmBox('Treci pe producție?', 'Facturile trimise din aplicație ajung în SPV ca facturi reale, cu efect fiscal.', 'Treci pe producție', false))) return;
      act(envBtn, async () => { await call('anafEnv', { env: toProd ? 'prod' : 'test' }); show('anaf'); });
    });
    const clearBtn = h('button', { class: 'btn danger', text: 'Șterge datele ANAF' });
    clearBtn.addEventListener('click', async () => {
      if (!(await confirmBox('Ștergi datele ANAF?', 'Firmele nu se mai pot conecta la SPV din aplicație până setezi din nou Client ID și Client Secret. Conexiunile existente se opresc la următoarea reînnoire.', 'Șterge', true))) return;
      act(clearBtn, async () => { await call('anafClear'); show('anaf'); });
    });
    const cb = h('input', { type: 'text', readonly: true, value: s.callback, class: 'mono' });
    const copy = h('button', { class: 'btn', text: 'Copiază' });
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(s.callback); toast('Copiat.'); } catch (e) { cb.select(); } });
    fill(
      head('ANAF e-Factura', 'Conectarea firmelor la SPV, ca facturile să se trimită automat'),
      h('div', { class: 'card' }, [h('h2', { text: 'Stare' }), h('dl', { class: 'kv' }, [
        h('dt', { text: 'e-Factura' }), h('dd', {}, [s.active ? pill('Configurat', 'ok') : pill('Neconfigurat', 'bad')]),
        h('dt', { text: 'Mediu' }), h('dd', {}, [s.active ? (s.env === 'prod' ? pill('Producție · facturi reale', 'ok') : pill('Test · fără efect fiscal', 'warn')) : '–']),
        h('dt', { text: 'Client ID' }), h('dd', { class: 'mono', text: s.clientIdEnd || '–' }),
        h('dt', { text: 'Verificat la ANAF' }), h('dd', { text: s.checked === 'ok' ? 'Da' : s.checked === 'unreachable' ? 'ANAF nu a răspuns la verificare' : '–' }),
        h('dt', { text: 'Setat' }), h('dd', { text: s.setAt ? dt(s.setAt) : '–' }),
      ]), s.active ? h('div', { class: 'row' }, [h('span'), envBtn, clearBtn]) : null]),
      h('div', { class: 'card' }, [h('h2', { text: 'Adresa de întoarcere (Callback URL)' }),
        h('p', { class: 'sub', text: 'În contul de dezvoltator ANAF → Profil OAuth, la aplicația ACM Docs, pune exact această adresă.' }),
        h('div', { class: 'row' }, [cb, copy])]),
      h('div', { class: 'card' }, [h('h2', { text: s.active ? 'Schimbă datele aplicației' : 'Conectează aplicația la ANAF' }),
        h('p', { class: 'sub', text: 'anaf.ro → Servicii Online → Înregistrare utilizatori → Dezvoltatori aplicații → Profil OAuth (serviciul E-Factura) → Generare Client ID. Datele se verifică la ANAF și rămân doar pe server: secretul nu mai poate fi citit, nici din acest panou. Facturile firmelor nu trec prin server: aplicația le trimite direct la ANAF.' }),
        h('label', { text: 'Client ID' }), id, h('label', { text: 'Client Secret' }), secret, h('label', { text: 'Mediu' }), env,
        h('div', { class: 'row' }, [h('span'), save])]),
    );
  }

  // ---------------------------------------------------------------- log
  async function log() {
    const rows = await call('log');
    const OPS = { setTester: 'Tester', bugStatus: 'Raport tester', bugDelete: 'Raport tester șters', setPlan: 'Plan manual', suspend: 'Suspendare', blockDevice: 'Dispozitiv blocat', 'switches.set': 'Kill switches', resolveReport: 'Raport închis', savePromo: 'Promoție salvată', deletePromo: 'Promoție ștearsă', stripeSet: 'Cheie Stripe', stripeTax: 'Taxe Stripe', stripeClear: 'Stripe deconectat', anafSet: 'Date ANAF', anafEnv: 'Mediu ANAF', anafClear: 'ANAF șters' };
    fill(head('Jurnal', 'Tot ce s-a schimbat din panou (păstrat 2 ani)'), h('div', { class: 'card' }, [table(['Data', 'Acțiune', 'Țintă', 'Detalii', 'Administrator', 'IP'], rows.map((r) => ({
      uid: r.target, cells: [dt(r.at), OPS[r.op] || r.op, r.target ? { node: h('span', { class: 'mono', text: String(r.target).slice(0, 12) }) } : '–', r.detail || '–', r.email, { node: h('span', { class: 'mono', text: r.ip || '–' }) }],
    })))]));
  }

  // remembered from an earlier visit: straight in (the server still checks the right and the authenticator app)
  root.append(h('div', { class: 'gate' }, [h('div', { class: 'spinner' })]));
  auth.authStateReady().then(() => (auth.currentUser ? enter() : gate('signin'))).catch(() => gate('signin'));
})();
