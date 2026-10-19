'use strict';
// The account's devices: each has its own key, made on the device. The server gives a session only
// to a device that proves it holds that key and is not blocked.
//  - the first device of the account is the primary: it can block any device; the others can block
//    devices of the same level
//  - a new device joins with a QR code: an already signed-in device approves it (after Face ID /
//    fingerprint) and hands it the account keys, encrypted for that device only
//  - every new sign-in shows an alert on the other devices, with "That wasn't me → block"
// Device names are encrypted with the account's key: the server only sees ids and dates.

const Devices = (() => {
  const A = () => window.__lib.acmcrypto;
  const F = () => window.__lib.firebase;
  const uid = () => (Account.current() ? Account.current().uid : null);
  const LS = { dev: (u) => 'acm.dev.' + u, key: (u) => 'acm.devkey.' + u, seen: (u) => 'acm.events.seen.' + u };
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  let devKey = null, pollTimer = null, vkey = null;

  // ---------------------------------------------------------------- this device
  function myDevice() { return uid() ? ls.get(LS.dev(uid())) : null; }
  function loadKey() {
    if (devKey) return devKey;
    const b = uid() && ls.get(LS.key(uid()));
    if (b) devKey = A().importSecrets(Host.fromB64(b));
    return devKey;
  }
  function newKey() { devKey = A().deriveIdentity(A().generateMnemonic()); return devKey; }
  function keep(u, dev, key) { ls.set(LS.dev(u), dev); ls.set(LS.key(u), Host.toB64(A().exportSecrets(key))); devKey = key; }
  function forget(u) { [LS.dev(u), LS.key(u), LS.seen(u)].forEach(ls.del); devKey = null; vkey = null; }

  function describe() {
    const ua = navigator.userAgent || '';
    const p = (Host.info && Host.info.platform) || (Host.mobile ? 'android' : 'windows');
    let name = p === 'ios' ? (/iPad/.test(ua) || (Host.info && Host.info.idiom === 'pad') ? 'iPad' : 'iPhone') : p === 'android' ? 'Telefon Android' : /Mac/.test(ua) ? 'Mac' : 'Calculator Windows';
    if (Host.info && Host.info.model) name = Host.info.model;
    return { name, platform: p, os: (Host.info && (Host.info.os || Host.info.system)) || '', app: (Host.info && Host.info.version) || '' };
  }
  const vaultKey = async (reason) => { if (!vkey) vkey = A().vaultKey(await Account.unlock(reason || 'Deblochează cheile contului')); return vkey; };
  async function sealInfo(dev) { return Host.toB64(A().vaultSealText(await vaultKey(), describe(), 'device:' + dev)); }
  function openInfo(d) {
    if (!d.info || !vkey) return null;
    try { return A().vaultOpenText(vkey, Host.fromB64(d.info), 'device:' + d.id); } catch (e) { return null; }
  }

  /**
   * After the account keys are on this device: make sure it is a registered device with a device
   * session. Returns 'ok', or 'blocked' (this device was blocked: it signs out and forgets the keys).
   */
  async function ensure() {
    const u = uid();
    if (!u) return 'none';
    const dev = myDevice();
    if (dev && loadKey()) {
      const c = await Account.claims();
      if (c.dev === dev) return 'ok';
      try {
        const ts = Date.now();
        const r = await Account.call('deviceSession', { uid: u, dev, ts, sig: Host.toB64(A().signEd(devKey, `acm-session\n${u}\n${dev}\n${ts}`)) });
        await Account.signInWithToken(r.token);
        return 'ok';
      } catch (e) {
        if (/blocked/.test(e.server || '')) return wipeBlocked();
        if (!/unknown device/.test(e.server || '')) throw e;
        forget(u); // the server no longer knows it: register again
      }
    }
    // a new device on this account (signed in with password / Google, has the account keys)
    const id = await Account.unlock('Confirmă ca să adaugi acest dispozitiv la cont');
    const key = newKey();
    const ts = Date.now();
    const r = await Account.call('registerDevice', { bundle: Host.toB64(key.bundle), ts, proof: Host.toB64(A().signEd(id, `acm-register\n${u}\n${key.fingerprint}\n${ts}`)) });
    keep(u, r.dev, key);
    await Account.signInWithToken(r.token);
    vkey = A().vaultKey(id);
    try { await saveInfo(); } catch (e) { console.warn('device info', e); }
    ls.set(LS.seen(u), String(Date.now()));
    return 'ok';
  }
  async function saveInfo() {
    const { F: f, db } = Account.internals();
    const dev = myDevice();
    await f.firestore.updateDoc(f.firestore.doc(db, 'accounts', uid(), 'devices', dev), { info: await sealInfo(dev) });
  }

  async function wipeBlocked() {
    const u = uid();
    forget(u);
    try { await Host.secureDelete('words.' + u); await Host.secureDelete('keys.' + u); } catch (e) {}
    try { await Account.signOut(); } catch (e) {}
    await UI.confirm('Acest dispozitiv a fost blocat', 'Un alt dispozitiv al contului a blocat acest dispozitiv. Cheile contului au fost șterse de aici. Dacă a fost o greșeală, conectează-te din nou: vei avea nevoie de codul de recuperare sau de un cod QR de pe alt dispozitiv.', 'Am înțeles', 'Închide');
    return 'blocked';
  }

  // ---------------------------------------------------------------- reading the list
  async function list() {
    const { F: f, db } = Account.internals();
    const snap = await f.firestore.getDocs(f.firestore.collection(db, 'accounts', uid(), 'devices'));
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }
  async function events() {
    const { F: f, db } = Account.internals();
    const q = f.firestore.query(f.firestore.collection(db, 'accounts', uid(), 'events'), f.firestore.orderBy('at', 'desc'), f.firestore.limit(30));
    return (await f.firestore.getDocs(q)).docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  const when = (t) => (ms(t) ? new Date(ms(t)).toLocaleString(I18n.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const ICON = { ios: 'camera', android: 'camera', windows: 'doc' };
  void ICON;
  const nameOf = (d) => { const i = openInfo(d); return i ? i.name : d.id === myDevice() ? describe().name : 'Dispozitiv'; };
  const subOf = (d) => { const i = openInfo(d); return i ? [i.platform === 'ios' ? 'iOS' : i.platform === 'android' ? 'Android' : i.platform === 'windows' ? 'Windows' : i.platform, i.os].filter(Boolean).join(' ') : ''; };
  const VIA = { create: 'a creat contul', password: 'conectat cu parola', qr: 'conectat cu cod QR' };

  // ---------------------------------------------------------------- new sign-in alerts
  async function checkAlerts() {
    const u = uid();
    if (!u || !myDevice() || document.hidden) return;
    let evs;
    try { evs = await events(); } catch (e) { if (/permission/i.test(String(e && (e.code || e.message)))) { const st = await ensure().catch(() => null); if (st === 'blocked') stop(); } return; }
    const seen = +(ls.get(LS.seen(u)) || 0);
    const fresh = evs.filter((e) => e.type === 'signin' && e.dev !== myDevice() && ms(e.at) > seen).reverse();
    if (!evs.length) return;
    ls.set(LS.seen(u), String(Math.max(seen, ...evs.map((e) => ms(e.at)))));
    if (!fresh.length) return;
    const devs = await list().catch(() => []);
    for (const e of fresh) {
      const d = devs.find((x) => x.id === e.dev) || { id: e.dev };
      if (d.status && d.status !== 'active') continue;
      await alertSignIn(e, d, devs);
    }
  }
  async function alertSignIn(e, d, devs) {
    const me = devs.find((x) => x.id === myDevice());
    const canBlock = me && (me.role === 'primary' || d.role !== 'primary');
    const act = await UI.modal((box, close) => {
      box.append(
        el('div', { class: 'acm-alert', html: svg('shield') }),
        el('h2', { text: 'Conectare nouă în contul tău' }),
        el('div', { class: 'recv-from' }, [
          el('b', { class: 'no-tr', text: nameOf(d) }),
          el('small', { class: 'muted', text: [subOf(d), VIA[e.via] || '', when(e.at)].filter(Boolean).join(' · ') }),
        ]),
        el('p', { class: 'muted small', text: canBlock ? 'Dacă nu ai fost tu, blochează dispozitivul acum: pierde imediat accesul la cont, iar datele noi nu le mai poate deschide.' : 'Dacă nu ai fost tu, blochează-l de pe dispozitivul principal și schimbă parola contului.' }),
        el('div', { class: 'actions col' }, [
          canBlock ? el('button', { class: 'btn danger', type: 'button', text: 'Nu am fost eu: blochează', onclick: () => close('block') }) : null,
          el('button', { class: 'btn primary', type: 'button', text: 'Am fost eu', onclick: () => close(null) }),
        ]),
      );
    });
    if (act === 'block') await block(d, true);
  }

  function start() {
    stop();
    checkAlerts();
    pollTimer = setInterval(checkAlerts, 45000);
    document.addEventListener('visibilitychange', onVisible);
  }
  function stop() { clearInterval(pollTimer); pollTimer = null; document.removeEventListener('visibilitychange', onVisible); }
  function onVisible() { if (!document.hidden) checkAlerts(); }

  // ---------------------------------------------------------------- blocking
  async function block(d, fromAlert) {
    const name = nameOf(d);
    if (!fromAlert && !(await UI.confirm(`Blochezi „${name}”?`, 'Dispozitivul pierde imediat accesul la cont și la datele din cloud. Blocarea este definitivă: ca să-l folosești din nou, va trebui conectat de la zero.', 'Blochează'))) return false;
    if (!(await Host.confirmOwner(`Confirmă blocarea dispozitivului „${name}”`))) return false;
    UI.busy('Se blochează…');
    try {
      await Account.call('blockDevice', { target: d.id });
      // our own session was renewed on the server side: get a fresh one
      await ensure();
      UI.busy();
      UI.toast(`„${name}” a fost blocat.`);
      return true;
    } catch (e) {
      UI.busy();
      UI.toast(/only the primary/.test(e.server || '') ? 'Doar dispozitivul principal poate bloca dispozitivul principal.' : Account.say(e), { error: true });
      return false;
    }
  }

  // ---------------------------------------------------------------- the Devices screen
  async function show() {
    if (!(await AcmShare.ensureAccount())) return;
    try { await vaultKey('Deblochează ca să vezi dispozitivele contului'); } catch (e) { if (String(e && e.message) === 'cancel') return; }
    let devs = [];
    const load = async () => { devs = await list(); };
    try { UI.busy('Se încarcă…'); await ensure(); await load(); } catch (e) { UI.busy(); return UI.toast(Account.say(e), { error: true }); } finally { UI.busy(); }
    let live = null;
    const act = await UI.modal((box, close) => {
      box.classList.add('devices');
      const body = el('div');
      const draw = () => {
        body.innerHTML = '';
        const me = devs.find((x) => x.id === myDevice()) || {};
        const active = devs.filter((d) => d.status === 'active').sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : ms(b.lastSeen) - ms(a.lastSeen)));
        const blocked = devs.filter((d) => d.status === 'blocked');
        const row = (d) => {
          const mine = d.id === myDevice();
          const canBlock = !mine && d.status === 'active' && (me.role === 'primary' || d.role !== 'primary');
          const tags = [d.role === 'primary' ? el('span', { class: 'dtag pri', text: 'Principal' }) : null, mine ? el('span', { class: 'dtag me', text: 'Acesta' }) : null];
          const r = el('div', { class: 'drow' + (d.status !== 'active' ? ' off' : '') }, [
            el('span', { class: 'dico', html: svg(d.status === 'active' ? 'lock' : 'close') }),
            el('span', { class: 'ctx' }, [
              el('b', { class: 'no-tr' }, [nameOf(d), ...tags.filter(Boolean)]),
              el('small', { class: 'muted', text: d.status === 'active' ? [subOf(d), mine ? 'activ acum' : 'văzut ' + when(d.lastSeen)].filter(Boolean).join(' · ') : 'blocat ' + when(d.blockedAt) }),
              el('small', { class: 'muted', text: `Adăugat ${when(d.created)} · ${VIA[d.via] || ''}` }),
            ]),
            canBlock ? el('button', { class: 'btn danger-text dblock', type: 'button', text: 'Blochează', onclick: () => close({ block: d }) }) : null,
          ]);
          return r;
        };
        body.append(el('div', { class: 'list-card' }, active.map(row)));
        body.append(el('p', { class: 'muted small', text: me.role === 'primary' ? 'Acesta este dispozitivul principal: poate bloca orice alt dispozitiv al contului.' : 'Acest dispozitiv poate bloca doar dispozitivele de același nivel. Dispozitivul principal le poate bloca pe toate.' }));
        if (blocked.length) body.append(el('h3', { class: 'csub', text: 'Blocate' }), el('div', { class: 'list-card' }, blocked.map(row)));
        hydrateIcons(body);
      };
      draw();
      // live: the list refreshes while it is open
      live = setInterval(async () => { try { await load(); draw(); } catch (e) {} }, 10000);
      box.append(
        el('h2', { text: 'Dispozitive' }),
        body,
        el('div', { class: 'actions col' }, [
          el('button', { class: 'btn primary', type: 'button', html: svg('qr') + '<span>Conectează un dispozitiv nou</span>', onclick: () => close('pair') }),
          el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]),
      );
    });
    clearInterval(live);
    if (act && act.block) { await block(act.block); return show(); }
    if (act === 'pair') { await approveNew(); return show(); }
  }

  // ---------------------------------------------------------------- QR: the device that is already in
  async function approveNew() {
    if (!(await Host.confirmOwner('Confirmă ca să conectezi un dispozitiv nou'))) return;
    let text;
    try { text = await Contacts.scanCode('Scanează codul QR afișat pe dispozitivul nou'); } catch (e) { return UI.toast(e.message || String(e), { error: true }); }
    if (!text) return;
    const m = /^ACMP1:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(String(text).trim());
    if (!m) return UI.confirm('Nu este un cod de conectare', 'Pe dispozitivul nou alege „Conectează-te cu cod QR” și scanează codul afișat acolo.', 'Am înțeles', 'Închide');
    const [, pid, fp] = m;
    let got;
    try { UI.busy('Se verifică…'); got = await Account.call('pairGet', { pid }); } catch (e) { UI.busy(); return UI.toast(/expired/.test(e.server || '') ? 'Codul a expirat. Generează unul nou pe dispozitivul nou.' : Account.say(e), { error: true }); } finally { UI.busy(); }
    if (got.fp !== fp || A().fingerprint(Host.fromB64(got.bundle)) !== fp) {
      return UI.confirm('Codul nu se potrivește', 'Cheia primită de la server nu este cea din codul QR. Nu continua: încearcă din nou, cu un cod nou.', 'Am înțeles', 'Închide');
    }
    const ok = await UI.confirm('Conectezi dispozitivul nou?', 'Dispozitivul va avea acces complet la cont: documente criptate, contacte și datele din cloud. Conectează doar dispozitive care îți aparțin.', 'Conectează');
    if (!ok) return;
    try {
      const id = await Account.unlock('Confirmă conectarea dispozitivului nou');
      const words = await Account.words('Confirmă conectarea dispozitivului nou');
      if (!words) throw new Error('Codul de recuperare nu este pe acest dispozitiv.');
      const payload = new TextEncoder().encode(JSON.stringify({ v: 1, words, handle: Account.handle() }));
      const sealed = A().seal({ bytes: payload, name: 'acm-account-keys', mime: 'application/json' }, id, [Host.fromB64(got.bundle)]);
      UI.busy('Se conectează…');
      await Account.call('pairApprove', { pid, fp, sealed: Host.toB64(sealed) });
      UI.busy();
      UI.toast('Dispozitivul nou a fost conectat.');
    } catch (e) { UI.busy(); if (String(e && e.message) !== 'cancel') UI.toast(Account.say(e), { error: true }); }
  }

  // ---------------------------------------------------------------- QR: the new device
  /** Sign-in screen → "Sign in with a QR code": shows the code, waits for an approval, signs in. */
  async function pairThisDevice() {
    const key = newKey();
    let pid;
    try { UI.busy('Se pregătește codul…'); pid = (await Account.call('pairStart', { bundle: Host.toB64(key.bundle) })).pid; } catch (e) { UI.busy(); return UI.toast(Account.say(e), { error: true }); } finally { UI.busy(); }
    const qr = `ACMP1:${pid}:${key.fingerprint}`;
    let stopPoll = false;
    const result = await UI.modal((box, close) => {
      box.classList.add('mycode');
      const status = el('p', { class: 'muted small', text: 'Așteptăm confirmarea…' });
      box.append(
        el('h2', { text: 'Conectează-te cu cod QR' }),
        el('div', { class: 'qr-card' }, [el('div', { class: 'qr-img', html: window.__lib.qr.svg(qr) }), el('small', { class: 'qr-fp no-tr', text: key.fingerprint.slice(0, 20).toUpperCase().match(/.{4}/g).join(' ') })]),
        el('ol', { class: 'sh-tips' }, [
          el('li', { text: 'Deschide ACM Docs pe un dispozitiv deja conectat la cont.' }),
          el('li', { text: 'Profil › Dispozitive › Conectează un dispozitiv nou.' }),
          el('li', { text: 'Confirmă cu Face ID / amprenta și scanează acest cod.' }),
        ]),
        status,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]),
      );
      const started = Date.now();
      const poll = async () => {
        if (stopPoll) return;
        if (Date.now() - started > 5 * 60 * 1000) { status.textContent = 'Codul a expirat. Închide și încearcă din nou.'; return; }
        try {
          const r = await Account.call('pairPoll', { pid, sig: Host.toB64(A().signEd(key, `acm-pair\n${pid}`)) });
          if (r.status === 'approved') return close(r);
        } catch (e) { if (/expired/.test(e.server || '')) { status.textContent = 'Codul a expirat. Închide și încearcă din nou.'; return; } }
        setTimeout(poll, 2500);
      };
      setTimeout(poll, 2500);
    });
    stopPoll = true;
    if (!result) return false;
    UI.busy('Se conectează…');
    try {
      const opened = A().open(Host.fromB64(result.sealed), key);
      const pl = JSON.parse(new TextDecoder().decode(opened.bytes));
      await Account.signInWithToken(result.token);
      const profile = await Account.profileOf(result.uid);
      if (!profile || profile.fp !== opened.sender.fingerprint) throw new Error('Cheile primite nu aparțin acestui cont.');
      keep(result.uid, result.dev, key);
      await Account.restoreKeys(pl.words);
      vkey = A().vaultKey(await Account.unlock());
      try { await saveInfo(); } catch (e) { console.warn('device info', e); }
      ls.set(LS.seen(result.uid), String(Date.now()));
      UI.busy();
      return true;
    } catch (e) {
      UI.busy();
      forget(result.uid);
      UI.errorDetails('Conectarea cu cod QR nu a reușit', e);
      return false;
    }
  }

  /** Sign out on this device: the device leaves the account's list. */
  async function leave() {
    const u = uid();
    if (!u) return;
    try { if (myDevice()) await Account.call('leaveDevice', {}); } catch (e) { console.warn('leave', e); }
    forget(u);
    stop();
  }

  return { ensure, start, stop, show, pairThisDevice, leave, myDevice, block };
})();
