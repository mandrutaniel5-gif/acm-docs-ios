const h = require('./harness');
(async () => {
  await h.init();
  const { PDF } = h;
  const W = 2000, H = 2800;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i*4] = 250; rgba[i*4+1] = (i % W) & 255; rgba[i*4+2] = 240; rgba[i*4+3] = 255; }
  const d = PDF.Doc.createFromImage(rgba, W, H, 595, 842);
  const out = d.save();
  console.log('size MB', (out.length / 1e6).toFixed(2));
})();
