const h = require('./harness');
const fs = require('fs');
const vm = require('vm');
(async () => {
  await h.init();
  const { PDF } = h;
  const SystemFonts = vm.runInThisContext('SystemFonts');
  const doc = PDF.Doc.open(new Uint8Array(fs.readFileSync(__dirname + '/sample.pdf')));
  let items = doc.items(0);
  const para = items.find((i) => i.kind === 'text' && i.text.startsWith('Subsemnatul'));
  const title = items.find((i) => i.kind === 'text' && i.text.startsWith('Contract'));
  const img = items.find((i) => i.kind === 'image');
  const font = SystemFonts.findTrueType('Times New Roman');
  console.log('font', font && font.key, font && font.family);
  // Rewrite paragraph
  const created = doc.writeText(0, { remove: para.objects, lines: [
    { text: 'Subsemnata Maria Ionescu, domiciliată în Cluj-Napoca, țară România,', dx: 0, baseline: 10 },
    { text: 'declar că am citit și accept condițiile.', dx: 0, baseline: 25 } ],
    topLeft: { x: para.box.l, y: para.box.t }, fontKey: font.key, fontBytes: font.bytes, size: 12, argb: 0xff1c3faa });
  console.log('created', created.length);
  // Move title down 20pt, delete image
  const pts = doc.pageSize(0);
  doc.transform(0, title.objects, title.box, { l: title.box.l, t: title.box.t + 20/pts.h, r: title.box.r, b: title.box.b + 20/pts.h });
  doc.deleteObjects(0, img.objects);
  doc.addInk(0, [{x:0.1,y:0.8},{x:0.2,y:0.82},{x:0.3,y:0.78},{x:0.4,y:0.81}], 0xff1c3faa, 1.5);
  doc.addRect(0, {l:0.1,t:0.85,r:0.4,b:0.87}, 0xffffe629, 110, true);
  doc.addMark(0, {l:0.5,t:0.85,r:0.53,b:0.87}, 'check', 0xff111111);
  // lift test
  const lift = doc.lift(0, title.objects, title.box, 600, 848);
  console.log('lift', lift.background.width, lift.sprite && lift.sprite.width, lift.sprite && lift.sprite.data.filter((v,i)=>i%4===3&&v===255).length);
  doc.setActive(0, title.objects, true);
  const out = doc.save();
  fs.writeFileSync(__dirname + '/out1.pdf', out);
  // Reopen and list items
  const d2 = PDF.Doc.open(out);
  items = d2.items(0);
  for (const it of items) console.log(it.kind, (it.text||'').slice(0,70), it.style ? it.style.family + ' ' + it.style.size : '');
  // forms
  const f = PDF.Doc.open(new Uint8Array(fs.readFileSync(__dirname + '/form.pdf')));
  const fields = f.fields(0);
  f.setField(fields[0], 'Andrei Mandruț');
  f.setField(fields[1], true);
  f.setField(fields[2], 2);
  f.setField(fields[4], true);
  const fo = f.save(); fs.writeFileSync(__dirname + '/out_form.pdf', fo);
  const f2 = PDF.Doc.open(fo);
  console.log(JSON.stringify(f2.fields(0).map(x => [x.name, x.value, x.checked, x.selected])));
  // page ops
  const d3 = PDF.Doc.open(out);
  d3.insertBlankPage(1, 595, 842); d3.movePage(2, 0); d3.rotatePage(0, 1); const o3 = d3.save();
  const d4 = PDF.Doc.open(o3); console.log('pages after ops', d4.pageCount, JSON.stringify(d4.pageSizes()));
  // image doc
  const rgba = new Uint8Array(40*20*4).fill(200);
  const di = PDF.Doc.createFromImage(rgba, 40, 20, 595, 297); const oi = di.save(); console.log('imgpdf', oi.length, PDF.Doc.open(oi).pageCount);
  // render output as PNG for visual check
  const r = PDF.Doc.open(out).render(0, 900, 1272);
  fs.writeFileSync(__dirname + '/out1.rgba', Buffer.from(r.data.buffer));
})().catch(e => { console.error('ERR', e); process.exit(1); });
