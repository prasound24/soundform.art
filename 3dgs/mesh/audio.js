import { StringOscillator } from "../../create/oscillator.js";
import { StringOscillator2D } from "../../create/oscillator2d.js";
import { dcheck, Float32Tensor } from "../../lib/utils.js";

export function createShader(w, h, { audio, depth }) {
    let ch = audio.channels[0];
    let n = ch.length, m = Math.ceil(n / h);
    dcheck(m > 0);
    let hh = depth, ww = w / hh | 0;
    let osc = new StringOscillator2D(ww, hh);
    //let osc = new StringOscillator(w);
    osc.damping = 0.001;

    let agg = {};
    agg.min = new Float32Array(w);
    agg.max = new Float32Array(w);

    let uniforms = {};
    uniforms.iMemShape = [ww, hh];
    uniforms.iAmp = new Float32Tensor([h, w]);

    for (let t = 0; t < n; t++) {
        osc.update(ch[t]);

        for (let x = 0; x < w; x++) {
            let amp = osc.wave[x] - ch[t];
            //dcheck(Math.abs(amp) <= 3);
            if (amp < agg.min[x]) agg.min[x] = amp;
            if (amp > agg.max[x]) agg.max[x] = amp;
        }

        if (t % m == m - 1) {
            let y = Math.floor(t / m);
            for (let x = 0; x < w; x++)
                uniforms.iAmp.data[y * w + x] = agg.max[x] - agg.min[x];
            agg.min.fill(+Infinity);
            agg.max.fill(-Infinity);
        }
    }

    let max = uniforms.iAmp.max();
    for (let i = 0; i < h * w; i++)
        uniforms.iAmp.data[i] /= max;

    return uniforms;
}
