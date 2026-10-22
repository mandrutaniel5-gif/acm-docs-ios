'use strict';
// ACM Docs control panel. Talks only to the server function "admin", which checks on every request
// that the caller holds the administrator right AND signed in with the authenticator app. The session
// lives only in this tab's memory: closing or reloading the tab signs out, and so do 20 idle minutes.
(() => {
  const F = window.__lib.firebase;
  const app = F.initializeApp({ apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w', authDomain: 'acm-docs-52280.firebaseapp.com', projectId: 'acm-docs-52280' }, 'control');
  const auth = F.auth.initializeAuth(app, { persistence: F.auth.inMemoryPersistence });
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

  // idle lock: 20 minutes without activity ends the session
  let idle = null;
  function touch() { clearTimeout(idle); idle = setTimeout(async () => { if (auth.currentUser) { await F.auth.signOut(auth); gate('signin', 'Sesiune încheiată după 20 de minute de inactivitate.'); } }, 20 * 60 * 1000); }
  ['click', 'keydown'].forEach((e) => document.addEventListener(e, () => { if (auth.currentUser) touch(); }));

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
    log: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  };
  const VIEWS = [['overview', 'Prezentare'], ['accounts', 'Conturi'], ['switches', 'Kill switches'], ['reports', 'Rapoarte'], ['promos', 'Promoții'], ['stripe', 'Stripe'], ['log', 'Jurnal']];
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
        h('div', { class: 'side-foot' }, [h('div', { class: 'who', text: auth.currentUser.email }), h('button', { text: 'Ieșire', onclick: async () => { await F.auth.signOut(auth); gate('signin'); } })]),
      ]), main,
    ]));
    show('overview');
  }
  function show(id, arg) {
    current = id;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === id));
    clear(main).append(h('div', { class: 'sub', text: 'Se încarcă…' }));
    const run = { overview, accounts, switches, reports, promos, stripe, log }[id];
    run(arg).catch((e) => { clear(main).append(h('div', { class: 'alert bad', text: say(e) })); });
  }
  function head(title, sub, right) {
    return h('div', { class: 'head' }, [h('div', {}, [h('h1', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null]), right || null]);
  }
  const table = (cols, rows, onRow) => {
    if (!rows.length) return h('div', { class: 'empty', text: 'Nimic de afișat.' });
    const tb = h('tbody');
    for (const r of rows) {
      const tr = h('tr', { class: onRow ? 'click' : '' }, r.cells.map((c) => h('td', { class: c && c.cls ? c.cls : '' }, [c && c.node ? c.node : c && c.text != null ? String(c.text) : c == null ? '–' : String(c)])));
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
    clear(main).append(
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
    clear(main).append(head('Conturi', 'Fără căutare: ultimele 50 de conturi create'), h('div', { class: 'card' }, [form]), h('div', { class: 'card' }, [out]));
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
    const devRows = a.devices.map((v) => {
      const b = v.status === 'active' ? h('button', { class: 'btn small danger', text: 'Blochează' }) : null;
      if (b) b.addEventListener('click', async () => {
        if (!(await confirmBox('Blochezi dispozitivul?', 'Dispozitivul se deconectează și uită cheile contului. Proprietarul îl poate adăuga din nou doar cu parola și cele 24 de cuvinte sau prin cod QR.', 'Blochează', true))) return;
        act(b, async () => { await call('blockDevice', { uid, dev: v.id }); toast('Dispozitiv blocat.'); show('accounts', uid); });
      });
      return { cells: [{ node: h('span', { class: 'mono', text: v.id.slice(0, 8) }) }, v.role === 'primary' ? 'Principal' : 'Membru', { node: pill(v.status === 'active' ? 'Activ' : v.status === 'blocked' ? 'Blocat' : 'Scos', v.status === 'active' ? 'ok' : 'bad') }, v.via || '–', day(v.created), dt(v.lastSeen), { node: h('span', { class: 'mono', text: v.ip || '–' }) }, v.agent || '–', { node: b }] };
    });
    clear(main).append(
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
    const save = h('button', { class: 'btn primary', text: 'Salvează' });
    save.addEventListener('click', async () => {
      const off = {}; for (const k of Object.keys(boxes)) if (!boxes[k].checked) off[k] = true;
      const stopping = !all.checked || Object.keys(off).length;
      if (stopping && !(await confirmBox('Aplici modificările?', !all.checked ? 'Tot serviciul se oprește pentru toți utilizatorii, în câteva secunde.' : 'Funcțiile oprite nu mai pot fi folosite de nimeni până le pornești din nou.', 'Aplică', true))) return;
      act(save, async () => { await call('switches.set', { off, all: !all.checked, msg: msg.value }); toast('Salvat. Se aplică în cel mult 15 secunde.'); show('switches'); });
    });
    clear(main).append(
      head('Kill switches', 'Verde = pornit · Roșu = oprit. Se aplică pe server, în toate aplicațiile, în cel mult 15 secunde.'),
      s.all ? h('div', { class: 'alert bad', text: 'Mentenanță: tot serviciul este oprit.' }) : Object.keys(s.off).length ? h('div', { class: 'alert warn', text: 'Unele funcții sunt oprite.' }) : null,
      h('div', { class: 'card' }, [h('div', { class: 'sw' }, [h('div', { class: 'tx' }, [h('b', { text: 'Tot serviciul' }), h('small', { text: 'Oprit = mentenanță: nicio conectare, sesiune sau acțiune. Pentru atacuri în desfășurare.' })]), h('span', { class: 'toggle' }, [all, h('span')])])]),
      h('div', { class: 'card' }, [list]),
      h('div', { class: 'card' }, [h('h2', { text: 'Mesaj pentru utilizatori' }), h('div', { class: 'sub', text: 'Apare în aplicație cât timp ceva este oprit.' }), msg, h('div', { class: 'row' }, [h('div', { class: 'sub', text: s.at ? 'Ultima schimbare: ' + dt(s.at) : '' }), save])]),
    );
  }

  // ---------------------------------------------------------------- reports
  async function reports(status) {
    status = status || 'open';
    const rows = await call('reports', { status });
    const tabs = h('div', { class: 'tabs' }, [['open', 'Deschise'], ['resolved', 'Rezolvate'], ['dismissed', 'Respinse']].map(([k, l]) => h('button', { class: k === status ? 'on' : '', text: l, onclick: () => show('reports', k) })));
    clear(main).append(head('Rapoarte', 'Conturi raportate de alți utilizatori', tabs), h('div', { class: 'card' }, [table(['Data', 'Cont raportat', 'Motiv', 'Detalii', 'Raportat de', ''], rows.map((r) => {
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
    clear(main).append(head('Promoții', 'Reduceri și perioade de probă, aplicate automat la plata abonamentelor', add),
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
    clear(main).append(
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

  // ---------------------------------------------------------------- log
  async function log() {
    const rows = await call('log');
    const OPS = { setPlan: 'Plan manual', suspend: 'Suspendare', blockDevice: 'Dispozitiv blocat', 'switches.set': 'Kill switches', resolveReport: 'Raport închis', savePromo: 'Promoție salvată', deletePromo: 'Promoție ștearsă', stripeSet: 'Cheie Stripe', stripeTax: 'Taxe Stripe', stripeClear: 'Stripe deconectat' };
    clear(main).append(head('Jurnal', 'Tot ce s-a schimbat din panou (păstrat 2 ani)'), h('div', { class: 'card' }, [table(['Data', 'Acțiune', 'Țintă', 'Detalii', 'Administrator', 'IP'], rows.map((r) => ({
      uid: r.target, cells: [dt(r.at), OPS[r.op] || r.op, r.target ? { node: h('span', { class: 'mono', text: String(r.target).slice(0, 12) }) } : '–', r.detail || '–', r.email, { node: h('span', { class: 'mono', text: r.ip || '–' }) }],
    })))]));
  }

  gate('signin');
})();
