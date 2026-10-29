// Server pentru ACM Contabil (aplicația de contabilitate a ACM CODE SRL), găzduit în proiectul ACM Docs.
//
// ACM Contabil nu are conturi: fiecare dispozitiv se autentifică anonim în proiectul Firebase „acm-contabil”
// (unde stă seiful criptat). Aici verificăm acel token și oferim:
//  - asistentul AI (cheia Claude: ANTHROPIC_API_KEY în functions/.env, scrisă la publicare din secretul GitHub);
//  - căutarea firmelor după CUI (registrul public ANAF);
//  - conectarea la SPV: același client OAuth ANAF ca ACM Docs, același callback. Cheile se sigilează pentru
//    dispozitivul care a cerut (ECDH P-256 + AES-256-GCM) și nu pot fi citite de server. Facturile nu trec pe aici.
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { CALLBACK } from './anaf.js';

const PROIECT_CONTABIL = 'acm-contabil';
const MODEL = 'claude-sonnet-5-5';
const AUTHORIZE = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize';

const SYSTEM = `Ești asistentul contabil din aplicația ACM Contabil, folosită de o persoană cu puțină experiență în contabilitate, pentru un SRL din România (servicii IT).
Reguli:
- Răspunzi în română, simplu, pe pași, fără jargon inutil. Când folosești un termen tehnic, îl explici într-o propoziție.
- Te bazezi pe legislația românească în vigoare în 2026: OMFP 1802/2014, Codul fiscal. Impozit micro cotă unică 1%, plafon 100.000 EUR; impozit pe profit 16%; TVA 21% standard și 11% redus, plafon de scutire 395.000 lei; impozit pe dividende 16%; prag mijloc fix 5.000 lei.
- Pentru fiecare operațiune indici notele contabile sub forma „cont debitor = cont creditor : sumă” și unde se face în aplicație (meniurile: Acasă, Documente, Bancă, Operațiuni, Parteneri, Registre, Declarații, Formulare, Ghid, Setări).
- Aplicația face singură: importul facturilor din SPV, cursul BNR, potrivirea extraselor bancare, închiderea lunilor, reportarea soldurilor în anul nou. Facturile se emit și se trimit în SPV din ACM Docs.
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
  const fileBlock = (file) => (file.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type, data: file.data } });
  const textOf = (r) => r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

  const contabilAi = endpoint(async (b, u) => {
    if (!process.env.ANTHROPIC_API_KEY) throw err(412, 'Asistentul AI nu este configurat pe server (lipsește cheia Claude).');
    await limita(u.uid);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { mode, messages = [], context = '', file, items } = b;
    if (mode === 'extract' || mode === 'extras') {
      if (!file || !file.data || !file.type) throw err(400, 'Lipsește fișierul');
      if (file.data.length > 14_000_000) throw err(413, 'Fișier prea mare (max ~10 MB)');
      const r = await client.messages.create({
        model: MODEL, max_tokens: mode === 'extras' ? 8000 : 1500, system: SYSTEM,
        messages: [{ role: 'user', content: [fileBlock(file), { type: 'text', text: (mode === 'extras' ? EXTRAS_PROMPT : EXTRACT_PROMPT) + (context ? `\n\nContext firmă: ${context}` : '') }] }],
      });
      return { result: parseJSON(textOf(r)) };
    }
    if (mode === 'incadrare') {
      const r = await client.messages.create({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: INCADRARE_PROMPT(items || []) + (context ? `\nContext: ${context}` : '') }] });
      return { result: parseJSON(textOf(r)) };
    }
    const clean = messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 20000) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') throw err(400, 'Mesaj invalid');
    const r = await client.messages.create({
      model: MODEL, max_tokens: mode === 'review' ? 2500 : 1200,
      system: SYSTEM + (context ? `\n\nSituația curentă din aplicație (date reale ale firmei):\n${String(context).slice(0, 30000)}` : ''),
      messages: clean,
    });
    return { text: textOf(r) };
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
