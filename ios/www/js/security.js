'use strict';
// "Security and encryption": what ACM Docs does to keep documents private, in plain words, with the
// state of this account (recovery code, two-step verification, app lock, devices, cloud) and the
// short security notes shown around the app.

Object.assign(Icons, {
  atom: 'M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1 1.1-.49 1.1-1.1-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z',
  fingerprint: 'M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.94-2.87-1.47-6.54-1.47-9.4.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.21-.39.21z',
  eu: 'M12 2l1.1 3.4h3.6l-2.9 2.1 1.1 3.4L12 8.8l-2.9 2.1 1.1-3.4-2.9-2.1h3.6zM5 12.5l.7 2.1H8l-1.8 1.3.7 2.1L5 16.7 3.2 18l.7-2.1L2 14.6h2.3zm14 0l.7 2.1H22l-1.8 1.3.7 2.1-1.9-1.3-1.8 1.3.7-2.1-1.9-1.3h2.3zM12 15.5l.7 2.1H15l-1.8 1.3.7 2.1-1.9-1.3-1.8 1.3.7-2.1-1.9-1.3h2.3z',
});

const Security = (() => {
  // short notes around the app (Home, empty lists, sign-up): one at a time
  const TIPS = [
    'Criptare post-cuantică: documentele tale rezistă și computerelor viitorului.',
    'Nici ACM Docs nu îți poate citi documentele. Cheile sunt doar pe dispozitivele tale.',
    'Parola singură nu deschide nimic: fără cheile contului, datele rămân criptate.',
    'Fiecare dispozitiv nou îți apare pe celelalte, cu buton de blocare.',
    'Documentele .acm sunt semnate: afli imediat dacă au fost modificate pe drum.',
    'În cloud ajung doar blocuri criptate, fără nume de fișiere și fără conținut lizibil.',
    'Textul din poze se recunoaște pe dispozitiv. Pozele nu pleacă nicăieri.',
    'Fără reclame, fără urmărire, fără analiza datelor tale.',
    'Servere în Uniunea Europeană, cu date criptate de la un capăt la altul.',
    'Criptare verificată de biblioteci auditate public, nimic inventat de noi.',
  ];
  let tipIx = (() => { try { const n = (Number(localStorage.getItem('acm.tip')) + 1) % TIPS.length; localStorage.setItem('acm.tip', String(n)); return n || 0; } catch (e) { return 0; } })();
  const tip = () => TIPS[tipIx % TIPS.length];
  function nextTip() { tipIx = (tipIx + 1) % TIPS.length; return tip(); }

  /** The line on Home: one note per start, a tap opens this page. */
  function mountHomeTip() {
    const b = document.getElementById('sec-tip');
    const t = document.getElementById('sec-tip-t');
    if (!b || !t) return;
    t.textContent = tip();
    hydrateIcons(b);
    b.addEventListener('click', () => show());
  }

  // ---------------------------------------------------------------- the page
  function status() {
    const out = [];
    const signed = typeof Account !== 'undefined' && Account.current() && !Account.needsVerification();
    if (!signed) return [{ ok: false, t: 'Fără cont, documentele stau doar pe acest dispozitiv', s: 'Cu un cont primești criptare de la un capăt la altul, sincronizare criptată și documente .acm.', go: 'account' }];
    out.push({ ok: Account.wordsSaved(), t: Account.wordsSaved() ? 'Codul de recuperare este notat' : 'Codul de recuperare nu e notat încă', s: 'Cele 24 de cuvinte sunt singura cale de a-ți recupera datele dacă pierzi toate dispozitivele.', go: Account.wordsSaved() ? null : 'words' });
    if (Account.isPasswordUser()) out.push({ ok: Account.twoStep(), t: Account.twoStep() ? 'Verificarea în doi pași este activă' : 'Verificarea în doi pași este oprită', s: 'Cu ea pornită, cine îți află parola tot nu se poate conecta.', go: Account.twoStep() ? null : 'twostep' });
    if (typeof AppLock !== 'undefined') { const on = AppLock.enabled(); out.push({ ok: on, t: on ? 'Aplicația se blochează' : 'Blocarea aplicației este oprită', s: 'Cu Face ID, amprentă, Windows Hello sau un cod, nimeni nu o deschide în locul tău.', go: on ? null : 'applock' }); }
    out.push({ ok: true, t: 'Dispozitivele contului sunt sub control', s: 'Vezi fiecare dispozitiv conectat și blochează-l pe loc dacă nu-l recunoști.', go: 'devices' });
    return out;
  }

  async function show() {
    const act = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'sec-page');
      const card = (icon, color, title, text, more) => el('div', { class: 'sec-card' }, [
        el('span', { class: 'si ' + color, html: svg(icon) }),
        el('div', {}, [el('b', { text: title }), el('p', { text }), more ? el('small', { class: 'muted no-tr sec-tech', text: more }) : null]),
      ]);
      const st = status();
      const checks = el('div', { class: 'list-card sec-status' }, st.map((x) => {
        const r = el(x.go ? 'button' : 'div', { class: 'srow', type: x.go ? 'button' : null }, [
          el('span', { class: 'si ' + (x.ok ? 'green' : 'orange'), html: svg(x.ok ? 'check' : 'warn') }),
          el('span', { class: 'stx' }, [el('b', { text: x.t }), el('small', { text: x.s })]),
          x.go ? el('span', { class: 'chev', html: svg('right') }) : null,
        ]);
        if (x.go) r.addEventListener('click', () => close(x.go));
        return r;
      }));
      box.append(
        el('div', { class: 'sec-hero' }, [
          el('span', { class: 'sec-shield', html: svg('shield') }),
          el('h2', { text: 'Securitate și criptare' }),
          el('p', { text: 'Documentele, facturile și datele tale sunt criptate pe dispozitivul tău, înainte să plece undeva. Doar tu ai cheile. Nici noi nu le putem citi.' }),
        ]),
        el('h3', { class: 'plan-h', text: 'Contul tău' }),
        checks,
        el('h3', { class: 'plan-h', text: 'Cum te protejăm' }),
        el('div', { class: 'sec-cards' }, [
          card('lock', 'blue', 'Criptare de la un capăt la altul', 'Cheile contului se creează pe dispozitivul tău și nu ajung niciodată la noi. Serverul primește doar date criptate, pe care nu le poate deschide.', 'XChaCha20-Poly1305 · HKDF-SHA256'),
          card('atom', 'indigo', 'Rezistentă la computerele cuantice', 'Folosim deodată criptarea clasică și cea post-cuantică standardizată de NIST. Ca să-ți citească datele, cineva ar trebui să le spargă pe amândouă.', 'X25519 + ML-KEM-768 (FIPS 203) · Ed25519 + ML-DSA-65 (FIPS 204)'),
          card('key', 'orange', 'Fără uși din spate', 'Nu există o cheie de rezervă la noi și nici o resetare care să ocolească criptarea. Contul se recuperează doar cu cele 24 de cuvinte, pe care le ai doar tu.', 'BIP-39 · 256 bit'),
          card('devices', 'teal', 'Fiecare dispozitiv are cheia lui', 'Un dispozitiv nou intră doar cu aprobarea ta, de pe un dispozitiv deja conectat, sau cu codul de recuperare. Toate celelalte sunt anunțate și îl pot bloca pe loc.', null),
          card('fingerprint', 'green', 'Parola singură nu ajunge', 'Cine îți află parola nu poate citi nimic: datele se deschid doar cu cheile de pe dispozitivele tale. Cu verificarea în doi pași, nici măcar nu se poate conecta.', null),
          card('lockfile', 'purple', 'Documente semnate, imposibil de falsificat', 'Fișierele .acm se deschid doar pentru destinatarii aleși și poartă semnătura expeditorului. Orice modificare pe drum se vede imediat.', 'Ed25519 + ML-DSA-65 · Argon2id'),
          card('cloud', 'blue', 'Cloud care nu știe ce păstrează', 'În cloud ajung doar blocuri criptate, cu nume aleatorii. Fără numele fișierelor, fără conținut, fără legături între ele.', null),
          card('eu', 'indigo', 'Servere în Uniunea Europeană', 'Datele criptate stau în centre de date din UE, protejate de GDPR. Nu vindem date, nu afișăm reclame și nu urmărim ce faci în aplicație.', null),
          card('shield', 'red', 'Protecție anti-spyware', 'Cheile se închid singure când ieși din aplicație, codul de recuperare și documentele decriptate nu pot fi capturate pe ecran, iar copiile decriptate temporare se șterg când închizi documentul.', null),
          card('verified', 'gray', 'Verificată, nu doar promisă', 'Criptarea folosește biblioteci open-source auditate public. Serverul și aplicația trec regulat prin teste de atac, la fiecare versiune nouă.', null),
        ]),
        el('div', { class: 'recov-warn', html: `${svg('info')}<span>${escHtml(I18n.t('Sincer: nicio aplicație nu te poate apăra pe un dispozitiv deja compromis. Ține sistemul actualizat, folosește blocarea ecranului și nu instala aplicații din surse necunoscute.'))}</span>` }),
        el('div', { class: 'actions col' }, [
          typeof Shield !== 'undefined' ? el('button', { class: 'btn', type: 'button', html: svg('shield') + '<span>' + escHtml(I18n.t('Detalii anti-spyware')) + '</span>', onclick: () => close('shield') }) : null,
          el('button', { class: 'btn primary', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]),
      );
    });
    if (!act) return;
    if (act === 'account') { Account.setSkipped(false); return AccountUI.show('signin'); }
    if (act === 'words') { await AccountUI.showWords(); return show(); }
    if (act === 'twostep') { await AccountUI.twoStepFlow(); return show(); }
    if (act === 'applock') { await AppLock.settings(); return show(); }
    if (act === 'devices') return Devices.show();
    if (act === 'shield') { await Shield.showInfo(); return show(); }
  }

  return { show, tip, nextTip, mountHomeTip, TIPS };
})();
