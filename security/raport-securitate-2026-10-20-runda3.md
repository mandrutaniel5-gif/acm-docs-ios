# ACM Docs — test de securitate, runda 3, 20.10.2026

Versiune testată: 2.2.6 + reparația de conectare (cod pe `main`, fără build nou).

**Ce am testat**
- Serverul (reguli Firestore, reguli Storage, funcții), pe emulatoarele Firebase din GitHub Actions. Proiectul real n-a fost atins.
- Runda 2 reluată: 44 de atacuri, 43 blocate. Singurul reușit e S40, phishing cu cod QR, cunoscut și atenuat.
- Runda 3: 28 de atacuri noi, 16 blocate și 12 reușite.
- Aplicația, prin citirea codului: sincronizarea, fișierele, limbile, Windows (Electron), Android, iPhone.
- Dependențele (npm audit + versiunile bibliotecilor de documente).

## Reparat deja (azi)

| # | Problemă | Stare |
|---|---|---|
| R1 | Cu emailul și parola te puteai conecta pe un dispozitiv nou și, cu „Mai târziu”, rămâneai conectat fără chei | REPARAT în cod: pe un cont neconfigurat butonul devine „Deconectează-te” și chiar deconectează; o configurare lăsată la jumătate e reluată la pornire. Testat în aplicație. |

## Probleme găsite — server

| # | Gravitate | Problemă | Cum se repară |
|---|---|---|---|
| P02 | MARE | Doar cu parola (fără chei, fără dispozitiv): atacatorul eliberează @numele victimei, apoi îl ia cu contul lui. Cine o caută pe victimă după @nume primește cheia atacatorului. Cine a verificat-o deja prin QR e protejat: aplicația îl avertizează că s-a schimbat cheia. | Regulă: profilul (@nume, nume) se modifică doar de pe un dispozitiv al contului |
| P01 | MARE | Doar cu parola: schimbă numele afișat al victimei | Aceeași regulă |
| P03 | MARE | Doar cu parola: șterge contul de conectare Firebase direct prin API. Profilul și dispozitivele rămân orfane, iar proprietarul nu se mai poate conecta. | Consola Firebase › Authentication › Settings › User actions › debifat „Enable delete”. Aplicația șterge contul oricum prin server, cu semnătura cheilor. |
| P04 | MEDIU | Doar cu parola: schimbă parola. La Firebase, schimbarea parolei închide toate sesiunile, deci și dispozitivele proprietarului sunt scoase din cont. | Aplicația: când sesiunea e închisă din afară, dispozitivul se reconectează singur cu cheia lui de dispozitiv, fără parolă |
| P05 | MARE | Doar cu parola: schimbă emailul contului. Direct e blocat dacă „Email enumeration protection” e activă, dar prin link de confirmare trimis pe noul email merge oricum. | Reconectarea cu cheia de dispozitiv (P04) păstrează dispozitivele funcționale. Protecție completă doar cu Identity Platform (vezi C9). |
| P09 | MEDIU | Proprietarul nu află că cineva a intrat cu parola lui (alerta apare doar când se adaugă un dispozitiv) | Identity Platform: o funcție „beforeSignIn” care scrie evenimentul, apoi apare alerta pe toate dispozitivele |
| F04 | MEDIU | O sesiune de dispozitiv poate schimba parola fără parola veche | Identity Platform / acceptat (sesiunea de dispozitiv e deja un acces complet) |
| F01 | MEDIU | Limita de coduri QR (10 / 10 min) se ocolește cu un antet `X-Forwarded-For` fals: 30 din 30 trecute | Funcția folosește ultima adresă din antet (cea pusă de Google), plus o limită globală de siguranță; App Check (C8) |
| V11 | MIC | Fără cotă: un dispozitiv al contului poate scrie oricât în seif (cost) | Alertă de buget în Google Cloud (Billing › Budgets) |
| V05 | MIC | Emulatorul permite rescrierea unui bloc din cloud. Doar dispozitivele contului pot, iar conținutul e semnat, deci rezultatul ar fi doar un fișier stricat. | De verificat pe proiectul real la următoarea publicare |
| V07 | MIC | Emulatorul acceptă un bloc cu tip HTML (regula cere octet-stream). Blocurile nu sunt publice. | De verificat pe proiectul real |
| P10 | MIC | Doar cu parola: citește profiluri publice / caută @nume | Se închide odată cu P01 (doar de pe dispozitiv) |

Blocate corect, printre altele: sesiune doar cu parola → dispozitive, evenimente, seif, blocuri cloud, funcții de dispozitiv. Alt cont → blocurile victimei (citire, scriere, ștergere, listare). Dispozitiv blocat sau ieșit din cont → tot. Nume de bloc cu `../` sau altă formă, peste 110 MB, neautentificat, câmpuri necriptate în seif, cont cu email neconfirmat.

## Probleme găsite — aplicație

| # | Gravitate | Problemă | Cum se repară |
|---|---|---|---|
| C12 | MARE | Windows rulează pe Electron 22.3 (Chromium 108, fără actualizări de securitate din 2023). Un document făcut special (PDF, Word, Excel, imagine) ar putea exploata o vulnerabilitate cunoscută a motorului. Pagina are acces la fișiere prin preload (sandbox oprit), deci ar rezulta acces la calculator. | Actualizare la Electron actual. Atenție: Electron nou nu mai rulează pe Windows 7/8. |
| C13 | MARE | Excel: biblioteca de citire e SheetJS 0.18.5, cu vulnerabilități cunoscute la deschiderea unui fișier .xlsx făcut special: CVE-2023-30533 (prototype pollution) și CVE-2024-22363 (blocare / ReDoS) | Citirea Excel mutată într-un Web Worker izolat (o eventuală poluare rămâne acolo), plus trecerea la SheetJS 0.20.x când se poate descărca |
| C14 | MEDIU | Sincronizare: o înregistrare din cloud poate scrie orice setare locală (nu doar cele sincronizate) și poate crea un fișier în afara folderului de documente (`../`). Pe Windows asta înseamnă și folderul Startup, deci cod rulat la pornire. Necesită un dispozitiv al contului compromis sau cele 24 de cuvinte. | Doar cheile din lista sincronizată; nume de fișier curățat (fără `..`, fără căi absolute) și doar tipurile de documente ale aplicației |
| C15 | MEDIU | Windows: Ctrl+Shift+F12 deschide DevTools în versiunea finală, deci blocarea aplicației se ocolește din consolă | DevTools oprit în versiunea instalată |
| C16 | MIC | Android: `allowBackup="true"`. Datele locale (facturi, clienți, setări) intră în backup-ul Google / transfer. Cheile din Keystore nu. | `allowBackup="false"` |
| C17 | MIC | Android: altă aplicație poate cere deschiderea unui `file://` din folderul privat al ACM Docs | Refuzate căile din folderul privat |
| C18 | MIC | iPhone: puntea nativă nu verifică de unde vine mesajul; navigarea permite pagini `data:` | Mesaje acceptate doar din pagina principală `acm://app`; `data:` refuzat la navigare |
| C19 | MIC | Android: `/~file/` poate servi și fișiere private (doar paginilor aplicației) | Limitat la folderele de documente |
| C20 | INFO | npm audit: `@grpc/grpc-js` (doar server, nu e în aplicație) și `image-size` (folosit de pptxgenjs doar în Node). Funcțiile server: 0 vulnerabilități. | Actualizări de rutină |

Verificate fără probleme:
- Limbile se încarcă doar din lista fixă.
- CSP strictă: fără script inline, fără conexiuni externe în afara Firebase.
- Datele din facturi sunt afișate ca text.
- Fișierele primite pe Android au numele curățat.
- Windows: navigarea e blocată, linkuri externe doar https/mailto, `contextIsolation` activ.
- iPhone: Web Inspector doar în build-urile de test.

## Rămase din rundele anterioare
- C8: drepturi largi ale conturilor de serviciu, fără App Check.
- C9: fără al doilea factor, recomandat Identity Platform (gratuit până la 50.000 utilizatori activi / lună pe planul Blaze): permite TOTP / passkey și alerta la conectarea cu parola (P09).
- S40: phishing cu cod QR (atenuat).

## După reparații — versiunea 2.2.7 (20.10.2026)

Reparat, publicat pe server și verificat pe proiectul real. Verificarea folosește un cont de test temporar, creat și șters automat.

| # | Stare | Ce s-a făcut |
|---|---|---|
| R1 | REPARAT | Un cont neconfigurat pe dispozitiv nu rămâne conectat („Deconectează-te”); configurarea neterminată se reia |
| P01, P02, P10 | REPARAT (live) | Profilul și @numele se schimbă doar de pe un dispozitiv al contului; doar cu parola, schimbarea e refuzată |
| P03 | REPARAT (live) | Ștergerea contului de conectare din client e dezactivată; contul se șterge doar prin server, cu semnătura cheilor |
| P04, P05, F04 | REPARAT | Verificare în doi pași (Setări › Securitate). Cu ea pornită, parola singură nu mai conectează nicăieri (verificat live: parola singură refuzată, cod greșit refuzat, cod corect acceptat). Dispozitivele contului se reconectează singure cu cheia lor dacă sesiunea e închisă din afară (schimbare de parolă). „Email enumeration protection” e activă. |
| P09 | REPARAT (live) | Fiecare conectare cu parola apare ca alertă pe toate dispozitivele („Cineva a intrat cu parola contului”), cu buton „Nu am fost eu: schimbă parola” |
| F01 | REPARAT (live) | Limita de coduri QR folosește adresa văzută de Google + o limită globală: 10 din 14 cu adrese false (limita e 10) |
| V05 | REPARAT (live) | Un bloc din cloud nu mai poate fi rescris |
| V07 | VERIFICAT (live) | Blocurile cu tip HTML sunt refuzate pe proiectul real (emulatorul nu aplică regula) |
| C12 | REPARAT | Windows: Electron 44.9 (64 biți, Windows 10/11); pagina și preload-ul în sandbox; accesul la fișiere trece prin procesul principal, care refuză programele și scripturile (.exe, .bat, .ps1, .lnk…), folderul Startup, folderul aplicației și folderul cheilor; „Deschide” pornește doar documente; permisiuni doar cameră și clipboard; fuses (fără RunAsNode, fără NODE_OPTIONS, fără inspector, app doar din asar) |
| C13 | REPARAT | Excel citit într-un Web Worker separat, cu oprire după 90 s; dacă workerul nu e disponibil, aplicația verifică după citire că obiectele de bază nu au fost modificate și refuză fișierul |
| C14 | REPARAT | Sincronizarea aplică doar cheile din lista sincronizată; fișierele din cloud primesc nume curățate (fără `..`, fără căi absolute), doar tipuri de documente, doar în folderul de documente |
| C15 | REPARAT | DevTools dezactivat în aplicația instalată |
| C16 | REPARAT | Android: backup oprit (`allowBackup=false`, `fullBackupContent=false`). Transferul direct telefon-la-telefon de pe Android 12+ cere uneltele SDK 31 (aici e SDK 23); rămâne doar pentru proprietarul cu telefonul deblocat. |
| C17, C19 | REPARAT | Android: folderul intern al aplicației (setări, stocarea paginii, chei) nu mai e servit paginii, partajat sau deschis la cererea altei aplicații |
| C18 | REPARAT | iPhone: puntea nativă răspunde doar paginii principale `acm://app`; navigarea la `data:`/`javascript:`/`file:` e refuzată; Library-ul aplicației nu e servit paginii |
| — | REPARAT | Windows: recunoașterea textului (OCR) nu mai mergea cu Electron nou; acum datele de limbă se citesc din cache-ul local (testat) |
| V11 | RĂMÂNE | Fără cotă pe cont; recomandat: alertă de buget în Google Cloud › Billing › Budgets |
| S40 | RĂMÂNE | Phishing cu cod QR (atenuat prin confirmare) |
| C8 | RĂMÂNE | App Check + drepturi minime pentru conturile de serviciu |

Teste rulate pentru 2.2.7:
- Atacuri pe emulator: runda 2 are 43 din 44 blocate. În runda 3, cele 7 marcate tot „reușite” pe emulator sunt fie verificate ca blocate pe proiectul real (P03, P05, V07), fie închise prin verificarea în doi pași și reconectarea cu cheia dispozitivului (P04, F04), fie acceptate (P10: date publice; V11: cost).
- Live pe proiectul real: toate verificările de mai sus.
- Windows (Electron 44, sandbox): citire/scriere documente, blocarea .bat și a folderului cheilor, refuzul de a porni un program, PDF, Word, Excel, PowerPoint, .doc, .xls, PDF din factură, OCR, clipboard.
- Excel în worker în browser și în Electron.
- Ecranele de verificare în doi pași, în română și germană, pe telefon și calculator.

## Log runda 3
```
✗ VULNERABIL  [MARE] P01 Doar cu parola: schimbă numele afișat al victimei (văzut de toți contactele noi)
✗ VULNERABIL  [MARE] P02 Doar cu parola: eliberează @numele victimei, apoi alt cont îl preia (impersonare pentru contactele noi)  — @victimmvfrri7h a ajuns la contul atacatorului
✗ VULNERABIL  [MARE] P03 Doar cu parola: șterge contul de conectare (Firebase Auth) direct prin API  — contul de conectare a dispărut; profilul, dispozitivele și @numele rămân orfane
✗ VULNERABIL  [MEDIU] P04 Doar cu parola: schimbă parola (proprietarul nu se mai poate conecta cu parola lui)  — proprietarul își recuperează accesul doar prin „Ai uitat parola?”
✗ VULNERABIL  [MARE] P05 Doar cu parola: schimbă emailul contului direct (fără confirmare pe emailul vechi)  — în emulator merge; în producție o blochează „email enumeration protection” dacă e activă — de verificat
✓ blocat      [MARE] P06 Doar cu parola: funcțiile de dispozitiv (aprobare QR, blocare, ieșire, principal)  — pairGet:false pairApprove:false block:false leave:false primary:false
✓ blocat      [CRITIC] P07 Doar cu parola: citește / scrie / șterge blocurile criptate din cloud (Storage)  — citire:false scriere:false ștergere:false
✓ blocat      [MARE] P08 Doar cu parola: scrie / șterge înregistrări din seiful cloud (Firestore)  — scriere:false ștergere:false
✗ VULNERABIL  [MEDIU] P09 Doar cu parola: proprietarul nu află că cineva a intrat cu parola lui (nicio alertă)  — evenimente „conectare” vizibile proprietarului: 1 (doar crearea contului)
✗ VULNERABIL  [MIC] P10 Doar cu parola: citește profilurile publice și caută @nume  — date publice prin natura lor (cheie publică + @nume); de închis odată cu P01
✓ blocat      [CRITIC] V01 Alt cont: citește blocul criptat al victimei (știind calea)
✓ blocat      [CRITIC] V02 Alt cont: scrie un bloc în folderul victimei
✓ blocat      [CRITIC] V03 Alt cont: șterge blocul victimei
✓ blocat      [MEDIU] V04 Alt cont / propriul dispozitiv: listează blocurile (enumerare)  — alt cont:false propriul:false
✗ VULNERABIL  [MARE] V05 Dispozitivul victimei: rescrie un bloc existent (înlocuire de fișier sincronizat)
✓ blocat      [MEDIU] V06 Nume de bloc ne-hex / cu ../ (ieșire din folder)  — traversare:false nume liber:false alt folder:false
✗ VULNERABIL  [MEDIU] V07 Bloc cu tip HTML (servit ca pagină web de pe domeniul Firebase)
✓ blocat      [MEDIU] V08 Bloc peste limita de 110 MB
✓ blocat      [CRITIC] V09 Neautentificat: citește / listează blocuri  — citire:false listare:false
✓ blocat      [MEDIU] V10 Seif: înregistrare cu câmpuri în plus (date necriptate strecurate lângă cele criptate)
✗ VULNERABIL  [MEDIU] V11 Cost: un singur dispozitiv scrie 300 de înregistrări în seif într-un minut (fără cotă)  — 300/300 acceptate — abuz de cost posibil doar din contul propriu
✓ blocat      [CRITIC] V12 Dispozitiv blocat: citește / scrie blocurile din cloud  — citire:false scriere:false
✓ blocat      [CRITIC] V13 Dispozitiv ieșit din cont (deconectat): citește seiful și blocurile cu sesiunea veche  — bloc:false seif:false
✓ blocat      [MARE] V14 Dispozitiv ieșit din cont: cere o sesiune nouă cu cheia lui
✗ VULNERABIL  [MEDIU] F01 Limita de coduri QR ocolită cu antet X-Forwarded-For fals  — 30/30 coduri create cu adrese inventate (limita: 10)
✓ blocat      [MIC] F02 pairPoll: cine nu are cheia de unică folosință nu află nici măcar starea
✓ blocat      [MARE] F03 Cont cu email neconfirmat (doar parola): înregistrează un dispozitiv / creează profil
✗ VULNERABIL  [MEDIU] F04 Sesiune de dispozitiv folosită pentru a schimba parola contului (fără parola veche)  — o sesiune de dispozitiv (furată) poate schimba parola
TOTAL 28 atacuri · blocate 16 · reușite 12
```
