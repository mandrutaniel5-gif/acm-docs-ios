# ACM Docs

PDF, documente, tabele, prezentări și facturi (cu RO e-Factura), criptate pe dispozitiv. De la ACM Code SRL.
Aceeași aplicație web (`app/`) rulează în trei învelișuri: Windows (Electron: `main.js`, `preload.js`), Android (`android/`) și iOS (`ios/`).
Serverul e pe Firebase (`functions/`, `firestore.rules`, `storage.rules`); panoul de control e în `site/control` și `control-app/`.

## Comenzi

| Comandă | Ce face |
|---|---|
| `npm ci --ignore-scripts` | instalează dependențele (`node node_modules/electron/install.js` pentru a porni aplicația Windows) |
| `npm start` | pornește aplicația Windows |
| `npm test` | calcule, sincronizare, criptare, securitatea procesului Windows |
| `npm run test:anaf` | trimite facturile de test la validatorul public ANAF |
| `npm run test:screens` | capturi și verificarea așezării ecranelor (variabila `CHROME`, dacă nu e Chrome pe Windows) |
| `node test/ui/electron-flow.mjs` | fluxul complet în aplicația Windows reală |
| `npm run lint` | verificările ESLint |
| `npm run build:win` | `dist/ACM-Docs-Setup-<versiune>.exe` |
| `npm run build:android` | `dist/android/ACM-Docs-<versiune>.apk` (cheia: `ACM_ANDROID_KEY`, implicit `Downloads/ACM Docs/cheie-android (NU STERGE)`) |
| `npm run build:ios-web` | face `ios/www` din `app/`; nu e în git și nu se editează |

Testele de server rulează pe emulatoarele Firebase (vezi `.github/workflows/server.yml`).

## Publicare

- **Serverul se publică automat la orice push pe `main`** (`server.yml`): regulile, funcțiile și site-ul, după teste.
- **iOS:** se construiește pe macOS la push pe ramura `build-ios` sau pornit de mână (`ios.yml`); rezultatul ajunge pe ramura `ios-build`.
- **Versiunea** se schimbă în `package.json`; `build:ios-web` o pune și în proiectul iOS.
- **Textele noi:** se adaugă în toate limbile cu `build/i18n-src/extra-<versiune>.json` și `apply-extra.mjs`.
- **ACM Contabil:** variabila GitHub `CONTABIL_UIDS` limitează serverul la dispozitivele trecute acolo.
