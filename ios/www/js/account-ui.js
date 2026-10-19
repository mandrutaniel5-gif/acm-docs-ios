'use strict';
// Sign-in screen (blue waves), account steps and the "Cont" section of Settings.

const AccountUI = (() => {
  let root = null, view = null;
  const bio = () => (Host.info && Host.info.platform === 'ios' ? 'Face ID' : Host.mobile ? 'amprenta' : 'confirmarea Windows');
  const GLOGO = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const WAVE = (cls) => el('div', { class: 'wave ' + cls, html: '<svg viewBox="0 0 2880 120" preserveAspectRatio="none"><path d="M0 64 Q360 4 720 64 T1440 64 T2160 64 T2880 64 V120 H0 Z"/></svg>' });

  // ---------------------------------------------------------------- the screen
  function ensureRoot() {
    if (root) return root;
    root = el('section', { id: 'auth', class: 'auth', role: 'dialog', 'aria-label': 'Cont ACM Docs' }, [
      el('div', { class: 'auth-sky' }, [
        el('div', { class: 'auth-glow' }),
        el('div', { class: 'auth-brand' }, [el('img', { src: 'icon.png', alt: '' }), el('b', { text: 'ACM Docs' }), el('small', { text: 'Documente, facturi și PDF-uri, protejate' })]),
        WAVE('w1'), WAVE('w2'), WAVE('w3'),
      ]),
      el('div', { class: 'auth-body' }, [el('div', { class: 'auth-card', id: 'auth-card' })]),
    ]);
    document.body.append(root);
    return root;
  }
  function close() { if (root) { root.classList.add('out'); const r = root; root = null; setTimeout(() => r.remove(), 320); } view = null; refreshAround(); }
  function refreshAround() {
    try { banner(); } catch (e) {}
    try { if (typeof AcmShare !== 'undefined') AcmShare.renderHome(); } catch (e) {}
    try { if (document.querySelector('#v-settings:not(.hidden)')) App.showView('settings'); } catch (e) {}
  }

  const field = (label, attrs) => {
    const input = el('input', Object.assign({ class: 'in', spellcheck: 'false', autocapitalize: 'off' }, attrs));
    return { input, node: el('label', { class: 'auth-fld' }, [el('span', { text: label }), input]) };
  };
  const passField = (label, id, autocomplete) => {
    const f = field(label, { type: 'password', id, autocomplete });
    const eye = el('button', { class: 'auth-eye', type: 'button', title: 'Arată parola', html: svg('eye') });
    eye.addEventListener('click', () => { f.input.type = f.input.type === 'password' ? 'text' : 'password'; });
    f.node.append(eye);
    return f;
  };
  const err = () => el('p', { class: 'auth-err', role: 'alert' });
  const showErr = (box, e) => { box.textContent = typeof e === 'string' ? e : Account.say(e); box.classList.toggle('on', !!box.textContent); };
  async function busy(btn, fn) {
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true; btn.classList.add('busy');
    try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = label; }
  }

  function render(name, data) {
    ensureRoot();
    view = name;
    const card = document.getElementById('auth-card');
    card.innerHTML = '';
    card.className = 'auth-card v-' + name;
    (VIEWS[name] || VIEWS.signin)(card, data || {});
    hydrateIcons(card);
    const f = card.querySelector('input');
    if (f && !Host.mobile) setTimeout(() => f.focus(), 60);
  }

  const later = (card) => card.append(el('button', { class: 'auth-later', type: 'button', text: 'Mai târziu', onclick: () => { Account.setSkipped(true); close(); } }));
  const googleBtn = (box) => el('button', { class: 'auth-google', type: 'button', html: GLOGO + '<span>Continuă cu Google</span>', onclick: async (e) => {
    showErr(box, '');
    try { await busy(e.currentTarget, () => Account.google()); await route(); } catch (x) { if (String(x && x.message) !== 'cancel') showErr(box, x); }
  } });

  const VIEWS = {
    signin(card) {
      const box = err();
      const email = field('Email', { type: 'email', id: 'auth-email', autocomplete: 'username', inputmode: 'email' });
      const pass = passField('Parolă', 'auth-pass', 'current-password');
      const go = el('button', { class: 'btn primary auth-main', type: 'submit', text: 'Intră în cont' });
      const form = el('form', { class: 'auth-form', novalidate: true }, [email.node, pass.node, box, go]);
      form.addEventListener('submit', (e) => { e.preventDefault(); showErr(box, ''); busy(go, async () => { try { await Account.signIn(email.input.value, pass.input.value); await route(); } catch (x) { showErr(box, x); } }); });
      card.append(
        el('h2', { text: 'Bine ai revenit' }),
        el('p', { class: 'auth-sub', text: 'Intră în contul ACM Docs ca să trimiți și să primești documente criptate.' }),
        form,
        el('button', { class: 'auth-link', type: 'button', text: 'Ai uitat parola?', onclick: () => render('reset', { email: email.input.value }) }),
        el('div', { class: 'auth-or' }, [el('span', { text: 'sau' })]),
        googleBtn(box),
        el('p', { class: 'auth-switch' }, [document.createTextNode('Nu ai cont? '), el('button', { type: 'button', class: 'auth-link inline', text: 'Creează unul', onclick: () => render('signup') })]),
      );
      later(card);
    },

    signup(card) {
      const box = err();
      const name = field('Nume', { type: 'text', id: 'auth-name', autocomplete: 'name', autocapitalize: 'words' });
      const email = field('Email', { type: 'email', id: 'auth-email', autocomplete: 'username', inputmode: 'email' });
      const pass = passField('Parolă (cel puțin 8 caractere)', 'auth-pass', 'new-password');
      const pass2 = passField('Confirmă parola', 'auth-pass2', 'new-password');
      // both fields show / hide together
      pass.node.querySelector('.auth-eye').addEventListener('click', () => { pass2.input.type = pass.input.type; });
      pass2.node.querySelector('.auth-eye').addEventListener('click', () => { pass.input.type = pass2.input.type; });
      const match = () => {
        const a = pass.input.value, b = pass2.input.value;
        pass2.node.classList.toggle('ok', !!b && a === b);
        pass2.node.classList.toggle('bad', !!b && a !== b && b.length >= Math.min(a.length, 1) && (b.length >= a.length || !a.startsWith(b)));
      };
      pass.input.addEventListener('input', match);
      pass2.input.addEventListener('input', match);
      const go = el('button', { class: 'btn primary auth-main', type: 'submit', text: 'Creează contul' });
      const form = el('form', { class: 'auth-form', novalidate: true }, [name.node, email.node, pass.node, pass2.node, box, go]);
      form.addEventListener('submit', (e) => { e.preventDefault(); showErr(box, ''); busy(go, async () => { try { await Account.signUp(name.input.value, email.input.value, pass.input.value, pass2.input.value); await route(); } catch (x) { showErr(box, x); if (pass.input.value !== pass2.input.value) pass2.input.focus(); } }); });
      card.append(
        el('h2', { text: 'Cont nou' }),
        el('p', { class: 'auth-sub', text: 'Contul îți dă chei de criptare post-cuantică, create pe acest dispozitiv. Nimeni altcineva nu le are.' }),
        form,
        el('div', { class: 'auth-or' }, [el('span', { text: 'sau' })]),
        googleBtn(box),
        el('p', { class: 'auth-switch' }, [document.createTextNode('Ai deja cont? '), el('button', { type: 'button', class: 'auth-link inline', text: 'Intră în cont', onclick: () => render('signin') })]),
      );
      later(card);
    },

    reset(card, d) {
      const box = err();
      const email = field('Email', { type: 'email', id: 'auth-email', autocomplete: 'username', inputmode: 'email', value: d.email || '' });
      const go = el('button', { class: 'btn primary auth-main', type: 'submit', text: 'Trimite linkul' });
      const form = el('form', { class: 'auth-form', novalidate: true }, [email.node, box, go]);
      form.addEventListener('submit', (e) => { e.preventDefault(); showErr(box, ''); busy(go, async () => {
        try { await Account.resetPassword(email.input.value); UI.toast('Ți-am trimis un email pentru parola nouă.'); render('signin'); } catch (x) { showErr(box, x); }
      }); });
      card.append(el('h2', { text: 'Parolă nouă' }), el('p', { class: 'auth-sub', text: 'Îți trimitem pe email un link prin care îți alegi o parolă nouă.' }), form,
        el('button', { class: 'auth-link', type: 'button', text: 'Înapoi', onclick: () => render('signin') }));
    },

    verify(card) {
      const u = Account.current();
      const box = err();
      const ok = el('button', { class: 'btn primary auth-main', type: 'button', text: 'Am confirmat' });
      ok.addEventListener('click', () => busy(ok, async () => {
        showErr(box, '');
        try { await Account.refresh(); if (Account.needsVerification()) showErr(box, 'Încă nu văd confirmarea. Deschide linkul din email, apoi apasă din nou.'); else await route(); } catch (x) { showErr(box, x); }
      }));
      const again = el('button', { class: 'auth-link', type: 'button', text: 'Retrimite emailul' });
      again.addEventListener('click', () => busy(again, async () => { try { await Account.resendVerification(); UI.toast('Email retrimis.'); } catch (x) { showErr(box, x); } }));
      card.append(
        el('div', { class: 'auth-icon', html: svg('mail') }),
        el('h2', { text: 'Confirmă emailul' }),
        el('p', { class: 'auth-sub' }, [document.createTextNode('Ți-am trimis un link la '), el('b', { class: 'no-tr', text: u ? u.email : '' }), document.createTextNode('. Deschide-l, apoi revino aici.')]),
        box, ok, again,
        el('button', { class: 'auth-link', type: 'button', text: 'Folosește alt cont', onclick: async () => { await Account.signOut(); render('signin'); } }),
      );
      later(card);
    },

    // @name: how other people find this account (instead of the email, which stays private)
    handle(card, d) {
      const box = err();
      const u = Account.current();
      const suggestion = d.value || Account.handle() || Account.suggestHandle(u && u.displayName);
      const f = field('Nume de utilizator', { type: 'text', id: 'auth-handle', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', maxlength: '21', value: suggestion });
      f.node.classList.add('auth-handle');
      f.node.insertBefore(el('i', { class: 'at', text: '@' }), f.input);
      const hint = el('small', { class: 'auth-hint', text: '3–20 caractere: litere mici, cifre și _' });
      f.input.addEventListener('input', () => {
        const v = Account.cleanHandle(f.input.value);
        if (f.input.value !== v) f.input.value = v;
        const p = v ? Account.handleProblem(v) : null;
        hint.textContent = p || '3–20 caractere: litere mici, cifre și _';
        hint.classList.toggle('bad', !!p);
      });
      const go = el('button', { class: 'btn primary auth-main', type: 'submit', text: d.create ? 'Continuă' : 'Salvează' });
      const form = el('form', { class: 'auth-form', novalidate: true }, [f.node, hint, box, go]);
      form.addEventListener('submit', (e) => { e.preventDefault(); showErr(box, ''); busy(go, async () => {
        const v = Account.cleanHandle(f.input.value);
        const p = Account.handleProblem(v);
        if (p) return showErr(box, p);
        try {
          if (d.create) {
            render('keys');
            const t0 = Date.now();
            try { await Account.createKeys(v); } catch (x) { return render('handle', { create: true, value: v, error: x }); }
            await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
            return render('done');
          }
          await Account.setHandle(v);
          if (d.change) { UI.toast(`Numele tău este acum @${v}.`); return close(); }
          await route();
        } catch (x) { showErr(box, x); }
      }); });
      card.append(
        el('div', { class: 'auth-icon', html: svg('user') }),
        el('h2', { text: d.change ? 'Schimbă numele de utilizator' : 'Alege-ți numele de utilizator' }),
        el('p', { class: 'auth-sub', text: 'Așa te găsesc cei care îți trimit documente criptate. Emailul tău rămâne privat: nimeni nu te poate căuta după el.' }),
        form,
      );
      if (d.error) showErr(box, d.error);
      if (d.change) card.append(el('button', { class: 'auth-link', type: 'button', text: 'Anulează', onclick: () => close() }));
      else later(card);
    },

    keys(card) {
      card.append(
        el('div', { class: 'auth-spin' }, [el('span'), el('span'), el('span')]),
        el('h2', { text: 'Pregătim cheile tale' }),
        el('p', { class: 'auth-sub', text: 'Se creează pe acest dispozitiv cheile de criptare post-cuantică ale contului. Durează câteva secunde.' }),
      );
    },

    keyError(card, d) {
      card.append(
        el('div', { class: 'auth-icon warn', html: svg('info') }),
        el('h2', { text: 'Nu am putut pregăti cheile' }),
        el('p', { class: 'auth-sub', text: Account.say(d.error) }),
        el('button', { class: 'btn primary auth-main', type: 'button', text: 'Încearcă din nou', onclick: () => route() }),
      );
      later(card);
    },

    done(card) {
      card.append(
        el('div', { class: 'auth-icon good', html: svg('shield') }),
        el('h2', { text: 'Contul tău e gata' }),
        el('p', { class: 'auth-sub', text: `Cheile de criptare au fost create pe acest dispozitiv. Codul de recuperare (24 de cuvinte) e salvat aici, protejat de ${bio()}.` }),
        el('div', { class: 'auth-note' }, [el('span', { html: svg('key') }), el('span', { text: 'Îl poți nota oricând din profil (butonul cu inițiala, sus în dreapta). Îți trebuie doar dacă pierzi acest dispozitiv.' })]),
        el('button', { class: 'btn primary auth-main', type: 'button', text: 'Începe', onclick: () => close() }),
        el('button', { class: 'auth-link', type: 'button', text: 'Vezi codul acum', onclick: async () => { close(); await showWords(); } }),
      );
    },

    restore(card) {
      const box = err();
      const ta = el('textarea', { class: 'in auth-words', id: 'auth-words', rows: '5', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', placeholder: 'cele 24 de cuvinte, în ordine, separate prin spațiu' });
      const count = el('small', { class: 'auth-count', text: '0 / 24' });
      ta.addEventListener('input', () => { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; count.textContent = `${n} / 24`; count.classList.toggle('full', n === 24); });
      const go = el('button', { class: 'btn primary auth-main', type: 'button', text: 'Recuperează cheile' });
      go.addEventListener('click', () => busy(go, async () => { showErr(box, ''); try { await Account.restoreKeys(ta.value); UI.toast('Cheile au fost recuperate.'); await route(); } catch (x) { showErr(box, x); } }));
      card.append(
        el('div', { class: 'auth-icon', html: svg('key') }),
        el('h2', { text: 'Recuperează cheile' }),
        el('p', { class: 'auth-sub', text: 'Contul tău are deja chei, create pe alt dispozitiv. Scrie cele 24 de cuvinte ale codului de recuperare ca să le aduci și aici.' }),
        el('div', { class: 'auth-fld' }, [ta, count]), box, go,
        el('button', { class: 'auth-link', type: 'button', text: 'Folosește alt cont', onclick: async () => { await Account.signOut(); render('signin'); } }),
      );
      later(card);
    },
  };

  /** Where the signed-in account still needs something: email, keys, words. */
  async function route() {
    const u = Account.current();
    if (!u) return render('signin');
    if (Account.needsVerification()) return render('verify');
    render('keys');
    const t0 = Date.now();
    try {
      const st = await Account.keyState();
      if (st === 'create') return render('handle', { create: true });
      if (st === 'restore') return render('restore');
      if (st === 'handle') return render('handle', {});
      void t0;
      close();
    } catch (e) { console.error(e); render('keyError', { error: e }); }
  }

  // ---------------------------------------------------------------- recovery words
  async function showWords() {
    let w;
    try { w = await Account.words(`Confirmă cu ${bio()} ca să vezi codul de recuperare`); } catch (e) { if (String(e && e.message) !== 'cancel') UI.toast(Account.say(e), { error: true }); return; }
    if (!w) return UI.toast('Codul nu este pe acest dispozitiv.', { error: true });
    const list = w.split(' ');
    if (typeof Shield !== 'undefined') await Shield.protect(true);
    await UI.modal((box, done) => {
      box.classList.add('recov');
      const grid = el('ol', { class: 'recov-grid no-tr' }, list.map((x) => el('li', { text: x })));
      const chk = el('input', { type: 'checkbox', id: 'recov-ok' });
      const ok = el('button', { class: 'btn primary', type: 'button', text: 'Gata', disabled: !Account.wordsSaved(), onclick: () => { if (chk.checked) Account.markWordsSaved(); done(true); } });
      chk.checked = Account.wordsSaved();
      chk.addEventListener('change', () => { ok.disabled = !chk.checked; });
      box.append(
        el('h2', { text: 'Codul de recuperare' }),
        el('p', { text: 'Scrie aceste 24 de cuvinte pe hârtie, în ordine, și păstrează foaia într-un loc sigur. Cu ele îți recuperezi cheile pe alt dispozitiv.' }),
        grid,
        el('div', { class: 'recov-warn', html: `${svg('info')}<span>Nu le fotografia și nu le trimite nimănui. Nimeni de la ACM Docs nu îți va cere vreodată aceste cuvinte.</span>` }),
        el('label', { class: 'chk' }, [chk, 'Le-am notat într-un loc sigur']),
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => done(false) }), ok]),
      );
    });
    if (typeof Shield !== 'undefined') await Shield.protect(false);
    banner();
  }

  // ---------------------------------------------------------------- delete account
  async function deleteFlow() {
    const u = Account.current();
    if (!u) return;
    if (!(await UI.confirm('Ștergi contul?', 'Se șterg contul, cheia publică și cheile de pe acest dispozitiv. Documentele .acm primite nu se vor mai putea deschide. Nu se poate anula.', 'Continuă'))) return;
    if (!(await Host.confirmOwner(`Confirmă cu ${bio()} ștergerea contului`))) return UI.toast('Ștergerea a fost anulată.');
    let password = null;
    if (Account.isPasswordUser()) {
      password = await UI.modal((box, done) => {
        const p = el('input', { type: 'password', class: 'in', id: 'del-pass', placeholder: 'Parola contului', autocomplete: 'current-password', autofocus: true });
        p.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(p.value); });
        box.append(el('h2', { text: 'Confirmă cu parola' }), el('p', { text: `Ultimul pas: parola contului ${u.email}.` }), p,
          el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => done(null) }), el('button', { class: 'btn danger', type: 'button', id: 'del-go', text: 'Șterge contul', onclick: () => done(p.value) })]));
      });
      if (!password) return;
    }
    UI.busy('Se șterge contul…');
    try { await Account.deleteAccount(password); UI.busy(); UI.toast('Contul a fost șters.'); App.showView('settings'); }
    catch (e) { UI.busy(); UI.toast(Account.say(e), { error: true }); }
  }

  // ---------------------------------------------------------------- Settings › Cont
  function settingsGroup(group, srow, chev) {
    const u = Account.current();
    if (!u) return group('Cont', [srow('user', 'blue', 'Intră în cont sau creează unul', 'Pentru documente criptate .acm', chev(), () => { Account.setSkipped(false); render('signin'); })]);
    const h = Account.handle();
    const rows = [srow('user', 'blue', u.displayName || u.email, (h ? '@' + h + ' · ' : '') + (u.displayName ? u.email : 'Cont ACM Docs'), null, null)];
    if (!Account.needsVerification() && typeof Contacts !== 'undefined') {
      rows.push(srow('qr', 'blue', 'Codul meu', 'QR-ul cu care te adaugă alții', chev(), () => Contacts.showMyCode()));
      rows.push(srow('people', 'green', 'Contacte', 'Persoanele cărora le trimiți .acm', chev(), () => Contacts.showList()));
      if (h) rows.push(srow('edit', 'gray', 'Schimbă numele de utilizator', '@' + h, chev(), () => render('handle', { change: true })));
    }
    if (Account.needsVerification()) rows.push(srow('mail', 'orange', 'Confirmă emailul', 'Fără confirmare nu poți primi documente', chev(), () => render('verify')));
    else rows.push(srow('key', 'green', 'Codul de recuperare', Account.wordsSaved() ? 'Notat ✓' : 'Nenotat încă: notează-l', chev(), showWords));
    rows.push(srow('logout', 'gray', 'Deconectează-te', 'Cheile rămân pe acest dispozitiv', null, async () => { await Account.signOut(); App.showView('settings'); }));
    const del = srow('del', 'red', 'Șterge contul', `Cu ${bio()}`, null, deleteFlow);
    del.classList.add('danger');
    rows.push(del);
    return group('Cont', rows, 'Cheile de criptare sunt create și păstrate doar pe dispozitivele tale. Serverul păstrează doar cheia publică.');
  }

  // ---------------------------------------------------------------- the account sheet (avatar on Home)
  async function showProfile() {
    const u = Account.current();
    if (!u) { Account.setSkipped(false); return render('signin'); }
    if (Account.needsVerification()) return render('verify');
    const h = Account.handle();
    const qrText = h && Account.fingerprint() ? `ACMC1:${h}:${u.uid}:${Account.fingerprint()}` : null;
    const integrity = typeof Shield !== 'undefined' ? await Shield.integrity() : null;
    const act = await UI.modal((box, close) => {
      box.classList.add('profile');
      const row = (icon, color, label, sub, key, cls) => {
        const r = el('button', { class: 'srow' + (cls ? ' ' + cls : ''), type: 'button' }, [
          el('span', { class: 'si ' + color, html: svg(icon) }),
          el('span', { class: 'stx' }, [el('b', { text: label }), sub ? el('small', { text: sub }) : null]),
          el('span', { class: 'chev', html: svg('right') }),
        ]);
        r.addEventListener('click', () => close(key));
        return r;
      };
      box.append(
        el('div', { class: 'pf-head' }, [
          el('span', { class: 'pf-av', text: ((u.displayName || u.email || '?').trim()[0] || '?').toUpperCase() }),
          el('div', { class: 'pf-id' }, [el('b', { class: 'no-tr', text: u.displayName || 'Contul meu' }), el('span', { class: 'pf-h no-tr', text: h ? '@' + h : '' }), el('small', { class: 'muted no-tr', text: u.email || '' })]),
        ]),
        qrText ? el('button', { class: 'pf-qr', type: 'button', title: 'Codul meu', onclick: () => close('code') }, [
          el('span', { class: 'pf-qr-img', html: window.__lib.qr.svg(qrText) }),
          el('span', { class: 'pf-qr-t' }, [el('b', { text: 'Codul meu' }), el('small', { text: 'Arată-l cuiva ca să te adauge și să te verifice. Atinge pentru mărire.' })]),
        ]) : null,
        el('div', { class: 'list-card' }, [
          row('people', 'green', 'Contacte', 'Caută după @nume, scanează coduri QR', 'contacts'),
          row('lockfile', 'blue', 'Trimite un document criptat', 'Criptare post-cuantică', 'send'),
        ]),
        el('h3', { class: 'csub', text: 'Securitate' }),
        el('div', { class: 'list-card' }, [
          row('key', Account.wordsSaved() ? 'green' : 'orange', 'Codul de recuperare', Account.wordsSaved() ? 'Notat ✓' : 'Nenotat încă: notează-l', 'words'),
          row('shield', integrity && integrity.risk ? 'red' : 'indigo', 'Protecție anti-spyware', integrity && integrity.risk ? 'Atenție: telefonul pare modificat' : 'Ce face aplicația și ce poți face tu', 'shield'),
          h ? row('edit', 'gray', 'Schimbă numele de utilizator', '@' + h, 'handle') : null,
        ]),
        el('div', { class: 'list-card' }, [
          row('logout', 'gray', 'Deconectează-te', 'Cheile rămân pe acest dispozitiv', 'logout'),
          row('del', 'red', 'Șterge contul', `Cu ${bio()} și parola`, 'delete', 'danger'),
        ]),
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close() })]),
      );
    });
    if (act === 'code') { await Contacts.showMyCode(); return showProfile(); }
    if (act === 'contacts') return Contacts.showList();
    if (act === 'send') return AcmShare.chooseAndSend();
    if (act === 'words') { await showWords(); return showProfile(); }
    if (act === 'shield') { await Shield.showInfo(); return showProfile(); }
    if (act === 'handle') return render('handle', { change: true });
    if (act === 'logout') {
      if (await UI.confirm('Te deconectezi?', 'Cheile și contactele rămân pe acest dispozitiv. Când intri din nou, le găsești la fel.', 'Deconectează-te')) { await Account.signOut(); refreshAround(); }
      return;
    }
    if (act === 'delete') { await deleteFlow(); refreshAround(); }
  }

  // ---------------------------------------------------------------- reminder on Home
  function banner() {
    const old = document.getElementById('acct-banner');
    if (old) old.remove();
    const u = Account.current();
    if (!u || Account.needsVerification() || Account.wordsSaved()) return;
    const quick = document.getElementById('quick');
    if (!quick) return;
    const b = el('button', { id: 'acct-banner', class: 'acct-banner', type: 'button' }, [
      el('span', { class: 'ab-i', html: svg('key') }),
      el('span', { class: 'ab-t' }, [el('b', { text: 'Notează codul de recuperare' }), el('small', { text: 'Îți trebuie dacă pierzi acest dispozitiv' })]),
      el('span', { class: 'chev', html: svg('right') }),
    ]);
    b.addEventListener('click', showWords);
    quick.before(b);
  }

  // ---------------------------------------------------------------- start
  async function start() {
    if (!window.__lib || !window.__lib.firebase || !window.__lib.acmcrypto) return;
    const args = (Host.info && Host.info.args) || [];
    if (args.includes('-uitest') && !args.includes('-uitest-account')) return; // automatic tests of other screens
    Account.init();
    Account.onChange(() => { banner(); try { if (typeof AcmShare !== 'undefined') AcmShare.renderHome(); } catch (e) {} });
    await Account.ready();
    const u = Account.current();
    if (!u) { if (!Account.skipped()) render('signin'); return; }
    if (Account.needsVerification()) return; // reminded in Settings
    try { const st = await Account.keyState(); if (st !== 'ok') await route(); } catch (e) { console.warn('keys', e); }
    banner();
  }

  return { start, showProfile, show: (v) => render(v || 'signin'), settingsGroup, showWords, route, get view() { return view; } };
})();
