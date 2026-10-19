'use strict';
// ACM Docs accounts (Firebase) and the account keys for .acm documents.
//
// - Sign in: email + password (with email confirmation), or a QR code from a signed-in device.
// - Keys: made automatically from 24 recovery words when the account is created. The words and
//   the private keys stay on this device, behind Face ID / the phone's lock (Host.secure*);
//   only the public key (the "open padlock") goes to Firestore, so others can lock documents for you.
// - Nothing secret is ever sent to a server.

Object.assign(Icons, {
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
});

const Account = (() => {
  const CONFIG = {
    apiKey: 'AIzaSyDsXxKCjxhOeGTZYyYIsm_S6SO6zADe25w',
    authDomain: 'acm-docs-52280.firebaseapp.com',
    projectId: 'acm-docs-52280',
    storageBucket: 'acm-docs-52280.firebasestorage.app',
    messagingSenderId: '1013772730312',
    appId: '1:1013772730312:web:81f63346bf055dc2d58afd',
  };

  const LS = {
    later: 'acm.account.later',
    saved: (uid) => 'acm.words.saved.' + uid,
    fp: (uid) => 'acm.fp.' + uid,
    handle: (uid) => 'acm.handle.' + uid,
  };
  // @name: 3-20 lowercase letters, digits, _ (checked again by the server rules)
  const RESERVED = ['admin', 'administrator', 'acm', 'acmdocs', 'acm_docs', 'acmcode', 'acm_code', 'support', 'suport', 'help', 'ajutor', 'root', 'system', 'official', 'oficial', 'security', 'securitate'];
  const cleanHandle = (h) => String(h || '').trim().replace(/^@+/, '').toLowerCase();
  function handleProblem(h) {
    h = cleanHandle(h);
    if (h.length < 3) return 'Numele de utilizator are cel puțin 3 caractere.';
    if (h.length > 20) return 'Numele de utilizator are cel mult 20 de caractere.';
    if (!/^[a-z0-9_]+$/.test(h)) return 'Folosește doar litere mici fără diacritice, cifre și _.';
    if (RESERVED.includes(h)) return 'Acest nume este rezervat. Alege altul.';
    return null;
  }
  /** a suggestion from the display name: "Aniel Mândruț" → "aniel_mandrut" */
  function suggestHandle(name) {
    const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    return s.length >= 3 ? s : '';
  }
  const SEC = { words: (uid) => 'words.' + uid, secrets: (uid) => 'keys.' + uid };

  let fb = null, auth = null, db = null, fns = null, user = null, firstState = null, identity = null;
  const listeners = [];
  const A = () => window.__lib.acmcrypto;
  const F = () => window.__lib.firebase;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---------------------------------------------------------------- setup
  function init() {
    if (fb || !window.__lib || !window.__lib.firebase) return;
    const { initializeApp, auth: Au, firestore: Fs } = F();
    fb = initializeApp(CONFIG);
    auth = Au.initializeAuth(fb, { persistence: [Au.indexedDBLocalPersistence, Au.browserLocalPersistence, Au.inMemoryPersistence] });
    try { auth.languageCode = I18n.lang === 'en' ? 'en' : 'ro'; } catch (e) {}
    db = Fs.getFirestore(fb);
    fns = F().functions.getFunctions(fb, 'europe-west1');
    firstState = new Promise((resolve) => {
      Au.onAuthStateChanged(auth, (u) => {
        if (!u || !user || u.uid !== user.uid) identity = null;
        user = u;
        resolve();
        listeners.forEach((f) => { try { f(u); } catch (e) { console.error(e); } });
      });
    });
  }
  const ready = () => { init(); return firstState || Promise.resolve(); };
  const onChange = (f) => listeners.push(f);
  const current = () => user;
  const isPasswordUser = () => !!(user && user.providerData.some((p) => p.providerId === 'password'));
  const needsVerification = () => !!(user && !user.emailVerified && isPasswordUser());

  // ---------------------------------------------------------------- errors in plain words
  function say(e) {
    const c = (e && e.code) || '';
    const m = {
      'auth/email-already-in-use': 'Există deja un cont cu acest email. Intră în cont sau resetează parola.',
      'auth/invalid-email': 'Adresa de email nu este corectă.',
      'auth/invalid-credential': 'Emailul sau parola nu sunt corecte.',
      'auth/wrong-password': 'Parola nu este corectă.',
      'auth/user-not-found': 'Nu există niciun cont cu acest email.',
      'auth/weak-password': 'Parola este prea slabă: folosește cel puțin 8 caractere.',
      'auth/too-many-requests': 'Prea multe încercări. Mai încearcă peste câteva minute.',
      'auth/network-request-failed': 'Nu există conexiune la internet.',
      'auth/requires-recent-login': 'Din motive de siguranță, intră din nou în cont și reîncearcă.',
      'auth/user-disabled': 'Contul a fost dezactivat.',
      'permission-denied': 'Serverul a refuzat cererea. Confirmă emailul și reîncearcă.',
      'unavailable': 'Serverul nu răspunde. Verifică internetul.',
    }[c];
    if (m) return m;
    if (e && e.message === 'cancel') return 'Anulat.';
    return (e && e.message) || String(e);
  }

  // ---------------------------------------------------------------- email + password
  async function signUp(name, email, password, password2) {
    await ready();
    if (!String(name || '').trim()) throw new Error('Scrie-ți numele.');
    if (password2 !== undefined && password !== password2) throw new Error('Parolele nu sunt la fel. Scrie aceeași parolă de două ori.');
    if (String(password).length < 8) throw Object.assign(new Error(), { code: 'auth/weak-password' });
    const { auth: Au } = F();
    const cred = await Au.createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name && name.trim()) await Au.updateProfile(cred.user, { displayName: name.trim() });
    try { await Au.sendEmailVerification(cred.user); } catch (e) { console.warn(e); }
    return cred.user;
  }
  async function signIn(email, password) {
    await ready();
    return (await F().auth.signInWithEmailAndPassword(auth, email.trim(), password)).user;
  }
  async function resetPassword(email) { await ready(); await F().auth.sendPasswordResetEmail(auth, email.trim()); }
  async function resendVerification() { if (user) await F().auth.sendEmailVerification(user); }
  async function refresh() { if (user) { await F().auth.reload(user); user = auth.currentUser; await user.getIdToken(true); } return user; }
  async function signOut() { identity = null; profile = null; await F().auth.signOut(auth); }

  // ---------------------------------------------------------------- keys
  const Fs = () => F().firestore;
  const userDoc = (uid) => Fs().doc(db, 'users', uid || user.uid);
  const nameDoc = (h) => Fs().doc(db, 'usernames', h);
  let profile = null; // this account's public profile on the server (cached)
  async function remoteKey() {
    const snap = await Fs().getDoc(userDoc());
    profile = snap.exists() ? snap.data() : null;
    if (profile && profile.handle) store.set(LS.handle(user.uid), profile.handle);
    return profile;
  }
  /** Writes the public profile (@name + padlock) and reserves the @name, in one step. */
  async function publish(pub, handle) {
    const h = cleanHandle(handle);
    const p = handleProblem(h);
    if (p) throw new Error(p);
    const taken = await Fs().getDoc(nameDoc(h));
    if (taken.exists() && taken.data().uid !== user.uid) throw Object.assign(new Error(`@${h} este deja folosit. Alege alt nume.`), { code: 'handle-taken' });
    const old = profile && profile.handle;
    const b = Fs().writeBatch(db);
    if (old && old !== h) b.delete(nameDoc(old));
    if (!taken.exists()) b.set(nameDoc(h), { uid: user.uid });
    b.set(userDoc(), { name: (user.displayName || '').slice(0, 60), handle: h, key: pub.key, fp: pub.fp, created: Fs().serverTimestamp() });
    try { await b.commit(); } catch (e) {
      if (e && e.code === 'permission-denied') throw Object.assign(new Error(`Nu am putut rezerva @${h}. Poate tocmai l-a luat altcineva: alege alt nume.`), { code: 'handle-taken' });
      throw e;
    }
    profile = { name: user.displayName || '', handle: h, key: pub.key, fp: pub.fp };
    store.set(LS.handle(user.uid), h);
  }
  const pubOf = (id) => ({ key: Host.toB64(id.bundle), fp: id.fingerprint });

  /** What the signed-in account still needs on this device: 'ok' | 'create' | 'restore' | 'handle' */
  async function keyState() {
    if (!user) return 'none';
    const local = await Host.secureHas(SEC.secrets(user.uid));
    let remote = null;
    try { remote = await remoteKey(); } catch (e) { if (!local) throw e; return 'ok'; }
    if (local && remote && store.get(LS.fp(user.uid)) && store.get(LS.fp(user.uid)) !== remote.fp) return 'restore';
    if (local) return remote && remote.handle && !remote.email ? 'ok' : 'handle';
    return remote ? 'restore' : 'create';
  }
  /** Picks (or changes) the @name; the padlock comes from the server copy or from this device. */
  async function setHandle(handle) {
    let pub = profile && profile.key && profile.fp && store.get(LS.fp(user.uid)) === profile.fp ? { key: profile.key, fp: profile.fp } : null;
    if (!pub) pub = pubOf(await unlock('Confirmă ca să actualizezi profilul'));
    await publish(pub, handle);
  }
  const handle = () => (profile && profile.handle) || (user && store.get(LS.handle(user.uid))) || null;
  const fingerprint = () => (user && store.get(LS.fp(user.uid))) || (profile && profile.fp) || null;

  /** New account: 24 words made automatically, keys saved on the device, padlock published with the @name. */
  async function createKeys(handle) {
    const p = handleProblem(handle);
    if (p) throw new Error(p);
    const taken = await Fs().getDoc(nameDoc(cleanHandle(handle)));
    if (taken.exists() && taken.data().uid !== user.uid) throw Object.assign(new Error(`@${cleanHandle(handle)} este deja folosit. Alege alt nume.`), { code: 'handle-taken' });
    const words = A().generateMnemonic();
    const id = A().deriveIdentity(words);
    await Host.secureSet(SEC.words(user.uid), new TextEncoder().encode(words));
    await Host.secureSet(SEC.secrets(user.uid), A().exportSecrets(id));
    store.set(LS.fp(user.uid), id.fingerprint);
    identity = id;
    await publish(pubOf(id), handle);
    return id;
  }

  /** Someone else's public profile by @name: { uid, handle, name, key (bytes), fp }, or null. */
  async function lookup(h) {
    await ready();
    h = cleanHandle(h);
    if (handleProblem(h)) return null;
    const n = await Fs().getDoc(nameDoc(h));
    if (!n.exists()) return null;
    const uid = n.data().uid;
    const u = await Fs().getDoc(userDoc(uid));
    if (!u.exists()) return null;
    const d = u.data();
    if (d.handle !== h) return null; // half-finished rename: not trustworthy
    const key = Host.fromB64(d.key);
    if (A().fingerprint(key) !== d.fp) return null; // the padlock does not match its own fingerprint
    return { uid, handle: h, name: d.name || '', key, fp: d.fp };
  }
  /** The current profile of a known account (to notice a changed padlock). */
  async function profileOf(uid) {
    await ready();
    const u = await Fs().getDoc(userDoc(uid));
    if (!u.exists()) return null;
    const d = u.data();
    const key = Host.fromB64(d.key);
    if (A().fingerprint(key) !== d.fp) return null;
    return { uid, handle: d.handle, name: d.name || '', key, fp: d.fp };
  }
  /** Another device / reinstall: the 24 words give back exactly the same keys. */
  async function restoreKeys(words) {
    if (!A().validateMnemonic(words)) throw new Error('Cuvintele nu sunt corecte. Verifică ordinea și scrierea lor.');
    const id = A().deriveIdentity(words);
    const remote = await remoteKey();
    if (remote && remote.fp !== id.fingerprint) throw new Error('Aceste cuvinte aparțin altui cont.');
    const norm = A().normalizeMnemonic(words);
    await Host.secureSet(SEC.words(user.uid), new TextEncoder().encode(norm));
    await Host.secureSet(SEC.secrets(user.uid), A().exportSecrets(id));
    store.set(LS.fp(user.uid), id.fingerprint);
    store.set(LS.saved(user.uid), '1'); // they had them written down
    identity = id; // the @name step publishes the padlock if the server has none
    return id;
  }
  /** The account's keys for this session (asks for Face ID the first time). */
  async function unlock(reason) {
    if (identity) return identity;
    const blob = await Host.secureGet(SEC.secrets(user.uid), reason || 'Deblochează cheile ACM Docs');
    if (!blob) throw new Error('Cheile contului nu sunt pe acest dispozitiv.');
    identity = A().importSecrets(blob);
    return identity;
  }
  /** The account password is right (asked by the server). */
  async function checkPassword(password) {
    const { auth: Au } = F();
    await Au.reauthenticateWithCredential(user, Au.EmailAuthProvider.credential(user.email, password));
    return true;
  }
  /** Forgets the unlocked keys (the next use asks for Face ID again). */
  function lock() { identity = null; }
  async function words(reason) {
    const b = await Host.secureGet(SEC.words(user.uid), reason || 'Vezi codul de recuperare');
    return b ? new TextDecoder().decode(b) : null;
  }
  const wordsSaved = () => !!(user && store.get(LS.saved(user.uid)));
  const markWordsSaved = () => { if (user) store.set(LS.saved(user.uid), '1'); };

  // ---------------------------------------------------------------- delete account
  async function deleteAccount(password) {
    const { auth: Au, firestore: Fs } = F();
    if (isPasswordUser()) {
      await Au.reauthenticateWithCredential(user, Au.EmailAuthProvider.credential(user.email, password));
    }
    const uid = user.uid;
    // the server removes profile, @name, devices, cloud data and the sign-in, but only with a
    // signature made by the account keys (a stolen password or session alone cannot do it)
    const id = await unlock('Confirmă ștergerea contului');
    const dev = typeof Devices !== 'undefined' ? Devices.myDevice() : null;
    if (typeof Devices !== 'undefined') await Devices.ensure();
    const ts = Date.now();
    await call('wipeAccount', { ts, sig: Host.toB64(A().signEd(id, `acm-wipe\n${uid}\n${Devices.myDevice() || dev}\n${ts}`)) });
    void Fs;
    try { await F().auth.signOut(auth); } catch (e) {}
    await Host.secureDelete(SEC.words(uid));
    await Host.secureDelete(SEC.secrets(uid));
    if (typeof Sync !== 'undefined') await Sync.forgetAccount(uid);
    [LS.saved(uid), LS.fp(uid), LS.handle(uid), 'acm.contacts.' + uid].forEach(store.del);
    profile = null;
    identity = null;
  }

  // ---------------------------------------------------------------- the "later" choice
  const skipped = () => store.get(LS.later) === '1';
  const setSkipped = (v) => (v ? store.set(LS.later, '1') : store.del(LS.later));

  /** Server function (europe-west1) → its data; errors carry the server's message. */
  async function call(name, data) {
    await ready();
    try { return (await F().functions.httpsCallable(fns, name)(data || {})).data; } catch (e) {
      const m = String((e && e.message) || e);
      throw Object.assign(new Error(m), { code: (e && e.code) || 'functions/error', server: m });
    }
  }
  async function signInWithToken(token) { await ready(); user = (await F().auth.signInWithCustomToken(auth, token)).user; return user; }
  async function claims() { if (!user) return {}; try { return (await F().auth.getIdTokenResult(user)).claims || {}; } catch (e) { return {}; } }
  const internals = () => ({ F: F(), db, auth });

  return {
    call, signInWithToken, claims, internals,
    init, ready, onChange, current, needsVerification, isPasswordUser, say,
    signUp, signIn, resetPassword, resendVerification, refresh, signOut,
    keyState, createKeys, restoreKeys, setHandle, handle, fingerprint, lookup, profileOf, handleProblem, suggestHandle, cleanHandle, unlock, lock, checkPassword, words, wordsSaved, markWordsSaved, deleteAccount,
    skipped, setSkipped,
  };
})();
