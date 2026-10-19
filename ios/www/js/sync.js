'use strict';
// Cloud sync: the same account shows the same data on every device (companies, invoices, clients,
// signatures, settings, contacts and documents). All of it is encrypted on the device with the
// account's vault key before upload; the server only stores opaque records.
// Each device can choose "Cloud" (default) or "Only on this device".

const Sync = (() => {
  const A = () => window.__lib.acmcrypto;
  const F = () => window.__lib.firebase;
  const uid = () => (typeof Account !== 'undefined' && Account.current() ? Account.current().uid : null);
  const BUCKET = 'acm-docs-52280.firebasestorage.app';
  const MAX_FILE = 100 * 1024 * 1024;
  const MAX_INLINE = 600000;
  const CHECK_MS = 5000;
  const PULL_MS = 60000;

  // data that belongs to the account (device-only data such as app lock or device keys stays local)
  const SHARED = ['acm.businesses', 'acm.business', 'acm.invoiceItems', 'acm.invoiceClients', 'acm.docs', 'acm.invoiceDraft',
    'pdfeditor.signatures', 'acm.theme', 'acm.scan', 'acm.print']; // the language is chosen on each device
  const PER_ACCOUNT = ['acm.contacts.', 'acm.contacts.mac.', 'acm.sent.', 'acm.words.saved.'];
  // lists joined on a device's first sync, so nothing made before signing in is lost
  const MERGE = ['acm.businesses', 'acm.invoiceItems', 'acm.invoiceClients', 'acm.docs', 'pdfeditor.signatures'];
  function merge(cloud, local) {
    try {
      const a = JSON.parse(cloud), b = JSON.parse(local || 'null');
      if (!Array.isArray(a) || !Array.isArray(b)) return cloud;
      const key = (x) => (x && typeof x === 'object' && x.id != null ? 'id:' + x.id : 'v:' + JSON.stringify(x));
      const have = new Set(a.map(key));
      const out = a.concat(b.filter((x) => !have.has(key(x))));
      return JSON.stringify(out);
    } catch (e) { return cloud; }
  }
  const sharedKeys = () => { const u = uid(); return u ? SHARED.concat(PER_ACCOUNT.map((p) => p + u)) : []; };

  // ---------------------------------------------------------------- local state of this device
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const stateKey = () => 'acm.sync.' + (uid() || '-');
  function state() {
    let s = null;
    try { s = JSON.parse(get(stateKey()) || 'null'); } catch (e) {}
    return Object.assign({ mode: 'cloud', inited: false, lastAt: 0, lastSync: 0, seen: {}, kvT: {}, dirty: {}, files: {}, err: null, counts: {} }, s || {});
  }
  const saveState = (s) => put(stateKey(), JSON.stringify(s));
  const hash = (v) => (v == null ? '' : A().macText(new Uint8Array(32), 'seen', v).slice(0, 16));

  let vkey = null, busy = null, checkTimer = null, pullTimer = null, pushTimer = null;
  const listeners = [];

  async function vaultKey() {
    if (vkey) return vkey;
    const u = uid();
    const name = 'vault.' + u;
    const saved = await Host.secureGet(name, '', { quiet: true }).catch(() => null);
    if (saved && saved.length === 32) { vkey = saved; return vkey; }
    vkey = A().vaultKey(await Account.unlock('Confirmă ca să pornești sincronizarea criptată'));
    await Host.secureSet(name, vkey, { quiet: true }).catch(() => {});
    return vkey;
  }
  const rid = (kind, name) => A().macText(vkey, 'rid', kind + ':' + name).slice(0, 40);
  const vaultCol = () => { const { F: f, db } = Account.internals(); return f.firestore.collection(db, 'accounts', uid(), 'vault'); };
  const vaultDoc = (id) => { const { F: f, db } = Account.internals(); return f.firestore.doc(db, 'accounts', uid(), 'vault', id); };

  // ---------------------------------------------------------------- noticing local changes
  /** Compares the shared keys with what was last seen: anything different is queued for upload. */
  function noticeChanges() {
    const s = state();
    if (s.mode !== 'cloud' || !uid() || busy) return;
    if (noticeChangesInto(s)) { saveState(s); schedulePush(); }
  }
  const fileList = () => (typeof App !== 'undefined' && App.recentFiles ? App.recentFiles() : [])
    .filter((f) => !(typeof Shield !== 'undefined' && Shield.isProtected(f.path)));

  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => run('push'), 3000); }

  // ---------------------------------------------------------------- path placeholders
  // Paths differ per device: inside synced values they travel as "acmcloud:<id>".
  function toCloud(v, s) {
    if (typeof v !== 'string') return v;
    for (const [p, r] of Object.entries(s.files)) { if (r.fk) v = v.split(JSON.stringify(p).slice(1, -1)).join('acmcloud:' + r.fk); }
    return v;
  }
  function fromCloud(v, s) {
    if (typeof v !== 'string' || !v.includes('acmcloud:')) return v;
    const byFk = {};
    for (const [p, r] of Object.entries(s.files)) if (r.fk) byFk[r.fk] = JSON.stringify(p).slice(1, -1);
    return v.replace(/acmcloud:([0-9a-f]{32})/g, (m, fk) => byFk[fk] || m);
  }

  // ---------------------------------------------------------------- storage of large encrypted blocks
  async function token() { const { auth } = Account.internals(); return auth.currentUser.getIdToken(); }
  const blobUrl = (id) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`accounts/${uid()}/blobs/${id}`)}`;
  async function uploadBlob(bytes) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
    const sealed = A().vaultSeal(vkey, bytes, 'blob:' + id);
    const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(`accounts/${uid()}/blobs/${id}`)}`, {
      method: 'POST', headers: { Authorization: 'Firebase ' + (await token()), 'Content-Type': 'application/octet-stream' }, body: sealed,
    });
    if (!r.ok) throw Object.assign(new Error('storage ' + r.status), { status: r.status });
    return id;
  }
  async function downloadBlob(id) {
    const r = await fetch(blobUrl(id) + '?alt=media', { headers: { Authorization: 'Firebase ' + (await token()) } });
    if (!r.ok) throw Object.assign(new Error('storage ' + r.status), { status: r.status });
    return A().vaultOpen(vkey, new Uint8Array(await r.arrayBuffer()), 'blob:' + id);
  }
  async function deleteBlob(id) {
    try { await fetch(blobUrl(id), { method: 'DELETE', headers: { Authorization: 'Firebase ' + (await token()) } }); } catch (e) {}
  }

  // ---------------------------------------------------------------- records
  async function writeRecord(id, payload) {
    const f = F().firestore;
    let b = Host.toB64(A().vaultSealText(vkey, payload, 'rec:' + id));
    if (b.length > MAX_INLINE) {
      // too big for one record: the record points to an encrypted block in Storage
      const blob = await uploadBlob(new TextEncoder().encode(JSON.stringify(payload)));
      b = Host.toB64(A().vaultSealText(vkey, { kind: 'ref', blob, t: payload.t }, 'rec:' + id));
    }
    await f.setDoc(vaultDoc(id), { b, v: 1, at: f.serverTimestamp() });
  }
  async function readRecord(d) {
    let p = A().vaultOpenText(vkey, Host.fromB64(d.data().b), 'rec:' + d.id);
    if (p.kind === 'ref') p = JSON.parse(new TextDecoder().decode(await downloadBlob(p.blob)));
    return p;
  }

  // ---------------------------------------------------------------- push
  async function push(s) {
    for (const key of Object.keys(s.dirty)) {
      const t = s.dirty[key];
      if (key.startsWith('file:')) { await pushFile(s, key.slice(5), t); delete s.dirty[key]; continue; }
      const v = get(key);
      await writeRecord(rid('kv', key), { kind: 'kv', k: key, v: toCloud(v, s), del: v == null, t });
      s.kvT[key] = t;
      delete s.dirty[key];
      saveState(s);
    }
  }
  function docsRoot() { return Host.specialDir('documents'); }
  async function pushFile(s, path, t) {
    if (!Host.exists(path)) return;
    const f = fileList().find((x) => x.path === path);
    if (!f) return;
    const bytes = await Host.readFileAsync(path);
    if (bytes.length > MAX_FILE) { s.files[path] = Object.assign(s.files[path] || {}, { mtime: Host.mtime(path), tooBig: true }); return; }
    const sha = A().macText(vkey, 'file', Host.toB64(bytes)).slice(0, 32);
    const rec = s.files[path] || {};
    if (rec.sha === sha && rec.blob) { rec.mtime = Host.mtime(path); s.files[path] = rec; return; }
    const fk = rec.fk || Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
    const blob = await uploadBlob(bytes);
    const root = await docsRoot();
    const rel = root && path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]+/, '') : Host.baseName(path);
    await writeRecord(rid('file', fk), { kind: 'file', fk, name: Host.baseName(path), rel, fileKind: f.kind, size: bytes.length, sha, blob, t, del: false });
    if (rec.blob && rec.blob !== blob) deleteBlob(rec.blob);
    s.files[path] = { fk, sha, blob, mtime: Host.mtime(path) };
    saveState(s);
  }
  /** A document taken out of the list on one device leaves the list on the others too. */
  async function forget(path) {
    const s = state();
    const rec = s.files[path];
    if (!rec || !rec.fk || s.mode !== 'cloud') return;
    try {
      await vaultKey();
      await writeRecord(rid('file', rec.fk), { kind: 'file', fk: rec.fk, del: true, t: Date.now() });
      if (rec.blob) deleteBlob(rec.blob);
    } catch (e) { console.warn('sync forget', e); }
    delete s.files[path];
    saveState(s);
  }

  // ---------------------------------------------------------------- pull
  async function pull(s) {
    const f = F().firestore;
    const q = s.inited && s.lastAt
      ? f.query(vaultCol(), f.where('at', '>', new Date(s.lastAt)), f.orderBy('at'))
      : f.query(vaultCol(), f.orderBy('at'));
    const snap = await f.getDocs(q);
    const recs = [];
    for (const d of snap.docs) {
      try { recs.push(await readRecord(d)); } catch (e) { console.warn('sync record', d.id, e); }
      const at = d.data().at && d.data().at.toMillis ? d.data().at.toMillis() : 0;
      if (at > s.lastAt) s.lastAt = at;
    }
    // documents first, so placeholders in other values can be turned back into local paths
    let changedKV = [];
    for (const p of recs.filter((x) => x.kind === 'file')) await applyFile(s, p);
    for (const p of recs.filter((x) => x.kind === 'kv')) {
      const localT = s.dirty[p.k] || s.kvT[p.k] || 0;
      // first sync of a device: what the account already has wins over this device's defaults
      if (s.inited && localT >= p.t) continue;
      let v = p.del ? null : fromCloud(p.v, s);
      if (!s.inited && v != null && MERGE.includes(p.k)) v = merge(v, get(p.k));
      put(p.k, v);
      s.seen[p.k] = hash(get(p.k));
      s.kvT[p.k] = p.t;
      delete s.dirty[p.k];
      changedKV.push(p.k);
    }
    return changedKV;
  }
  async function applyFile(s, p) {
    const local = Object.entries(s.files).find(([, r]) => r.fk === p.fk);
    if (p.del) {
      if (local) { delete s.files[local[0]]; try { App.forgetPath && App.forgetPath(local[0]); } catch (e) {} }
      return;
    }
    if (local && local[1].sha === p.sha && Host.exists(local[0])) return;
    const bytes = await downloadBlob(p.blob);
    const root = await docsRoot();
    let path = local ? local[0] : Host.join(root, p.rel || p.name);
    Host.mkdirp(Host.dirName(path));
    if (!local && Host.exists(path)) {
      const m = /^(.*?)(\.[^.]*)?$/.exec(Host.baseName(path));
      let i = 2;
      while (Host.exists(Host.join(Host.dirName(path), `${m[1]} (${i})${m[2] || ''}`))) i++;
      path = Host.join(Host.dirName(path), `${m[1]} (${i})${m[2] || ''}`);
    }
    Host.writeFile(path, bytes);
    s.files[path] = { fk: p.fk, sha: p.sha, blob: p.blob, mtime: Host.mtime(path) };
    try { App.rememberFile(path, p.fileKind || 'original', /\.pdf$/i.test(path) ? bytes : null); } catch (e) {}
  }

  // ---------------------------------------------------------------- one sync round
  async function run(what) {
    if (busy) return busy;
    const s0 = state();
    if (s0.mode !== 'cloud' || !uid() || (typeof Devices !== 'undefined' && !Devices.myDevice())) return null;
    busy = (async () => {
      const s = state();
      try {
        await vaultKey();
        if (typeof Devices !== 'undefined' && (await Devices.ensure()) !== 'ok') return;
        if (what !== 'push') {
          const changed = await pull(s);
          if (!s.inited) {
            // queue whatever this device has that the account does not have yet (and the joined lists)
            for (const k of sharedKeys()) if (get(k) != null && (!s.kvT[k] || MERGE.includes(k))) s.dirty[k] = Date.now();
            for (const f of fileList()) if (!s.files[f.path]) s.dirty['file:' + f.path] = Date.now();
            s.inited = true;
          }
          saveState(s);
          if (changed.length) afterPull(changed);
        }
        noticeChangesInto(s);
        await push(s);
        s.lastSync = Date.now();
        s.err = null;
        s.counts = { files: Object.keys(s.files).length, data: Object.keys(s.kvT).length };
      } catch (e) {
        console.warn('sync', e);
        s.err = e.status === 404 ? 'storage' : /permission/i.test(String(e.code || e.message)) ? 'permission' : 'offline';
      } finally {
        saveState(s);
        busy = null;
        listeners.forEach((f) => { try { f(); } catch (e) {} });
      }
    })();
    return busy;
  }
  function noticeChangesInto(s) {
    let changed = false;
    for (const k of sharedKeys()) {
      const h = hash(get(k));
      if ((s.seen[k] || '') !== h) { s.seen[k] = h; if (!s.dirty[k]) s.dirty[k] = Date.now(); changed = true; }
    }
    // documents in the list that are new or changed since the last upload
    for (const f of fileList()) {
      const rec = s.files[f.path];
      if ((!rec || rec.mtime !== (Host.mtime(f.path) || 0)) && !s.dirty['file:' + f.path]) { s.dirty['file:' + f.path] = Date.now(); changed = true; }
    }
    return changed;
  }
  function afterPull(keys) {
    try { if (keys.includes('acm.theme') && typeof Theme !== 'undefined') Theme.set(get('acm.theme') || 'light'); } catch (e) {}
    try { if (typeof Biz !== 'undefined' && Biz.reload) Biz.reload(); } catch (e) {}
    try { App.renderView(); } catch (e) {}
  }

  // ---------------------------------------------------------------- start / stop
  function start() {
    stop();
    if (state().mode !== 'cloud') return;
    run('all');
    checkTimer = setInterval(noticeChanges, CHECK_MS);
    pullTimer = setInterval(() => { if (!document.hidden) run('all'); }, PULL_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  function stop() { clearInterval(checkTimer); clearInterval(pullTimer); clearTimeout(pushTimer); document.removeEventListener('visibilitychange', onVisible); }
  function onVisible() { if (!document.hidden) run('all'); }
  function reset() { stop(); vkey = null; }

  // ---------------------------------------------------------------- local-only mode
  async function setMode(mode) {
    const s = state();
    s.mode = mode === 'local' ? 'local' : 'cloud';
    if (s.mode === 'cloud') { s.inited = false; s.lastAt = 0; }
    saveState(s);
    if (s.mode === 'cloud') start(); else stop();
  }
  /** Removes everything this account keeps in the cloud (the data on the devices stays). */
  async function wipeCloud() {
    await vaultKey();
    const f = F().firestore;
    const snap = await f.getDocs(vaultCol());
    for (const d of snap.docs) {
      try { const p = await readRecord(d); if (p.blob) await deleteBlob(p.blob); } catch (e) {}
      await f.deleteDoc(d.ref);
    }
    const s = state();
    s.files = {}; s.kvT = {}; s.dirty = {}; s.inited = false; s.lastAt = 0;
    saveState(s);
  }

  // ---------------------------------------------------------------- Settings
  function summary() {
    const s = state();
    if (!uid()) return 'Necesită cont';
    if (s.mode !== 'cloud') return 'Oprită: datele stau doar pe acest dispozitiv';
    if (s.err === 'storage') return 'Stocarea în cloud nu este activată încă';
    if (s.err) return 'Nesincronizat (fără internet?)';
    if (!s.lastSync) return 'Pornește…';
    return I18n.t('Sincronizat') + ' ' + new Date(s.lastSync).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' });
  }
  async function show() {
    if (!(await AcmShare.ensureAccount())) return;
    const s = state();
    const act = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'sync-set');
      const sw = (on) => el('span', { class: 'acm-sw' + (on ? ' on' : ''), 'aria-hidden': 'true' });
      const row = el('button', { class: 'srow', type: 'button' }, [el('span', { class: 'stx' }, [el('b', { text: 'Sincronizare în cloud' }), el('small', { text: summary() })]), sw(s.mode === 'cloud')]);
      row.addEventListener('click', () => close('toggle'));
      box.append(
        el('h2', { text: 'Cloud criptat' }),
        el('p', { class: 'muted small', text: 'Firmele, facturile, clienții, semnăturile, setările, contactele și documentele tale apar la fel pe toate dispozitivele contului.' }),
        el('div', { class: 'list-card' }, [row]),
        s.mode === 'cloud' ? el('p', { class: 'muted small', text: `${(s.counts && s.counts.files) || 0} documente și ${(s.counts && s.counts.data) || 0} seturi de date sincronizate.` }) : null,
        el('div', { class: 'acm-note ok', html: `${svg('shield')}<span>Totul se criptează pe dispozitiv înainte să plece, cu cheia contului, cu o criptare care rezistă și computerelor cuantice. Serverul păstrează doar blocuri criptate, fără nume și fără conținut lizibil. Nici ACM Docs nu le poate citi.</span>` }),
        el('div', { class: 'actions col' }, [
          s.mode === 'cloud' ? el('button', { class: 'btn primary', type: 'button', text: 'Sincronizează acum', onclick: () => close('now') }) : null,
          s.mode !== 'cloud' ? el('button', { class: 'btn danger-text', type: 'button', text: 'Șterge datele mele din cloud', onclick: () => close('wipe') }) : null,
          el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]),
      );
    });
    if (act === 'toggle') {
      if (s.mode === 'cloud') {
        if (await UI.confirm('Oprești sincronizarea?', 'Datele noi de pe acest dispozitiv nu vor mai ajunge pe celelalte dispozitive. Ce este deja în cloud rămâne acolo, criptat, până îl ștergi.', 'Oprește')) await setMode('local');
      } else {
        await setMode('cloud');
        UI.toast('Sincronizarea a pornit.');
      }
      return show();
    }
    if (act === 'now') { UI.busy('Se sincronizează…'); try { await run('all'); } finally { UI.busy(); } return show(); }
    if (act === 'wipe') {
      if (!(await UI.confirm('Ștergi datele din cloud?', 'Se șterg din cloud toate datele criptate ale contului. Datele de pe acest dispozitiv rămân. Celelalte dispozitive care au sincronizarea pornită le vor încărca din nou.', 'Șterge'))) return show();
      UI.busy('Se șterge…');
      try { await wipeCloud(); UI.toast('Datele din cloud au fost șterse.'); } catch (e) { UI.toast(Account.say(e), { error: true }); } finally { UI.busy(); }
      return show();
    }
  }

  /** The account is gone from this device (deleted or blocked): its sync data goes too. */
  async function forgetAccount(u) {
    reset();
    put('acm.sync.' + u, null);
    try { await Host.secureDelete('vault.' + u, { quiet: true }); } catch (e) {}
  }
  if (typeof Account !== 'undefined' && Account.onChange) Account.onChange(() => { if (!uid()) reset(); });

  return { start, stop, reset, run, forget, forgetAccount, summary, show, setMode, onChange: (f) => listeners.push(f) };
})();
