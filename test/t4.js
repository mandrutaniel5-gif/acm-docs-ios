const h = require('./harness');
const fs = require('fs');
(async () => {
  await h.init();
  const d = h.PDF.Doc.open(new Uint8Array(fs.readFileSync(__dirname + '/' + (process.argv[2] || 'mixed.pdf'))));
  for (const it of d.items(0)) if (it.kind === 'text') console.log(JSON.stringify(it.text), it.style && `${it.style.family} ${it.style.size} b=${it.style.bold}`);
})();
