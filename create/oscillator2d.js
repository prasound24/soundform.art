const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

export class StringOscillator2D {
  constructor(w, h) {
    this.damping = 0.0;
    this.dt = 1.0;
    this.width = w;
    this.height = h;
    this.wavefront = new WaveFront([w, h], 4);
  }

  get wave() {
    return this.wavefront.get(0);
  }

  update(input) {
    let w = this.width, h = this.height;
    let a = this.damping; // c = this.stiffness;
    let dt = this.dt;
    let wave = this.wavefront.get(0);
    let next = this.wavefront.get(1);
    let prev = this.wavefront.get(-1);
    let a0 = 1 - a * dt / 2;
    let a2 = 1 + a * dt / 2;

    if (Number.isFinite(input))
      wave[0] = input;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let l = x > 0 ? x - 1 : w - 1;
        let b = y > 0 ? y - 1 : h - 1;
        let r = x < w - 1 ? x + 1 : 0;
        let t = y < h - 1 ? y + 1 : 0;
        let lx = wave[y * w + l], bx = wave[b * w + x];
        let rx = wave[y * w + r], tx = wave[t * w + x];
        // u_tt + a*u_t - u_xx = f
        let sx = prev[y * w + x] * a0 - (lx + rx + tx + bx) / 2;
        next[y * w + x] = -sx / a2;
      }
    }

    this.wavefront.iteration++;
  }
}

class WaveFront {
  constructor([w, h], n) {
    this.iteration = 0;
    this.plane = [];
    for (let i = 0; i < n; i++)
      this.plane[i] = new Float32Array(w * h);
  }

  get(i) {
    let n = this.plane.length;
    let i0 = this.iteration;
    return this.plane[(i + i0) & (n - 1)];
  }
}

