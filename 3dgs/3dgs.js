const uargs = new URLSearchParams(location.search);
const isEmbedded = uargs.get('iframe') == '1';
const [CW, CH] = (uargs.get('n') || '60x300').split('x').map(x => +x);
const sid = parseFloat('0.' + (uargs.get('sid') || '')) || Math.random();
const sphRadius = +uargs.get('r') || 2.0;
const camDist = +uargs.get('cam') || 1.5;
const backgroundURL = uargs.get('bg') || '/img/bb3.jpg';
const colorRGBA = (uargs.get('c') || '0.1,0.2,0.3,1.0').split(',').map(x => +x || 0);
const useAdditiveBlending = +uargs.get('blend') || 0;
const imgSize = (uargs.get('i') || '0x0').split('x').map(x => +x);
const timespan = (uargs.get('t') || '1x1').split('x').map(x => +x);
const rotation = +uargs.get('rot') || 0;
const signature = uargs.get('l') || '@soundform.art';
const dxdy = (uargs.get('dxdy') || '0,1').split(',').map(x => +x || 0);
const quality = +uargs.get('q') || 1.0;
const aperture = +uargs.get('aperture') || 0;
const numFrames = +uargs.get('numf') || (Math.hypot(...dxdy) > 0 ? 10000 : 0);
const stringAmps = (uargs.get('amps') || '0').split(',').map(x => +x || 0);

import * as THREE from "three";
import Stats from 'three/addons/libs/stats.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SavePass } from 'three/addons/postprocessing/SavePass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, PackedSplats, dyno } from "@sparkjsdev/spark";

import * as utils from '../lib/utils.js';
const { $, mix, clamp, check, fract, DEBUG } = utils;

if (!isEmbedded) {
  $('h1').style.display = '';
  $('.wave_spanner').style.display = '';
}

document.body.classList.toggle('debug', DEBUG && !isEmbedded);

const img = {
  get width() { return imgSize[0] || window.innerWidth; },
  get height() { return imgSize[1] || window.innerHeight; },
};

console.log('Color:', colorRGBA.map(x => x.toFixed(2)).join(','));

const stats = { numSplats: 0, prevFrames: 0 };
const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, img.width / img.height, 0.001, 1000);
camera.position.set(camDist, camDist, camDist);
const renderer = new THREE.WebGLRenderer(
  { canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });

const spark = new SparkRenderer({ renderer, view: { sort32: true }, material: initMaterial });
scene.add(spark);

if (quality == 1) {
  spark.maxStdDev = 4;
  spark.apertureAngle = aperture ? Math.PI / aperture : 0;
  spark.focalDistance = 0;
  spark.focalAdjustment = 2;
}

window.camera = camera;
window.scene = scene;
window.spark = spark;

const animateTime = dyno.dynoFloat(0);
const animateFrame = dyno.dynoInt(0);

const controls = new OrbitControls(camera, canvas);
controls.minDistance = 0;
controls.maxDistance = 10;

const statsUI = new Stats();
statsUI.domElement.classList.add('debug');
statsUI.domElement.id = 'fps';
statsUI.domElement.style = isEmbedded ? 'none' : '';
document.body.appendChild(statsUI.domElement);

$('#pause').onclick = () => setControlsEnabled(!controls.enabled);
$('#audio').onclick = () => initAudioMesh();

const worker = new Worker('./worker.js', { type: 'module' });
let gsm0 = null;

const editor = {
  view: null,

  get text() {
    return dyno.unindent(editor.view ?
      editor.view.state.doc.toString() : gsm0.shader);
  },

  set text(str) {
    editor.view?.dispatch({
      changes: { from: 0, to: editor.text.length, insert: str }
    });
  }
};

window.editor = editor;

await generateSplats('string');
console.log('Mesh size:', CW + 'x' + CH);
console.log('Num meshes:', scene.children.filter(m => m.numSplats > 0).length);

let recorder = null;

function startRecording() {
  let stream = canvas.captureStream(30);
  recorder = new MediaRecorder(stream);

  recorder.ondataavailable = (e) => {
    let blob = new Blob([e.data], { type: 'video/webm' });
    let url = URL.createObjectURL(blob);
    console.log('Recorded video:', url);
  };

  recorder.start();
}

function stopRecording() {
  recorder.stop();
}

window.startRecording = startRecording;
window.stopRecording = stopRecording;

function setControlsEnabled(v) {
  controls.enabled = v;
  if (v) stats.prevFrames = animateFrame.value;
  document.body.classList.toggle('paused', !controls.enabled);
}

function initMaterial(mat) {
  console.log('Blending mode:', useAdditiveBlending ? 'additive' : 'normal');
  if (!useAdditiveBlending)
    return mat;
  mat.vertexShader = mat.vertexShader
    .replace('out vec3 vNdc;', 'out vec3 vNdc; out vec2 vNdcOffset; out vec2 vNdcScales;')
    .replace('vNdc = ndc;', 'vNdc = ndc; vNdcOffset = ndcOffset; vNdcScales = 2.0/scaledRenderSize*min(vec2(MAX_PIXEL_RADIUS),maxStdDev*sqrt(vec2(eigen1,eigen2)));');
  //console.debug(mat.vertexShader);
  mat.fragmentShader = mat.fragmentShader
    .replace('in vec3 vNdc;', 'in vec3 vNdc; in vec2 vNdcOffset; in vec2 vNdcScales;')
    .replace('void main()', 'void mainSpark()');
  mat.fragmentShader += '\n' + $('#spark-frag-glsl').textContent;
  //console.debug(mat.fragmentShader);
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  return mat;
}

function updateTextureMesh() {
  for (let name in gsm0.uniforms) {
    let uniform = gsm0.uniforms[name];
    if (!uniform.shape || !uniform.data)
      continue;

    let [h, w, ch = 1] = uniform.shape;
    let fmt = [0, THREE.RedFormat, THREE.RGFormat, THREE.RGBFormat, THREE.RGBAFormat][ch];
    utils.dcheck(ch > 0 && fmt > 0);

    let tex = new THREE.DataTexture(
      uniform.data, w, h, fmt, THREE.FloatType);
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    gsm0.textures[name] = dyno.dynoSampler2D(tex);
  }
}

function splitMeshIntoChunks(gsm, chunk = CW * 512) {
  return [gsm];
}

function appendMesh(gsm) {
  stats.numSplats += gsm.numSplats;

  // Spark rounds down to 2048
  const packedArray = new Uint32Array(4 * 2048 * Math.ceil(gsm.numSplats / 2048));
  const packedSplats = new PackedSplats({ packedArray });
  const mesh = new SplatMesh({ packedSplats });
  //mesh.quaternion.set(0, 0, 0, 0);
  //mesh.position.set(0, 0, 0);
  scene.add(mesh);

  const uniforms = {};

  uniforms.iTime = animateTime;
  uniforms.iFrame = animateFrame;
  uniforms.iDxDy = dyno.dynoVec2(dxdy);

  for (let name in gsm.uniforms) {
    let uni = gsm.uniforms[name];

    if (gsm.textures[name]) {
      uniforms[name] = gsm.textures[name];
      let [h, w, ch] = uni.shape;
      uniforms[name + 'Size'] = dyno.dynoVec3([w, h, ch]);
    } else if (uni.length > 0) {
      let vecN = [0, 0, dyno.dynoVec2, dyno.dynoVec3, dyno.dynoVec4][uni.length];
      uniforms[name] = vecN(uni);
    } else if (Number.isFinite(uni)) {
      uniforms[name] = dyno.dynoFloat(uni);
    } else {
      utils.dcheck('Unknown uniform type: ' + uni);
    }
  }

  const inTypes = {};

  for (let name in uniforms)
    inTypes[name] = uniforms[name].type;

  mesh.objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, ...inTypes },
        outTypes: { gsplat: dyno.Gsplat },
        globals: ({ inputs }) => [
          ...Object.keys(uniforms).map(
            name => `#define ${name} ${inputs[name]}`),
          dyno.unindent(editor.text),
        ],
        statements: ({ inputs, outputs }) => [
          `Gsplat gs = ${inputs.gsplat};`,
          `gs.rgba = vec4(1);`,
          `gs.center = vec3(0);`,
          `gs.scales = vec3(1)/sqrt(${gsm.numSplats}.);`,
          `gs.flags |= gs.index < ${gsm.numSplats} ? 1u : 0u;`,
          `mainSplatModifier(gs);`,
          `gs.scales *= ${sphRadius.toFixed(3)};`,
          `${outputs.gsplat} = gs;`,
        ],
      });
      return d.apply({ gsplat, ...uniforms });
    });

  mesh.updateGenerator();
  return mesh;
}

function clearScene() {
  for (let m of scene.children) {
    if (m.numSplats > 0) {
      scene.remove(m);
      m.dispose();
      m.numSplats = 0;
    }
  }
  stats.numSplats = 0;
  gsm0 = {};
  updateTextureMesh();
  clearAccumulator();
}

$('#download').onclick = () => downloadMesh();

console.log('Scene size:', (stats.numSplats / 1e6).toFixed(1), 'M splats');

const tonemappingPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: $('#vert-glsl').textContent,
  fragmentShader: $('#tonemapping-glsl').textContent,
});
const sunraysPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    iTime: { value: 0 },
  },
  vertexShader: $('#vert-glsl').textContent,
  fragmentShader: $('#sunrays-glsl').textContent,
});
const vignettePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tSignature: { value: null },
    tImageLogo: { value: null },
  },
  vertexShader: $('#vert-glsl').textContent,
  fragmentShader: $('#vignette-glsl').textContent,
});
const savePass = new SavePass(
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType }));
const accumulatorPass = new ShaderPass({
  uniforms: {
    iNumFrames: { value: numFrames },
    tDiffuse: { value: null },
    tAccumulator: { value: null },
  },
  vertexShader: $('#vert-glsl').textContent,
  fragmentShader: $('#accumulator-glsl').textContent,
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (useAdditiveBlending)
  composer.addPass(tonemappingPass);
//composer.addPass(sunraysPass);
composer.addPass(vignettePass);
composer.addPass(accumulatorPass);
composer.addPass(savePass);
accumulatorPass.uniforms.tAccumulator.value = savePass.renderTarget.texture;
composer.addPass(new TexturePass(accumulatorPass.uniforms.tAccumulator.value));

controls.addEventListener('change', clearAccumulator);

function clearAccumulator() {
  stats.prevFrames = animateFrame.value;
  renderer.setRenderTarget(savePass.renderTarget);
  renderer.clear();
}

function resizeCanvas() {
  const w = img.width, h = img.height;

  if (w != canvas.width || h != canvas.height) {
    //console.debug('Resizing canvas:', w, h);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

renderer.setAnimationLoop((time) => {
  if (!controls.enabled)
    return;

  if (animateFrame.value - stats.prevFrames > 500) {
    setControlsEnabled(false);
    return;
  }

  if (aperture > 0) {
    let p = camera.position;
    spark.focalDistance = Math.hypot(p.x, p.y, p.z);
  }

  animateTime.value = time / 1000;
  animateFrame.value += 1;
  scene.children.map(m => m.numSplats > 0 && m.updateVersion());
  resizeCanvas();
  controls.update();
  statsUI.update();

  scene.rotation.y = time / 1000 * rotation;

  //renderer.render(scene, camera);
  //sunraysPass.uniforms.iTime.value = time / 1000;
  composer.render();
});

window.addEventListener('resize', () => {
  setTimeout(resizeCanvas, 500);
});

if (!isEmbedded) {
  //initImageLogoTexture();
  initSignatureTexture();
}
initSceneBackground();
initCodeMirror();

async function initCodeMirror() {
  const { basicSetup } = await import("/lib/codemirror/codemirror.js");
  const { EditorView, EditorState } = await import("/lib/codemirror/@codemirror_view.js");
  const { glsl } = await import("/lib/codemirror/codemirror-lang-glsl.js");
  const { oneDark } = await import("/lib/codemirror/codemirror-theme-one-dark.js");

  editor.view = new EditorView({
    doc: editor.text,
    parent: $('#codemirror'),
    extensions: [basicSetup, glsl(), oneDark],
  });

  editor.view.dom.addEventListener('focusin', (e) => {
    setControlsEnabled(false);
  });

  editor.view.dom.addEventListener('focusout', (e) => {
    //console.log('Updating SplatMesh GLSL...');
    scene.children.map(m => m.numSplats > 0 && m.updateGenerator());
    clearAccumulator();
    setControlsEnabled(true);
  });

  $('#show_code').onclick = () => {
    document.body.classList.toggle('codemirror');
  };
}

function interpolateX(res, src, [xmin, xmax], [ymin, ymax], a = 0) {
  let w = xmax - xmin, h = ymax - ymin;
  check(res.length == w * h * 4);
  check(src.length >= xmax * ymax * 4);
  check(a >= 0 && a <= 1);

  for (let y = ymin; y < ymax; y++) {
    for (let x = xmin; x < xmax; x++) {
      let r4 = 4 * (w * (y - ymin) + (x - xmin));
      let i4 = 4 * (w * y + x);
      let j4 = 4 * (w * y + (x + 1) % w);

      for (let k = 0; k < 4; k++)
        res[r4 + k] = mix(src[i4 + k], src[j4 + k], a);
    }
  }
}

function interpolateY(res, src, w, h, a = 0) {
  check(res.length == w * h * 4);
  check(src.length == w * h * 4);
  check(a >= 0 && a <= 1);

  for (let y = 0; y < h; y++) {
    let t = (y + a) / h * (h - 1);
    let s = fract(t);
    check(t >= 0 && t <= h - 1);

    for (let x = 0; x < w; x++) {
      let i4 = 4 * (x + w * Math.floor(t));
      let j4 = 4 * (x + w * Math.ceil(t));
      let r4 = 4 * (x + w * y);

      for (let k = 0; k < 4; k++)
        res[r4 + k] = mix(src[i4 + k], src[j4 + k], s);
    }
  }
}

async function downloadMesh() {
  let gsm = {};
  console.log('Enumerating splats...');
  gsm.xyzw = new Float32Array(stats.numSplats * 4);
  gsm.rgba = new Float32Array(stats.numSplats * 4);
  let index = 0;

  for (let mesh of scene.children) {
    if (!mesh.numSplats)
      continue;
    mesh.forEachSplat((splatId, center, scales, quaternion, opacity, color) => {
      let i = index++;
      if (i >= gsm.rgba.length / 4)
        return;

      gsm.xyzw[4 * i + 0] = center.x;
      gsm.xyzw[4 * i + 1] = -center.y;
      gsm.xyzw[4 * i + 2] = center.z;
      gsm.xyzw[4 * i + 3] = scales.x;

      gsm.rgba[4 * i + 0] = color.r;
      gsm.rgba[4 * i + 1] = color.g;
      gsm.rgba[4 * i + 2] = color.b;
      gsm.rgba[4 * i + 3] = opacity;
    });
  }

  console.log('Creating a .ply file...');
  const ply = await import("../lib/ply.js");
  const blob = ply.exportPLY(gsm.xyzw.length / 4, 1, gsm.xyzw, gsm.rgba);
  console.log('.ply file size:', (blob.size / 1e6).toFixed(1), 'MB');
  check(blob.size > 0);

  let file = new File([blob], 'soundform' + CW + 'x' + CH + '.ply');
  let a = document.createElement('a');
  let url = URL.createObjectURL(file);
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

async function generateSplats(name = 'sphere', audio = null) {
  let cw = CW, ch = CH, ts = Date.now();
  let depth = +uargs.get('depth') || 3;

  gsm0 = await new Promise((resolve, reject) => {
    worker.onmessage = (e) =>
      resolve(e.data);
    worker.postMessage({
      type: 'mesh', name, cw, ch,
      args: { sid, audio, rgb: colorRGBA, depth, timespan, amps: stringAmps }
    });
  });

  gsm0.numSplats = cw * ch;
  gsm0.textures = {};

  for (let name in gsm0.uniforms) {
    let u = gsm0.uniforms[name];
    if (!u.shape || !u.data)
      continue;
    let [h, w, ch = 1] = u.shape;
    utils.dcheck(h > 0 && w > 0 && ch > 0);
    gsm0.uniforms[name] = new utils.Float32Tensor([h, w, ch], u.data);
  }

  console.debug('Mesh ready:', 'type=' + name, Date.now() - ts, 'ms',
    (cw * ch / 4e6).toFixed(1), 'M splats, sid=' + (sid + '').replace('0.', ''));

  let chunks = splitMeshIntoChunks(gsm0);
  console.debug('Mesh split into', chunks.length, 'chunks');
  updateTextureMesh();
  chunks.map(gsm => appendMesh(gsm));
  editor.text = gsm0.shader;
}

// https://sparkjs.dev/docs/packed-splats
function packSplats({ xyzw, rgba }) {
  let n = xyzw.length / 4;
  let m = Math.ceil(n / 2048) * 2048;
  let sbig = 0;

  let uint32 = new Int32Array(xyzw.buffer);
  let bytes = new Uint8ClampedArray(m * 16);
  let data = new DataView(bytes.buffer);

  for (let i = 0; i < n; i++) {
    bytes[i * 16 + 0] = rgba[i * 4 + 0] * 255; //  R
    bytes[i * 16 + 1] = rgba[i * 4 + 1] * 255; //  G
    bytes[i * 16 + 2] = rgba[i * 4 + 2] * 255; //  B
    bytes[i * 16 + 3] = rgba[i * 4 + 3] * 255; //  A

    data.setInt16(i * 16 + 4, float16(uint32[i * 4 + 0]), true); // X
    data.setInt16(i * 16 + 6, float16(uint32[i * 4 + 1]), true); // Y
    data.setInt16(i * 16 + 8, float16(uint32[i * 4 + 2]), true); // Z

    let s = xyzw[i * 4 + 3]; // W
    let logs = (Math.log(s) / 9 + 1) / 2 * 255;
    logs = clamp(Math.round(logs), 1, 255);
    if (s <= 0) logs = 0;

    if (s > 0.03) sbig++;

    bytes[i * 16 + 12] = logs; //  X scale
    bytes[i * 16 + 13] = logs; //  Y scale
    bytes[i * 16 + 14] = logs; //  Z scale
  }

  if (sbig > 5000)
    throw new Error('Too many big splats: ' + sbig);

  return new Uint32Array(data.buffer);
}

function float16(float32) {
  let b = float32 + 0x00001000;
  let e = (b & 0x7F800000) >> 23;
  let m = b & 0x007FFFFF;
  return (b & 0x80000000) >> 16 | (e > 143) * 0x7FFF |
    (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) |
    ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1);
}

async function initAudioMesh() {
  let blob = await utils.selectAudioFile();
  if (!blob) return;
  let audio = {};
  audio.channels = await utils.decodeAudioFile2(blob);
  console.log('Opened ' + blob.name + ':',
    audio.channels.map(ch => ch.length).join(','), 'samples');

  clearScene();
  await generateSplats('audio', audio);
  setControlsEnabled(true);
}

async function initSceneBackground() {
  if (backgroundURL.indexOf('.') > 0) {
    let loader = new THREE.TextureLoader();
    let texture = await loader.load(backgroundURL);
    scene.background = texture;
  } else {
    scene.background = new THREE.Color('#' + backgroundURL);
  }
}

async function initSignatureTexture(text = signature) {
  let logo = await import("../lib/logo.js");
  let size = 50 * renderer.domElement.height / 2160 | 0;
  let { canvas } = await logo.createLogoTexture(text, size);
  vignettePass.uniforms.tSignature.value = new THREE.CanvasTexture(canvas);
}

async function initImageLogoTexture() {
  let loader = new THREE.TextureLoader();
  let tex = await loader.load('/img/favicon.png');
  vignettePass.uniforms.tImageLogo.value = tex;
}
