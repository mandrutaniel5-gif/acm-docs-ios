'use strict';
// Service state from ACM Docs: functions paused for security or maintenance, account suspended, and
// reporting another account. The server enforces every pause on its own; this file only tells the
// user, in time, why something is not available.
const Service = (() => {
  const LS = 'acm.service';
  const FEATURE = {
    signup: 'Crearea conturilor noi', signin: 'Conectarea cu parola', newDevice: 'Adăugarea dispozitivelor noi',
    sync: 'Sincronizarea în cloud', docs: 'Salvarea documentelor', scans: 'Scanarea documentelor', invoices: 'Emiterea facturilor',
    acmSend: 'Trimiterea documentelor .acm', acmOpen: 'Deschiderea documentelor .acm', payments: 'Abonamentele', chat: 'Mesajele',
  };
  let state = (() => { try { return JSON.parse(localStorage.getItem(LS)) || { off: {}, all: false, msg: '' }; } catch (e) { return { off: {}, all: false, msg: '' }; } })();
  let unlisten = null, banner = null;
  const listeners = [];

  function set(d) {
    const off = {};
    for (const k of Object.keys(FEATURE)) if (d && d.off && d.off[k] === true) off[k] = true;
    state = { off, all: !!(d && d.all === true), msg: d && typeof d.msg === 'string' ? d.msg.slice(0, 300) : '' };
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
    drawBanner();
    listeners.forEach((f) => { try { f(state); } catch (e) {} });
  }

  /** Live: the switches document is public, so this works signed in or not. */
  function start() {
    stop();
    try {
      const { F: f, db } = Account.internals();
      if (!f.firestore.onSnapshot || !db) return;
      unlisten = f.firestore.onSnapshot(f.firestore.doc(db, 'server', 'switches'), (snap) => set(snap.exists() ? snap.data() : null), () => { stop(); setTimeout(start, 60000); });
    } catch (e) { console.warn('service', e); }
    drawBanner();
  }
  function stop() { if (unlisten) { try { unlisten(); } catch (e) {} unlisten = null; } }

  const off = (feature) => state.all || !!state.off[feature];
  const anyOff = () => state.all || Object.keys(state.off).length > 0;

  function drawBanner() {
    if (!document.body) return;
    if (!anyOff()) { if (banner) { banner.remove(); banner = null; } return; }
    if (!banner) {
      banner = el('button', { class: 'svc-banner', type: 'button' });
      banner.addEventListener('click', () => notice(null));
      document.body.append(banner);
    }
    banner.innerHTML = `${svg('info')}<span>${escHtml(I18n.t(state.all ? 'ACM Docs este în mentenanță.' : 'Unele funcții sunt oprite temporar.'))}</span>`;
  }

  /** Explains a paused feature (or maintenance); with feature=null, lists what is paused. */
  async function notice(feature) {
    const list = state.all ? [] : Object.keys(state.off);
    await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'plan-ask');
      box.append(
        el('div', { class: 'plan-ico warn', html: svg('info') }),
        el('h2', { text: state.all ? 'ACM Docs este în mentenanță' : feature ? 'Funcție oprită temporar' : 'Funcții oprite temporar' }),
        feature && !state.all ? el('p', { text: FEATURE[feature] || feature }) : null,
        !feature && list.length ? el('div', { class: 'plan-incl' }, list.map((k) => el('div', { class: 'plan-li' }, [el('span', { text: FEATURE[k] || k })]))) : null,
        state.msg ? el('p', { class: 'no-tr', text: state.msg }) : el('p', { text: 'Pentru siguranța conturilor, echipa ACM Docs a oprit temporar această funcție. Documentele și datele tale nu sunt afectate. Reîncearcă în curând.' }),
        el('div', { class: 'actions col' }, [el('button', { class: 'btn primary', type: 'button', text: 'Am înțeles', onclick: () => close(true) })]),
      );
    });
  }
  /** true (and a message) when the feature is paused right now. */
  function blocked(feature) {
    if (!off(feature)) return false;
    notice(feature);
    return true;
  }

  let suspendedShown = false;
  const shown = {};
  async function suspended() {
    if (suspendedShown) return;
    suspendedShown = true;
    await UI.confirm('Contul a fost suspendat', 'Accesul la acest cont a fost suspendat de echipa ACM Docs, conform Termenilor și condițiilor. Datele criptate nu au fost șterse. Pentru detalii, scrie-ne la mandrutaniel5@gmail.com.', 'Am înțeles', 'Închide');
    suspendedShown = false;
  }
  /** Server answers about pauses and suspension: shown, and true if the error was one of them. */
  function handle(e) {
    const m = String((e && (e.server || e.message)) || '');
    const p = /paused:([a-zA-Z]+)/.exec(m);
    if (p) {
      if (p[1] !== 'all' && !state.off[p[1]]) set({ ...state, off: { ...state.off, [p[1]]: true } });
      // the same pause is explained at most once every 10 minutes (background syncs hit it too)
      if (Date.now() - (shown[p[1]] || 0) > 600000) { shown[p[1]] = Date.now(); notice(p[1] === 'all' ? null : p[1]); }
      return true;
    }
    if (/account suspended|auth\/user-disabled/.test(m) || (e && e.code === 'auth/user-disabled')) { suspended(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- reporting an account
  const REASONS = [
    ['spam', 'Spam sau mesaje nedorite'], ['abuse', 'Hărțuire sau abuz'], ['fraud', 'Fraudă sau înșelăciune'],
    ['impersonation', 'Se dă drept altcineva'], ['illegal', 'Conținut ilegal'], ['other', 'Altceva'],
  ];
  async function report(handle) {
    if (!(await AcmShare.ensureAccount())) return;
    const r = await UI.modal((box, close) => {
      box.classList.add('acm-ui');
      const who = el('input', { class: 'in', type: 'text', placeholder: '@nume', value: handle ? '@' + handle : '', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      const why = el('select', { class: 'in' }, REASONS.map(([v, t]) => el('option', { value: v, text: t })));
      const more = el('textarea', { class: 'in', maxlength: '1000', rows: '4', placeholder: 'Ce s-a întâmplat? (opțional)' });
      const err = el('p', { class: 'auth-err', role: 'alert' });
      const send = el('button', { class: 'btn primary', type: 'button', text: 'Trimite raportul' });
      send.addEventListener('click', () => {
        const h = who.value.trim().toLowerCase().replace(/^@/, '');
        if (!/^[a-z0-9_]{3,20}$/.test(h)) { err.textContent = I18n.t('Scrie @numele contului.'); err.classList.add('on'); return; }
        close({ handle: h, reason: why.value, details: more.value.trim() });
      });
      const fld = (label, input) => el('label', { class: 'auth-fld' }, [el('span', { text: label }), input]);
      box.append(
        el('h2', { text: 'Raportează un cont' }),
        el('p', { class: 'muted', text: 'Raportul ajunge doar la echipa ACM Docs, care îl analizează. Contul raportat nu află cine l-a raportat.' }),
        el('div', { class: 'report-form' }, [fld('Contul', who), fld('Motivul', why), fld('Detalii', more), err]),
        el('div', { class: 'actions col' }, [send, el('button', { class: 'btn', type: 'button', text: 'Renunță', onclick: () => close(null) })]),
      );
    });
    if (!r) return;
    UI.busy('Se trimite…');
    try {
      await Account.call('reportAccount', r);
      UI.busy();
      UI.toast('Raportul a fost trimis. Mulțumim!');
    } catch (e) {
      UI.busy();
      const m = String(e.server || e.message || '');
      UI.toast(/no such account/.test(m) ? I18n.t('Nu există niciun cont cu acest @nume.') : /self/.test(m) ? I18n.t('Nu îți poți raporta propriul cont.') : /too many/.test(m) ? I18n.t('Ai trimis multe rapoarte azi. Încearcă mâine.') : Account.say(e), { error: true });
    }
  }

  const onChange = (f) => listeners.push(f);
  return { start, stop, off, anyOff, blocked, notice, handle, suspended, report, onChange, state: () => state };
})();
