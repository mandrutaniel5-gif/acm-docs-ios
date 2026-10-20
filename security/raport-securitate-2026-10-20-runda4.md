# ACM Docs — test de securitate, runda 4, 20.10.2026

Versiune: 2.2.11. Scor estimat: **78 / 100**. E o estimare internă, nu un audit extern.

## Găsit și reparat

| # | Gravitate | Problemă | Reparație |
|---|---|---|---|
| W1 | MARE | Windows: verificarea care oprea scrierea de programe putea fi ocolită prin felul în care Windows citește numele de fișiere: puncte sau spații la final, fluxuri NTFS ascunse, căi `\\?\`, `\\.\` și de rețea. Ar fi contat doar după preluarea paginii aplicației. | Fiecare cale e adusă la forma ei reală înainte de orice operație. Căile de dispozitiv, de rețea și cu flux ascuns sunt refuzate. Tipul fișierului e verificat pe numele pe care îl folosește efectiv Windows. Testat pe fiecare variantă. |
| W2 | MEDIU | Pagina avea voie să ruleze cod generat din text (`unsafe-eval` în CSP), nefolosit de aplicație | Scos. Word, Excel, PowerPoint, PDF, salvarea și OCR verificate fără nicio încălcare. Pe iOS 15 și pe Android cu WebView mai vechi de Chrome 97 se păstrează permisiunea veche, altfel motoarele PDF și OCR nu pornesc. |
| W3 | MEDIU | Procesul principal Windows răspundea oricărui expeditor din fereastră | Răspunde doar paginii principale a aplicației, încărcate din folderul ei. Cadrele din interior și fereastra de tipărire sunt refuzate. |
| W4 | MIC | Permisiunea „media” includea și microfonul | Doar camera, doar pentru pagina aplicației (testat) |
| B1 | MEDIU | GitHub Actions și firebase-tools luate după etichete mobile, în jobul care are cheia de publicare | Fixate pe commit-uri și versiuni exacte |
| A1 | — | Verificarea în doi pași era ușor de ignorat | Memento pe Acasă după notarea codului de recuperare |

## Reluat

- Server, pe emulator: runda 2 are 43 din 44 blocate. Runda 3 are 29 din 36 blocate. Cele 7 rămase sunt fie verificate ca blocate pe proiectul real (P03, P05, V07), fie închise de verificarea în doi pași (P04, F04), fie acceptate (P10: date publice; V11: cost din propriul cont).
- Live pe proiectul real, toate trecute: sesiuni de dispozitiv, cloud (fără rescriere, fără HTML), parola singură nu schimbă profilul și nu șterge contul, alertă la conectarea cu parola, verificarea în doi pași (parolă singură refuzată, cod greșit refuzat), limita de coduri QR.
- Funcțiile de server: `npm audit` fără probleme.

## Rămâne (de ce nu 90+)

1. Niciun audit extern al criptării și al formatului .acm.
2. Instalatorul Windows nu e semnat digital (certificat de semnare de cod).
3. Verificarea în doi pași e opțională.
4. Cheia de semnare Android e pe calculator lângă parola ei: de mutat pe un stick, cu parola doar pe hârtie.
5. Fără App Check.
6. Aplicația deschide fișiere din orice sursă (atac prin documente), redus prin sandbox, CSP și worker, dar inevitabil.
7. Phishing cu cod QR (S40), atenuat.
8. Fără cotă de spațiu pe cont (V11), recomandată alertă de buget.
