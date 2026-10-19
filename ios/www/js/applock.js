'use strict';
// Optional app lock, on every device: biometrics (Face ID, fingerprint, Windows Hello) and/or an
// app password. Locks at start and when the app comes back after a while in the background.
// The password is never stored, only an Argon2id check value; it stays on this device.

const AppLock = (() => {
  const KEY = 'acm.applock';
  const A = () => window.__lib.acmcrypto;
  let cfg = load();
  let locked = false, hiddenAt = 0, root = null, fails = 0, waitUntil = 0;

  function load() {
    try { return Object.assign({ bio: false, pw: null, after: 60000 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { bio: false, pw: null, after: 60000 }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  const enabled = () => !!(cfg.bio || cfg.pw);
  const bioName = () => (Host.info && Host.info.platform === 'ios' ? 'Face ID / Touch ID' : Host.mobile ? 'amprentă sau blocarea ecranului' : 'Windows Hello');

  // ---------------------------------------------------------------- the lock screen
  function show() {
    if (!enabled() || locked) return;
    locked = true;
    root = el('section', { id: 'applock', class: 'applock', role: 'dialog', 'aria-label': 'ACM Docs blocat' });
    const card = el('div', { class: 'al-card' });
    root.append(el('div', { class: 'al-bg' }), card);
    const err = el('p', { class: 'auth-err', role: 'alert' });
    card.append(
      el('img', { class: 'al-icon', src: 'icon.png', alt: '' }),
      el('h2', { text: 'ACM Docs este blocat' }),
      el('p', { class: 'auth-sub', text: cfg.pw && cfg.bio ? `Deblochează cu ${bioName()} sau cu parola aplicației.` : cfg.pw ? 'Scrie parola aplicației.' : `Deblochează cu ${bioName()}.` }),
    );
    if (cfg.pw) {
      const input = el('input', { class: 'in', type: 'password', id: 'al-pass', placeholder: 'Parola aplicației', autocomplete: 'current-password' });
      const go = el('button', { class: 'btn primary auth-main', type: 'submit', text: 'Deblochează' });
      const form = el('form', { class: 'auth-form', novalidate: true }, [input, err, go]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (Date.now() < waitUntil) { err.textContent = `Prea multe încercări. Așteaptă ${Math.ceil((waitUntil - Date.now()) / 1000)} secunde.`; err.classList.add('on'); return; }
        go.disabled = true; go.classList.add('busy');
        await new Promise((r) => setTimeout(r, 30));
        let ok = false;
        try { ok = A().passwordVerifier(input.value, cfg.pw.s).h === cfg.pw.h; } catch (x) { ok = false; }
        go.disabled = false; go.classList.remove('busy');
        if (ok) { fails = 0; return unlock(); }
        fails++;
        if (fails >= 5) waitUntil = Date.now() + Math.min(300, 15 * 2 ** (fails - 5)) * 1000;
        input.value = '';
        err.textContent = 'Parola nu este corectă.'; err.classList.add('on');
      });
      card.append(form);
      if (!Host.mobile) setTimeout(() => input.focus(), 80);
    }
    if (cfg.bio) {
      const b = el('button', { class: cfg.pw ? 'btn al-bio' : 'btn primary auth-main', type: 'button', text: `Deblochează cu ${bioName()}` });
      b.addEventListener('click', tryBio);
      card.append(b);
    }
    if (cfg.pw) card.append(el('button', { class: 'auth-link', type: 'button', text: 'Am uitat parola aplicației', onclick: forgot }));
    document.body.append(root);
    if (cfg.bio) setTimeout(tryBio, 350);
  }

  async function tryBio() {
    if (!locked) return;
    const ok = await Host.confirmOwner('Deblochează ACM Docs');
    if (ok) unlock();
  }

  function unlock() {
    locked = false;
    if (root) { const r = root; root = null; r.classList.add('out'); setTimeout(() => r.remove(), 250); }
  }

  /** Forgotten app password: the account password (checked by the server) removes it. */
  async function forgot() {
    const u = typeof Account !== 'undefined' && Account.current();
    if (!u || !Account.isPasswordUser()) {
      return UI.confirm('Parola nu poate fi recuperată', cfg.bio ? `Deblochează cu ${bioName()}, apoi schimbă parola din Profil › Securitate.` : 'Parola aplicației se poate reseta doar cu parola contului ACM Docs. Fără cont, reinstalează aplicația (datele locale se pierd).', 'Am înțeles', 'Închide');
    }
    const pw = await UI.modal((box, close) => {
      const i = el('input', { class: 'in', type: 'password', placeholder: 'Parola contului', autocomplete: 'current-password', autofocus: true });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(i.value); });
      box.append(el('h2', { text: 'Resetează parola aplicației' }), el('p', { text: `Confirmă cu parola contului ${u.email}. Parola aplicației va fi ștearsă și o poți seta din nou din Profil.` }), i,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'Confirmă', onclick: () => close(i.value) })]));
    });
    if (!pw) return;
    try {
      await Account.checkPassword(pw);
      cfg.pw = null; save();
      UI.toast('Parola aplicației a fost ștearsă.');
      unlock();
    } catch (e) { UI.toast(Account.say(e), { error: true }); }
  }

  // ---------------------------------------------------------------- when to lock
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) return;
    if (document.hidden) { hiddenAt = Date.now(); if (cfg.after === 0) show(); }
    else if (hiddenAt && Date.now() - hiddenAt >= cfg.after) show();
  });

  // ---------------------------------------------------------------- settings (Profile › Security)
  async function settings() {
    const hasBio = await Host.biometricsAvailable();
    const act = await UI.modal((box, close) => {
      box.classList.add('applock-set');
      const sw = (on) => el('span', { class: 'sw' + (on ? ' on' : ''), 'aria-hidden': 'true' });
      const row = (label, sub, on, key, disabled) => {
        const r = el('button', { class: 'srow', type: 'button', disabled: disabled || null }, [el('span', { class: 'stx' }, [el('b', { text: label }), sub ? el('small', { text: sub }) : null]), on === null ? el('span', { class: 'chev', html: svg('right') }) : sw(on)]);
        r.addEventListener('click', () => close(key));
        return r;
      };
      const afterLabel = { 0: 'Imediat', 60000: 'După 1 minut', 300000: 'După 5 minute', 900000: 'După 15 minute' }[cfg.after] || 'După 1 minut';
      box.append(
        el('h2', { text: 'Blocarea aplicației' }),
        el('p', { class: 'muted small', text: 'Opțional. La pornire și când revii în aplicație, ACM Docs cere confirmarea ta. Setarea e separată pe fiecare dispozitiv.' }),
        el('div', { class: 'list-card' }, [
          row(`Deblocare cu ${bioName()}`, hasBio ? null : 'Nu este disponibilă pe acest dispozitiv', !!cfg.bio, 'bio', !hasBio && !cfg.bio),
          row('Parola aplicației', cfg.pw ? 'Activă · atinge ca s-o schimbi sau s-o oprești' : 'Oprită', null, 'pw'),
          enabled() ? row('Blochează', afterLabel, null, 'after') : null,
        ]),
        el('div', { class: 'actions' }, [el('button', { class: 'btn primary', type: 'button', text: 'Gata', onclick: () => close(null) })]),
      );
    });
    if (act === 'bio') {
      if (!cfg.bio) { if (!(await Host.confirmOwner('Activează deblocarea ACM Docs'))) return settings(); }
      cfg.bio = !cfg.bio; save();
      return settings();
    }
    if (act === 'pw') { await passwordFlow(); return settings(); }
    if (act === 'after') {
      const v = await UI.modal((box, close) => {
        box.append(el('h2', { text: 'Când se blochează' }), el('div', { class: 'list-card' }, [[0, 'Imediat ce ieși din aplicație'], [60000, 'După 1 minut'], [300000, 'După 5 minute'], [900000, 'După 15 minute']].map(([ms, l]) => {
          const r = el('button', { class: 'srow', type: 'button' }, [el('span', { class: 'stx' }, [el('b', { text: l })]), cfg.after === ms ? el('span', { class: 'chev', html: svg('check') }) : null]);
          r.addEventListener('click', () => close(ms));
          return r;
        })));
      });
      if (typeof v === 'number') { cfg.after = v; save(); }
      return settings();
    }
  }

  async function passwordFlow() {
    if (cfg.pw) {
      const c = await UI.modal((box, close) => {
        box.append(el('h2', { text: 'Parola aplicației' }), el('div', { class: 'actions col' }, [
          el('button', { class: 'btn primary', type: 'button', text: 'Schimbă parola', onclick: () => close('change') }),
          el('button', { class: 'btn danger-text', type: 'button', text: 'Oprește parola', onclick: () => close('off') }),
          el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }),
        ]));
      });
      if (!c) return;
      // the current password first (or biometrics)
      const old = await askPassword('Parola actuală', 'Confirmă cu parola actuală a aplicației.', false);
      if (old == null) return;
      if (A().passwordVerifier(old, cfg.pw.s).h !== cfg.pw.h) return UI.toast('Parola actuală nu este corectă.', { error: true });
      if (c === 'off') { cfg.pw = null; save(); return UI.toast('Parola aplicației a fost oprită.'); }
    }
    const np = await askPassword('Parolă nouă', 'Cel puțin 6 caractere. Nu o folosi și în alte locuri.', true);
    if (np == null) return;
    UI.busy('Se salvează…');
    await new Promise((r) => setTimeout(r, 30));
    try { cfg.pw = A().passwordVerifier(np); save(); } finally { UI.busy(); }
    UI.toast('Parola aplicației este activă.');
  }

  function askPassword(title, text, twice) {
    return UI.modal((box, close) => {
      const a = el('input', { class: 'in', type: 'password', placeholder: twice ? 'Parola nouă' : 'Parola', autocomplete: twice ? 'new-password' : 'current-password', autofocus: true });
      const b = twice ? el('input', { class: 'in', type: 'password', placeholder: 'Confirmă parola', autocomplete: 'new-password' }) : null;
      const err = el('p', { class: 'auth-err', role: 'alert' });
      const done = () => {
        if (twice && a.value.length < 6) { err.textContent = 'Parola are cel puțin 6 caractere.'; err.classList.add('on'); return; }
        if (twice && a.value !== b.value) { err.textContent = 'Parolele nu sunt la fel.'; err.classList.add('on'); return; }
        close(a.value);
      };
      [a, b].forEach((i) => i && i.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); }));
      box.append(el('h2', { text: title }), el('p', { class: 'muted small', text }), el('div', { class: 'pw-box' }, [a, b]), err,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'Continuă', onclick: done })]));
    });
  }

  const summary = () => (!enabled() ? 'Oprită' : [cfg.bio ? bioName() : null, cfg.pw ? 'parolă' : null].filter(Boolean).join(' + '));

  return { start: show, settings, summary, enabled, get locked() { return locked; } };
})();
