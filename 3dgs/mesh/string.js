import { Float32Tensor } from '../../lib/utils.js';

const fract = (x) => x - Math.floor(x);

function hash11(p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

function tri(t) {
  t /= Math.PI * 2;
  return 2 * Math.abs(t - Math.floor(t + 0.5));
}

function initStr(xyzw, w, h, x, y, amps) {
  let a = Math.PI * 2 * x / w;
  let px = Math.cos(a);
  let py = Math.sin(a);
  let pz = 0;
  let pw = 0;

  for (let s = 0; s < amps.length; s++) {
    pz += amps[s] * Math.cos(a * s);
    pw += amps[s] * Math.sin(a * s);
  }

  //px *= Math.cos(pz);
  //py *= Math.cos(pz);
  //pz = Math.sin(pz);

  let len = Math.hypot(px, py, pz, pw);
  let i = y * w + x;
  xyzw[i * 4 + 0] = px / len; // * Math.cos(pw);
  xyzw[i * 4 + 1] = py / len; // * Math.cos(pw);
  xyzw[i * 4 + 2] = pz / len; // * Math.cos(pw);
  xyzw[i * 4 + 3] = pw / len; // Math.sin(pw);
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

function moveStr(tmp, xyzw, w, h, x, y, damping, [dx, dt]) {
  if (tmp.length == 0)
    for (let i = 0; i < 7; i++)
      tmp[i] = vec4();

  let [c, l, r, ll, rr, prev, ds] = tmp;

  tex(c, xyzw, w, h, x, y);
  tex(l, xyzw, w, h, x - 1, y);
  tex(r, xyzw, w, h, x + 1, y);
  tex(ll, xyzw, w, h, x - 2, y);
  tex(rr, xyzw, w, h, x + 2, y);
  tex(prev, xyzw, w, h, x, y - 1);

  //mul(l, 1.0 / dot(l, c));
  //mul(r, 1.0 / dot(r, c));
  //mul(d, 1.0 / dot(d, c));
  //mul(ll, 1.0 / dot(ll, c));
  //mul(rr, 1.0 / dot(rr, c));

  let dt2 = dt * dt, dx2 = dx * dx, dtdx2 = dt2 / dx2;

  for (let i = 0; i < 4; i++) {
    ds[i] = c[i] - prev[i];
    ds[i] += dtdx2 * (l[i] + r[i] - c[i] * 2);
    //ds -= (0.1 * dtdx2 / dx2) * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);
  }

  //let spin = 30;
  //for (let i = 0; i < 2; i++)
  //  ds[i] += dt2 * spin * c[i];

  //if (x % (w / 5) == 0) {
  //  let gc = dot(g, c), g2 = dot(g, g);
  //  if (g2 > 0)
  //    for (let i = 0; i < 4; i++)
  //      ds[i] += dt2 * g[i] * (1 - gc / g2);
  //}

  for (let i = 0; i < 4; i++)
    ds[i] += dt * damping * prev[i];

  for (let i = 0; i < 4; i++)
    c[i] += ds[i];

  mul(c, 1 / (1 + dt * damping));
  mul(c, 1 / len(c));
  return c;
}

export function createMesh(w, h, { sid, rgb, amps, timespan } = {}) {
  let str4 = new Float32Array(w * h * 4);

  if (!amps || !amps.length || amps.length == 1 && amps[0] == 0) {
    amps = new Float32Array(w / 2);
    let add = (num, pow, vol) => {
      for (let s = 0; s < amps.length; s += num) {
        let a = hash11(sid + s / num) - 0.5;
        if (s > 0) a *= Math.exp(pow * (s / num));
        //if (s > 0) a *= (s / num) ** pow;
        amps[s] += a * vol;
      }
    };
    add(3, -1.3, 10);
    add(3, -1.7, -9);
  }

  console.debug('Amps:', [...amps].map(a => a.toFixed(2)).join(',')
    .replace(/(,[-]?0.00)+$/, ''));

  for (let y = 0; y < 2; y++)
    for (let x = 0; x < w; x++)
      initStr(str4, w, h, x, y, amps, sid);

  let tmp = [];
  let dx = timespan[0] / w;
  let dt = timespan[1] / h;
  let damping = 0.001;
  console.debug('dt/dx=' + (dt / dx).toFixed(2));
  if (dt / dx > 0.5) console.warn('dx/dt > 0.5 is unstable');

  for (let y = 2; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = moveStr(tmp, str4, w, h, x, y - 1, damping, [dx, dt]);
      str4.set(c, (y * w + x) * 4);
    }
  }

  return {
    iColor: rgb,
    iDT: dt, iDX: dx, iDamping: damping,
    iMesh: new Float32Tensor([h, w, 4], str4),
  };
}
