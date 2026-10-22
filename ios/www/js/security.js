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
    'Post-Quantum Cryptography: documentele sunt protejate cu standardele NIST pentru era computerelor cuantice.',
    'Zero-Knowledge Architecture: cheile de criptare există doar pe dispozitivele tale.',
    'End-to-End Encryption pentru documente, facturi și date sincronizate.',
    'Device-Bound Keys: fiecare dispozitiv al contului are propria cheie.',
    'Documentele .acm poartă semnătura digitală a expeditorului.',
    'Cloudul păstrează exclusiv date criptate, fără nume de fișiere.',
    'Recunoașterea textului (OCR) rulează local, pe dispozitiv.',
    'Fără reclame, fără tracking, fără profilare.',
    'EU Data Residency: datele criptate sunt găzduite în Uniunea Europeană.',
    'Criptare bazată pe biblioteci open-source auditate public.',
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
    if (!signed) return [{ ok: false, t: 'Cont neconectat', s: 'Conectează-te pentru End-to-End Encryption, sincronizare criptată și documente .acm.', go: 'account' }];
    out.push({ ok: Account.wordsSaved(), t: Account.wordsSaved() ? 'Cod de recuperare notat' : 'Cod de recuperare nenotat', s: 'Cele 24 de cuvinte permit restaurarea cheilor pe un dispozitiv nou.', go: Account.wordsSaved() ? null : 'words' });
    if (Account.isPasswordUser()) {
      const on = Account.twoStep() || (AccountUI.emailTwoStep && AccountUI.emailTwoStep());
      out.push({ ok: on, t: on ? 'Two-Factor Authentication activă' : 'Two-Factor Authentication oprită', s: 'Conectarea unui dispozitiv nou cere o confirmare suplimentară.', go: on ? null : 'twostep' });
    }
    if (typeof AppLock !== 'undefined') { const on = AppLock.enabled(); out.push({ ok: on, t: on ? 'Blocarea aplicației activă' : 'Blocarea aplicației oprită', s: 'Deschiderea aplicației cere Face ID, amprentă, Windows Hello sau cod.', go: on ? null : 'applock' }); }
    out.push({ ok: true, t: 'Dispozitive conectate', s: 'Lista dispozitivelor contului, cu posibilitatea de a le deconecta sau bloca.', go: 'devices' });
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
          el('p', { text: 'ACM Docs protejează documentele, facturile și datele prin End-to-End Encryption și Post-Quantum Cryptography. Criptarea are loc pe dispozitiv, iar cheile nu părăsesc dispozitivele contului.' }),
        ]),
        el('h3', { class: 'plan-h', text: 'Contul tău' }),
        checks,
        el('h3', { class: 'plan-h', text: 'Tehnologii de protecție' }),
        el('div', { class: 'sec-cards' }, [
          card('lock', 'blue', 'End-to-End Encryption', 'Datele sunt criptate pe dispozitiv înainte de sincronizare sau trimitere. Serverul stochează exclusiv date criptate.', 'XChaCha20-Poly1305 · 256-bit · HKDF-SHA256'),
          card('atom', 'indigo', 'Post-Quantum Cryptography', 'Criptare hibridă: algoritmi clasici împreună cu algoritmii post-cuantici standardizați de NIST, pentru protecție pe termen lung, inclusiv împotriva computerelor cuantice.', 'X25519 + ML-KEM-768 (FIPS 203) · Ed25519 + ML-DSA-65 (FIPS 204)'),
          card('key', 'orange', 'Zero-Knowledge Architecture', 'Cheile de criptare sunt generate și păstrate pe dispozitivele contului. ACM Docs nu deține chei de rezervă și nu are acces la conținut. Recuperarea se face exclusiv cu cele 24 de cuvinte.', 'BIP-39 · 256-bit'),
          card('devices', 'teal', 'Device-Bound Keys', 'Fiecare dispozitiv are propria cheie. Un dispozitiv nou se adaugă prin aprobare de pe un dispozitiv existent sau cu codul de recuperare, iar celelalte dispozitive sunt notificate.', null),
          card('fingerprint', 'green', 'Two-Factor Authentication', 'Conectarea unui dispozitiv nou cere, pe lângă parolă, un cod trimis pe email sau generat de o aplicație de autentificare. Conținutul rămâne accesibil doar cu cheile contului.', null),
          card('lockfile', 'purple', 'Digital Signatures', 'Documentele .acm se deschid doar pentru destinatarii aleși și poartă semnătura digitală a expeditorului, verificată automat la deschidere.', 'Ed25519 + ML-DSA-65 · Argon2id'),
          card('cloud', 'blue', 'Encrypted Cloud', 'Cloudul primește blocuri criptate cu identificatori aleatorii, fără nume de fișiere și fără metadate de conținut.', null),
          card('eu', 'indigo', 'EU Data Residency', 'Datele criptate sunt găzduite în centre de date din Uniunea Europeană, conform GDPR. Fără reclame, tracking sau profilare.', null),
          card('shield', 'red', 'Anti-Spyware Protection', 'Cheile se blochează la ieșirea din aplicație, codul de recuperare și documentele decriptate sunt protejate la capturile de ecran, iar copiile temporare se șterg automat.', null),
          card('verified', 'gray', 'Penetration Testing', 'Criptarea folosește biblioteci open-source auditate public. Serverul și aplicațiile sunt testate prin scenarii de atac la fiecare versiune.', null),
        ]),
        el('div', { class: 'recov-warn', html: `${svg('info')}<span>${escHtml(I18n.t('Protecția completă presupune și un dispozitiv sigur: sistem de operare actualizat, blocarea ecranului activă și aplicații instalate doar din surse de încredere.'))}</span>` }),
        el('div', { class: 'actions col' }, [
          typeof Shield !== 'undefined' ? el('button', { class: 'btn', type: 'button', html: svg('shield') + '<span>' + escHtml(I18n.t('Detalii Anti-Spyware')) + '</span>', onclick: () => close('shield') }) : null,
          el('button', { class: 'btn primary', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]),
      );
    });
    if (!act) return;
    if (act === 'account') { Account.setSkipped(false); return AccountUI.show('signin'); }
    if (act === 'words') { await AccountUI.showWords(); return show(); }
    if (act === 'twostep') { await AccountUI.twoStepScreen(); return show(); }
    if (act === 'applock') { await AppLock.settings(); return show(); }
    if (act === 'devices') return Devices.show();
    if (act === 'shield') { await Shield.showInfo(); return show(); }
  }

  return { show, tip, nextTip, mountHomeTip, TIPS };
})();
