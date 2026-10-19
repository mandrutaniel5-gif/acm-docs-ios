// entry for the app bundle: window.__lib.acmcrypto (built into app/vendor/acmcrypto.js)
import * as acm from './acmcrypto.mjs';
window.__lib = window.__lib || {};
window.__lib.acmcrypto = acm;
