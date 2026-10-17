window.__lib = window.__lib || {};
var B = require('buffer').Buffer; if (!window.Buffer) window.Buffer = B;
window.__lib.jszip = window.__lib.jszip || require('jszip');
window.__lib['docx-preview'] = require('docx-preview');
window.__lib.docx = require('docx');
var WordOle = require('word-extractor/lib/word-ole-extractor');
var BufferReader = require('word-extractor/lib/buffer-reader');
// Same API as word-extractor (only the old binary .doc format is needed here)
window.__lib['word-extractor'] = function WordExtractor() {
  this.extract = function (buf) { var r = new BufferReader(buf); return r.open().then(function () { return new WordOle().extract(r); }).finally(function () { r.close(); }); };
};
