// QR codes for ACM Docs contacts: make (qrcode-generator) and read (jsQR). window.__lib.qr
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
window.__lib = window.__lib || {};
window.__lib.qr = {
  /** SVG markup of a QR code for `text` */
  svg(text) {
    const q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount(), m = 2; // quiet zone
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b1b33"/></svg>`;
  },
  /** text of a QR code found in ImageData, or null */
  read(img) { const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' }); return r ? r.data : null; },
};
