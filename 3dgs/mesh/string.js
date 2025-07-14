import { Float32Tensor } from '../../lib/utils.js';
import * as webfft from '../../lib/webfft.js';

const fract = (x) => x - Math.floor(x);

function hash11(p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

function initStr(xyzw, w, h, x, y, amps, sid = 0) {
  let phi = Math.PI * 2 * x / w;
  let px = Math.cos(phi);
  let py = Math.sin(phi);
  let pz = 0;
  let pw = 0;

  for (let s = 0; s < amps.length; s++) {
    let arg = phi * s;
    //arg *= 2;
    pz += amps[s] * Math.cos(arg);
    pw += amps[amps.length - 1 - s] * Math.sin(arg);
  }

  px *= Math.cos(pz);
  py *= Math.cos(pz);
  pz = Math.sin(pz);

  let i = y * w + x;
  xyzw[i * 4 + 0] = px * Math.cos(pw);
  xyzw[i * 4 + 1] = py * Math.cos(pw);
  xyzw[i * 4 + 2] = pz * Math.cos(pw);
  xyzw[i * 4 + 3] = Math.sin(pw);
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

function moveStr(tmp, xyzw, w, h, x, y) {
  if (tmp.length == 0)
    for (let i = 0; i < 6; i++)
      tmp[i] = vec4();

  let [c, l, r, ll, rr, d] = tmp;

  tex(c, xyzw, w, h, x, y);
  tex(l, xyzw, w, h, x - 1, y);
  tex(r, xyzw, w, h, x + 1, y);
  tex(ll, xyzw, w, h, x - 2, y);
  tex(rr, xyzw, w, h, x + 2, y);
  tex(d, xyzw, w, h, x, y - 1);

  mul(l, 1.0 / dot(l, c));
  mul(r, 1.0 / dot(r, c));
  mul(d, 1.0 / dot(d, c));
  mul(ll, 1.0 / dot(ll, c));
  mul(rr, 1.0 / dot(rr, c));

  let dx2 = 1 / (w * w);
  let dt2 = dx2; // 1 / (h * h);

  for (let i = 0; i < 4; i++) {
    let ds = c[i] - d[i];
    ds += (0.25 * dt2 / dx2) * (l[i] + r[i] - c[i] * 2);
    //ds -= (5e-8 * dt2 / dx2 / dx2) * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);
    c[i] += ds;
  }

  mul(c, 1.0 / len(c));
  return c;
}

export function createShader(w, h, { sid, rgb, audio } = {}) {
  let str4 = new Float32Array(w * h * 4);
  let amps = new Float32Array(60);

  if (audio) {
    amps = getAverageSpectrum(audio);
  } else {
    let vol = 5 * hash11(sid);
    for (let s = 0; s < amps.length; s++) {
      amps[s] = hash11(s + sid) - 0.5;
      if (s > 0) amps[s] *= vol / (s*s);
    }
  }

  console.debug('String amps:', [...amps].map(a => a.toFixed(2)).join(',')
    .replace(/(,[-]?0.00)+$/, ''));

  for (let y = 0; y < 2; y++)
    for (let x = 0; x < w; x++)
      initStr(str4, w, h, x, y, amps, sid);

  let tmp = [];

  for (let y = 2; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = moveStr(tmp, str4, w, h, x, y - 1);
      let i = y * w + x;
      str4.set(c, i * 4);
    }
  }

  return {
    iColor: rgb,
    iMesh: new Float32Tensor([h, w, 4], str4),
  };
}


function getAverageSpectrum(audio) {
  let ch = audio.channels[0];
  let n = ch.length, m = 1024;
  let amps = new Float32Array(m);
  let frame = new Float32Array(m * 2);
  let len2 = (a, b) => a * a + b * b;

  if (n < m) throw new Error(
    'Audio sample is too short: ' + n + ' < ' + m);

  for (let i = 0; i + m <= n; i += m) {
    frame.fill(0);

    for (let j = 0; j < m; j++)
      frame[j * 2] = ch[i + j];

    webfft.fft_1d(frame);

    for (let j = 0; j < m; j++)
      amps[j] += len2(frame[j * 2], frame[j * 2 + 1]);
  }

  let maxamp = 0;

  for (let j = 0; j < m; j++)
    maxamp = Math.max(maxamp, amps[j]);

  for (let j = 0; j < m; j++)
    amps[j] = amps[j] / maxamp / 3;

  return amps.slice(0, m / 2);
}
