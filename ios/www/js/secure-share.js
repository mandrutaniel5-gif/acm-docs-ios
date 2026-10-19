'use strict';
// Contacts (@name, QR verification) and encrypted .acm documents: send and open.
//
// Who is who:
//  - you find a person by their @name; the server gives their padlock (public key)
//  - to be SURE the padlock is really theirs (and not one slipped in by a hacked server), you scan
//    their QR code face to face, or compare the 60-digit safety code: the contact becomes "Verificat"
//  - contacts and what you verified stay on this device; if a contact's padlock ever changes, the app
//    stops and warns before sending anything to them

Object.assign(Icons, {
  qr: 'M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z',
  people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  warn: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  verified: 'M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  lockfile: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1 15c0 .55-.45 1-1 1h-4c-.55 0-1-.45-1-1v-3c0-.55.45-1 1-1v-1c0-1.1.9-2 2-2s2 .9 2 2v1c.55 0 1 .45 1 1v3zm-2-4v-1c0-.55-.45-1-1-1s-1 .45-1 1v1h2zm0-4V3.5L18.5 9H13z',
});

const Contacts = (() => {
  const A = () => window.__lib.acmcrypto;
  const QR_PREFIX = 'ACMC1';
  const me = () => Account.current();
  const key = () => 'acm.contacts.' + (me() ? me().uid : '-');

  // ---------------------------------------------------------------- storage (this device only)
  function all() {
    try { return JSON.parse(localStorage.getItem(key()) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveAll(map) { try { localStorage.setItem(key(), JSON.stringify(map)); } catch (e) {} }
  const get = (uid) => all()[uid] || null;
  function put(c) { const m = all(); m[c.uid] = c; saveAll(m); return c; }
  function remove(uid) { const m = all(); delete m[uid]; saveAll(m); }
  const list = () => Object.values(all()).sort((a, b) => (a.name || a.handle).localeCompare(b.name || b.handle, 'ro'));

  /** 'verified' | 'unverified' | 'changed' */
  const status = (c) => (c.pending ? 'changed' : c.verified ? 'verified' : 'unverified');
  const keyBytes = (c) => Host.fromB64(c.key);
  const shortFp = (fp) => String(fp || '').slice(0, 20).toUpperCase().match(/.{4}/g).join(' ');

  /** Adds someone found on the server (not verified yet). */
  function addFromProfile(p) {
    const old = get(p.uid);
    if (old && old.fp === p.fp) return put(Object.assign(old, { handle: p.handle, name: p.name || old.name }));
    if (old && old.fp !== p.fp) return put(Object.assign(old, { pending: { fp: p.fp, key: Host.toB64(p.key), handle: p.handle, name: p.name } }));
    return put({ uid: p.uid, handle: p.handle, name: p.name, fp: p.fp, key: Host.toB64(p.key), verified: false, added: Date.now() });
  }

  /** Asks the server for the latest padlock of each contact; a different one is flagged, never swapped silently. */
  async function refresh(c) {
    let p = null;
    try { p = await Account.profileOf(c.uid); } catch (e) { return get(c.uid); }
    if (!p) return put(Object.assign(get(c.uid) || c, { gone: true }));
    const cur = get(c.uid) || c;
    delete cur.gone;
    if (p.fp === cur.fp) { delete cur.pending; return put(Object.assign(cur, { handle: p.handle, name: p.name || cur.name })); }
    return put(Object.assign(cur, { pending: { fp: p.fp, key: Host.toB64(p.key), handle: p.handle, name: p.name } }));
  }
  /** The person confirmed (or re-verified) the new padlock. */
  function acceptNewKey(uid, verified) {
    const c = get(uid);
    if (!c || !c.pending) return c;
    Object.assign(c, { fp: c.pending.fp, key: c.pending.key, handle: c.pending.handle || c.handle, name: c.pending.name || c.name, verified: !!verified });
    delete c.pending;
    return put(c);
  }

  async function myBundle() {
    const prof = await Account.profileOf(me().uid);
    if (!prof) throw new Error('Contul tău nu are încă lacătul publicat.');
    return prof.key;
  }

  // ---------------------------------------------------------------- QR
  const myQrText = () => `${QR_PREFIX}:${Account.handle()}:${me().uid}:${Account.fingerprint()}`;
  function parseQr(text) {
    const m = /^ACMC1:([a-z0-9_]{3,20}):([A-Za-z0-9]{10,64}):([0-9a-f]{64})$/.exec(String(text || '').trim());
    return m ? { handle: m[1], uid: m[2], fp: m[3] } : null;
  }

  /** Reads a QR code: live camera (iPhone native or webcam), else a photo of it. */
  async function scan() {
    const native = await Host.scanQR('Scanează codul QR al persoanei din aplicația ei (Setări › Codul meu)');
    if (native !== undefined) return native;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try { return await webcamScan(); } catch (e) { console.warn('webcam', e); }
    }
    const p = Host.mobile ? await Host.camera() : await Host.openDialog('image');
    if (!p) return null;
    const text = await readQrFromImage(await Host.readFileAsync(p));
    if (!text) UI.toast('Nu am găsit niciun cod QR în poză. Încearcă din nou, mai de aproape.', { error: true });
    return text;
  }
  async function readQrFromImage(bytes) {
    const blob = new Blob([bytes]);
    const img = await createImageBitmap(blob);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    return window.__lib.qr.read(g.getImageData(0, 0, c.width, c.height));
  }
  function webcamScan() {
    return new Promise(async (resolve, reject) => {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { return reject(e); }
      let stop = false;
      const video = el('video', { class: 'qr-video', autoplay: true, playsinline: true, muted: true });
      video.muted = true;
      video.srcObject = stream;
      const end = () => { stop = true; stream.getTracks().forEach((t) => t.stop()); };
      const res = UI.modal((box, close) => {
        box.classList.add('qr-scan');
        box.append(el('h2', { text: 'Scanează codul QR' }), el('div', { class: 'qr-cam' }, [video, el('i')]),
          el('p', { class: 'muted', text: 'Ține codul persoanei în fața camerei.' }),
          el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
        const c = document.createElement('canvas');
        const tick = () => {
          if (stop) return;
          if (video.readyState >= 2 && video.videoWidth) {
            c.width = video.videoWidth; c.height = video.videoHeight;
            const g = c.getContext('2d');
            g.drawImage(video, 0, 0);
            const t = window.__lib.qr.read(g.getImageData(0, 0, c.width, c.height));
            if (t) return close(t);
          }
          setTimeout(() => requestAnimationFrame(tick), 120);
        };
        tick();
      });
      res.then((v) => { end(); resolve(v || null); });
    });
  }

  /** Scan someone's code: adds them (if needed) and marks them verified when everything matches. */
  async function scanAndVerify(expectUid) {
    let text;
    try { text = await scan(); } catch (e) { return UI.toast(e.message || String(e), { error: true }); }
    if (!text) return null;
    const q = parseQr(text);
    if (!q) { await UI.confirm('Nu este un cod ACM Docs', 'Codul scanat nu este codul unui cont ACM Docs. Cere persoanei să deschidă Setări › Codul meu.', 'Am înțeles', 'Închide'); return null; }
    if (q.uid === me().uid) { UI.toast('Acesta este codul tău.'); return null; }
    if (expectUid && q.uid !== expectUid) {
      await UI.confirm('Alt cont', `Codul scanat este al lui @${q.handle}, nu al persoanei pe care o verifici.`, 'Am înțeles', 'Închide');
      return null;
    }
    UI.busy('Se verifică…');
    let p = null;
    try { p = await Account.profileOf(q.uid); } catch (e) { UI.busy(); UI.toast(Account.say(e), { error: true }); return null; } finally { UI.busy(); }
    if (!p) { await UI.confirm('Cont inexistent', `Contul @${q.handle} nu mai există.`, 'Am înțeles', 'Închide'); return null; }
    if (p.fp !== q.fp) {
      // the server's padlock is not the one on the person's own phone: someone is in the middle
      await UI.modal((box, close) => {
        box.append(el('div', { class: 'acm-alert danger', html: svg('warn') }), el('h2', { text: 'Atenție: codurile nu se potrivesc' }),
          el('p', { text: `Lacătul pe care serverul îl dă pentru @${q.handle} NU este cel din telefonul persoanei. Fie și-a refăcut cheile chiar acum, fie cineva încearcă să intercepteze documentele trimise ei.` }),
          el('p', { html: '<b>Nu trimite nimic sensibil</b> până nu lămuriți, față în față, ce s-a întâmplat.' }),
          el('div', { class: 'actions' }, [el('button', { class: 'btn primary', type: 'button', text: 'Am înțeles', onclick: () => close() })]));
      });
      return null;
    }
    const cur = get(q.uid);
    if (cur && cur.fp !== p.fp) acceptNewKey(q.uid, true); // the new padlock is confirmed face to face
    const c = cur && cur.fp === p.fp ? cur : get(q.uid) || addFromProfile(p);
    c.verified = true; c.verifiedAt = Date.now(); delete c.pending;
    Object.assign(c, { handle: p.handle, name: p.name || c.name, fp: p.fp, key: Host.toB64(p.key) });
    put(c);
    UI.toast(`@${c.handle} este verificat ✓`);
    return c;
  }

  // ---------------------------------------------------------------- UI pieces
  function badge(c) {
    const st = status(c);
    const map = { verified: ['verified', 'Verificat', 'ok'], unverified: ['info', 'Neverificat', 'warn'], changed: ['warn', 'Cheia s-a schimbat', 'bad'] };
    const [icon, label, cls] = map[st];
    return el('span', { class: 'cbadge ' + cls, html: svg(icon) + `<span>${label}</span>` });
  }
  const avatar = (c) => el('span', { class: 'cav', text: ((c.name || c.handle || '?').trim()[0] || '?').toUpperCase() });
  function contactRow(c, onClick, right) {
    const r = el('button', { class: 'crow', type: 'button' }, [
      avatar(c),
      el('span', { class: 'ctx' }, [el('b', { class: 'no-tr', text: c.name || '@' + c.handle }), el('small', { class: 'no-tr', text: '@' + c.handle })]),
      right || badge(c),
    ]);
    if (onClick) r.addEventListener('click', onClick);
    return r;
  }

  /** "@name" search box: finds the person on the server and returns their profile. */
  function searchBox(onFound) {
    const box = el('form', { class: 'csearch', novalidate: true });
    const input = el('input', { class: 'in', type: 'text', placeholder: '@numele persoanei', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' });
    const go = el('button', { class: 'btn primary', type: 'submit', text: 'Caută' });
    const out = el('div', { class: 'cfound' });
    box.append(el('div', { class: 'crow-in' }, [el('i', { class: 'at', text: '@' }), input, go]), out);
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const h = Account.cleanHandle(input.value);
      out.innerHTML = '';
      if (!h) return;
      const prob = Account.handleProblem(h);
      if (prob) { out.append(el('p', { class: 'cmsg', text: prob })); return; }
      go.disabled = true;
      try {
        const p = await Account.lookup(h);
        if (!p) { out.append(el('p', { class: 'cmsg', text: `Nu există niciun cont @${h}. Verifică scrierea.` })); return; }
        if (p.uid === me().uid) { out.append(el('p', { class: 'cmsg', text: 'Acesta este contul tău.' })); return; }
        onFound(p, out);
      } catch (x) { out.append(el('p', { class: 'cmsg', text: Account.say(x) })); } finally { go.disabled = false; }
    });
    return box;
  }

  // ---------------------------------------------------------------- My code
  async function showMyCode() {
    if (!(await AcmShare.ensureAccount())) return;
    let bundle = null;
    try { bundle = await myBundle(); } catch (e) { return UI.toast(Account.say(e), { error: true }); }
    const fp = A().fingerprint(bundle);
    await UI.modal((box, close) => {
      box.classList.add('mycode');
      box.append(
        el('h2', { text: 'Codul meu' }),
        el('div', { class: 'qr-card' }, [
          el('div', { class: 'qr-img', html: window.__lib.qr.svg(myQrText()) }),
          el('b', { class: 'no-tr', text: me().displayName || '' }),
          el('span', { class: 'qr-h no-tr', text: '@' + Account.handle() }),
          el('small', { class: 'qr-fp no-tr', text: shortFp(fp) }),
        ]),
        el('p', { class: 'muted', text: 'Cine vrea să-ți trimită documente criptate scanează acest cod din aplicația lui (Setări › Contacte › Scanează). Așa e sigur că lacătul este al tău.' }),
        el('div', { class: 'recov-warn', html: `${svg('info')}<span>Scanați codul față în față sau prin apel video. Un cod primit prin mesaj de la altcineva nu dovedește nimic.</span>` }),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close() }),
          el('button', { class: 'btn primary', type: 'button', html: svg('camera') + '<span>Scanează alt cod</span>', onclick: async () => { close(); await scanAndVerify(); } }),
        ]),
      );
    });
  }

  // ---------------------------------------------------------------- contact list + details
  async function showList() {
    if (!(await AcmShare.ensureAccount())) return;
    await UI.modal((box, close) => {
      box.classList.add('contacts');
      const listBox = el('div', { class: 'clist' });
      const draw = () => {
        listBox.innerHTML = '';
        const cs = list();
        if (!cs.length) listBox.append(el('p', { class: 'cempty', text: 'Încă nu ai contacte. Caută pe cineva după @nume sau scanează-i codul QR.' }));
        cs.forEach((c) => listBox.append(contactRow(c, async () => { close(); await showContact(c.uid); })));
        hydrateIcons(listBox);
      };
      draw();
      box.append(
        el('h2', { text: 'Contacte' }),
        searchBox((p, out) => {
          const exists = get(p.uid);
          out.append(el('div', { class: 'cfound-card' }, [
            avatar(p), el('span', { class: 'ctx' }, [el('b', { class: 'no-tr', text: p.name || '@' + p.handle }), el('small', { class: 'no-tr', text: '@' + p.handle })]),
            el('button', { class: 'btn primary', type: 'button', text: exists ? 'Deschide' : 'Adaugă', onclick: async () => { if (!exists) addFromProfile(p); close(); await showContact(p.uid, !exists); } }),
          ]));
        }),
        el('button', { class: 'btn cscan', type: 'button', html: svg('camera') + '<span>Scanează codul QR al cuiva</span>', onclick: async () => { const c = await scanAndVerify(); if (c) draw(); } }),
        listBox,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close() })]),
      );
    });
  }

  async function showContact(uid, justAdded) {
    let c = get(uid);
    if (!c) return;
    UI.busy('Se încarcă…');
    try { c = await refresh(c); } finally { UI.busy(); }
    let mine = null;
    try { mine = await myBundle(); } catch (e) {}
    const st = status(c);
    const action = await UI.modal((box, close) => {
      box.classList.add('contact');
      box.append(
        el('div', { class: 'chead' }, [avatar(c), el('div', {}, [el('h2', { class: 'no-tr', text: c.name || '@' + c.handle }), el('span', { class: 'muted no-tr', text: '@' + c.handle })]), badge(c)]),
      );
      if (c.gone) box.append(el('div', { class: 'recov-warn', html: `${svg('info')}<span>Acest cont a fost șters. Nu-i mai poți trimite documente.</span>` }));
      if (st === 'changed') {
        box.append(
          el('div', { class: 'acm-alert danger', html: svg('warn') }),
          el('p', { html: `<b>Lacătul lui @${c.handle} s-a schimbat.</b> Se întâmplă dacă și-a refăcut contul sau cheile pe alt telefon fără cele 24 de cuvinte. Poate fi însă și un atac. Până nu verificați din nou, nu-i poți trimite documente.` }),
          el('div', { class: 'actions col' }, [
            el('button', { class: 'btn primary', type: 'button', html: svg('camera') + '<span>Scanează codul lui din nou</span>', onclick: () => close('scan') }),
            el('button', { class: 'btn', type: 'button', text: 'Acceptă cheia nouă fără verificare', onclick: () => close('accept') }),
          ]),
        );
      } else if (st === 'unverified' && !c.gone) {
        box.append(
          el('div', { class: 'recov-warn', html: `${svg('info')}<span>${justAdded ? 'Contact adăugat. ' : ''}Nu ai verificat încă faptul că lacătul este chiar al lui @${c.handle}. Pentru documente sensibile, verificați-vă codurile față în față.</span>` }),
        );
      }
      if (mine && st !== 'changed') {
        box.append(
          el('h3', { class: 'csub', text: 'Codul de siguranță' }),
          el('p', { class: 'muted small', text: 'Aceleași 60 de cifre apar și pe telefonul lui când deschide contactul tău. Dacă sunt identice, nimeni nu stă la mijloc.' }),
          el('div', { class: 'safety no-tr', text: A().safetyCode(mine, keyBytes(c)) }),
        );
      }
      const acts = [];
      if (!c.gone && st !== 'changed') {
        if (st !== 'verified') acts.push(el('button', { class: 'btn primary', type: 'button', html: svg('camera') + '<span>Verifică prin cod QR</span>', onclick: () => close('scan') }));
        if (st !== 'verified') acts.push(el('button', { class: 'btn', type: 'button', text: 'Cifrele sunt identice: marchează verificat', onclick: () => close('mark') }));
        else acts.push(el('button', { class: 'btn', type: 'button', text: 'Anulează verificarea', onclick: () => close('unmark') }));
      }
      acts.push(el('button', { class: 'btn danger-text', type: 'button', text: 'Șterge contactul', onclick: () => close('delete') }));
      acts.push(el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close() }));
      box.append(el('div', { class: 'actions col' }, acts));
    });
    if (action === 'scan') { const v = await scanAndVerify(uid); if (v) return showContact(uid); }
    else if (action === 'mark') {
      if (await UI.confirm('Sunt cifrele identice?', 'Marchează verificat doar dacă ați comparat toate cele 60 de cifre față în față sau la telefon, cu vocea persoanei.', 'Da, sunt identice')) {
        put(Object.assign(get(uid), { verified: true, verifiedAt: Date.now() }));
        UI.toast(`@${c.handle} este verificat ✓`);
      }
      return showContact(uid);
    } else if (action === 'unmark') { put(Object.assign(get(uid), { verified: false })); return showContact(uid); }
    else if (action === 'accept') {
      if (await UI.confirm('Accepți cheia nouă?', `Documentele trimise de acum vor putea fi deschise doar cu cheia nouă. Dacă nu ești sigur că @${c.handle} și-a schimbat cheile, întreabă-l întâi.`, 'Acceptă')) acceptNewKey(uid, false);
      return showContact(uid);
    } else if (action === 'delete') {
      if (await UI.confirm('Ștergi contactul?', `@${c.handle} dispare din contactele tale de pe acest dispozitiv.`, 'Șterge')) remove(uid);
    }
  }

  return { list, get, put, remove, status, refresh, addFromProfile, acceptNewKey, badge, avatar, contactRow, searchBox, scanAndVerify, showMyCode, showList, showContact, parseQr };
})();

const AcmShare = (() => {
  const A = () => window.__lib.acmcrypto;
  const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const yieldUI = () => new Promise((r) => setTimeout(r, 40));
  const safeName = (n) => String(n || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'document';

  /** Signed in, email confirmed, keys on this device and an @name: otherwise opens the right step. */
  async function ensureAccount() {
    if (typeof Account === 'undefined') return false;
    await Account.ready();
    const u = Account.current();
    if (!u) {
      if (await UI.confirm('Ai nevoie de un cont', 'Documentele criptate .acm se trimit și se deschid doar cu un cont ACM Docs. Durează un minut.', 'Intră în cont')) { Account.setSkipped(false); AccountUI.show('signin'); }
      return false;
    }
    if (Account.needsVerification()) { AccountUI.show('verify'); return false; }
    let st;
    try { st = await Account.keyState(); } catch (e) { UI.toast(Account.say(e), { error: true }); return false; }
    if (st !== 'ok') { await AccountUI.route(); return false; }
    return true;
  }

  async function freePath(dir, name) {
    Host.mkdirp(dir);
    const m = /^(.*?)(\.[^.]*)?$/.exec(name);
    let p = Host.join(dir, name), i = 2;
    while (Host.exists(p)) p = Host.join(dir, `${m[1]} (${i++})${m[2] || ''}`);
    return p;
  }
  async function docsDir(sub) {
    const base = await Host.specialDir('documents');
    return Host.join(base, sub);
  }

  // ---------------------------------------------------------------- send
  async function send(path) {
    if (!(await ensureAccount())) return;
    const name = Host.baseName(path);
    const choice = await pickRecipients(name);
    if (!choice) return;
    let { people, password } = choice;

    // last look at the server: a changed padlock stops everything
    UI.busy('Se verifică destinatarii…');
    try { people = await Promise.all(people.map((c) => Contacts.refresh(c))); } finally { UI.busy(); }
    const changed = people.filter((c) => Contacts.status(c) === 'changed' || c.gone);
    if (changed.length) {
      await UI.confirm('Nu pot trimite încă', `${changed.map((c) => '@' + c.handle).join(', ')}: ${changed.some((c) => c.gone) ? 'contul nu mai există sau ' : ''}lacătul s-a schimbat. Deschide contactul din Setări › Contacte și verifică-l din nou.`, 'Am înțeles', 'Închide');
      return;
    }
    const unverified = people.filter((c) => Contacts.status(c) === 'unverified');
    if (unverified.length) {
      const ok = await UI.confirm('Destinatari neverificați',
        `Nu ai verificat încă ${unverified.map((c) => '@' + c.handle).join(', ')}. Documentul va fi criptat cu lacătul dat de server; dacă serverul ar fi spart, cineva ar putea pune un lacăt fals. Pentru documente sensibile, scanați întâi codurile QR.`,
        'Trimite oricum', 'Anulează');
      if (!ok) return;
    }

    let id;
    try { id = await Account.unlock(`Confirmă cu Face ID criptarea documentului „${name}”`); } catch (e) { if (String(e && e.message) !== 'cancel') UI.toast(Account.say(e), { error: true }); return; }
    UI.busy(password ? 'Se criptează (cu parolă)…' : 'Se criptează…');
    await yieldUI();
    let out;
    try {
      const bytes = await Host.readFileAsync(path);
      const sealed = A().seal({ bytes, name, mime: MIME[Host.ext(name)] || 'application/octet-stream' }, id,
        [...people.map((c) => Host.fromB64(c.key)), id.bundle], { password: password || undefined, handle: Account.handle() });
      out = await freePath(await docsDir('Trimise criptat'), safeName(name.replace(/\.[^.]+$/, '')) + '.acm');
      Host.writeFile(out, sealed);
    } catch (e) {
      UI.busy();
      console.error(e);
      return UI.errorDetails('Nu am putut cripta documentul', e);
    }
    UI.busy();
    const who = people.map((c) => '@' + c.handle).join(', ');
    if (Host.mobile) {
      UI.toast(`Criptat pentru ${who}. Alege cum îl trimiți.`);
      await Host.share(out, 'Document criptat cu ACM Docs. Se deschide doar în aplicația ACM Docs, în contul destinatarului.');
    } else {
      UI.toast(`Criptat pentru ${who}: ${Host.baseName(out)}`, { duration: 8000, action: { label: 'Arată în folder', run: () => Host.showInFolder(out) } });
      Host.showInFolder(out);
    }
  }

  function pickRecipients(name) {
    return UI.modal((box, close) => {
      box.classList.add('acm-send');
      box.dataset.sticky = '1';
      const chosen = new Map();
      const listBox = el('div', { class: 'clist pick' });
      const summary = el('div', { class: 'send-sum' });
      const go = el('button', { class: 'btn primary', type: 'button', text: 'Criptează și trimite', disabled: true });
      const pwOn = el('input', { type: 'checkbox', id: 'acm-pw-on' });
      const pw1 = el('input', { class: 'in', type: 'password', placeholder: 'Parola documentului', autocomplete: 'new-password', id: 'acm-pw1' });
      const pw2 = el('input', { class: 'in', type: 'password', placeholder: 'Confirmă parola', autocomplete: 'new-password', id: 'acm-pw2' });
      const pwBox = el('div', { class: 'pw-box hidden' }, [pw1, pw2, el('small', { class: 'muted', text: 'Destinatarul are nevoie și de parolă, pe lângă contul lui. Spune-i-o pe altă cale (la telefon, față în față).' })]);
      pwOn.addEventListener('change', () => { pwBox.classList.toggle('hidden', !pwOn.checked); if (pwOn.checked) setTimeout(() => pw1.focus(), 30); });
      const err = el('p', { class: 'auth-err', role: 'alert' });

      const update = () => {
        go.disabled = !chosen.size;
        summary.innerHTML = '';
        const cs = [...chosen.values()];
        if (!cs.length) return;
        const st = cs.map(Contacts.status);
        if (st.includes('changed')) summary.append(el('div', { class: 'acm-note bad', html: `${svg('warn')}<span>Un destinatar are lacătul schimbat: verifică-l din nou înainte să-i trimiți.</span>` }));
        else if (st.includes('unverified')) summary.append(el('div', { class: 'acm-note warn', html: `${svg('info')}<span>Ai destinatari neverificați. Pentru documente sensibile, scanați-vă întâi codurile QR.</span>` }));
        else summary.append(el('div', { class: 'acm-note ok', html: `${svg('verified')}<span>Toți destinatarii sunt verificați.</span>` }));
      };
      const toggleRow = (c) => {
        const tick = el('span', { class: 'ctick', html: svg('check') });
        const r = Contacts.contactRow(c, () => {
          if (chosen.has(c.uid)) chosen.delete(c.uid); else chosen.set(c.uid, Contacts.get(c.uid) || c);
          r.classList.toggle('on', chosen.has(c.uid));
          update();
        }, el('span', { class: 'cright' }, [Contacts.badge(c), tick]));
        if (chosen.has(c.uid)) r.classList.add('on');
        return r;
      };
      const draw = () => {
        listBox.innerHTML = '';
        const cs = Contacts.list();
        if (!cs.length) listBox.append(el('p', { class: 'cempty', text: 'Nu ai încă contacte. Caută persoana după @nume.' }));
        cs.forEach((c) => listBox.append(toggleRow(c)));
        hydrateIcons(listBox);
      };
      draw();

      go.addEventListener('click', () => {
        err.classList.remove('on');
        if (pwOn.checked) {
          if (pw1.value.length < 6) { err.textContent = 'Parola documentului are cel puțin 6 caractere.'; err.classList.add('on'); return; }
          if (pw1.value !== pw2.value) { err.textContent = 'Parolele nu sunt la fel.'; err.classList.add('on'); return; }
        }
        close({ people: [...chosen.values()], password: pwOn.checked ? pw1.value : null });
      });

      box.append(
        el('div', { class: 'send-head' }, [el('span', { class: 'send-i', html: svg('lockfile') }), el('div', {}, [el('h2', { text: 'Trimite criptat' }), el('small', { class: 'muted no-tr', text: name })])]),
        el('p', { class: 'muted small', text: 'Doar persoanele alese (și tu) vor putea deschide fișierul .acm, în aplicația ACM Docs.' }),
        Contacts.searchBox((p, out) => {
          const c = Contacts.addFromProfile(p);
          chosen.set(c.uid, c);
          out.innerHTML = '';
          out.append(el('p', { class: 'cmsg', text: `@${c.handle} a fost adăugat.` }));
          draw(); update();
        }),
        listBox,
        el('label', { class: 'chk' }, [pwOn, 'Adaugă și o parolă (opțional)']),
        pwBox, summary, err,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }), go]),
      );
      update();
    });
  }

  // ---------------------------------------------------------------- open
  const isAcm = (path, bytes) => Host.ext(path) === 'acm' || (bytes && bytes.length > 4 && bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] === 0x4d && bytes[3] === 0x31);

  async function openFile(path, bytes) {
    const name = Host.baseName(path);
    let info;
    try { info = A().inspect(bytes); } catch (e) { return UI.toast(e.message || 'Nu este un fișier .acm.', { error: true }); }
    if (!(await ensureAccount())) return;
    let id;
    try { id = await Account.unlock(`Confirmă cu Face ID ca să deschizi „${name}”`); } catch (e) { if (String(e && e.message) !== 'cancel') UI.toast(Account.say(e), { error: true }); return; }
    let password = null, res = null, wrong = false;
    for (;;) {
      if (info.password) {
        password = await askDocPassword(wrong);
        if (password == null) return;
      }
      UI.busy('Se deschide documentul criptat…');
      await yieldUI();
      try { res = A().open(bytes, id, { password: password || undefined }); UI.busy(); break; } catch (e) {
        UI.busy();
        if (e.code === 'BAD_PASSWORD_OR_NOT_FOR_YOU') { wrong = true; continue; }
        const msg = {
          NOT_FOR_YOU: 'Acest document nu îți este adresat: a fost criptat pentru alte persoane. Dacă ar trebui să-l poți deschide, cere expeditorului să ți-l trimită din nou, pe @' + (Account.handle() || 'numele tău') + '.',
          TAMPERED: 'Fișierul a fost modificat sau s-a deteriorat pe drum. Cere expeditorului să-l trimită din nou.',
          BAD_SIGNATURE: 'Semnătura expeditorului nu este validă: fișierul a fost falsificat. Nu-l folosi.',
          NEWER_VERSION: 'Fișierul a fost creat cu o versiune mai nouă a aplicației. Actualizează ACM Docs.',
        }[e.code];
        return UI.confirm('Nu pot deschide documentul', msg || e.message || String(e), 'Am înțeles', 'Închide');
      }
    }

    const sender = await describeSender(res.sender);
    const keep = el('input', { type: 'checkbox', id: 'acm-keep' });
    let keepCopy = false;
    const go = await UI.modal((box, close) => {
      keep.addEventListener('change', () => { keepCopy = keep.checked; });
      box.classList.add('acm-recv');
      box.append(
        el('div', { class: 'send-head' }, [el('span', { class: 'send-i ok', html: svg('lockfile') }), el('div', {}, [el('h2', { text: 'Document criptat deschis' }), el('small', { class: 'muted no-tr', text: res.name })])]),
        el('div', { class: 'recv-from' }, [el('small', { class: 'muted', text: 'Trimis de' }), sender.row]),
        sender.note,
        el('p', { class: 'muted small', text: 'Semnătura expeditorului a fost verificată: documentul nu a fost modificat pe drum.' }),
        el('label', { class: 'chk' }, [keep, 'Păstrează o copie decriptată pe acest dispozitiv']),
        el('small', { class: 'muted small', text: 'Altfel, copia decriptată se șterge când închizi documentul.' }),
        el('div', { class: 'actions' }, [
          sender.add ? el('button', { class: 'btn', type: 'button', text: 'Adaugă la contacte', onclick: () => close('add') }) : el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
          el('button', { class: 'btn primary', type: 'button', text: 'Deschide documentul', onclick: () => close('open') }),
        ]),
      );
    });
    if (go === 'add' && sender.add) {
      const c = Contacts.addFromProfile(sender.add);
      UI.toast(`@${c.handle} a fost adăugat la contacte (neverificat).`);
    }
    if (!go) return;
    // a temporary copy (wiped when you leave the document), unless "keep" was ticked
    const temporary = !keepCopy;
    const out = await freePath(temporary ? await Shield.tempDir() : await docsDir('Primite criptat'), safeName(res.name));
    Host.writeFile(out, res.bytes);
    Shield.watchOpen(out, temporary);
    await App.openPath(out);
  }

  async function describeSender(s) {
    const known = Contacts.list().find((c) => c.fp === s.fingerprint);
    if (known) {
      return {
        row: Contacts.contactRow(known, null),
        note: Contacts.status(known) === 'verified' ? null : el('div', { class: 'acm-note warn', html: `${svg('info')}<span>@${known.handle} este în contactele tale, dar nu l-ai verificat încă prin cod QR.</span>` }),
      };
    }
    const changed = s.handle && Contacts.list().find((c) => c.handle === s.handle);
    if (changed) {
      return {
        row: Contacts.contactRow(Object.assign({}, changed, { pending: true }), null),
        note: el('div', { class: 'acm-note bad', html: `${svg('warn')}<span>Documentul e semnat cu alt lacăt decât cel pe care îl ai pentru @${s.handle}. Poate și-a refăcut cheile, sau cineva se dă drept el. Întreabă-l direct înainte să ai încredere în document.</span>` }),
      };
    }
    if (s.handle) {
      let p = null;
      try { p = await Account.lookup(s.handle); } catch (e) {}
      if (p && p.fp === s.fingerprint) {
        const c = { uid: p.uid, handle: p.handle, name: p.name, verified: false };
        return { row: Contacts.contactRow(c, null), add: p, note: el('div', { class: 'acm-note warn', html: `${svg('info')}<span>Nu este în contactele tale. Serverul confirmă că lacătul este al lui @${p.handle}, dar nu l-ai verificat față în față.</span>` }) };
      }
      return {
        row: Contacts.contactRow({ handle: s.handle, name: 'Expeditor neconfirmat', verified: false, pending: true }, null),
        note: el('div', { class: 'acm-note bad', html: `${svg('warn')}<span>Expeditorul spune că este @${s.handle}, dar lacătul lui nu corespunde contului @${s.handle} de pe server. Tratează documentul cu suspiciune.</span>` }),
      };
    }
    return {
      row: el('div', { class: 'crow' }, [el('span', { class: 'cav', text: '?' }), el('span', { class: 'ctx' }, [el('b', { text: 'Expeditor necunoscut' }), el('small', { class: 'no-tr', text: s.fingerprint.slice(0, 20).toUpperCase().match(/.{4}/g).join(' ') })])]),
      note: el('div', { class: 'acm-note warn', html: `${svg('info')}<span>Nu știm cine a trimis documentul. Semnătura este validă, dar nu aparține niciunui contact.</span>` }),
    };
  }

  function askDocPassword(wrong) {
    return UI.modal((box, close) => {
      const input = el('input', { type: 'password', class: 'in', placeholder: 'Parola documentului', autofocus: true, id: 'acm-open-pw' });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
      box.append(
        el('h2', { text: 'Documentul are parolă' }),
        el('p', { text: wrong ? 'Parola nu este corectă. Încearcă din nou.' : 'Expeditorul a pus și o parolă. Scrie parola pe care ți-a spus-o.' }),
        input,
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }),
          el('button', { class: 'btn primary', type: 'button', text: 'Deschide', onclick: () => close(input.value) }),
        ]),
      );
    });
  }

  // ---------------------------------------------------------------- Home: account buttons + the encrypted-send card
  function renderHome() {
    const acts = document.getElementById('hero-acts');
    const slot = document.getElementById('home-secure');
    if (!acts || !slot || typeof Account === 'undefined') return;
    const u = Account.current();
    acts.innerHTML = '';
    const people = el('button', { class: 'hb', type: 'button', id: 'home-contacts', title: 'Contacte', 'aria-label': 'Contacte', html: svg('people') });
    people.addEventListener('click', () => Contacts.showList());
    const me = el('button', { class: 'hb avatar' + (u ? ' on' : ''), type: 'button', id: 'home-me', title: u ? 'Contul meu' : 'Intră în cont', 'aria-label': u ? 'Contul meu' : 'Intră în cont' });
    if (u) me.textContent = ((u.displayName || u.email || '?').trim()[0] || '?').toUpperCase(); else me.innerHTML = svg('user');
    me.addEventListener('click', () => (u ? AccountUI.showProfile() : (Account.setSkipped(false), AccountUI.show('signin'))));
    if (u) acts.append(people);
    acts.append(me);

    slot.innerHTML = '';
    const nContacts = u ? Contacts.list().length : 0;
    const nVerified = u ? Contacts.list().filter((c) => Contacts.status(c) === 'verified').length : 0;
    const card = el('section', { class: 'sec-card', 'aria-label': 'Trimite criptat' }, [
      el('div', { class: 'sec-bg', 'aria-hidden': 'true' }),
      el('div', { class: 'sec-top' }, [
        el('span', { class: 'sec-shield', html: svg('shield') }),
        el('div', { class: 'sec-t' }, [
          el('b', { text: 'Trimite criptat' }),
          el('small', { text: 'Doar destinatarul îl poate deschide. Nici noi, nici serverul, nici un computer cuantic.' }),
        ]),
      ]),
      el('div', { class: 'sec-chips' }, [
        el('span', { text: 'Post-cuantic' }), el('span', { text: 'ML-KEM-768 + X25519' }), el('span', { text: 'Semnat ML-DSA' }),
      ]),
      el('div', { class: 'sec-btns' }, u ? [
        el('button', { class: 'sec-main', type: 'button', id: 'home-send', html: svg('lockfile') + '<span>Alege fișierul</span>', onclick: chooseAndSend }),
        el('button', { class: 'sec-ghost', type: 'button', id: 'home-open-acm', text: 'Deschide .acm', onclick: openAcmDialog }),
      ] : [
        el('button', { class: 'sec-main', type: 'button', html: '<span>Creează cont gratuit</span>', onclick: () => { Account.setSkipped(false); AccountUI.show('signup'); } }),
        el('button', { class: 'sec-ghost', type: 'button', text: 'Am deja cont', onclick: () => { Account.setSkipped(false); AccountUI.show('signin'); } }),
      ]),
      u ? el('button', { class: 'sec-foot', type: 'button', onclick: () => Contacts.showList() }, [
        el('span', { text: nContacts ? `${nContacts} ${nContacts === 1 ? 'contact' : 'contacte'} · ${nVerified} ${nVerified === 1 ? 'verificat' : 'verificate'}` : 'Adaugă primul contact după @nume sau cod QR' }),
        el('span', { class: 'chev', html: svg('right') }),
      ]) : null,
    ]);
    slot.append(card);
  }

  /** From Home: pick what to send (recent files or any file), then the usual send flow. */
  async function chooseAndSend() {
    if (!(await ensureAccount())) return;
    const recent = (App.recentFiles ? App.recentFiles() : []).filter((f) => Host.ext(f.path) !== 'acm').slice(0, 8);
    const pick = await UI.modal((box, close) => {
      box.classList.add('acm-pick');
      box.append(el('div', { class: 'send-head' }, [el('span', { class: 'send-i', html: svg('lockfile') }), el('div', {}, [el('h2', { text: 'Ce trimiți criptat?' }), el('small', { class: 'muted', text: 'PDF, Word, Excel, poze… orice fișier' })])]));
      const list = el('div', { class: 'clist' });
      for (const f of recent) {
        const r = el('button', { class: 'crow', type: 'button' }, [
          el('span', { class: 'cav file', html: svg('doc') }),
          el('span', { class: 'ctx' }, [el('b', { class: 'no-tr', text: Host.baseName(f.path) }), el('small', { class: 'no-tr', text: Host.baseName(Host.dirName(f.path)) })]),
          el('span', { class: 'chev', html: svg('right') }),
        ]);
        r.addEventListener('click', () => close(f.path));
        list.append(r);
      }
      if (recent.length) box.append(el('h3', { class: 'csub', text: 'Recente' }), list);
      box.append(el('div', { class: 'actions col' }, [
        el('button', { class: 'btn primary', type: 'button', html: svg('folder') + '<span>Alege alt fișier…</span>', onclick: async () => { const p = await Host.openDialog('pdf'); close(p || null); } }),
        el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }),
      ]));
    });
    if (pick) await send(pick);
  }
  async function openAcmDialog() {
    const p = await Host.openDialog('pdf');
    if (p) await App.openPath(p);
  }

  return { send, openFile, isAcm, ensureAccount, renderHome, chooseAndSend };
})();
