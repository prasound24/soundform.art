import { Float32Tensor, dcheck } from '../../lib/utils.js';

function initPos(xyzw, [w, h], [x, y]) {
  let a = Math.PI * 2 * x / w;
  let i = y * w + x;
  xyzw[i * 4 + 0] = Math.cos(a);
  xyzw[i * 4 + 1] = Math.sin(a);
  xyzw[i * 4 + 2] = 0;
  xyzw[i * 4 + 3] = 0;
}

const vec4 = () => new Float32Array(4);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3];
const mul = (v, f) => { v[0] *= f; v[1] *= f; v[2] *= f; v[3] *= f; }
const len = (v) => Math.sqrt(dot(v, v));

function tex(res, rgba, w, h, x, y) {
  x = (x + w) % w;
  let i = y * w + x;
  res[0] = rgba[i * 4 + 0];
  res[1] = rgba[i * 4 + 1];
  res[2] = rgba[i * 4 + 2];
  res[3] = rgba[i * 4 + 3];
}

function moveStr(xyzw, [w, h], [x, y], [dx, dt]) {
  if (!moveStr.tmp) {
    moveStr.tmp = [];
    for (let i = 0; i < 8; i++)
      moveStr.tmp[i] = vec4();
  }

  let [c, l, r, ll, rr, prev, ds] = moveStr.tmp;

  tex(c, xyzw, w, h, x, y);
  tex(l, xyzw, w, h, x - 1, y);
  tex(r, xyzw, w, h, x + 1, y);
  tex(ll, xyzw, w, h, x - 2, y);
  tex(rr, xyzw, w, h, x + 2, y);
  tex(prev, xyzw, w, h, x, (y - 1 + h) % h);

  let dt2 = dt * dt, dx2 = dx * dx, dtdx2 = dt2 / dx2;

  for (let i = 0; i < 4; i++) {
    ds[i] = c[i] - prev[i];
    ds[i] += dtdx2 * (l[i] + r[i] - c[i] * 2);
    //ds -= (0.1 * dtdx2 / dx2) * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);
  }

  //let spin = 0.001;
  //for (let i = 0; i < 3; i++)
  //  ds[i] += dt2 * spin * c[i];

  let damping = 0.001;
  for (let i = 0; i < 4; i++)
    ds[i] += dt * damping * prev[i];

  for (let i = 0; i < 4; i++)
    c[i] += ds[i];

  mul(c, 1 / (1 + dt * damping));

  let r2 = Math.hypot(c[0], c[1]);
  c[0] /= r2;
  c[1] /= r2;

  return c;
}

export function createMesh(w, h, { rgb, audio, timespan } = {}) {
  let temp = new Float32Array(w * 4 * 4);
  let wave = new Float32Array(w * h * 4);
  let iAmps = new Float32Tensor([h, w, 4]);

  for (let t = 0; t < 2; t++)
    for (let x = 0; x < w; x++)
      initPos(temp, [w, h], [x, t]);

  let dx = timespan[0] / w;
  let dt = timespan[1] / h;
  console.debug('dt/dx=' + (dt / dx).toFixed(2));
  if (dt / dx > 0.5) console.warn('dx/dt > 0.5 is unstable');
  console.debug('Audio channels:', audio.channels.length);

  let min = new Float32Array(w * 4);
  let max = new Float32Array(w * 4);
  min.fill(+Infinity);
  max.fill(-Infinity);
  let ampmax = 0;

  let ch0 = audio.channels[0];
  let ch1 = audio.channels[1];
  let n = ch0.length;
  let y = 0;

  for (let t = 2; t < n; t++) {
    let g = [0, 0, 0, 0];

    if (ch0) g[2] = ch0[t] * 0.007;
    //if (ch1) g[3] = ch1[t] * 0.00;

    let tw = t % 4 * w;

    for (let x = 0; x < w; x++) {
      let c = moveStr(temp, [w, 4], [x, (t - 1) % 4], [dx, dt]);

      if ((x + 0) % (w / 3) == 0) {
        initPos(c, [w, h], [x, 0]);
        for (let i = 2; i < 4; i++)
          c[i] = g[i];
      }

      for (let i = 0; i < 4; i++) {
        let xi = x * 4 + i;
        min[xi] = Math.min(min[xi], c[i] - g[i]);
        max[xi] = Math.max(max[xi], c[i] - g[i]);
        ampmax = Math.max(ampmax, max[xi] - min[xi]);
        //dcheck(ampmax >= 0);
      }

      temp.set(c, (tw + x) * 4);
    }

    if (Math.floor(t / n * h) > y) {
      let line = temp.subarray(tw * 4, (tw + w) * 4);

      for (let x = 0; x < w; x++) {
        for (let i = 0; i < 4; i++) {
          let yw = y * w * 4;
          let xi = x * 4 + i;
          iAmps.data[yw + xi] = max[xi] - min[xi];
          line[xi] -= g[i];
        }
      }

      min.fill(+Infinity);
      max.fill(-Infinity);
      wave.set(line, y * w * 4);
      y++;
    }
  }

  iAmps.update(x => x / ampmax);
  console.debug('iAmps max:', ampmax);

  return {
    iColor: rgb,
    iMesh: new Float32Tensor([h, w, 4], wave),
    iAmps: iAmps,
  };
}
