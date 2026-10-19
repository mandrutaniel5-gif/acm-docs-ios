'use strict';
// ACM Docs accounts (Firebase) and the account keys for .acm documents.
//
// - Sign in: email + password (with email confirmation) or Google.
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
  // Google sign-in: OAuth clients (filled in once created in Google Cloud / Firebase)
  const GOOGLE = {
    ios: '',        // iOS client ID ("….apps.googleusercontent.com")
    desktop: '',    // Windows: "Desktop app" client ID
    desktopSecret: '', // Google gives desktop apps a non-secret "secret"; it is not a password
  };

  const LS = {
    later: 'acm.account.later',
    saved: (uid) => 'acm.words.saved.' + uid,
    fp: (uid) => 'acm.fp.' + uid,
  };
  const SEC = { words: (uid) => 'words.' + uid, secrets: (uid) => 'keys.' + uid };

  let fb = null, auth = null, db = null, user = null, firstState = null, identity = null;
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
  async function signUp(name, email, password) {
    await ready();
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
  async function signOut() { identity = null; await F().auth.signOut(auth); }

  // ---------------------------------------------------------------- Google (system browser, PKCE)
  const b64url = (u8) => Host.toB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function google() {
    await ready();
    const ios = Host.info && Host.info.platform === 'ios';
    const clientId = ios ? GOOGLE.ios : GOOGLE.desktop;
    if (!clientId || (!ios && Host.mobile)) throw new Error('Conectarea cu Google va fi disponibilă în curând. Până atunci, folosește emailul.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const scheme = 'com.googleusercontent.apps.' + clientId.split('.apps.googleusercontent.com')[0];
    const redirect = ios ? scheme + ':/oauth2redirect' : '{REDIRECT}';
    const q = (o) => Object.entries(o).map(([k, v]) => k + '=' + (v === '{REDIRECT}' ? v : encodeURIComponent(v))).join('&');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + q({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account' });
    const back = new URL(await Host.oauth(url, ios ? scheme : 'loopback'));
    if (back.searchParams.get('state') !== state) throw new Error('Răspuns Google nevalid.');
    const code = back.searchParams.get('code');
    if (!code) throw new Error('cancel');
    const usedRedirect = ios ? redirect : back.origin;
    const body = q({ client_id: clientId, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: usedRedirect, ...(ios ? {} : { client_secret: GOOGLE.desktopSecret }) });
    const tok = JSON.parse(await Host.googleToken(body));
    if (!tok.id_token) throw new Error(tok.error_description || 'Google nu a răspuns.');
    const { auth: Au } = F();
    return (await Au.signInWithCredential(auth, Au.GoogleAuthProvider.credential(tok.id_token))).user;
  }

  // ---------------------------------------------------------------- keys
  const userDoc = () => F().firestore.doc(db, 'users', user.uid);
  async function remoteKey() {
    const snap = await F().firestore.getDoc(userDoc());
    return snap.exists() ? snap.data() : null;
  }
  async function publish(id) {
    const { setDoc, serverTimestamp } = F().firestore;
    await setDoc(userDoc(), {
      name: user.displayName || '', email: user.email || '', emailLower: (user.email || '').toLowerCase(),
      key: Host.toB64(id.bundle), fp: id.fingerprint, created: serverTimestamp(),
    });
  }
  /** What this device has for the signed-in account: 'ok' | 'create' | 'restore' */
  async function keyState() {
    if (!user) return 'none';
    const local = await Host.secureHas(SEC.secrets(user.uid));
    let remote = null;
    try { remote = await remoteKey(); } catch (e) { if (!local) throw e; }
    if (local && remote && store.get(LS.fp(user.uid)) && store.get(LS.fp(user.uid)) !== remote.fp) return 'restore';
    if (local) { if (!remote) await publishFromDevice(); return 'ok'; }
    return remote ? 'restore' : 'create';
  }
  async function publishFromDevice() { const id = await unlock('Publică lacătul contului tău'); await publish(id); }

  /** New account: 24 words made automatically, keys saved on the device, padlock published. */
  async function createKeys() {
    const words = A().generateMnemonic();
    const id = A().deriveIdentity(words);
    await Host.secureSet(SEC.words(user.uid), new TextEncoder().encode(words));
    await Host.secureSet(SEC.secrets(user.uid), A().exportSecrets(id));
    store.set(LS.fp(user.uid), id.fingerprint);
    await publish(id);
    identity = id;
    return id;
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
    if (!remote) await publish(id);
    identity = id;
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
    try { await Fs.deleteDoc(userDoc()); } catch (e) { if (e.code !== 'not-found') console.warn(e); }
    await Au.deleteUser(user);
    await Host.secureDelete(SEC.words(uid));
    await Host.secureDelete(SEC.secrets(uid));
    [LS.saved(uid), LS.fp(uid)].forEach(store.del);
    identity = null;
  }

  // ---------------------------------------------------------------- the "later" choice
  const skipped = () => store.get(LS.later) === '1';
  const setSkipped = (v) => (v ? store.set(LS.later, '1') : store.del(LS.later));

  return {
    init, ready, onChange, current, needsVerification, isPasswordUser, say,
    signUp, signIn, resetPassword, resendVerification, refresh, signOut, google,
    keyState, createKeys, restoreKeys, unlock, words, wordsSaved, markWordsSaved, deleteAccount,
    skipped, setSkipped,
    get googleReady() { return !!(Host.info && Host.info.platform === 'ios' ? GOOGLE.ios : (!Host.mobile && GOOGLE.desktop)); },
  };
})();
