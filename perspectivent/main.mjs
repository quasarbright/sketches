import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  parseExpr, backPlaneF, backPlaneText, convergenceDepth, normalizedLens, compileLens,
  LUT, sampleLens, PRESETS, linearS, NEAR,
} from "./lens.mjs";
import { drawDiagram, lutFn } from "./diagram.mjs";

const $ = (id) => document.getElementById(id);
const isBg = new URLSearchParams(location.search).has("background");

/* =====================================================================
 * renderer
 * ===================================================================== */
const canvas = $("c");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  if (!renderer.capabilities.isWebGL2) throw new Error("no webgl2");
} catch (e) {
  $("nogl").style.display = "grid";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xdde8f1); // the sky's horizon color, behind the sky dome

const scene = new THREE.Scene();
// The camera object only supplies the view matrix. Projection happens in the lens shader.
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, LUT.zMax);
const FOV = 60 * Math.PI / 180;

/* =====================================================================
 * the lens, on the GPU
 * Every material gets its projection replaced: a point at view-space (x, y, -z) lands at
 * x / (hx * gx(z)), y / (hy * gy(z)), where g is the normalized lens read from a lookup table.
 * The clip-space w is gy(z), so the GPU's own clipping drops whatever no ray reaches (g <= 0),
 * and for the back-plane family this is an exact projective map.
 * ===================================================================== */
const lutData = new Float32Array(LUT.N * 4);   // RGBA: gx, gy, unused, unused
const lutTex = new THREE.DataTexture(lutData, LUT.N, 1, THREE.RGBAFormat, THREE.FloatType);
lutTex.minFilter = lutTex.magFilter = THREE.NearestFilter;
lutTex.needsUpdate = true;

const FAR = LUT.zMax;
const lensUniforms = {
  lensLUT: { value: lutTex },
  lensHalf: { value: new THREE.Vector2(1, 1) },
  lensRange: { value: new THREE.Vector4(NEAR, FAR, LUT.a0, LUT.a1) },
  lensC: { value: LUT.C },
};

const LENS_PARS = /* glsl */`
uniform sampler2D lensLUT;
uniform vec2 lensHalf;
uniform vec4 lensRange;   // near, far, asinh(zMin/C), asinh(zMax/C)
uniform float lensC;
varying float vLensDepth;
vec2 lensG(float z) {
  float t = (asinh(z / lensC) - lensRange.z) / (lensRange.w - lensRange.z);
  float fi = clamp(t, 0.0, 1.0) * ${(LUT.N - 1).toFixed(1)};
  int i0 = int(floor(fi));
  int i1 = min(i0 + 1, ${LUT.N - 1});
  vec2 a = texelFetch(lensLUT, ivec2(i0, 0), 0).rg;
  vec2 b = texelFetch(lensLUT, ivec2(i1, 0), 0).rg;
  return mix(a, b, fract(fi));
}
vec4 lensProject(vec4 mv) {
  float z = -mv.z;
  vec2 g = lensG(z);
  float w = g.y;
  float zl = 2.0 * (z - lensRange.x) / (lensRange.y - lensRange.x) - 1.0;
  vLensDepth = (z - lensRange.x) / (lensRange.y - lensRange.x);
  vec4 p = vec4(mv.x / lensHalf.x * (w / g.x), mv.y / lensHalf.y, zl * w, w);
  if (g.x <= 0.0) p.z = 2.0 * abs(w) + 1.0;   // no ray reaches this side-to-side: clip it
  return p;
}
`;

function lensify(mat, extra) {
  // three.js caches compiled programs by onBeforeCompile's source text, which is the same for
  // every material here, so materials with extra shader code need their own key
  mat.customProgramCacheKey = () => "lens:" + (extra ? extra.toString() : "");
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lensUniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + LENS_PARS)
      .replace("#include <project_vertex>",
        THREE.ShaderChunk.project_vertex.replace(
          "gl_Position = projectionMatrix * mvPosition;", "gl_Position = lensProject(mvPosition);"));
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vLensDepth;")
      .replace("#include <dithering_fragment>",
        "#include <dithering_fragment>\ngl_FragDepth = clamp(vLensDepth, 0.0, 1.0);");
    if (extra) extra(sh);
  };
  return mat;
}

/* =====================================================================
 * lens state (what the panel edits)
 * ===================================================================== */
const state = {
  D: 10,          // screen distance (m)
  split: false,
  active: "x",    // which field the presets and slider apply to when split
  x: { src: "z", s: 0 },   // s is the back-plane size, or null when the lens isn't in that family
  y: { src: "z", s: 0 },
};
// what's currently on the GPU, possibly mid-morph between two lenses
const shown = new Float32Array(LUT.N * 2);
let morph = null; // { from: Float32Array, to: Float32Array, t0, dur }

function axisFn(ax) {
  const a = state[ax];
  if (a.s != null) return backPlaneF(a.s, state.D);
  return parseExpr(a.src);
}
// back-plane size of an axis: from the slider, or recognized from a typed straight line
function effS(ax) {
  const a = state[ax];
  if (a.s != null) return a.s;
  try { return linearS(parseExpr(a.src), state.D); } catch { return null; }
}
function targetSamples() {
  const gx = normalizedLens(axisFn("x"), state.D);
  const gy = normalizedLens(axisFn(state.split ? "y" : "x"), state.D);
  if (!gx || !gy) return null;
  return sampleLens(gx, gy, undefined, NEAR);
}
function uploadShown() {
  for (let i = 0; i < LUT.N; i++) {
    lutData[4 * i] = shown[2 * i];
    lutData[4 * i + 1] = shown[2 * i + 1];
  }
  lutTex.needsUpdate = true;
}
function applyLens(animate) {
  const t = targetSamples();
  if (!t) return;
  if (animate) {
    morph = { from: shown.slice(), to: t, t0: performance.now(), dur: 900 };
  } else {
    morph = null;
    shown.set(t);
    uploadShown();
  }
}
function stepMorph(now) {
  if (!morph) return false;
  const u = Math.min(1, (now - morph.t0) / morph.dur);
  const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in-out
  const { from, to } = morph;
  for (let i = 0; i < shown.length; i++) shown[i] = from[i] + (to[i] - from[i]) * k;
  uploadShown();
  if (u >= 1) morph = null;
  return true;
}

/* =====================================================================
 * the world
 * Everything is cut into small pieces so curved lenses bend edges smoothly.
 * ===================================================================== */
const COL = {
  ground: 0x5f8a43, ballast: 0x8c877e, tie: 0x6b513c, rail: 0xc3c8cf, pole: 0x7a5f45,
  chalk: 0xe9e4d8, ochre: 0xd6a756, board: 0x23262c, red: 0xe8553d, blue: 0x5aa9e6,
};
const lambert = (color, extra) => lensify(new THREE.MeshLambertMaterial({ color }), extra);
const colliders = []; // { min: Vector3, max: Vector3 }

// Curved lenses (1/z) bend the lower rays up out of the ground, so they meet things from below.
// The ground hides a sunken box from there, unless the box still has a bottom face under it.
function openBottom(geo) {
  const g = geo.groups[3], idx = Array.from(geo.index.array); // BoxGeometry's -y face
  idx.splice(g.start, g.count);
  geo.setIndex(idx); geo.clearGroups();
  return geo;
}

function addBox(w, h, d, x, y, z, color, { collide = false, seg = 0.5, mat } = {}) {
  const onGround = y === 0;
  if (onGround) { y = -0.05; h += 0.05; } // sink into the ground so no seam shows at its foot
  const geo = new THREE.BoxGeometry(w, h, d,
    Math.max(1, Math.ceil(w / seg)), Math.max(1, Math.ceil(h / seg)), Math.max(1, Math.ceil(d / seg)));
  if (onGround) openBottom(geo);
  const m = new THREE.Mesh(geo, mat || lambert(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  if (collide) colliders.push({
    min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
  });
  return m;
}

// ground: a grid that follows you, dense near you and coarse far away (sinh-spaced rows), with
// grid lines drawn per pixel in world space so they never swim.
const groundGeo = (() => {
  const n = 320, c = 3, A = Math.asinh(4000 / c);
  const g = new THREE.PlaneGeometry(2, 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, c * Math.sinh(p.getX(i) * A));
    p.setZ(i, c * Math.sinh(p.getZ(i) * A));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
})();
const groundMat = lambert(COL.ground, (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vGroundW;")
    .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGroundW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vGroundW;\n" + /* glsl */`
      float pvGrid(vec2 p, float spacing, float width) {
        vec2 q = p / spacing;
        vec2 fw = fwidth(q);
        vec2 d = abs(fract(q - 0.5) - 0.5) / max(fw, 1e-5);
        float line = 1.0 - clamp(min(d.x, d.y) - width, 0.0, 1.0);
        float fade = 1.0 - smoothstep(0.15, 0.5, max(fw.x, fw.y)); // drop lines finer than a pixel
        return line * fade;
      }`)
    .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal *= faceDirection;")
    .replace("#include <dithering_fragment>", /* glsl */`
      // a little variation so the grass isn't flat paint, then a faint grid
      float n = fract(sin(dot(floor(vGroundW.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor.rgb *= 0.94 + 0.08 * n;
      float minor = pvGrid(vGroundW.xz, 1.0, 0.0);
      float major = pvGrid(vGroundW.xz, 10.0, 0.6);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.18, minor * 0.5);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.35, major * 0.6);
      #include <dithering_fragment>`);
});
// Curved lenses (1/z) bend rays so they come up to the ground from below. The point they hit is
// still the same patch of grass, so both sides look and light the same.
groundMat.side = THREE.DoubleSide;
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// the railroad: ballast, ties, two rails, straight to the horizon
const TRACK_START = 30, TRACK_LEN = 3000, GAUGE = 1.435;
{
  const len = TRACK_LEN, zc = TRACK_START - len / 2;
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, len, 2, 1, len / 2), lambert(COL.ballast));
  ballast.position.set(0, 0.125, zc); ballast.receiveShadow = true; scene.add(ballast);

  const tieGeo = new THREE.BoxGeometry(2.6, 0.16, 0.24, 6, 1, 1);
  const spacing = 0.65, count = Math.floor(len / spacing);
  const ties = new THREE.InstancedMesh(tieGeo, lambert(COL.tie), count);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    mtx.makeTranslation(0, 0.25 + 0.08, TRACK_START - 0.3 - i * spacing);
    ties.setMatrixAt(i, mtx);
  }
  ties.castShadow = ties.receiveShadow = true; scene.add(ties);

  // rail: a little I-beam profile (head, web, foot), extruded along z in 1 m pieces
  const prof = new THREE.Shape();
  [[-0.075, 0], [0.075, 0], [0.075, 0.015], [0.015, 0.03], [0.012, 0.12], [0.035, 0.13],
   [0.035, 0.17], [-0.035, 0.17], [-0.035, 0.13], [-0.012, 0.12], [-0.015, 0.03], [-0.075, 0.015]]
    .forEach(([x, y], i) => (i ? prof.lineTo(x, y) : prof.moveTo(x, y)));
  const railGeo = new THREE.ExtrudeGeometry(prof, { depth: len, steps: len, bevelEnabled: false });
  const railMat = lambert(COL.rail);
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.set(sx * GAUGE / 2, 0.41, TRACK_START - len);
    r.castShadow = r.receiveShadow = true; scene.add(r);
  }
}

// telegraph poles every 50 m on the left, with sagging wires between them
{
  const n = 60, gap = 50, x = -4.5;
  const poleGeo = new THREE.CylinderGeometry(0.13, 0.16, 9, 10, 9);
  const armGeo = new THREE.BoxGeometry(2.4, 0.14, 0.14, 6, 1, 1);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(COL.pole), n);
  const arms = new THREE.InstancedMesh(armGeo, lambert(COL.pole), n);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const z = 10 - i * gap;
    poles.setMatrixAt(i, mtx.makeTranslation(x, 4.5, z));
    arms.setMatrixAt(i, mtx.makeTranslation(x, 8.4, z));
  }
  poles.castShadow = arms.castShadow = true;
  scene.add(poles, arms);
  const wirePts = [];
  for (const dx of [-1, 1]) for (let i = 0; i < n - 1; i++) {
    const z0 = 10 - i * gap;
    const seg = 16;
    for (let k = 0; k < seg; k++) {
      for (const kk of [k, k + 1]) {
        const t = kk / seg;
        wirePts.push(x + dx, 8.55 - 1.4 * 4 * t * (1 - t), z0 - t * gap);
      }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wg, lensify(new THREE.LineBasicMaterial({ color: 0x15171b }))));
}

// distance signs on the right of the track, all the same size, so far ones are only readable
// with a lens that doesn't shrink them
const SIGN_DISTS = [10, 25, 50, 100, 200, 400, 800, 1600];
async function buildSigns() {
  try { await document.fonts.load("700 120px 'JetBrains Mono'"); } catch {}
  for (const d of SIGN_DISTS) {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#23262c"; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = "#e9e4d8"; g.lineWidth = 10; g.strokeRect(14, 14, 484, 228);
    g.fillStyle = "#e9e4d8"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 124px 'JetBrains Mono', monospace";
    g.fillText(`${d} m`, 256, 134);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const z = -d;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5, 6, 3),
      lensify(new THREE.MeshBasicMaterial({ map: tex })));
    board.position.set(3.6, 3.2, z);
    scene.add(board);
    const back = addBox(3.1, 1.6, 0.08, 3.6, 2.4, z - 0.06, COL.board);
    back.castShadow = true;
    addBox(0.12, 2.4, 0.12, 3.6, 0, z - 0.06, COL.pole, { seg: 0.5 });
  }
}
buildSigns();

// a suburb on the left, behind the power lines: two rows of houses with gable roofs, facing the
// tracks, and a tree in most yards. All of it is merged into one mesh with per-vertex colors.
{
  const rnd = mulberry(11);
  const WALLS = [0xe8dcc0, 0xa9b89a, 0x9fb7c9, 0xa65a46, 0xecebe6, 0xe3c76a, 0xc9b49a];
  const ROOFS = [0x4a3f3a, 0x5b5f66, 0x6e3b2e, 0x3f4a52];
  const parts = [];
  const tint = (geo, hex) => {
    const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const part = (geo, hex, x, y, z) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.translate(x, y, z);
    parts.push(tint(geo, hex));
  };
  const box = (w, h, d, open = false) => {
    const g = new THREE.BoxGeometry(w, h, d, Math.ceil(w / 0.5), Math.ceil(h / 0.5), Math.ceil(d / 0.5));
    return open ? openBottom(g) : g;
  };
  function house(x, z) {
    const w = 7 + rnd() * 3, d = 8 + rnd() * 4, floors = rnd() < 0.45 ? 2 : 1, h = floors * 2.9 + 0.3;
    const wall = WALLS[Math.floor(rnd() * WALLS.length)], roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
    part(box(w, h + 0.05, d, true), wall, x, h / 2 - 0.05, z);
    colliders.push({ min: new THREE.Vector3(x - w / 2, 0, z - d / 2), max: new THREE.Vector3(x + w / 2, h, z + d / 2) });
    // gable roof, ridge running along the tracks, with a little overhang
    const rh = 1.6 + rnd() * 1.2, ow = w / 2 + 0.4;
    const tri = new THREE.Shape();
    tri.moveTo(-ow, 0); tri.lineTo(ow, 0); tri.lineTo(0, rh); tri.lineTo(-ow, 0);
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: d + 0.8, steps: Math.ceil(d / 0.5), bevelEnabled: false });
    part(roofGeo, roof, x, h, z - d / 2 - 0.4);
    // the side facing the tracks (+x): a door and windows on each floor
    const fx = x + w / 2 + 0.03;
    part(box(0.08, 2.1, 1.0, true), 0x5a3d2b, fx, 1.05, z + (rnd() - 0.5) * (d - 3));
    for (let f = 0; f < floors; f++) {
      for (const dz of [-d / 3.2, d / 3.2]) part(box(0.08, 1.2, 1.3), 0x2c3a46, fx, 1.6 + f * 2.9, z + dz);
    }
    if (rnd() < 0.5) part(box(0.7, 1.6, 0.7), 0x7b6a5e, x - w / 4, h + rh * 0.55, z + d / 4);
    // a tree in the yard, between the house and the tracks
    if (rnd() < 0.75) {
      const tx = x + w / 2 + 1.6 + rnd() * 1.4, tz = z + (rnd() - 0.5) * d, th = 2 + rnd() * 1.5;
      part(new THREE.CylinderGeometry(0.15, 0.22, th, 6, Math.ceil(th / 0.5), true), 0x6b4f3a, tx, th / 2, tz);
      const r = 1.6 + rnd() * 1.2;
      part(new THREE.IcosahedronGeometry(r, 2), rnd() < 0.5 ? 0x4f7d3a : 0x3f6d34, tx, th + r * 0.8, tz);
    }
  }
  for (let z = 6; z > -760; z -= 20 + rnd() * 8) house(-14 - rnd() * 1.5, z);
  for (let z = -4; z > -760; z -= 22 + rnd() * 8) house(-33 - rnd() * 3, z);
  const geo = mergeGeometries(parts);
  const suburb = new THREE.Mesh(geo, lensify(new THREE.MeshLambertMaterial({ vertexColors: true })));
  suburb.castShadow = suburb.receiveShadow = true;
  scene.add(suburb);
}

// a jumping course on the right: steps up to a lookout tower
const COURSE = [
  [9, 0.0, -6, 3, 0.8], [12, 0.0, -10, 3, 1.6], [16, 0.0, -13, 3, 2.4], [20, 0, -16, 3, 3.2],
  [24, 0, -20, 2.5, 4.0], [27, 0, -25, 2.5, 5.0], [27, 0, -31, 2.5, 6.0], [23, 0, -35, 2.5, 7.0],
  [19, 0, -39, 2.5, 8.0], [19, 0, -45, 2.5, 9.0], [23, 0, -49, 2.5, 10.0], [28, 0, -51, 2.5, 11.0],
];
for (const [x, , z, w, top] of COURSE) addBox(w, 0.5, w, x, top - 0.5, z, COL.ochre, { collide: true });
// pillars holding the steps up
for (const [x, , z, w, top] of COURSE) addBox(0.3, top - 0.5, 0.3, x, 0, z, COL.pole, { seg: 1 });
// the tower: a hollow-looking block with a lookout deck at 12 m
addBox(6, 11.5, 6, 34, 0, -54, COL.chalk, { collide: true });
addBox(7, 0.5, 7, 34, 11.5, -54, COL.ochre, { collide: true });

// the sky: pale at the horizon and deeper blue overhead. It's infinitely far away, so each pixel
// asks the lens where its ray is heading out there (its position at a very far depth) and takes
// the color for that direction. A sphere mesh doesn't work: lenses like z² bend its huge
// triangles into fans with gaps between them.
const SKY_R = 4500;
const EARTH_COLOR = 0x5b8a3e; // the grass as it looks lit from above
const skyUniforms = {
  skyG: { value: new THREE.Vector2(1, 1) },     // the lens at SKY_R, x and y
  skyHalf: { value: new THREE.Vector2(1, 1) },
  skyRot: { value: new THREE.Matrix3() },
  horizon: { value: new THREE.Color(0xdde8f1) },
  mid: { value: new THREE.Color(0xa9c8e6) },
  zenith: { value: new THREE.Color(0x5f97cf) },
};
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: skyUniforms, depthTest: false, depthWrite: false,
  vertexShader: /* glsl */`
    varying vec2 vNdc;
    void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec2 skyG, skyHalf;
    uniform mat3 skyRot;
    uniform vec3 horizon, mid, zenith;
    varying vec2 vNdc;
    void main() {
      vec3 c = horizon;
      if (skyG.x > 0.0 && skyG.y > 0.0) { // no ray gets this far when they meet in front
        vec3 d = skyRot * vec3(vNdc.x * skyHalf.x * skyG.x, vNdc.y * skyHalf.y * skyG.y, -${SKY_R.toFixed(1)});
        float e = max(0.0, normalize(d).y); // sine of the elevation
        c = e < 0.25 ? mix(horizon, mid, e / 0.25) : mix(mid, zenith, min(1.0, (e - 0.25) / 0.6));
      }
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);
// The earth is solid. Every lens sends its rays out from your eye (a point for a normal camera,
// a plane the size of the screen for orthographic), always centered on your eye so the eye is in
// the same place for every lens. Rays that start below the ground are inside the earth, so they
// see the ground and nothing beyond it. Which patch of ground: the one where the ray's line
// crosses the surface, the same rule as for every ray that starts above it, so the ground (grid,
// track bed and all) runs on unbroken. A ray running level never crosses it: plain grass.
const earthUniforms = {
  earthG: { value: new THREE.Vector2(0, 0) },   // the lens at the eye plane, x and y
  earthDG: { value: new THREE.Vector2(0, 0) },  // and how fast it changes with depth there
  earthHalf: { value: new THREE.Vector2(1, 1) },
  earthWorld: { value: new THREE.Matrix4() },
  earthColor: { value: new THREE.Color(EARTH_COLOR) },
  ballastColor: { value: new THREE.Color(COL.ballast) },
  tieColor: { value: new THREE.Color(COL.tie) },
  railColor: { value: new THREE.Color(COL.rail) },
};
const earth = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: earthUniforms, depthTest: true, depthWrite: true,
  vertexShader: /* glsl */`
    varying vec2 vNdc;
    void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec2 earthG, earthDG, earthHalf;
    uniform mat4 earthWorld;
    uniform vec3 earthColor, ballastColor, tieColor, railColor;
    varying vec2 vNdc;
    float pvGrid(vec2 p, float spacing, float width) {
      vec2 q = p / spacing;
      vec2 fw = fwidth(q);
      vec2 d = abs(fract(q - 0.5) - 0.5) / max(fw, 1e-5);
      float line = 1.0 - clamp(min(d.x, d.y) - width, 0.0, 1.0);
      float fade = 1.0 - smoothstep(0.15, 0.5, max(fw.x, fw.y));
      return line * fade;
    }
    void main() {
      vec4 start = earthWorld * vec4(vNdc.x * earthHalf.x * earthG.x, vNdc.y * earthHalf.y * earthG.y, -${NEAR.toFixed(3)}, 1.0);
      // the track bed is solid too (the same heights you walk on), and a hair above the surface
      // counts, so no sliver shows where the real surface is clipped
      bool onTrack = start.z < ${TRACK_START.toFixed(1)} && start.z > ${(TRACK_START - TRACK_LEN).toFixed(1)};
      float floorY = onTrack && abs(start.x) < 1.3 ? 0.41 : onTrack && abs(start.x) < 1.7 ? 0.25 : 0.0;
      if (start.y >= floorY + 0.02) discard;
      vec3 dir = mat3(earthWorld) * vec3(vNdc.x * earthHalf.x * earthDG.x, vNdc.y * earthHalf.y * earthDG.y, -1.0);
      vec3 c = earthColor;
      if (abs(dir.y) < 1e-5) { // looking level: the bed's own cross-section
        if (floorY > 0.0 && start.y > 0.0) c = start.y > 0.25 ? tieColor : ballastColor;
        gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragDepth = 0.0; return; }
      vec2 p = start.xz - dir.xz * ((start.y - floorY) / dir.y);
      float n = fract(sin(dot(floor(p * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
      c *= 0.94 + 0.08 * n;
      c = mix(c, c * 1.18, pvGrid(p, 1.0, 0.0) * 0.5);
      c = mix(c, c * 1.35, pvGrid(p, 10.0, 0.6) * 0.6);
      if (abs(p.x) < 1.7 && p.y < ${TRACK_START.toFixed(1)} && p.y > ${(TRACK_START - TRACK_LEN).toFixed(1)}) {
        c = ballastColor;
        float tz = mod(${(TRACK_START - 0.3).toFixed(2)} - p.y + 0.12, 0.65);
        if (abs(p.x) < 1.3 && tz < 0.24) c = tieColor;
        if (abs(abs(p.x) - ${(GAUGE / 2).toFixed(4)}) < 0.04) c = railColor;
      }
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragDepth = 0.0;
    }`,
}));
earth.renderOrder = -1;
scene.add(earth);

function updateSky() {
  skyUniforms.skyG.value.set(lutFn(shown, 0)(SKY_R), lutFn(shown, 1)(SKY_R));
  skyUniforms.skyHalf.value.copy(lensUniforms.lensHalf.value);
  skyUniforms.skyRot.value.setFromMatrix4(camera.matrixWorld);
  const ex = lutFn(shown, 0)(NEAR), ey = lutFn(shown, 1)(NEAR);
  earthUniforms.earthG.value.set(Number.isFinite(ex) ? ex : 0, Number.isFinite(ey) ? ey : 0);
  const dx = (lutFn(shown, 0)(2 * NEAR) - ex) / NEAR, dy = (lutFn(shown, 1)(2 * NEAR) - ey) / NEAR;
  earthUniforms.earthDG.value.set(Number.isFinite(dx) ? dx : 0, Number.isFinite(dy) ? dy : 0);
  earthUniforms.earthHalf.value.copy(lensUniforms.lensHalf.value);
  earthUniforms.earthWorld.value.copy(camera.matrixWorld);
}

for (const o of scene.children) o.frustumCulled = false;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* lights */
scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x4a5a32, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.3).normalize();

// an invisible body so you cast a shadow (and can see where you'll land)
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
  new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
body.castShadow = true;
body.frustumCulled = false;
scene.add(body);

/* =====================================================================
 * moving around
 * ===================================================================== */
const EYE = 1.65, RADIUS = 0.3, HEIGHT = 1.8;
const START = { pos: new THREE.Vector3(0, 0.41, 16), yaw: 0, pitch: 0 };
const player = {
  pos: START.pos.clone(), vel: new THREE.Vector3(), onGround: false,
  yaw: START.yaw, pitch: START.pitch,
  q: new THREE.Quaternion(),   // fly orientation
  mode: "walk",
};
let levelAnim = null;          // smooth roll back to level when you land from flying
const keys = new Set();
let locked = false;

function walkQuat(yaw, pitch, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
}
function setMode(m) {
  if (m === player.mode) return;
  if (m === "fly") {
    walkQuat(player.yaw, player.pitch, player.q);
    player.vel.set(0, 0, 0);
  } else {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(player.q);
    const from = player.q.clone();
    player.yaw = Math.atan2(-f.x, -f.z);
    player.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    levelAnim = { from, t0: performance.now(), dur: 350 };
    player.vel.set(0, 0, 0);
  }
  player.mode = m;
  $("jump").textContent = m === "walk" ? "jump" : "up";
  $("down").hidden = m === "walk";
  updateModeButton();
  updateHint();
}
function resetPlayer() {
  player.pos.copy(START.pos); player.vel.set(0, 0, 0);
  player.yaw = START.yaw; player.pitch = START.pitch;
  walkQuat(player.yaw, player.pitch, player.q);
  levelAnim = null;
}

function look(dx, dy) {
  const k = 0.0022;
  if (player.mode === "walk") {
    player.yaw -= dx * k;
    player.pitch = THREE.MathUtils.clamp(player.pitch - dy * k, -1.55, 1.55);
  } else {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(player.q), -dx * k);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(player.q), -dy * k);
    player.q.premultiply(qy).premultiply(qx).normalize();
  }
}

function collide(axis, pos, vel) {
  const minX = pos.x - RADIUS, maxX = pos.x + RADIUS, minZ = pos.z - RADIUS, maxZ = pos.z + RADIUS;
  const minY = pos.y, maxY = pos.y + HEIGHT;
  let hitGround = false;
  for (const c of colliders) {
    if (maxX <= c.min.x || minX >= c.max.x || maxY <= c.min.y || minY >= c.max.y ||
        maxZ <= c.min.z || minZ >= c.max.z) continue;
    if (axis === "y") {
      if (vel.y <= 0) { pos.y = c.max.y; hitGround = true; } else pos.y = c.min.y - HEIGHT;
      vel.y = 0;
    } else {
      const v = vel[axis];
      const half = RADIUS;
      if (v > 0) pos[axis] = c.min[axis] - half - 1e-4;
      else if (v < 0) pos[axis] = c.max[axis] + half + 1e-4;
      else {
        // pushed in without moving on this axis: leave by the nearer side
        const a = pos[axis] - (c.min[axis] - half), b = (c.max[axis] + half) - pos[axis];
        pos[axis] += a < b ? -a - 1e-4 : b + 1e-4;
      }
    }
  }
  return hitGround;
}

// the track bed is a low ledge you step onto
function floorAt(x, z) {
  if (Math.abs(x) < 1.7 && z < TRACK_START && z > TRACK_START - TRACK_LEN) {
    return Math.abs(x) < 1.3 ? 0.41 : 0.25;
  }
  return 0;
}

const touchMove = { x: 0, y: 0 };
let touchJump = false, touchDown = false;

function update(dt) {
  const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - touchMove.y;
  const sideIn = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + touchMove.x;
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");

  if (player.mode === "walk") {
    const speed = fast ? 11 : 5.5;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    let mx = -sy * fwdIn + cy * sideIn, mz = -cy * fwdIn - sy * sideIn;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    player.vel.x = mx * speed; player.vel.z = mz * speed;
    if ((keys.has("Space") || touchJump) && player.onGround) { player.vel.y = 8.2; player.onGround = false; }
    player.vel.y -= 24 * dt;

    const p = player.pos;
    p.x += player.vel.x * dt; collide("x", p, player.vel);
    p.z += player.vel.z * dt; collide("z", p, player.vel);
    p.y += player.vel.y * dt;
    let grounded = collide("y", p, player.vel);
    const fl = floorAt(p.x, p.z);
    if (p.y <= fl) {
      // step up onto the low track bed instead of stopping at it
      p.y = fl; player.vel.y = Math.max(0, player.vel.y); grounded = true;
    }
    player.onGround = grounded;
  } else {
    const speed = fast ? 60 : 15;
    const up = (keys.has("Space") || touchJump ? 1 : 0) - (keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC") || touchDown ? 1 : 0);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(player.q);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(player.q);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(player.q);
    const v = f.multiplyScalar(fwdIn).add(r.multiplyScalar(sideIn)).add(u.multiplyScalar(up));
    if (v.lengthSq() > 1) v.normalize();
    player.pos.addScaledVector(v, speed * dt);
    const roll = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
    if (roll) {
      const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1).applyQuaternion(player.q), roll * 1.6 * dt);
      player.q.premultiply(qr).normalize();
    }
    player.pos.y = Math.max(player.pos.y, floorAt(player.pos.x, player.pos.z));
  }

  // camera
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  if (player.mode === "walk") {
    const target = walkQuat(player.yaw, player.pitch);
    if (levelAnim) {
      const u = Math.min(1, (performance.now() - levelAnim.t0) / levelAnim.dur);
      camera.quaternion.slerpQuaternions(levelAnim.from, target, 1 - Math.pow(1 - u, 3));
      if (u >= 1) levelAnim = null;
    } else camera.quaternion.copy(target);
  } else camera.quaternion.copy(player.q);
  camera.updateMatrixWorld();

  body.position.set(player.pos.x, player.pos.y + HEIGHT / 2, player.pos.z);
  // the ground grid follows you in 8 m steps (its lines are drawn in world space)
  ground.position.set(Math.round(player.pos.x / 8) * 8, 0, Math.round(player.pos.z / 8) * 8);
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 100);
}

/* input */
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea")) return;
  if (e.code === "KeyF" && !e.repeat) { setMode(player.mode === "walk" ? "fly" : "walk"); return; }
  if (e.code === "KeyR" && !e.repeat && !e.metaKey && !e.ctrlKey) { resetPlayer(); return; }
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

let dragging = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") {
    if (!locked) canvas.requestPointerLock?.()?.catch?.(() => {});
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  } else {
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  try { canvas.setPointerCapture(e.pointerId); } catch {} // throws while the pointer is locked
});
canvas.addEventListener("pointermove", (e) => {
  if (locked) { look(e.movementX, e.movementY); return; }
  if (!dragging || dragging.id !== e.pointerId) return;
  look((e.clientX - dragging.x) * (e.pointerType === "touch" ? 1.6 : 1), (e.clientY - dragging.y) * (e.pointerType === "touch" ? 1.6 : 1));
  dragging.x = e.clientX; dragging.y = e.clientY;
});
const endDrag = (e) => { if (dragging?.id === e.pointerId) dragging = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  document.body.classList.toggle("pv-locked", locked);
  updateHint();
});

// touch joystick + jump
{
  const stick = $("stick"), knob = $("knob");
  let sid = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  stick.addEventListener("pointerdown", (e) => { sid = e.pointerId; stick.setPointerCapture(sid); move(e); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === sid) move(e); });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; touchMove.x = touchMove.y = 0; setKnob(0, 0); };
  stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
  function move(e) {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 12, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    setKnob(dx, dy);
    touchMove.x = dx / max; touchMove.y = dy / max;
  }
  const jump = $("jump");
  jump.addEventListener("pointerdown", (e) => { touchJump = true; jump.setPointerCapture(e.pointerId); });
  const up = () => { touchJump = false; };
  jump.addEventListener("pointerup", up); jump.addEventListener("pointercancel", up);
  const down = $("down");
  down.addEventListener("pointerdown", (e) => { touchDown = true; down.setPointerCapture(e.pointerId); });
  const up2 = () => { touchDown = false; };
  down.addEventListener("pointerup", up2); down.addEventListener("pointercancel", up2);
}

const ICON_WALK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>`;
const ICON_FLY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
function updateModeButton() {
  // offers the other mode
  $("mode").innerHTML = player.mode === "walk" ? `${ICON_FLY} fly` : `${ICON_WALK} walk`;
}
const kbd = (k) => `<kbd>${k}</kbd>`;
function updateHint() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  let h;
  if (coarse) {
    h = player.mode === "walk" ? "Drag to look, use the stick to walk." : "Drag to look, the stick flies where you look.";
  } else if (!locked) {
    h = "Click the view to look around.";
  } else if (player.mode === "walk") {
    h = `${kbd("WASD")} walk · ${kbd("Space")} jump · ${kbd("F")} fly · ${kbd("Esc")} free the mouse`;
  } else {
    h = `${kbd("WASD")} fly · ${kbd("Space")}/${kbd("Ctrl")} up and down · ${kbd("Q")}${kbd("E")} roll · ${kbd("Shift")} fast · ${kbd("F")} walk`;
  }
  $("hint").innerHTML = h;
}
$("mode").addEventListener("click", () => setMode(player.mode === "walk" ? "fly" : "walk"));
$("reset").addEventListener("click", resetPlayer);

/* =====================================================================
 * the panel
 * ===================================================================== */
const D_MIN = 1, D_MAX = 1000;
const dFromSlider = (v) => D_MIN * Math.pow(D_MAX / D_MIN, v / 100);
const sliderFromD = (d) => 100 * Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN);
const fmtD = (d) => (d < 9.95 ? d.toFixed(1) : Math.round(d)) + " m";

const chipsEl = $("chips");
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = p.id; b.title = p.tip;
  // the formula goes on the chip unless the label already is the formula
  b.innerHTML = p.label === p.src || /[√²]/.test(p.label) ? p.label : `${p.label}<span class="pv-chip-f">${p.src}</span>`;
  b.addEventListener("click", () => choosePreset(p));
  chipsEl.appendChild(b);
}
// a preset that only makes sense with split axes
{
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = "mixed";
  b.title = "Orthographic side to side, perspective up and down: the rails stay parallel while the poles still shrink.";
  b.textContent = "orthographic x, perspective y";
  b.addEventListener("click", () => {
    if (!state.split) { state.split = true; $("split").checked = true; }
    state.x = { src: "1", s: 1 }; state.y = { src: "z", s: 0 };
    syncPanel(); applyLens(true);
  });
  chipsEl.appendChild(b);
}

function activeAxis() { return state.split ? state.active : "x"; }
function setAxis(ax, v) {
  state[ax] = v;
  if (!state.split) state.y = { ...v };
}
function choosePreset(p) {
  setAxis(activeAxis(), { src: p.src, s: p.s ?? null });
  clearErrors();
  syncPanel();
  applyLens(true);
}
function clearErrors() {
  for (const a of ["x", "y"]) {
    $(a === "x" ? "fxErr" : "fyErr").textContent = "";
    $(a === "x" ? "fxField" : "fyField").classList.remove("pv-bad");
  }
}

function sameLens(ax, p) {
  const s = effS(ax);
  if (p.s != null && s != null) return Math.abs(s - p.s) < 1e-6;
  return state[ax].src.replace(/\s/g, "") === p.src.replace(/\s/g, "");
}

function syncPanel() {
  const ax = activeAxis();
  for (const a of ["x", "y"]) {
    const st = state[a];
    if (st.s != null) st.src = backPlaneText(st.s, state.D);
    const inp = $(a === "x" ? "fx" : "fy");
    if (document.activeElement !== inp) {
      // a half-typed lens that was never applied goes back to the one in use, error and all
      if (inp.value !== st.src) { inp.value = st.src; clearErrors(); }
    }
  }
  $("fyRow").hidden = !state.split;
  $("axisPick").hidden = !state.split;
  for (const b of $("axisPick").children) b.classList.toggle("is-on", b.dataset.axis === ax);
  $("fxLabel").textContent = state.split ? "x: f(z) =" : "f(z) =";
  $("fxField").classList.toggle("pv-active", state.split && ax === "x");
  $("fyField").classList.toggle("pv-active", state.split && ax === "y");
  const mixedOn = state.split && sameLens("x", { src: "1", s: 1 }) && sameLens("y", { src: "z", s: 0 });
  for (const b of chipsEl.children) {
    const id = b.dataset.id;
    if (id === "mixed") { b.classList.toggle("is-on", mixedOn); continue; }
    const p = PRESETS.find((q) => q.id === id);
    b.classList.toggle("is-on", !mixedOn && sameLens(ax, { src: p.src, s: p.s ?? null }));
  }
  const s = effS(ax);
  const row = $("sRow");
  row.classList.toggle("pv-na", s == null);
  if (s != null) { $("s").value = Math.min(3, Math.max(0, s)); $("sVal").textContent = sLabel(s); }
  else $("sVal").textContent = "rays are curved";
  $("d").value = sliderFromD(state.D);
  $("dVal").textContent = fmtD(state.D);
  updateCaption();
}
function sLabel(s) {
  if (Math.abs(s) < 1e-9) return "0 (a point)";
  if (Math.abs(s - 1) < 1e-9) return "1 (screen size)";
  return `${+s.toFixed(2)}×`;
}

function onField(ax) {
  const inp = $(ax === "x" ? "fx" : "fy");
  const err = $(ax === "x" ? "fxErr" : "fyErr");
  const field = $(ax === "x" ? "fxField" : "fyField");
  const r = compileLens(inp.value, state.D);
  if (r.error) { err.textContent = r.error; field.classList.add("pv-bad"); return; }
  err.textContent = ""; field.classList.remove("pv-bad");
  setAxis(ax, { src: inp.value, s: null });
  syncPanel();
  applyLens(false);
}
for (const ax of ["x", "y"]) {
  const inp = $(ax === "x" ? "fx" : "fy");
  inp.addEventListener("input", () => onField(ax));
  inp.addEventListener("focus", () => { state.active = ax; syncPanel(); });
  inp.addEventListener("blur", () => syncPanel());
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") inp.blur(); });
}
for (const b of $("axisPick").children) {
  b.addEventListener("click", () => { state.active = b.dataset.axis; syncPanel(); redrawDiagram(); });
}

$("s").addEventListener("input", (e) => {
  let s = +e.target.value;
  for (const snap of [0, 1]) if (Math.abs(s - snap) < 0.04) s = snap;
  setAxis(activeAxis(), { src: "", s });
  clearErrors();
  syncPanel();
  applyLens(false);
});
$("d").addEventListener("input", (e) => {
  let D = dFromSlider(+e.target.value);
  // a typed lens has to stay positive at the screen: stop at the last distance where it is
  const bad = (d) => ["x", "y"].some((a) => state[a].s == null && compileLens(state[a].src, d).error);
  if (bad(D)) {
    let lo = state.D, hi = D; // lo is valid
    for (let i = 0; i < 40; i++) { const m = Math.sqrt(lo * hi); if (bad(m)) hi = m; else lo = m; }
    // stop a little short: right at the edge f(D) is nearly 0 and the view degenerates
    D = Math.max(Math.min(state.D, lo), lo * 0.9);
    $("dErr").textContent = `f(z) isn't positive past ${fmtD(lo)}, so the screen can't go further.`;
  } else $("dErr").textContent = "";
  state.D = D;
  syncPanel();
  applyLens(false);
});
$("d").addEventListener("change", () => { $("dErr").textContent = ""; });
$("split").addEventListener("change", (e) => {
  state.split = e.target.checked;
  if (!state.split) { state.y = { ...state.x }; state.active = "x"; applyLens(true); }
  else state.active = "y";
  syncPanel();
});

/* ---------------- diagram + caption ---------------- */
const diag = $("diagram");
function updateCaption() {
  const ax = activeAxis();
  const st = state[ax];
  const s = effS(ax);
  let c;
  if (s != null) {
    if (Math.abs(s) < 1e-9) c = "Rays fan out from <b>one point</b> at your eye: a normal camera.";
    else if (s < 0) c = "The back plane is flipped, so rays cross <b>behind</b> you.";
    else if (s < 1) c = `The rays start on a plane <b>${+s.toFixed(2)}×</b> the screen's size, so far things shrink less.`;
    else if (Math.abs(s - 1) < 1e-9) c = "The back plane is <b>as big as the screen</b>, so rays are parallel and nothing shrinks.";
    else c = `The back plane is <b>bigger than the screen</b>, so rays meet <b>${fmtD(convergenceDepth(s, state.D))}</b> ahead. Nothing past that is seen.`;
  } else {
    c = `Rays bend to follow <b>f(z) = ${escapeHtml(st.src)}</b>.`;
  }
  if (state.split) c = `<b>${ax === "x" ? "Side to side" : "Up and down"}:</b> ` + c[0].toLowerCase() + c.slice(1);
  // a level parallel view sees the ground edge-on, which looks like a bug unless it's said
  if (ax === "y" || !state.split) {
    if (s != null && Math.abs(s - 1) < 1e-9) c += " Looking level, the ground is edge-on: look down or step sideways to see the world move.";
  }
  $("caption").innerHTML = c;
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function drawPanelDiagram() {
  const ax = activeAxis();
  const r = diag.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(devicePixelRatio, 2);
  if (diag.width !== Math.round(r.width * dpr)) { diag.width = Math.round(r.width * dpr); diag.height = Math.round(r.height * dpr); }
  const ctx = diag.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // during a morph the back plane size is in between; show it only when the lens is at rest
  const s = effS(ax);
  const comp = ax === "x" ? 0 : 1;
  drawDiagram(ctx, r.width, r.height, {
    D: state.D, fov: FOV,
    gy: lutFn(shown, comp),
    gx: state.split ? lutFn(shown, 1 - comp) : null,
    s: !morph && s != null ? s : null,
  });
}

/* =====================================================================
 * about-modal diagrams (the same drawing code, with lenses that animate on their own)
 * ===================================================================== */
let aboutRAF = 0;
document.addEventListener("cohesion-modal-open", (e) => {
  if (!e.detail.className?.includes("cohesion-about")) return;
  const el = e.detail.el;
  const canvases = [...el.querySelectorAll(".pv-about-diagram")];
  const t0 = performance.now();
  const D = 10;
  const fns = [
    { name: "√z", f: parseExpr("sqrt(z)") }, { name: "z²", f: parseExpr("z^2") },
    { name: "1/z", f: parseExpr("1/z") }, { name: "log(1 + z)", f: parseExpr("log(1+z)") },
  ];
  const tick = (now) => {
    const t = (now - t0) / 1000;
    for (const cv of canvases) {
      const r = cv.getBoundingClientRect();
      if (!r.width) continue;
      const dpr = Math.min(devicePixelRatio, 2);
      if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const demo = cv.dataset.demo;
      if (demo === "pinhole") {
        drawDiagram(ctx, r.width, r.height, { D, fov: FOV, gy: normalizedLens(backPlaneF(0, D), D), s: 0 });
      } else if (demo === "plane") {
        // sweep the back plane 0 → 1.6 → 0 with holds at the named values
        const period = 12, u = (t % period) / period;
        const keysS = [0, 0, 1, 1, 1.6, 1.6, 0];
        const seg = u * (keysS.length - 1), i = Math.floor(seg), f = seg - i;
        const ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        const s = keysS[i] + (keysS[Math.min(i + 1, keysS.length - 1)] - keysS[i]) * ease;
        drawDiagram(ctx, r.width, r.height, { D, fov: FOV, gy: normalizedLens(backPlaneF(s, D), D), s });
        const cap = el.querySelector('[data-caption="plane"]');
        const txt = s < 0.02 ? "Back plane size 0: one point, a normal camera."
          : Math.abs(s - 1) < 0.02 ? "Back plane size 1: parallel rays, orthographic."
          : s > 1.58 ? `Back plane size 1.6: rays meet ${Math.round(convergenceDepth(1.6, D))} m ahead, reverse perspective.`
          : `Back plane size ${s.toFixed(2)}.`;
        if (cap.textContent !== txt) cap.textContent = txt;
      } else if (demo === "functions") {
        // hold each function, then morph to the next the way the lens does
        const period = 3.5, k = Math.floor(t / period) % fns.length, into = (t % period) / 0.9;
        const cur = fns[k], prev = fns[(k + fns.length - 1) % fns.length];
        const ga = normalizedLens(prev.f, D), gb = normalizedLens(cur.f, D);
        const u = Math.min(1, into), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        drawDiagram(ctx, r.width, r.height, { D, fov: FOV, gy: (z) => ga(z) + (gb(z) - ga(z)) * e, s: null });
        const cap = el.querySelector('[data-caption="functions"]');
        const txt = `Divide by ${cur.name}.`;
        if (cap.textContent !== txt) cap.textContent = txt;
      }
    }
    aboutRAF = requestAnimationFrame(tick);
  };
  aboutRAF = requestAnimationFrame(tick);
});
document.addEventListener("cohesion-modal-close", (e) => {
  if (e.detail.className?.includes("cohesion-about")) cancelAnimationFrame(aboutRAF);
});

/* =====================================================================
 * main loop
 * ===================================================================== */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
}
addEventListener("resize", resize);
resize();

let last = performance.now();
let diagramDirty = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  const morphing = stepMorph(now);
  const hh = state.D * Math.tan(FOV / 2);
  lensUniforms.lensHalf.value.set(hh * camera.aspect, hh);
  camera.updateMatrixWorld();
  updateSky();
  renderer.render(scene, camera);
  if (morphing || diagramDirty) { drawPanelDiagram(); diagramDirty = morphing; }
  if (!morphing && morph === null && wasMorphing) syncPanel();
  wasMorphing = morphing;
  requestAnimationFrame(frame);
}
let wasMorphing = false;
const redrawDiagram = () => { diagramDirty = true; };
for (const id of ["s", "d", "fx", "fy", "split"]) $(id).addEventListener("input", redrawDiagram);
$("split").addEventListener("change", redrawDiagram);
chipsEl.addEventListener("click", redrawDiagram);
new ResizeObserver(redrawDiagram).observe(diag);

if (matchMedia("(max-width: 700px)").matches) document.querySelector("control-panel")?.setAttribute("collapsed", "");
// on touch screens the open panel covers most of the view, so a tap outside it closes it
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  const panel = document.querySelector("control-panel");
  if (panel && !panel.hasAttribute("collapsed") && !panel.contains(e.target)) panel.setAttribute("collapsed", "");
}, true);
if (isBg) document.body.classList.add("pv-background");
resetPlayer();
applyLens(false);
syncPanel();
updateModeButton();
updateHint();
requestAnimationFrame(frame);

// for testing from the console / automation
window.pv = { state, player, setMode, applyLens, syncPanel, renderer, scene, camera };
