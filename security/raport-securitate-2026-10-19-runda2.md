# ACM Docs — test de securitate, runda 2 (după reparații), 19.10.2026

Versiune: 2.2.1. Server (reguli + funcții) atacat din nou, identic cu runda 1, plus un atac nou (S54). Regulile și funcțiile reparate sunt publicate pe Firebase; verificarea live a trecut.

**Server: 44 atacuri · 43 blocate · 1 reușit** (runda 1: 43 atacuri, 11 reușite).

## Starea fiecărei probleme din runda 1

| # | Gravitate | Problemă | Stare |
|---|---|---|---|
| C1 | CRITIC | HTML injectat prin numele expeditorului dintr-un .acm | REPARAT — numele sunt afișate doar ca text; @numele din fișier este validat; CSP blochează orice script injectat |
| C2 | CRITIC | Windows: pagina are acces direct la sistem | ATENUAT — CSP strictă (doar scripturile aplicației pot rula). Separarea completă (contextIsolation) rămâne de făcut |
| S01 | CRITIC | Parola furată înlocuiește cheia publică | REPARAT — cheia publică e imuabilă (testat: blocat) |
| S02 | CRITIC | Parola furată șterge și recreează profilul | REPARAT — profilul nu se mai poate șterge direct (testat: blocat) |
| S03 | CRITIC | Dispozitivul atacatorului înregistrat în cont | REPARAT (testat: blocat) |
| S52 | MARE | Membru șterge contul | REPARAT — ștergerea cere semnătura cheilor contului (testat: blocat) |
| S54 | CRITIC | (nou) Sesiune furată șterge contul | BLOCAT |
| C3 | MARE | Sesiunea Firebase valabilă pentru totdeauna | REPARAT — regulile cer o sesiune de dispozitiv reînnoită în ultimele 26 h; aplicația o reînnoiește singură cu cheia dispozitivului |
| C4 | MEDIU | Cheia dispozitivului în stocarea paginii | REPARAT — Keychain (iOS) / Keystore (Android) / DPAPI (Windows); mutată automat la prima pornire |
| C5 | MEDIU | Inspectare Safari în versiunea finală (iOS) | REPARAT în cod — intră în vigoare cu următorul build de iPhone |
| C6 | MEDIU | Copii decriptate în Documents (Android) | REPARAT — în stocarea privată a aplicației; copiile vechi sunt șterse la pornire |
| C7 | MEDIU | Încercările greșite se resetau la repornire | REPARAT — salvate; așteptare crescătoare până la 1 oră |
| S32 | MEDIU | HTML în numele afișat | REPARAT (testat: blocat) |
| S33 | MEDIU | Cheie publică invalidă acceptată | REPARAT (testat: blocat) |
| S42 | MEDIU | Flood de coduri QR | REPARAT — max. 10 / 10 minute de pe o adresă + ștergere automată (TTL) |
| S53 | MEDIU | Documente uriașe în seif | REPARAT — limită ~500 KB / înregistrare (testat: blocat) |
| S64 | MEDIU | Dispozitiv blocat citește profiluri publice | REPARAT (testat: blocat) |
| S43 | MIC | Replay de semnătură în 5 minute | REPARAT — fiecare semnătură e bună o singură dată (testat: blocat) |
| C10 | MIC | Mulți destinatari blochează aplicația | REPARAT — max. 64 de destinatari |
| S40 | MARE→MIC | Cont străin aprobă codul QR (phishing) | ATENUAT — dispozitivul nou arată contul care a aprobat și cere confirmare; la server rămâne posibil prin natura funcției (de aceea apare încă „reușit”) |
| C11 | MIC | Starea „verificat” a contactelor e locală | RĂMÂNE — se mută în seiful criptat odată cu cloudul |
| C8 | MEDIU | Drepturi largi ale conturilor de serviciu, fără App Check | RĂMÂNE — se configurează din Google Cloud / Firebase |
| C9 | MEDIU | Fără al doilea factor pentru acțiunile de cont | RĂMÂNE — de adăugat (passkey / TOTP) |

## Alte verificări în runda 2

- Criptografie: 21/21 teste (inclusiv limita de 64 de destinatari).
- Server pe emulator: 8/8 teste funcționale.
- Live pe proiectul real (cont de test creat și șters): dispozitiv înregistrat, sesiune emisă, profil și @nume citibile cu sesiunea de dispozitiv.
- Aplicația cu CSP activă: zero încălcări, zero erori (editoare, PDF, criptare, coduri QR).
- Blocarea aplicației: parola greșită nu deblochează, parola corectă deblochează.

## Ce nu a putut fi testat

- Aplicația de iPhone 2.2.1 nu a putut fi construită (build-urile pe Mac sunt blocate de bugetul GitHub Actions). iPhone-ul cu 2.2.0 funcționează cu serverul nou, cu două excepții: ștergerea contului nu merge din 2.2.0, iar alertele de conectare se opresc după ~26 h, până la actualizarea la 2.2.1.
- Nimic nu a fost testat pe telefoane / calculatoare reale.

## Log complet, runda 2

```
blocat      [CRITIC] S01 Cu parola furată: înlocuiește cheia publică a victimei (atac man-in-the-middle pentru contactele noi)
blocat      [CRITIC] S02 Cu parola furată: șterge profilul și îl recreează cu cheia atacatorului
blocat      [CRITIC] S03 Cu parola furată: înregistrează un dispozitiv al atacatorului în contul victimei (după S01)  — cheia nu a putut fi înlocuită
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
blocat      [MEDIU ] S32 Pune HTML/script în numele afișat (stored XSS)
blocat      [MEDIU ] S33 Profil cu cheie publică invalidă / amprentă care nu corespunde
blocat      [MEDIU ] S34 Cont cu email neconfirmat își creează profil
blocat      [MIC   ] S35 Neautentificat: citește un profil
VULNERABIL  [MARE  ] S40 Pairing: alt cont aprobă codul QR al victimei (victima ar intra în contul atacatorului)  — pid-ul (128 biți) trebuie văzut fizic pe ecranul victimei; riscul e de phishing
blocat      [MARE  ] S41 Pairing: preia cheile cu altă cheie decât cea din QR (poll cu semnătură falsă)
blocat      [MIC   ] S43 Replay: aceeași semnătură de sesiune folosită de două ori în 5 minute  — o semnătură interceptată (în afara TLS) ar fi refolosibilă 5 minute
blocat      [MIC   ] S44 Replay: semnătură de sesiune veche (10 minute)
blocat      [MARE  ] S50 Dispozitiv membru blochează dispozitivul principal
blocat      [MARE  ] S51 Dispozitiv membru își dă singur rolul de principal (claimPrimary fără cheile contului)
blocat      [MARE  ] S52 Dispozitiv membru șterge contul (wipeAccount) fără semnătura cheilor contului
blocat      [CRITIC] S54 Sesiune de dispozitiv furată: șterge contul semnând cu cheia dispozitivului (nu a contului)
blocat      [MEDIU ] S53 Seif: un dispozitiv scrie 900 KB într-un singur document (abuz de spațiu / cost)
blocat      [CRITIC] S60 Dispozitiv blocat: citește în continuare datele contului cu sesiunea pe care o avea  — devices:false vault:false
blocat      [CRITIC] S61 Dispozitiv blocat: cere o sesiune nouă
blocat      [MARE  ] S62 Dispozitiv blocat: se reînregistrează cu parola (fără cheile contului)
blocat      [MARE  ] S63 Dispozitiv blocat: își schimbă singur statusul înapoi în „active”
blocat      [MEDIU ] S64 Dispozitiv blocat: citește în continuare profilurile publice și @numele (sesiunea Firebase rămâne validă)
blocat      [MEDIU ] S70 Funcții: cheie publică uriașă / malformată în registerDevice
blocat      [MEDIU ] S71 Funcții: info de dispozitiv de 4 MB
blocat      [MIC   ] S72 Funcții: pairApprove cu „sealed” de 10 MB
blocat      [MEDIU ] S42 Pairing: flood de coduri QR fără cont (200 cereri)  — 6/200 create
TOTAL 44 · blocate 43 · reușite 1
```
