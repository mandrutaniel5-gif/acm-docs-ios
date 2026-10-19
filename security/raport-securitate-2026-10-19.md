# ACM Docs — test de securitate, 19.10.2026

Versiune testată: 2.2.0 (commit d5bdce1). Partea de server (reguli Firestore + funcții) a fost atacată real, pe emulatoarele Firebase, nu pe proiectul live. Aplicația (Windows, iPhone, Android) a fost analizată din cod și configurație.

**Rezultat server: 43 atacuri · 32 blocate · 11 reușite.** Plus 11 probleme găsite în aplicație și infrastructură.

## Ce a picat (de reparat), în ordinea gravității

| # | Gravitate | Problemă | Unde | Cum se repară |
|---|---|---|---|---|
| C1 | CRITIC | Numele expeditorului (@nume) dintr-un fișier .acm este afișat ca HTML, nu ca text. Cine trimite un .acm făcut special poate rula cod în aplicație când destinatarul îl deschide. | app/js/secure-share.js (mesajele despre expeditor) | Afișare doar ca text + validarea @numelui la citire |
| C2 | CRITIC | Pe Windows, pagina aplicației are acces direct la sistem (nodeIntegration activ, contextIsolation și sandbox oprite, fără Content-Security-Policy). Orice cod injectat (ex. C1) devine control asupra calculatorului. | main.js | contextIsolation + sandbox, punte limitată (preload), CSP strictă |
| S01 | CRITIC | Cu parola furată, atacatorul poate înlocui cheia publică a contului. Cine adaugă contul ca persoană nouă ar cripta documentele pentru atacator (contactele deja verificate sunt avertizate). | firestore.rules (users) | Cheia publică nu se mai poate schimba după creare |
| S02 | CRITIC | Cu parola furată, profilul poate fi șters și recreat cu cheia atacatorului. | firestore.rules (users) | Ștergerea profilului doar dintr-o sesiune de dispozitiv |
| S03 | CRITIC | Consecința S01/S02: atacatorul își înregistrează propriul dispozitiv în cont, vede lista de dispozitive și poate bloca dispozitivele membre. Datele din seif rămân criptate pentru el. | firestore.rules + registerDevice | Se rezolvă odată cu S01/S02 |
| S52 | MARE | Un dispozitiv membru poate șterge toate datele contului din cloud, inclusiv lista dispozitivelor blocate. | functions/wipeAccount | Doar dispozitivul principal, cu confirmare semnată cu cheile contului |
| C3 | MARE | Sesiunea Firebase păstrează pentru totdeauna statutul de „dispozitiv”. Cine copiază datele aplicației de pe disc folosește sesiunea fără cheia dispozitivului. | reguli + sesiuni | Regulile cer o sesiune reînnoită recent (ex. 24 h); aplicația o reînnoiește singură cu cheia dispozitivului |
| C4 | MEDIU | Cheia fiecărui dispozitiv stă în stocarea obișnuită a paginii, nu în Keychain / Keystore / DPAPI. | app/js/devices.js | Mutare în stocarea securizată a sistemului |
| C5 | MEDIU | Pe iPhone, aplicația permite inspectarea paginii din Safari (Web Inspector) și în versiunea finală. | ios/ACMDocs/WebViewController.swift | Doar în versiunile de test (DEBUG) |
| C6 | MEDIU | Pe Android, documentele (inclusiv copiile decriptate temporare și „Decriptate”) stau în Documents/ACM Docs, folder public. | MainActivity.pickDocsRoot | Copiile decriptate în stocarea privată a aplicației |
| C7 | MEDIU | Blocarea aplicației: încercările greșite de parolă se resetează la repornire; blocarea este un ecran peste aplicație, nu criptează datele de pe disc. | app/js/applock.js | Contor salvat + întârziere crescătoare; datele locale criptate odată cu cloudul |
| S32 | MEDIU | Serverul acceptă HTML în numele afișat al unui cont (aplicația îl afișează corect ca text, dar e un risc dacă apare undeva ca HTML). | firestore.rules (users.name) | Restricție de caractere în reguli |
| S33 | MEDIU | Serverul acceptă un profil cu cheie publică invalidă (aplicația o respinge la citire). | firestore.rules | Verificare de lungime/format în reguli |
| S42 | MEDIU | Oricine, fără cont, poate crea mii de coduri QR de conectare; nu se șterg automat (cost / umplerea bazei de date). | functions/pairStart | TTL pe pairings + limită de frecvență / App Check |
| S53 | MEDIU | Un dispozitiv poate scrie documente foarte mari în seif (abuz de spațiu și cost). | firestore.rules (vault) | Limită de mărime în reguli |
| S64 | MEDIU | Un dispozitiv blocat poate citi în continuare profilurile publice și @numele (doar date publice). | firestore.rules | Profilurile citite doar cu sesiune de dispozitiv activ |
| C8 | MEDIU | Infrastructură: contul de serviciu al funcțiilor are rol „Editor” pe tot proiectul; lipsește App Check; nu există limită de cost (doar alertă). | Google Cloud IAM | Cont de serviciu dedicat cu drepturi minime, App Check, alertă de buget |
| C9 | MEDIU | Contul Firebase: cu parola furată, atacatorul poate schimba parola/emailul sau șterge contul (fără al doilea factor). | Firebase Auth | Confirmare pe email + 2FA (passkey / TOTP) pentru acțiunile de cont |
| S40 | MIC | Phishing: un alt cont poate aproba codul QR al victimei dacă îl vede (victima ar intra în contul atacatorului). | pairing | Afișare a contului care a aprobat, cu confirmare pe dispozitivul nou |
| S43 | MIC | O semnătură de sesiune interceptată poate fi refolosită 5 minute (doar dacă TLS ar fi spart). | functions/deviceSession | Nonce de unică folosință |
| C10 | MIC | Un .acm cu foarte mulți destinatari poate bloca aplicația câteva secunde la deschidere. | build/vendor/acmcrypto.mjs | Limită de destinatari (ex. 64) |
| C11 | MIC | Starea „verificat” a contactelor stă în stocarea locală (modificabilă de cineva cu acces la dispozitiv). | app/js/secure-share.js | Semnată cu cheia contului / în seiful criptat |

## Ce a rezistat (atacuri blocate)

- ✓ **S04** [MARE] Cu parola furată, fără dispozitiv: citește dispozitivele / evenimentele / seiful victimei
- ✓ **S05** [MARE] Cu parola furată: înregistrare dispozitiv cu o semnătură falsă (fără cheile contului)
- ✓ **S10** [CRITIC] Alt utilizator citește dispozitivele / evenimentele / seiful victimei
- ✓ **S11** [CRITIC] Alt utilizator scrie în seiful victimei
- ✓ **S12** [CRITIC] Alt utilizator modifică profilul / cheia victimei
- ✓ **S13** [MARE] Alt utilizator fură @numele victimei (suprascrie usernames/{handle})
- ✓ **S14** [MARE] Alt utilizator șterge @numele victimei
- ✓ **S15** [MEDIU] Enumerare: listează toți utilizatorii (colecția users)
- ✓ **S16** [MEDIU] Enumerare: listează toate @numele (colecția usernames)
- ✓ **S17** [MEDIU] Căutare după email (users where emailLower == ...)
- ✓ **S18** [MARE] Alt utilizator blochează un dispozitiv al victimei
- ✓ **S19** [MARE] Alt utilizator cere o sesiune pentru dispozitivul victimei (fără cheia dispozitivului)
- ✓ **S20** [MARE] Alt utilizator scrie evenimente false („conectare nouă”) în contul victimei
- ✓ **S21** [MEDIU] Clientul scrie direct un eveniment fals în propriul cont
- ✓ **S22** [MARE] Dispozitivul își ridică singur rolul la „primary”
- ✓ **S23** [MARE] Dispozitivul își adaugă singur un dispozitiv nou (scriere directă în devices)
- ✓ **S24** [MEDIU] Pairing: citește direct colecția pairings
- ✓ **S30** [MARE] Rezervă un @nume interzis (admin)
- ✓ **S31** [MEDIU] Rezervă mai multe @nume deodată (squatting)
- ✓ **S34** [MEDIU] Cont cu email neconfirmat își creează profil
- ✓ **S35** [MIC] Neautentificat: citește un profil
- ✓ **S41** [MARE] Pairing: preia cheile cu altă cheie decât cea din QR (poll cu semnătură falsă)
- ✓ **S44** [MIC] Replay: semnătură de sesiune veche (10 minute)
- ✓ **S50** [MARE] Dispozitiv membru blochează dispozitivul principal
- ✓ **S51** [MARE] Dispozitiv membru își dă singur rolul de principal (claimPrimary fără cheile contului)
- ✓ **S60** [CRITIC] Dispozitiv blocat: citește în continuare datele contului cu sesiunea pe care o avea
- ✓ **S61** [CRITIC] Dispozitiv blocat: cere o sesiune nouă
- ✓ **S62** [MARE] Dispozitiv blocat: se reînregistrează cu parola (fără cheile contului)
- ✓ **S63** [MARE] Dispozitiv blocat: își schimbă singur statusul înapoi în „active”
- ✓ **S70** [MEDIU] Funcții: cheie publică uriașă / malformată în registerDevice
- ✓ **S71** [MEDIU] Funcții: info de dispozitiv de 4 MB
- ✓ **S72** [MIC] Funcții: pairApprove cu „sealed” de 10 MB

Criptografia (.acm, chei, semnături, parola documentelor) are 20/20 teste trecute; nu s-a găsit nicio cale de a deschide un document fără cheile destinatarului.

## Log complet al atacurilor pe server

```
VULNERABIL  [CRITIC] S01 Cu parola furată: înlocuiește cheia publică a victimei (atac man-in-the-middle pentru contactele noi)
VULNERABIL  [CRITIC] S02 Cu parola furată: șterge profilul și îl recreează cu cheia atacatorului  — profil șters și recreat cu altă cheie
VULNERABIL  [CRITIC] S03 Cu parola furată: înregistrează un dispozitiv al atacatorului în contul victimei (după S01)  — dispozitiv înregistrat: vede lista de dispozitive și poate bloca dispozitivele membre
blocat      [MARE  ] S04 Cu parola furată, fără dispozitiv: citește dispozitivele / evenimentele / seiful victimei  — devices:false events:false vault:false
blocat      [MARE  ] S05 Cu parola furată: înregistrare dispozitiv cu o semnătură falsă (fără cheile contului)
blocat      [CRITIC] S10 Alt utilizator citește dispozitivele / evenimentele / seiful victimei  — devices:false events:false vault:false
blocat      [CRITIC] S11 Alt utilizator scrie în seiful victimei
blocat      [CRITIC] S12 Alt utilizator modifică profilul / cheia victimei
blocat      [MARE  ] S13 Alt utilizator fură @numele victimei (suprascrie usernames/{handle})
blocat      [MARE  ] S14 Alt utilizator șterge @numele victimei
blocat      [MEDIU ] S15 Enumerare: listează toți utilizatorii (colecția users)
blocat      [MEDIU ] S16 Enumerare: listează toate @numele (colecția usernames)
blocat      [MEDIU ] S17 Căutare după email (users where emailLower == ...)
blocat      [MARE  ] S18 Alt utilizator blochează un dispozitiv al victimei
blocat      [MARE  ] S19 Alt utilizator cere o sesiune pentru dispozitivul victimei (fără cheia dispozitivului)
blocat      [MARE  ] S20 Alt utilizator scrie evenimente false („conectare nouă”) în contul victimei
blocat      [MEDIU ] S21 Clientul scrie direct un eveniment fals în propriul cont
blocat      [MARE  ] S22 Dispozitivul își ridică singur rolul la „primary”
blocat      [MARE  ] S23 Dispozitivul își adaugă singur un dispozitiv nou (scriere directă în devices)
blocat      [MEDIU ] S24 Pairing: citește direct colecția pairings
blocat      [MARE  ] S30 Rezervă un @nume interzis (admin)
blocat      [MEDIU ] S31 Rezervă mai multe @nume deodată (squatting)
VULNERABIL  [MEDIU ] S32 Pune HTML/script în numele afișat (stored XSS)  — serverul acceptă; clientul trebuie să-l afișeze doar ca text
VULNERABIL  [MEDIU ] S33 Profil cu cheie publică invalidă / amprentă care nu corespunde  — acceptat de server; clientul verifică amprenta la citire
blocat      [MEDIU ] S34 Cont cu email neconfirmat își creează profil
blocat      [MIC   ] S35 Neautentificat: citește un profil
VULNERABIL  [MARE  ] S40 Pairing: alt cont aprobă codul QR al victimei (victima ar intra în contul atacatorului)  — pid-ul (128 biți) trebuie văzut fizic pe ecranul victimei; riscul e de phishing
blocat      [MARE  ] S41 Pairing: preia cheile cu altă cheie decât cea din QR (poll cu semnătură falsă)
VULNERABIL  [MEDIU ] S42 Pairing: flood de coduri QR fără cont (200 cereri)  — 200/200 create; documentele nu au TTL (rămân în baza de date)
VULNERABIL  [MIC   ] S43 Replay: aceeași semnătură de sesiune folosită de două ori în 5 minute  — o semnătură interceptată (în afara TLS) ar fi refolosibilă 5 minute
blocat      [MIC   ] S44 Replay: semnătură de sesiune veche (10 minute)
blocat      [MARE  ] S50 Dispozitiv membru blochează dispozitivul principal
blocat      [MARE  ] S51 Dispozitiv membru își dă singur rolul de principal (claimPrimary fără cheile contului)
VULNERABIL  [MARE  ] S52 Dispozitiv membru șterge toate datele contului (wipeAccount), inclusiv lista de dispozitive blocate
VULNERABIL  [MEDIU ] S53 Seif: un dispozitiv scrie 900 KB într-un singur document (abuz de spațiu / cost)
blocat      [CRITIC] S60 Dispozitiv blocat: citește în continuare datele contului cu sesiunea pe care o avea  — devices:false vault:false
blocat      [CRITIC] S61 Dispozitiv blocat: cere o sesiune nouă
blocat      [MARE  ] S62 Dispozitiv blocat: se reînregistrează cu parola (fără cheile contului)
blocat      [MARE  ] S63 Dispozitiv blocat: își schimbă singur statusul înapoi în „active”
VULNERABIL  [MEDIU ] S64 Dispozitiv blocat: citește în continuare profilurile publice și @numele (sesiunea Firebase rămâne validă)
blocat      [MEDIU ] S70 Funcții: cheie publică uriașă / malformată în registerDevice
blocat      [MEDIU ] S71 Funcții: info de dispozitiv de 4 MB
blocat      [MIC   ] S72 Funcții: pairApprove cu „sealed” de 10 MB
TOTAL 43 · blocate 32 · reușite 11
```
