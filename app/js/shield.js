'use strict';
// Protection against spyware (Pegasus-style) as far as an app can go.
//
// The honest limit: spyware that takes over the whole phone sees what the phone sees. What the app
// does is shrink what there is to steal and the moments when it is on screen:
//  - the private keys open only with Face ID / the phone's lock, and lock again when the app goes
//    to the background or after a few idle minutes
//  - recovery words and decrypted documents: no screenshots / screen recording / app-switcher preview
//  - a decrypted document is a temporary copy, wiped when you leave it (unless you choose to keep it)
//  - signs of a jailbroken / rooted phone are reported

const Shield = (() => {
  const IDLE_MS = 3 * 60 * 1000;
  let level = 0, idleTimer = null, watch = null;
  const temps = new Set();

  // ---------------------------------------------------------------- screen protection
  async function protect(on) {
    level = Math.max(0, level + (on ? 1 : -1));
    await Host.privacy(level > 0);
  }
  /** Runs fn with the screen protected. */
  async function guarded(fn) {
    await protect(true);
    try { return await fn(); } finally { await protect(false); }
  }
  window.__onScreenshot = () => UI.toast('Ai făcut o captură de ecran cu un document protejat. Șterge-o dacă nu ai nevoie de ea: pozele ajung des în cloud.', { error: true });

  // ---------------------------------------------------------------- keys lock again
  function lockKeys() { try { if (typeof Account !== 'undefined') Account.lock(); } catch (e) {} }
  function poke() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(lockKeys, IDLE_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockKeys(); });
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, poke, { passive: true, capture: true }));

  // ---------------------------------------------------------------- temporary decrypted copies
  async function tempDir() { return Host.join(await Host.specialDir('documents'), '.acm-temp'); }
  async function wipeTemp() {
    try {
      const d = await tempDir();
      for (const n of Host.listDir(d)) Host.remove(Host.join(d, n));
    } catch (e) { /* nothing there */ }
    temps.clear();
  }
  /** Keeps the screen protected while a decrypted document is open; wipes the copy when you leave it. */
  function watchOpen(path, temporary) {
    if (temporary) temps.add(path);
    if (watch) clearInterval(watch);
    protect(true);
    const home = document.getElementById('home');
    let seenOpen = false;
    watch = setInterval(() => {
      const atHome = home && !home.classList.contains('hidden');
      if (!atHome) { seenOpen = true; return; }
      if (!seenOpen) return;
      clearInterval(watch); watch = null;
      protect(false);
      if (temporary) { Host.remove(path); temps.delete(path); approved.delete(path); try { App.renderView(); } catch (e) {} }
    }, 800);
  }

  // ---------------------------------------------------------------- device check + advice
  let integrityCache = null;
  async function integrity() {
    if (!integrityCache) integrityCache = await Host.integrity();
    return integrityCache;
  }

  async function showInfo() {
    const ig = await integrity();
    const ios = Host.info && Host.info.platform === 'ios';
    const android = Host.mobile && !ios;
    const ok = (t, s) => el('li', { class: 'sh-ok' }, [el('span', { html: svg('check') }), el('div', {}, [el('b', { text: t }), el('small', { text: s })])]);
    await UI.modal((box, close) => {
      box.classList.add('shield-info');
      box.append(
        el('div', { class: 'acm-alert' + (ig.risk ? ' danger' : ' good'), html: svg(ig.risk ? 'warn' : 'shield') }),
        el('h2', { text: 'Protecție anti-spyware' }),
        ig.risk ? el('div', { class: 'acm-note bad', html: `${svg('warn')}<span><b>Telefonul pare modificat (${ios ? 'jailbreak' : 'root'}).</b> Pe un astfel de telefon, alte aplicații pot citi ce face ACM Docs. Nu deschide documente sensibile pe el.</span>` }) : null,
        el('p', { class: 'muted small', text: 'Ce face ACM Docs ca să nu poată fi spionat:' }),
        el('ul', { class: 'sh-list' }, [
          ok('Chei închise în telefon', `Cheile private se deschid doar cu ${ios ? 'Face ID' : Host.mobile ? 'amprenta sau PIN-ul' : 'confirmarea Windows'} și se închid singure când ieși din aplicație sau după 3 minute fără activitate.`),
          ok('Fără capturi de ecran', ios ? 'Codul de recuperare și documentele decriptate se ascund când ecranul e înregistrat sau partajat și în lista de aplicații deschise.' : 'Codul de recuperare și documentele decriptate nu pot fi capturate sau înregistrate.'),
          ok('Copii decriptate temporare', 'Un document .acm deschis se șterge din telefon când îl închizi, dacă nu alegi să-l păstrezi.'),
          ok('Criptare post-cuantică', 'Chiar dacă cineva copiază fișierele .acm acum, nu le poate deschide nici cu un computer cuantic de mai târziu.'),
          !Host.mobile ? null : ok(ig.risk ? 'Verificarea telefonului: problemă' : 'Telefon verificat', ig.risk ? 'Am găsit semne de jailbreak/root.' : 'Nu am găsit semne de jailbreak sau root.'),
        ]),
        el('h3', { class: 'csub', text: 'Ce poți face tu' }),
        el('ul', { class: 'sh-tips' }, [
          el('li', { text: 'Ține telefonul actualizat. Spyware-ul de tip Pegasus folosește breșe pe care actualizările le închid.' }),
          ios ? el('li', { html: 'Pornește <b>Modul Izolare</b> (Lockdown Mode): Setări › Confidențialitate și securitate › Mod Izolare. Este cea mai puternică protecție Apple împotriva Pegasus.' }) : null,
          android ? el('li', { html: 'Pornește <b>Protecția avansată</b> (Android 16+): Setări › Securitate și confidențialitate › Protecție avansată.' }) : null,
          Host.mobile ? el('li', { text: 'Repornește telefonul o dată pe zi: multe programe spion nu supraviețuiesc unei reporniri.' }) : null,
          el('li', { text: 'Nu deschide linkuri sau fișiere de la persoane necunoscute și nu instala aplicații din afara magazinului.' }),
        ]),
        el('div', { class: 'recov-warn', html: `${svg('info')}<span>Sincer: nicio aplicație nu se poate apăra complet de un spyware care a preluat controlul întregului telefon. Măsurile de mai sus reduc mult ce ar putea fura și când.</span>` }),
        el('div', { class: 'actions' }, [el('button', { class: 'btn primary', type: 'button', text: 'Am înțeles', onclick: () => close() })]),
      );
    });
  }

  // a decrypted copy left behind by a crash or a forced quit is removed at start
  setTimeout(wipeTemp, 1500);
  poke();

  // ---------------------------------------------------------------- saving a decrypted document
  const approved = new Set();
  /** The open document is the temporary copy of an encrypted .acm. */
  const isProtected = (p) => !!p && temps.has(p);
  /**
   * Before any save of a protected document: one warning, then the copy goes to "Decriptate"
   * (never next to the temporary copy, which is wiped). Returns that folder, or null if refused.
   */
  async function plainSaveDir(p) {
    if (!approved.has(p)) {
      const ok = await UI.confirm('Salvezi o copie decriptată?',
        'Documentul a fost primit criptat. Copia salvată nu mai este protejată: oricine are acces la acest dispozitiv o poate citi. Nu o trimite mai departe, nu o încărca în cloud și nu o posta. Dacă trebuie să ajungă la altcineva, trimite-o criptat.',
        'Salvează copia', 'Anulează');
      if (!ok) return null;
      approved.add(p);
    }
    const dir = Host.join(await Host.specialDir('documents'), 'Decriptate');
    Host.mkdirp(dir);
    return dir;
  }

  return { protect, guarded, watchOpen, wipeTemp, tempDir, integrity, showInfo, isProtected, plainSaveDir };
})();
