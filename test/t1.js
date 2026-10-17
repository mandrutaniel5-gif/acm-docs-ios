const h = require('./harness');
const fs = require('fs');
(async () => {
  await h.init();
  const { PDF } = h;
  const doc = PDF.Doc.open(new Uint8Array(fs.readFileSync(__dirname + '/sample.pdf')));
  console.log('pages', doc.pageCount, doc.pageSizes());
  const items = doc.items(0);
  for (const it of items) console.log(it.kind, it.id, JSON.stringify(it.box).slice(0,80), (it.text||'').slice(0,60), it.style ? JSON.stringify(it.style) : '', it.objects.length);
  const r = doc.render(0, 600, 848);
  console.log('render', r.width, r.height, r.data.length, r.data.slice(0,8));
  const runs = doc.textRuns(0); console.log('runs', runs.length, runs[0]);
  console.log('search', JSON.stringify(doc.search('Oradea')));
  const f = PDF.Doc.open(new Uint8Array(fs.readFileSync(__dirname + '/form.pdf')));
  console.log('fields', JSON.stringify(f.fields(0), null, 0));
  doc.close(); f.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
