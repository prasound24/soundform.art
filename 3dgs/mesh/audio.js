import { StringOscillator2D } from "../../create/oscillator2d.js";
import { dcheck, Float32Tensor } from "../../lib/utils.js";

export function createShader(w, h, { audio, depth }) {
  let ch = audio.channels[0];
  let n = ch.length, m = Math.ceil(n / h);
  dcheck(m > 0);
  let hh = depth, ww = w / hh | 0;
  let osc = new StringOscillator2D(ww, hh);
  osc.damping = 0.001;

  let iAmp = new Float32Tensor([h, w]);

  for (let t = 0; t < n; t++) {
    osc.update(ch[t]);

    let y = Math.floor(t / n * h);

    for (let x = 0; x < w; x++) {
      let amp = Math.abs(osc.wave[x] - ch[t]);
      let i = y * w + x;
      if (amp > iAmp.data[i])
        iAmp.data[i] = amp;
    }
  }

  let iSum = new Float32Tensor([h, w]);

  for (let i = 0; i < iAmp.data.length; i++)
    iSum.data[i] = iAmp.data[i] ** 2;

  for (let y = 1; y < h; y++)
    for (let x = 0; x < w; x++)
      iSum.data[y * w + x] += iSum.data[(y - 1) * w + x];

  let max = iAmp.max();
  iAmp.update(x => x / max);
  iSum.update(x => x / max);

  return { iAmp, iSum, iSumMax: iSum.max(), iDrumShape: [ww, hh] };
}
