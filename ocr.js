'use strict';
// Text recognition (OCR) for pictures, fully offline. Runs in the main process
// in a background thread so the window never freezes.
const path = require('path');

let workerPromise = null;
let progressCb = null;

// Packaged app: the OCR engine lives outside app.asar (worker threads cannot read inside it).
const unpacked = (p) => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

function getWorker() {
  if (!workerPromise) {
    const { createWorker, OEM } = require('tesseract.js');
    const root = __dirname;
    // Inside Electron the engine treats a folder as a web address and fails to load it, but it
    // reads its own cache from disk: the language data is put there once (the engine unpacks it).
    const fs = require('fs');
    let cachePath = null;
    try {
      const { app } = require('electron');
      cachePath = path.join(app.getPath('userData'), 'ocr');
      const src = unpacked(path.join(root, 'app', 'ocr', 'ron.traineddata.gz'));
      const dst = path.join(cachePath, 'ron.traineddata');
      const st = fs.statSync(src);
      let ok = false;
      try { ok = fs.statSync(dst).size === st.size; } catch (e) {}
      if (!ok) { fs.mkdirSync(cachePath, { recursive: true }); fs.copyFileSync(src, dst); }
    } catch (e) { cachePath = null; }
    workerPromise = createWorker('ron', OEM.LSTM_ONLY, {
      workerPath: unpacked(path.join(root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')),
      langPath: unpacked(path.join(root, 'app', 'ocr')),
      cacheMethod: cachePath ? 'readOnly' : 'none',
      cachePath: cachePath || undefined,
      gzip: true,
      logger: (m) => {
        if (progressCb && m && typeof m.progress === 'number') progressCb(m.status, m.progress);
      },
      errorHandler: (e) => console.error('ocr', e),
    }).then(async (w) => {
      // Keep spaces between words; one text block per region.
      await w.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return w;
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function bbox(b) {
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
}

/** [png]: Buffer with an encoded image. Returns paragraphs -> lines -> words (pixels). */
async function recognize(png, onProgress, opts) {
  progressCb = onProgress || null;
  try {
    const w = await getWorker();
    // whole pages: automatic layout (titles, columns); picture parts: one block of text
    await w.setParameters({ tessedit_pageseg_mode: opts && opts.page ? '3' : opts && opts.line ? '7' : '6' });
    const { data } = await w.recognize(png, {}, { blocks: true, text: false, hocr: false, tsv: false });
    const paragraphs = [];
    for (const block of data.blocks || []) {
      for (const par of block.paragraphs || []) {
        const lines = [];
        for (const line of par.lines || []) {
          const words = (line.words || []).map((wd) => ({ text: wd.text, conf: wd.confidence, bbox: bbox(wd.bbox) }));
          if (!words.length) continue;
          lines.push({
            text: line.text.replace(/\s+$/, ''),
            conf: line.confidence,
            bbox: bbox(line.bbox),
            baseline: line.baseline ? { x0: line.baseline.x0, y0: line.baseline.y0, x1: line.baseline.x1, y1: line.baseline.y1 } : null,
            rowHeight: line.rowAttributes ? line.rowAttributes.row_height : null,
            words,
          });
        }
        if (lines.length) paragraphs.push({ bbox: bbox(par.bbox), lines });
      }
    }
    return { paragraphs };
  } finally {
    progressCb = null;
  }
}

async function shutdown() {
  if (!workerPromise) return;
  try { (await workerPromise).terminate(); } catch (e) {}
  workerPromise = null;
}

async function warm() { await getWorker(); }

module.exports = { recognize, shutdown, warm };
