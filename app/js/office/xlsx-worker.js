'use strict';
// Reads Excel files away from the app: the parser (SheetJS) runs here, in a separate worker.
// A file made to attack the parser (prototype pollution, endless loops) can only spoil this
// throwaway worker, never the app, its keys or its data; an endless loop is cut off by a timer.
self.window = self;
importScripts('../../vendor/xlsx.js');
self.onmessage = (e) => {
  try {
    const X = self.__lib['xlsx-js-style'];
    const w = X.read(e.data.bytes, e.data.opts);
    // plain data only (no functions, no prototypes) goes back to the app
    postMessage({ ok: true, w: JSON.parse(JSON.stringify({ SheetNames: w.SheetNames, Sheets: w.Sheets, Workbook: w.Workbook || null })) });
  } catch (err) {
    postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
