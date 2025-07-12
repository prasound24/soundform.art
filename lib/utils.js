import * as webfft from './webfft.js';

let { min, max, sin, cos, abs, PI } = Math;

const uparams = new URLSearchParams(location?.search);
export const DEBUG = uparams.get('debug') ? !!+uparams.get('debug') :
  typeof location == 'undefined' || location.hostname == '0.0.0.0' || location.hostname == 'localhost';

export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);
export const log = (...args) => console.log(args.join(' '));
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const mix = (a, b, x) => a * (1 - x) + b * x;
export const step = (min, x) => x < min ? 0 : 1;
export const smoothstep = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
export const sqr = (x) => x * x;
export const clamp = (x, min = 0, max = 1) => Math.max(Math.min(x, max), min);
export const hann = (x) => x > 0 && x < 1 ? sqr(Math.sin(Math.PI * x)) : 0;
export const hann_ab = (x, a, b) => hann((x - a) / (b - a));
export const sinc = (x) => Math.abs(x) < 1e-8 ? 1.0 : sin(x) / x;
export const lanczos = (x, p) => Math.abs(x) < p ? sinc(PI * x) * sinc(PI * x / p) : 0;
export const lanczos_ab = (x, p, a, b) => lanczos((x - a) / (b - a) * 2 - 1, p);
export const fract = (x) => x - Math.floor(x);
export const reim2 = (re, im) => re * re + im * im;
export const is_pow2 = (x) => (x & (x - 1)) == 0;
export const hhmmss = (sec) => new Date(sec * 1000).toISOString().slice(11, -1);
export const clone = (obj) => JSON.parse(JSON.stringify(obj));
export const check = (x, msg = 'check failed') => { if (x) return; throw new Error(msg); }
export const dcheck = (x, msg = 'check failed') => { if (x) return; debugger; throw new Error(msg); }

export async function fetchText(url) {
  let res = await fetch(url);
  check(res.status == 200, 'HTTP ' + res.status + ' from ' + url);
  return await res.text();
}

export async function fetchRGBA(url, width = 0, height = 0) {
  console.log('Downloading ' + url);
  let img = new Image;
  img.src = url;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  let canvas = document.createElement('canvas');
  canvas.width = width || img.width;
  canvas.height = height || img.height;
  let ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export class CurrentOp {
  constructor(name, async_fn) {
    this.name = name;
    this.cancelled = false;
    this.completed = false;
    this.events = new EventTarget;
    this.promise = (async () => {
      try {
        await async_fn(this);
      } catch (e) {
        if (!(e instanceof ErrorCancelled))
          throw e;
      }
      this.completed = true;
    })();
  }

  async cancel() {
    if (!this.cancelled && !this.completed) {
      console.log('Cancelling', this.name);
      this.cancelled = true;
      this.events.dispatchEvent(new Event('cancel'));
      let ts = Date.now();
      try {
        await this.promise;
      } catch { }
      console.debug('Cancelled', this.name, 'in', Date.now() - ts, 'ms');
    }
  }

  async throwIfCancelled() {
    await sleep(0);
    if (this.cancelled)
      throw new ErrorCancelled('Operation cancelled: ' + this.name);
  }

  addEventListener(name, handler) {
    this.events.addEventListener(name, handler);
  }
}

export class ErrorCancelled extends Error { };

export class Float32Tensor {
  constructor(dims, data = 0) {
    let size = dims.reduce((p, d) => p * d, 1);
    dcheck(Number.isFinite(data) || data.length == size);

    // ds[i] = dims[i + 1] * dims[i + 2] * ...
    let dim = dims, ds = dim.slice(), n = ds.length;

    ds[n - 1] = 1;
    for (let i = n - 2; i >= 0; i--)
      ds[i] = ds[i + 1] * dim[i + 1];

    this.data = data.length ? data :
      new Float32Array(size);
    if (Number.isFinite(data))
      this.data.fill(data);

    this.rank = dims.length;
    this.dims = dims;
    this.shape = dims;
    this.dim_size = ds;

    this.array = this.data; // don't use
    this.dimensions = this.dims; //  don't use
  }

  at(...indexes) {
    dcheck(indexes.length == this.rank);
    let offset = 0;
    for (let i = 0; i < this.rank; i++)
      offset += indexes[i] * this.dim_size[i];
    return this.data[offset];
  }

  slice(begin, end) {
    dcheck(begin >= 0 && begin < end && end <= this.dims[0]);
    let size = this.dim_size[0];
    let dims = this.dims.slice(1);
    let data = this.data.subarray(begin * size, end * size);
    return new Float32Tensor([end - begin, ...dims], data);
  }

  subtensor(index) {
    let t = this.slice(index, index + 1);
    let d = t.dims;
    dcheck(d[0] == 1);
    return new Float32Tensor(d.slice(1), t.data);
  }

  transpose() {
    dcheck(this.rank >= 2);
    let [n, m, ...ds] = this.dims;
    let dsn = this.dim_size[1];
    let r = new Float32Tensor([m, n, ...ds]);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        let jni = (j * n + i) * dsn;
        let imj = (i * m + j) * dsn;
        for (let k = 0; k < dsn; k++)
          r.data[jni + k] = this.data[imj + k];
      }
    }
    return r;
  }

  clone() {
    return new Float32Tensor(this.dims.slice(), this.data.slice(0));
  }

  update(fn) {
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = fn(this.data[i]);
  }

  max() {
    return this.data.reduce((s, x) => Math.max(s, x), -Infinity);
  }

  min() {
    return this.data.reduce((s, x) => Math.min(s, x), +Infinity);
  }

  dcheck(predicate = Number.isFinite) {
    for (let i = 0; i < this.data.length; i++)
      dcheck(predicate(this.data[i]));
  }
}

export async function time(label, async_fn) {
  let ts = Date.now();
  let res = await async_fn();
  console.debug(label, Date.now() - ts, 'ms');
  return res;
}

// (1, 0) -> (1, 0)
// (-1, +0) -> (1, +PI)
// (-1, -0) -> (1, -PI)
export function xy2ra(x, y) {
  let r = Math.sqrt(x * x + y * y);
  let a = Math.atan2(y, x); // -PI..PI
  return [r, a];
}

// Returns null if no file was selected.
export async function selectAudioFile({ multiple = false } = {}) {
  let input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = multiple;
  input.click();
  return await new Promise(resolve =>
    input.onchange = () => resolve(multiple ? input.files : input.files[0]));
}

// Returns a Float32Array.
export async function decodeAudioFile(file, sample_rate = 48000) {
  let channels = await decodeAudioFile2(file, sample_rate);
  return channels[0];
}

export async function decodeAudioFile2(file, sample_rate = 48000) {
  let encoded_data = file instanceof Blob ? await file.arrayBuffer() : file;
  let audio_ctx = new AudioContext({ sampleRate: sample_rate });
  try {
    let cloned_data = encoded_data.slice(0);
    let audio_buffer = await audio_ctx.decodeAudioData(cloned_data);
    let channels = [];
    for (let i = 0; i < audio_buffer.numberOfChannels; i++)
      channels[i] = audio_buffer.getChannelData(i);
    return channels;
  } finally {
    audio_ctx.close();
  }
}

export async function playSound(channels, sample_rate, { audio = {}, onstarted } = {}) {
  audio.ctx = new AudioContext({ sampleRate: sample_rate });
  try {
    let nch = channels.length;
    let buffer = audio.ctx.createBuffer(nch, channels[0].length, sample_rate);
    for (let i = 0; i < nch; i++)
      buffer.getChannelData(i).set(channels[i]);
    let source = audio.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.ctx.destination);
    source.start();
    audio.startedTime = audio.ctx.currentTime;
    audio.duration = buffer.duration;
    onstarted?.call(null);
    await new Promise(resolve => source.onended = resolve);
  } finally {
    audio.ctx.close();
  }
}

// Returns an audio/wav Blob.
export async function recordAudio({ sample_rate = 48000, max_duration = 1.0 } = {}) {
  let stream = await navigator.mediaDevices.getUserMedia({
    audio: true, sampleRate: sample_rate, channelCount: 2
  });
  try {
    let recorder = new AudioRecorder(stream, sample_rate);
    await recorder.start();

    if (max_duration > 0)
      await sleep(max_duration * 1000);
    else if (max_duration instanceof Promise)
      await max_duration;
    else
      dcheck('Invalid max_duration: ' + max_duration);

    let blob = await recorder.fetch();
    await recorder.stop();
    return blob;
  } finally {
    stream.getTracks().map(t => t.stop());
  }
}

export class AudioRecorder {
  constructor(stream, sample_rate) {
    this.stream = stream;
    this.sample_rate = sample_rate;
    this.onaudiodata = null;
    this.onaudiochunk = null;

    this.audio_blob = null;
    this.audio_ctx = null;
    this.worklet = null;
    this.mss = null;
    this.stream_ended = null;
  }

  async start() {
    try {
      await this.init();
    } catch (err) {
      this.close();
      throw err;
    }

    let stream = this.stream;
    if (!stream.active)
      throw new Error('Stream is not active: ' + stream.id);

    this.stream_ended = new Promise((resolve) => {
      if ('oninactive' in stream) {
        console.debug('Watching for stream.oninactive');
        stream.addEventListener('inactive', resolve);
      } else {
        console.debug('Started a timer waiting for !stream.active');
        let timer = setInterval(() => {
          if (!stream.active) {
            resolve();
            clearInterval(timer);
            console.debug('Stopped the !stream.active timer');
          }
        }, 50);
      }
    });

    this.stream_ended.then(async () => {
      console.debug('Audio stream ended');
      this.stop();
    });
  }

  async stop() {
    await this.fetch();
    this.close();
  }

  async init() {
    log('Initializing the mic recorder @', this.sample_rate, 'Hz');
    this.audio_ctx = new AudioContext({ sampleRate: this.sample_rate });

    await this.audio_ctx.audioWorklet.addModule('/create/mic_thread.js');
    this.worklet = new AudioWorkletNode(this.audio_ctx, 'mic_thread');
    // this.worklet.onprocessorerror = (e) => console.error('mic_thread worklet:', e);
    this.worklet.port.onmessage = (e) => {
      // usually it's 128 samples per chunk
      if (e.data.type == 'chunk' && this.onaudiochunk)
        this.onaudiochunk(e.data.channels);
    };

    this.mss = this.audio_ctx.createMediaStreamSource(this.stream);
    this.mss.connect(this.worklet);
    await this.audio_ctx.resume();
  }

  async fetch() {
    if (!this.worklet) return;
    log('Fetching audio data from the worklet');
    this.worklet.port.postMessage('fetch-all');
    let { channels } = await new Promise((resolve) => {
      this.worklet.port.onmessage = (e) => {
        if (e.data.channels && !e.data.type)
          resolve(e.data);
      }
    });

    dcheck(channels.length > 0);
    let waves = [];

    for (let ch = 0; ch < channels.length; ch++) {
      let blob = new Blob(channels[ch]);
      let data = await blob.arrayBuffer();
      dcheck(data.byteLength % 4 == 0);
      waves[ch] = new Float32Array(data);
    }

    log('Recorded audio:', (waves[0].length / this.sample_rate).toFixed(2), 'sec');
    this.audio_blob = generateWavFile(waves, this.sample_rate);
    this.onaudiodata?.(this.audio_blob);
    return this.audio_blob;
  }

  close() {
    this.mss?.disconnect();
    this.worklet?.disconnect();
    this.audio_ctx?.close();
    this.mss = null;
    this.worklet = null;
    this.audio_ctx = null;
  }
}

// https://docs.fileformat.com/audio/wav
export function generateWavFile(channels, sample_rate, filename = null) {
  let nch = channels.length;
  let len = channels[0].length;
  let i16 = new Int16Array(22 + len * nch + len * nch % 2);
  let i32 = new Int32Array(i16.buffer);

  i16.set([
    0x4952, 0x4646, 0x0000, 0x0000, 0x4157, 0x4556, 0x6d66, 0x2074,
    0x0010, 0x0000, 0x0001, 0x0001, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0002, 0x0010, 0x6164, 0x6174, 0x0000, 0x0000]);

  i32[1] = i32.length * 4; // file size
  i16[11] = nch;
  i32[6] = sample_rate;
  i32[7] = sample_rate * nch * 2; // bytes per second
  i32[10] = len * nch * 2; // data size
  i16[16] = nch * 2;

  for (let i = 0; i < len; i++)
    for (let ch = 0; ch < nch; ch++)
      i16[22 + i * nch + ch] = channels[ch][i] * 0x7FFF;

  let blob = new Blob([i16.buffer], { type: 'audio/wav' });
  return filename ? new File([blob], filename, { type: blob.type }) : blob;
}

export async function decodeWavFile(blob) {
  let i16 = new Int16Array(await blob.arrayBuffer());
  let res = new Float32Array(i16.subarray(22));
  for (let i = 0; i < res.length; i++)
    res[i] /= 0x7FFF;
  return res;
}

// await showStatus("foobar", { "exit": () => ... })
export async function showStatus(text, buttons = null) {
  if (text instanceof Error)
    debugger;
  let str = Array.isArray(text) ? text.join(' ') : text + '';
  str && console.info(str);
  let status = initStatusBar();
  status.style.display = str || buttons ? '' : 'none';
  status.innerText = str;
  if (buttons) {
    for (let name in buttons) {
      let handler = buttons[name];
      let a = document.createElement('a');
      a.innerText = name;
      if (typeof handler == 'function')
        a.onclick = () => { a.onclick = null; handler(); };
      else if (typeof handler == 'string')
        a.href = handler;
      else
        throw new Error('Invalid button handler for ' + name);
      a.style.textDecoration = 'underline';
      a.style.cursor = 'pointer';
      a.style.marginLeft = '1em';
      a.style.color = 'inherit';
      status.append(a);
    }
  }
  await sleep(15);
}

export function hideStatus() {
  showStatus('');
}

function initStatusBar() {
  let id = 'status_283992';
  let status = $('#' + id);
  if (status) return status;

  status = document.createElement('div');
  status.id = id;
  status.style.background = '#112';
  status.style.borderTop = '1px solid #224';
  status.style.borderBottom = '1px solid #224';
  status.style.color = '#fff';
  status.style.padding = '1em';
  status.style.display = 'none';

  let middle = document.createElement('div');
  middle.style.zIndex = '432';
  middle.style.position = 'fixed';
  middle.style.width = '100%';
  middle.style.top = '50%';
  middle.style.textAlign = 'center';

  middle.append(status);
  document.body.append(middle);
  return status;
}

export function setUncaughtErrorHandlers(handler = null) {
  if (!handler) handler = (e) => showStatus(e, { 'Dismiss': hideStatus });
  window.onerror = (event, source, lineno, colno, error) => handler(error);
  window.onunhandledrejection = (event) => handler(event.reason, null);
}

// An indexedDB wrapper:
//
//    tab = DB.open("foo/bar");
//    await tab.set("key", "value");
//    val = await tab.get("key");
//
export class DB {
  static open(name) {
    if (name.indexOf('/') < 0)
      return DB.conns[name] = DB.conns[name] || new DB(name);
    let [db_name, tab_name, ...etc] = name.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).open(tab_name);
  }

  static get(key_path) {
    let [db_name, tab_name, key_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).open(tab_name).get(key_name);
  }

  static set(key_path, val) {
    let [db_name, tab_name, key_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).open(tab_name).set(key_name, val);
  }

  // DB.keys('db2/table3');
  // DB.keys('db2');
  // DB.keys();
  static keys(key_path = '') {
    let [db_name, tab_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    if (tab_name)
      return DB.open(db_name).open(tab_name).keys();
    if (db_name)
      return DB.open(db_name).keys();
    return indexedDB.databases().then(rs => rs.map(r => r.name));

  }

  // DB.remove('db2/table3/key4');
  // DB.remove('db2/table3');
  // DB.remove('db2');
  static async remove(key_path = '') {
    let [db_name, tab_name, key_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    if (key_name)
      return DB.open(db_name).open(tab_name).remove(key_name);
    if (tab_name)
      return DB.open(db_name).remove(tab_name);
    if (db_name)
      return DB.open(db_name).clear();
    dcheck(false, 'Use DB.clear() instead.');
  }

  constructor(name) {
    dcheck(name.indexOf('/') < 0);
    this.name = name;
    this.tables = {};
    this.changes = new Map
    this._ready = null;
    this._db = null;
  }

  async keys() {
    let db = await this.sync();
    return [...db.objectStoreNames];
  }

  async remove(tab_name) {
    delete this.tables[tab_name];
    this.changes.set(tab_name, -1);
    await this.sync();
  }

  open(name) {
    if (!this.tables[name]) {
      this.tables[name] = new IndexedDBTable(name, this);
      this.changes.set(name, +1);
    }
    return this.tables[name];
  }

  async clear() {
    await new Promise((resolve, reject) => {
      let r = indexedDB.deleteDatabase(this.name);
      r.onerror = () => reject(new Error(`Failed to delete DB ${this.name}: ${r.error}`));
      r.onblocked = r.onerror;
      r.onsuccess = () => resolve();
    });
    this.tables = {};
    this.changes.clear();
    this._ready = null;
    this._db = null;
  }

  async sync() {
    return (this._ready = this._ready || this._sync()).then(() => {
      this._ready = null;
      return this._db;
    });
  }

  async _sync() {
    // the initial fetch of the db state
    if (!this._db)
      this._db = await this._upgrade(0);

    while (this._applyChanges(this._db, false)) {
      let ver = 1 + parseInt(this._db.version);
      this._db.close();
      this._db = null;
      this._db = await this._upgrade(ver);
    }

    this.changes.clear();
    return this._db;
  }

  _applyChanges(db, apply = false) {
    let changed = false;
    let current = new Set(db.objectStoreNames);

    for (let [t, ch] of this.changes.entries()) {
      if (ch > 0 && !current.has(t)) {
        apply && DB.log('[db] create', db.name + '/' + t);
        apply && db.createObjectStore(t);
        changed = true;
      }
      if (ch < 0 && current.has(t)) {
        apply && DB.log('[db] delete', db.name + '/' + t);
        apply && db.deleteObjectStore(t);
        changed = true;
      }
    }

    return changed;
  }

  // version=0 fetches the current state without applying changes
  _upgrade(version) {
    return new Promise((resolve, reject) => {
      DB.log(`[db] opening db ${this.name}, version ${version}`);
      let req = indexedDB.open(this.name, version || undefined);

      // only when version > 0
      req.onupgradeneeded = (e) => {
        let db = e.target.result;
        DB.log('[db]', this.name + ':upgradeneeded', db.version);
        this._applyChanges(db, true);
        this.changes.clear();
      };
      req.onsuccess = (e) => {
        DB.log('[db]', this.name + ':success', e.target.result.version);
        resolve(e.target.result);
      };
      req.onerror = (e) => {
        DB.log('[db]', this.name + ':error', e);
        reject(e);
      };
    });
  }
}

DB.log = () => 0; // log;
DB.conns = {};

class IndexedDBTable {
  constructor(name, db) {
    dcheck(name.indexOf('/') < 0);
    this.name = name;
    this.db = db;
  }
  async get(key) {
    let db = await this.db.sync();
    return new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readonly');
      let s = t.objectStore(this.name);
      let r = s.get(key);
      r.onerror = () => reject(new Error(`${this.name}.get(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve(r.result);
    });
  }
  async set(key, value) {
    let db = await this.db.sync();
    await new Promise((resolve, reject) => {
      DB.log('[db]', db.name + ':' + this.name + '.set');
      let t = db.transaction(this.name, 'readwrite');
      let s = t.objectStore(this.name);
      let r = s.put(value, key);
      r.onerror = () => reject(new Error(`${this.name}.set(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve();
    });
  }
  async remove(key) {
    let db = await this.db.sync();
    await new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readwrite');
      let s = t.objectStore(this.name);
      let r = s.delete(key);
      r.onerror = () => reject(new Error(`${this.name}.remove(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve();
    });
  }
  async keys() {
    let db = await this.db.sync();
    return new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readonly');
      let s = t.objectStore(this.name);
      let r = s.getAllKeys();
      r.onerror = () => reject(new Error(`${this.name}.keys() failed: ${r.error}`));
      r.onsuccess = () => resolve(r.result);
    });
  }
}

export function hsl2rgb(h, s = 1.0, l = 0.5) {
  if (!s) return [l, l, l];

  let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  let p = 2 * l - q;
  let r = hue2rgb(p, q, h + 1 / 3);
  let g = hue2rgb(p, q, h);
  let b = hue2rgb(p, q, h - 1 / 3);

  return [r, g, b];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function rgb2hsl(r, g, b) {
  let vmax = max(r, g, b);
  let vmin = min(r, g, b);
  let c = vmax - vmin; // chroma
  let h, l = (vmax + vmin) / 2;
  let s = 0.5 * c / min(l, 1.0 - l);

  if (!c) return [0, 0, l];

  if (vmax == r) h = (g - b) / c + (g < b ? 6 : 0);
  if (vmax == g) h = (b - r) / c + 2;
  if (vmax == b) h = (r - g) / c + 4;

  return [h / 6, s, l];
}

export function rgb2hcl(r, g, b) {
  let [h, s, l] = rgb2hsl(r, g, b);
  let c = s * min(l, 1.0 - l) * 2;
  return [h, c, l];
}

export function hcl2rgb(h, c, l) {
  let s = 0.5 * c / min(l, 1.0 - l);
  return hsl2rgb(h, min(s, 1.0), l);
}

// t=0..1, returns [r,g,b]=0..1
export function blackbodyRGB(t) {
  // temperature range: 0K to 4250K, so the final RGB is white
  t = Math.max(t, 0) * 4250;

  // https://en.wikipedia.org/wiki/Planckian_locus
  let u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) / (1.0 + 8.42420235e-4 * t + 7.08145163e-7 * t * t);
  let v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) / (1.0 - 2.89741816e-5 * t + 1.61456053e-7 * t * t);

  // https://en.wikipedia.org/wiki/CIE_1960_color_space
  let d = 2 * u - 8 * v + 4;
  let x = 3 * u / d;
  let y = 2 * v / d;
  let z = 1 - x - y;

  x /= y, y /= y, z /= y;

  // https://www.cs.rit.edu/~ncs/color/t_spectr.html
  let r = +3.240479 * x - 1.537150 * y - 0.498535 * z;
  let g = -0.969256 * x + 1.875992 * y + 0.041556 * z;
  let b = +0.055648 * x - 0.204043 * y + 1.057311 * z;

  // https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law
  let t4 = sqr(sqr(t * 0.0004));

  r = clamp(r * t4);
  g = clamp(g * t4);
  b = clamp(b * t4);

  return [r, g, b];
}

// t=0..1, returns [r,g,b]=0..1
export function fireballRGB(t) {
  t = t * 1.88;
  return [clamp(t), clamp(t * t * 0.4), clamp(t * t * t * 0.15)];
}

export async function ctcheck(ctoken) {
  if (!ctoken || Date.now() < 100 + (ctoken.time || 0))
    return;
  await sleep(1);
  if (ctoken.cancelled)
    throw new Error('Cancelled');
  ctoken.time = Date.now();
}

// https://en.wikipedia.org/wiki/Lanczos_resampling
export function resampleSignal(input, output, q = 12) {
  if (typeof output == 'number')
    output = new Float32Array(Math.floor(output));

  let n = input.length, m = output.length;

  if (n == m) {
    output.set(input, 0);
    return output;
  }

  for (let j = 0; j < m; j++) {
    let t = j / m * n;
    let i = Math.round(t);
    if (i == t) {
      output[j] = input[i];
      continue;
    }

    let sum = 0.0;
    for (let k = -q; k <= q; k++)
      if (i + k >= 0 && i + k < n)
        sum += input[i + k] * lanczos(k + i - t, q);
    output[j] = sum;
  }

  return output;
}

// https://elad.cs.technion.ac.il/wp-content/uploads/2018/02/Polar_FFT_FoCM.pdf
export function rect2disk(rect, disk, { num_reps = 1, onprogress } = {}) {
  dcheck(rect.dims.length == 2);
  dcheck(disk.dims.length == 2);
  dcheck(disk.dims[0] == disk.dims[1]);

  let [nr, na] = rect.dims;
  let [n] = disk.dims;
  dcheck(n % 2 == 0);

  if (nr <= n / 4) {
    let img = rect.transpose();
    let img2 = new Float32Tensor([na, n / 2]);
    let tmp = new Float32Array(nr * 2);
    let tmp2 = new Float32Array(n);
    for (let x = 0; x < na; x++) {
      let row = img.subtensor(x);
      let row2 = img2.subtensor(x);
      tmp.set(row.data);
      webfft.interpolate_1d_re(tmp, tmp2);
      row2.data.set(tmp2.subarray(0, n / 2));
    }
    rect = img2.transpose();
    nr = n / 2;
  }

  onprogress?.call(null, 0.2);
  draw((x, y) => [x, y]);
  onprogress?.call(null, 0.4);
  draw((x, y) => [x, n - y - 1]);
  onprogress?.call(null, 0.8);
  draw((x, y) => [y, n - x - 1]);
  onprogress?.call(null, 0.8);
  draw((x, y) => [n - y - 1, x]);
  onprogress?.call(null, 1.0);

  function draw(transform) {
    let line = new Float32Array(n);
    let tmp = new Float32Array(n);
    let aa = new Float32Array(n);
    let rr = new Float32Array(n);

    for (let x = 0; x < n; x++) {
      let [x2, y2] = transform(x, 0);
      let dx = (x2 + 0.5) / n * 2 - 1; // -1..1
      let dy = (y2 + 0.5) / n * 2 - 1; // -1..1
      aa[x] = Math.atan2(dx, dy); // -PI..PI
      rr[x] = Math.hypot(dx, dy); // 0..sqrt(2)
    }

    for (let y = 0; y < n / 2; y++) {
      line.fill(0);
      tmp.fill(0);

      for (let x = 0; x < n; x++) {
        let kr = nr * rr[x] * (n - y * 2) / n; // 0..nr*sqrt(2)
        let ka = na * aa[x] / (2 * Math.PI); // -na/2..na/2
        ka = (ka + na) * num_reps % na;

        if (kr >= nr) continue;
        line[x] = interpolate2D(rect, kr, ka, true, false) || 0;
      }

      let tmp2 = tmp.subarray(y, n - y);

      //webfft.interpolate_1d_re(line, tmp2);

      for (let x = 0, xstep = 0.5; x < n; x += xstep) {
        let ny2 = (n - y * 2);
        let scale = ny2 / n;
        let xs = (x + 0.5) * scale - 0.5;
        let i = Math.floor(xs);
        let j = Math.ceil(xs);
        let v = line[x | 0] * scale * xstep;
        let s = smoothstep(xs - i);
        tmp2[(i + ny2) % ny2] += v * (1 - s);
        tmp2[j % ny2] += v * s;
      }

      for (let x = y; x < n - y; x++) {
        let [x2, y2] = transform(x, y);
        disk.data[y2 * n + x2] = tmp2[x - y];
      }
    }
  }
}

// Returns a Promise<Blob>.
export async function recordMic({ sample_rate = 48000 } = {}) {
  let mic_stream, resolve, reject;
  let audio_file = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  let ctx = {
    blob: () => audio_file,
    stop: () => stopRecording(),
    onaudiochunk: null,
  };

  async function getMicStream() {
    console.log('Requesting mic access');
    return navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 2,
        sampleSize: 16,
        sampleRate: { exact: sample_rate },
        //echoCancellation: false,
        //noiseSuppression: false,
        //autoGainControl: false,
      }
    });
  }

  async function startRecording() {
    mic_stream = await getMicStream();

    try {
      console.log('Initializing AudioRecorder');
      let recorder = new AudioRecorder(mic_stream, sample_rate);
      recorder.onaudiodata = (blob) => resolve(blob);
      recorder.onaudiochunk = (chunk) => ctx.onaudiochunk?.(chunk);
      await recorder.start();
      console.log('Started recording...');
    } catch (err) {
      await stopRecording();
      throw err;
    }
  }

  // can be invoked multiple times
  function stopRecording() {
    if (!mic_stream) return;
    console.log('Releasing the mic stream');
    let tracks = mic_stream.getTracks();
    tracks.map((t) => t.stop());
    mic_stream = null;
  }

  try {
    await startRecording();
  } catch (err) {
    reject(err);
  }

  return ctx;
}

export function approxPercentile(values, pctile, sample_size = 1000) {
  dcheck(pctile >= 0.0 && pctile <= 1.0);
  let n = values.length;
  let a = new Float32Array(Math.min(n, sample_size));
  for (let i = 0; i < a.length; i++)
    a[i] = values[Math.round(Math.random() * (n - 1))];
  a.sort();
  return a[Math.round(pctile * (a.length - 1))];
}

export function interpolateLinear(t, list) {
  dcheck(list.length >= 1);
  let n = list.length;
  let i0 = clamp(t, 0, 1) * (n - 1);
  let i1 = Math.floor(i0);
  let i2 = Math.ceil(i0);
  return mix(list[i1], list[i2], i0 - i1);
}

export function interpolate2D(a, p, q, clamp_p = false, clamp_q = false) {
  let [n, m] = a.dims;
  let p0 = Math.floor(p);
  let p1 = Math.ceil(p);
  let q0 = Math.floor(q);
  let q1 = Math.ceil(q);
  if (p1 > n - 1)
    p1 = clamp_p ? n - 1 : 0;
  if (q1 > m - 1)
    q1 = clamp_q ? m - 1 : 0;
  let qs = (q - q0);
  let ps = (p - p0);
  let a00 = a.data[p0 * m + q0];
  let a01 = a.data[p0 * m + q1];
  let a10 = a.data[p1 * m + q0];
  let a11 = a.data[p1 * m + q1];
  let a0 = mix(a00, a01, qs);
  let a1 = mix(a10, a11, qs);
  return mix(a0, a1, ps);
}

export function interpolateSmooth(sig, t, kernel_size = 2, wrap = false) {
  if (t < 0.0 || t > 1.0) {
    if (!wrap)
      return 0.0;
    t = (t + 1.0) % 1.0;
  }

  let n = sig.length;
  let i0 = t * (n - 1);
  let imin = Math.floor(i0 - kernel_size);
  let imax = Math.ceil(i0 + kernel_size);
  let sum = 0.0;

  for (let i = imin; i <= imax; i++) {
    let j = !wrap ? clamp(i, 0, n - 1) : (i & (n - 1));
    sum += sig[j] * lanczos(i - i0, kernel_size);
  }

  return sum;
}

export function sumArray(a) {
  let sum = 0.0;
  for (let i = 0; i < a.length; i++)
    sum += a[i];
  return sum;
}

class Deque {
  constructor(maxlen) {
    // data[head..(tail-1)]
    this.data = new Float32Array(maxlen);
    this.head = 0;
    this.tail = 0;
  }

  size() {
    return this.tail - this.head;
  }

  left() {
    return this.data[this.head % this.data.length];
  }

  right() {
    return this.data[(this.tail - 1) % this.data.length];
  }

  push(value) {
    this.data[this.tail++ % this.data.length] = value;
  }

  pop() {
    return this.data[--this.tail % this.data.length];
  }

  popLeft() {
    return this.data[this.head++ % this.data.length];
  }
}

export class SlidingWindowMax {
  constructor(len) {
    this.window = new Deque(len);
    this.deque = new Deque(len);
    this.len = len;
    this.num = 0;
  }

  max() {
    return this.deque.left();
  }

  push(x) {
    let dq = this.deque, win = this.window;

    if (win.size() == this.len) {
      if (dq.left() == win.left())
        dq.popLeft();
      win.popLeft();
    }

    while (dq.size() > 0 && dq.right() <= x)
      dq.pop();

    dq.push(x);
    win.push(x);
  }
}

export class SlidingWindowMinMax {
  constructor(maxlen) {
    this.pos = new SlidingWindowMax(maxlen);
    this.neg = new SlidingWindowMax(maxlen);
  }

  range() {
    return this.pos.max() + this.neg.max();
  }

  push(x) {
    this.pos.push(+x);
    this.neg.push(-x);
  }
}

export class MinMaxFilter {
  constructor(len) {
    this.count = 0;
    this.min = +Infinity;
    this.max = -Infinity;
    this.tmp = new Float32Array(len);
  }

  range() {
    return this.count > 0 ? this.max - this.min : 0;
  }

  push(x) {
    this.count++;
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
  }

  reset() {
    this.count = 0;
    this.min = +Infinity;
    this.max = -Infinity;
  }
}

class HaarFilter {
  constructor() {
    this.n = 0;
    this.prev = 0;
    this.hipass = null;
    this.lopass = null;
  }

  push(x) {
    this.n++;
    if (this.n % 2 == 0) {
      this.hipass.push((x - this.prev) * 0.5);
      this.lopass.push((x + this.prev) * 0.5);
    } else {
      this.prev = x;
    }
  }

  reset() {
    this.n = 0;
    this.prev = 0;
  }
}

export class DWTFilter {
  constructor(n = 0) {
    this.haar = [];
    this.minmax = [];

    for (let i = 0; i < n; i++) {
      this.minmax[i] = new MinMaxFilter;
      this.haar[i] = new HaarFilter;
    }

    this.minmax[n] = new MinMaxFilter;
    this.minmax[n + 1] = new MinMaxFilter;

    for (let i = 0; i < n; i++) {
      this.haar[i].hipass = this.minmax[i + 1];
      this.haar[i].lopass = this.haar[i + 1] || this.minmax[n + 1];
    }
  }

  // -1  = the entire signal
  // n   = hi-pass level n
  // 1   = hi-pass level 1
  // 0   = lo-pass level 0
  range(i) {
    let n = this.minmax.length;
    i = ((n - 1 - i) % n + n) % n
    return this.minmax[i].range;
  }

  push(x) {
    this.minmax[0].push(x);
    this.haar[0].push(x);
  }

  reset() {
    for (let h of this.haar)
      h.reset();
    for (let mm of this.minmax)
      mm.reset();
  }
}

// Return value: 0..1/2. Maps to 0..sample_rate/2.
export function meanFreq(sound, sample_rate) {
  dcheck(sound instanceof Float32Array);
  let n = sound.length;
  let a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++)
    a[i * 2] = sound[i];

  webfft.fft_1d(a);

  let sum1 = 0, sum2 = 0;
  for (let i = 1; i < n / 2; i++) {
    let re = a[i * 2], im = a[i * 2 + 1];
    let sqr = re * re + im * im;
    sum1 += i * sqr;
    sum2 += sqr;
  }

  return !sum2 ? 0 : sum1 / sum2 / n * sample_rate; // 0..SR/2
}

// 0..1 maps to 0..360 deg
export function meanPitch(freq_hz) {
  let c8_hz = 4434; // https://en.wikipedia.org/wiki/Piano_key_frequencies
  return freq_hz > 0 ? ((Math.log2(freq_hz / c8_hz) % 1) + 1) % 1 : 0;
}

export function pitchToNote(pitch) {
  dcheck(pitch >= 0 && pitch <= 1);
  let notes = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  let index = Math.round(pitch * 12) % 12;
  return notes[index];
}

export class DrawingArea {
  constructor(t2d, [xmin, xmax], [ymin, ymax]) {
    dcheck(t2d instanceof Float32Tensor);
    dcheck(t2d.dims.length == 2);
    this.t2d = t2d;
    this.xmin = xmin;
    this.xmax = xmax;
    this.ymin = ymin;
    this.ymax = ymax;
  }

  addXY(x, y, diff = 1) {
    let i = this.offsetXY(x, y);
    if (i >= 0)
      this.t2d.data[i] += diff;
  }

  offsetRA(rad, phi) {
    return this.offsetXY(rad * Math.cos(phi), rad * Math.sin(phi));
  }

  offsetXY(x, y) {
    let [h, w] = this.t2d.dims;
    let xx = Math.round(w * (x - this.xmin) / (this.xmax - this.xmin));
    let yy = Math.round(h * (y - this.ymin) / (this.ymax - this.ymin));
    if (xx >= 0 && yy >= 0 && xx < w && yy < h)
      return yy * w + xx;
    return -1;
  }
}
