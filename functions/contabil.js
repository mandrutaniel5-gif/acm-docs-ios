// Server pentru ACM Contabil (aplicația de contabilitate a ACM CODE SRL), găzduit în proiectul ACM Docs.
//
// ACM Contabil nu are conturi: fiecare dispozitiv se autentifică anonim în proiectul Firebase „acm-contabil”
// (unde stă seiful criptat). Aici verificăm acel token și oferim:
//  - asistentul AI (Google Gemini: GEMINI_API_KEY în functions/.env, scrisă la publicare din secretul GitHub;
//    modelul se poate schimba cu GEMINI_MODEL, implicit gemini-3.5-flash-lite);
//  - căutarea firmelor după CUI (registrul public ANAF);
//  - conectarea la SPV: același client OAuth ANAF ca ACM Docs, același callback. Cheile se sigilează pentru
//    dispozitivul care a cerut (ECDH P-256 + AES-256-GCM) și nu pot fi citite de server. Facturile nu trec pe aici.
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { CALLBACK } from './anaf.js';

const PROIECT_CONTABIL = 'acm-contabil';
// modelul principal + rezerve, folosite când Gemini e supraîncărcat (503) sau limitat (429)
const MODELE = () => [...new Set([process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'])];
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const AUTHORIZE = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize';

const SYSTEM = `Ești asistentul contabil din aplicația ACM Contabil, folosită de o persoană cu puțină experiență în contabilitate, pentru un SRL din România (servicii IT).
Reguli:
- Răspunzi în română, simplu, pe pași, fără jargon inutil. Când folosești un termen tehnic, îl explici într-o propoziție.
- Te bazezi pe legislația românească în vigoare în 2026: OMFP 1802/2014, Codul fiscal. Impozit micro cotă unică 1%, plafon 100.000 EUR; impozit pe profit 16%; TVA 21% standard și 11% redus, plafon de scutire 395.000 lei; impozit pe dividende 16%; prag mijloc fix 5.000 lei.
- Pentru fiecare operațiune indici notele contabile sub forma „cont debitor = cont creditor : sumă” și unde se face în aplicație (meniurile: Acasă, Documente, Bancă, Operațiuni, Parteneri, Registre, Declarații, Formulare, Ghid, Setări).
- Aplicația face singură: importul facturilor din SPV, cursul BNR, potrivirea extraselor bancare (inclusiv plățile deja înregistrate, salariile, plata la ANAF pe mai multe obligații), închiderea lunilor, nota lunară de salarii, reportarea soldurilor în anul nou. Facturile se emit și se trimit în SPV din ACM Docs.
- Salariați: se adaugă în Declarații → Salarii (contract de muncă sau contract de mandat al administratorului); statul de plată și D112 se calculează acolo. 2026: salariul minim 4.050 lei până la 30.06.2026 și 4.325 lei de la 1.07.2026; CAS 25%, CASS 10%, impozit 10%, CAM 2,25%; suma netaxabilă 300 lei, apoi 200 lei de la 1.07.2026, pentru brut egal cu salariul minim. O microîntreprindere trebuie să aibă un salariat cu normă întreagă sau administrator cu contract de mandat plătit cel puțin cu salariul minim (firmele noi au 90 de zile).
- Serviciile de la furnizori din străinătate (Google, GitHub, Apple etc.) se marchează cu taxare inversă; o firmă neplătitoare de TVA are nevoie de cod special de TVA (art. 317) și depune D301. La depășirea plafonului de 395.000 lei, firma devine plătitoare de TVA din ziua depășirii (cererea se depune cel târziu atunci); în aplicație: Setări → Regim fiscal, butonul „Trec la TVA”.
- Ți se dă contextul real al firmei (solduri, salariați, ce arată ecranul Acasă, termene). Folosește-l: răspunde cu cifrele firmei, nu generic.
- Dacă nu ești sigur sau situația e neobișnuită (operațiuni intracomunitare, dividende, angajați, plafoane depășite), spui clar asta și recomanzi confirmarea cu un contabil autorizat. Nu inventa articole de lege, cote sau termene.
- Situațiile financiare anuale trebuie semnate de un contabil autorizat sau expert contabil dacă administratorul nu are studii economice — amintește asta când e relevant.
- Ești concis: maximum 8–10 rânduri, dacă nu ți se cere mai mult.`;

const PLAN = '"6022","6028","303","2131","2051","214","605","611","612","613","622","6231","6232","624","625","626","627","628","635","6581","6588","666","665"';
const EXTRACT_PROMPT = `Extrage datele din acest document de cheltuială (bon fiscal, chitanță sau factură). Răspunde DOAR cu JSON valid, fără text în plus:
{"tipDocument":"Bon fiscal"|"Factura"|"Chitanta","nr":string,"data":"YYYY-MM-DD","scadenta":"YYYY-MM-DD"|"","furnizor":{"nume":string,"cui":string},
"descriere":string scurtă (max 60 caractere),"total":număr (total de plată),"tva":număr (0 dacă nu apare),"tvaCota":0.21|0.11|0,"moneda":"RON"|"EUR"|"USD",
"cont":contul de cheltuială OMFP 1802 cel mai potrivit dintre ${PLAN},"motivCont":o propoziție simplă,
"tvaDeductibil":0-100 (50 pentru combustibil auto cu utilizare mixtă, altfel 100),
"avertismente":[lucruri de verificat de om, ex. "Bonul nu are CUI-ul firmei — TVA nu se poate deduce", "Peste 5.000 lei: posibil mijloc fix"],"incredere":0-1}
Dacă un câmp nu se vede, pune "" sau 0 și adaugă un avertisment.`;
const EXTRAS_PROMPT = `Este un extras de cont bancar. Extrage TOATE tranzacțiile. Răspunde DOAR cu JSON valid:
{"banca":string,"iban":string,"moneda":"RON"|"EUR"|"USD","perioada":{"de":"YYYY-MM-DD","pana":"YYYY-MM-DD"},"soldInitial":număr,"soldFinal":număr,
"tranzactii":[{"data":"YYYY-MM-DD","suma":număr (pozitiv = încasare, negativ = plată),"contraparte":string,"iban":string,"cui":string,"detalii":string}]}`;
const INCADRARE_PROMPT = (items) => `Pentru fiecare cheltuială de mai jos alege contul OMFP 1802 cel mai potrivit dintre ${PLAN}.
Răspunde DOAR cu JSON: [{"i":index,"cont":"...","motiv":"o propoziție","tvaDeductibil":0-100}]
${JSON.stringify(items).slice(0, 20000)}`;

export function makeContabil({ db, anaf }) {
  const app = initializeApp({ projectId: PROIECT_CONTABIL }, 'contabil');
  const err = (code, message) => Object.assign(new Error(message), { code });

  async function auth(req) {
    const h = req.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw err(401, 'Neautentificat');
    try { return await getAuth(app).verifyIdToken(token); } catch { throw err(401, 'Sesiune invalidă'); }
  }

  /** Limită zilnică de cereri AI (pe dispozitiv și în total), ca un APK scăpat să nu consume cheia. */
  async function limita(uid) {
    const zi = new Date().toISOString().slice(0, 10);
    const max = Number(process.env.CONTABIL_AI_LIMITA_ZI) || 300;
    const ref = db.collection('contabilLimite').doc(zi);
    await db.runTransaction(async (t) => {
      const d = (await t.get(ref)).data() || { total: 0 };
      if ((d.total || 0) >= max) throw err(429, 'S-a atins limita zilnică a asistentului AI. Încearcă mâine.');
      if ((d[uid] || 0) >= Math.ceil(max * 0.6)) throw err(429, 'Prea multe cereri de pe acest dispozitiv azi.');
      t.set(ref, { total: (d.total || 0) + 1, [uid]: (d[uid] || 0) + 1, expires: Timestamp.fromMillis(Date.now() + 3 * 864e5) }, { merge: true });
    });
  }

  const cors = (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  };
  const endpoint = (handler, opts = {}) => onRequest({ timeoutSeconds: 120, ...opts }, async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('');
    try { const u = await auth(req); return res.json(await handler(req.body || {}, u)); }
    catch (e) { if (!Number.isInteger(e.code)) console.error(e); return res.status(Number.isInteger(e.code) ? e.code : 500).json({ error: e.message || 'Eroare' }); }
  });

  const parseJSON = (text) => { const m = text.match(/[[{][\s\S]*[\]}]/); return JSON.parse(m ? m[0] : text); };
  const filePart = (file) => ({ inlineData: { mimeType: file.type, data: file.data } });

  /** Un apel Gemini (REST, fără SDK). parts = conținutul ultimului mesaj; istoric = mesajele de dinainte. */
  async function gemini({ system, istoric = [], parts, maxTokens, json = false }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [...istoric.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), { role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
    };
    let d, r, ultim;
    const modele = MODELE();
    for (let i = 0; i < modele.length * 2; i++) {
      const model = modele[Math.floor(i / 2)];
      r = await fetch(`${GEMINI}/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body),
      });
      d = await r.json().catch(() => ({}));
      if (r.ok) break;
      ultim = d;
      console.error('Gemini', model, r.status, JSON.stringify(d).slice(0, 300));
      const temporar = r.status === 503 || r.status === 429 || r.status === 500 || r.status === 404;
      if (!temporar) break;
      await new Promise((ok) => setTimeout(ok, i % 2 ? 300 : 1200)); // o reîncercare pe același model, apoi următorul
    }
    if (!r.ok) {
      throw err(r.status === 429 ? 429 : 502, r.status === 429 ? 'Asistentul AI e ocupat (limita gratuită Gemini). Încearcă peste un minut.' : r.status === 503 ? 'Serviciul Gemini e foarte aglomerat acum. Încearcă din nou peste un minut.' : `Asistentul AI nu a răspuns (${ultim?.error?.message || r.status}).`);
    }
    const c = d.candidates?.[0];
    const text = (c?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    if (!text) throw err(502, `Asistentul AI nu a dat un răspuns (${c?.finishReason || d.promptFeedback?.blockReason || 'gol'}).`);
    return text;
  }

  const contabilAi = endpoint(async (b, u) => {
    if (!process.env.GEMINI_API_KEY) throw err(412, 'Asistentul AI nu este configurat pe server (lipsește cheia Gemini).');
    await limita(u.uid);
    const { mode, messages = [], context = '', file, items } = b;
    if (mode === 'extract' || mode === 'extras') {
      if (!file || !file.data || !file.type) throw err(400, 'Lipsește fișierul');
      if (file.data.length > 14_000_000) throw err(413, 'Fișier prea mare (max ~10 MB)');
      const text = await gemini({
        system: SYSTEM, json: true, maxTokens: mode === 'extras' ? 16000 : 4000,
        parts: [filePart(file), { text: (mode === 'extras' ? EXTRAS_PROMPT : EXTRACT_PROMPT) + (context ? `\n\nContext firmă: ${context}` : '') }],
      });
      return { result: parseJSON(text) };
    }
    if (mode === 'incadrare') {
      const text = await gemini({ system: SYSTEM, json: true, maxTokens: 6000, parts: [{ text: INCADRARE_PROMPT(items || []) + (context ? `\nContext: ${context}` : '') }] });
      return { result: parseJSON(text) };
    }
    const clean = messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 20000) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') throw err(400, 'Mesaj invalid');
    const text = await gemini({
      system: SYSTEM + (context ? `\n\nSituația curentă din aplicație (date reale ale firmei):\n${String(context).slice(0, 30000)}` : ''),
      istoric: clean.slice(0, -1), parts: [{ text: clean[clean.length - 1].content }], maxTokens: mode === 'review' ? 6000 : 3000,
    });
    return { text };
  }, { timeoutSeconds: 180, memory: '512MiB' });

  const contabilCui = endpoint(async (b) => {
    const cui = String(b.cui || '').replace(/\D/g, '');
    if (!cui) throw err(400, 'CUI invalid');
    const r = await fetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: new Date().toISOString().slice(0, 10) }]),
    });
    const f = (await r.json()).found?.[0];
    if (!f) throw err(404, 'CUI negăsit la ANAF');
    return { nume: f.date_generale?.denumire || '', cui, adresa: f.date_generale?.adresa || '', regCom: f.date_generale?.nrRegCom || '', platitorTVA: !!f.inregistrare_scop_Tva?.scpTVA, tvaLaIncasare: !!f.inregistrare_RTVAI?.statusTvaIncasare };
  });

  // ---------------------------------------------------------------- SPV (același client OAuth ca ACM Docs)
  const owner = (u) => 'contabil:' + u.uid;
  const contabilAnafInfo = endpoint(async () => { const c = await anaf.conf(); return { ready: !!(c.clientId && c.clientSecret), env: c.env === 'prod' ? 'prod' : 'test' }; });

  const contabilAnafStart = endpoint(async (b, u) => {
    const c = await anaf.conf();
    if (!c.clientId || !c.clientSecret) throw err(412, 'Conectarea la SPV nu este configurată pe server');
    if (typeof b.pub !== 'string' || b.pub.length > 200) throw err(400, 'Cheia dispozitivului lipsește');
    const recent = await anaf.states().where('uid', '==', owner(u)).where('created', '>', Timestamp.fromMillis(Date.now() - 3600000)).count().get();
    if (recent.data().count >= 10) throw err(429, 'Prea multe încercări de conectare. Încearcă peste o oră.');
    const state = randomBytes(24).toString('hex');
    await anaf.states().doc(state).set({ uid: owner(u), app: 'contabil', pub: b.pub, created: FieldValue.serverTimestamp(), expires: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000) });
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: CALLBACK, token_content_type: 'jwt', state }).toString();
    return { url: url.toString(), state, env: c.env === 'prod' ? 'prod' : 'test' };
  });

  const contabilAnafClaim = endpoint(async (b, u) => {
    const state = String(b.state || '');
    if (!/^[0-9a-f]{48}$/.test(state)) throw err(400, 'Cerere invalidă');
    const ref = anaf.states().doc(state);
    const s = await ref.get();
    if (!s.exists || s.data().uid !== owner(u)) throw err(404, 'Conectarea nu există');
    if (s.data().expires.toMillis() < Date.now()) { await ref.delete(); throw err(410, 'Conectarea a expirat'); }
    if (!s.data().sealed) return { ready: false };
    await ref.delete();
    return { ready: true, sigilat: s.data().sealed, env: (await anaf.conf()).env === 'prod' ? 'prod' : 'test' };
  });

  const contabilAnafRefresh = endpoint(async (b) => {
    if (typeof b.refresh !== 'string' || b.refresh.length < 8 || b.refresh.length > 8000) throw err(400, 'Cerere invalidă');
    const t = await anaf.tokenCall({ grant_type: 'refresh_token', refresh_token: b.refresh });
    return { sigilat: anaf.sealFor(b.pub, t), env: (await anaf.conf()).env === 'prod' ? 'prod' : 'test' };
  });

  return { contabilAi, contabilCui, contabilAnafInfo, contabilAnafStart, contabilAnafClaim, contabilAnafRefresh };
}
