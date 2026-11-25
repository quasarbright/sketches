import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  parseExpr, backPlaneF, backPlaneText, convergenceDepth, normalizedLens, compileLens, planeRatio, fitScreenH,
  sensorSpreadToLens, lensToSensorSpread,
  LUT, sampleLens, PRESETS, linearS, NEAR,
} from "./lens.mjs";
import { drawDiagram, lutFn } from "./diagram.mjs";
import { drawRenderDemo, EYE_LENS, SENSOR_LENS, RENDER_PIXELS } from "./render-demo.mjs";
import { drawAbout3D, FUNCTIONS, FUNCTION_PERIOD, sensorSweep, setEngine } from "./about3d.mjs";
import { SCENE3, axes } from "./render3d.mjs";
import { drawGraphDemo, GRAPHS } from "./graph-demo.mjs";
import { PHYS, COURSE, TOWER } from "./course.mjs";

// Under ?background the shared lib removes the panel, so its controls aren't in the page. The
// code that drives them still runs, on stand-ins that nobody sees.
const standIns = new Map();
const $ = (id) => document.getElementById(id) ?? standIns.get(id) ??
  standIns.set(id, document.createElement(id === "diagram" ? "canvas" : "input")).get(id);
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
renderer.shadowMap.autoUpdate = false;
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
  lensOn: { value: 1 },   // 0 while drawing the side view: an ordinary perspective camera
  // the angle lenses: x = 0 off, 1 lat-long, 2 fisheye; y and z = half the view's angular width
  // and height (radians)
  lensSphere: { value: new THREE.Vector3(0, 1, 1) },
};

const LENS_PARS = /* glsl */`
uniform sampler2D lensLUT;
uniform vec2 lensHalf;
uniform vec4 lensRange;   // near, far, asinh(zMin/C), asinh(zMax/C)
uniform float lensC;
uniform float lensOn;
uniform vec3 lensSphere;
varying float vLensDepth;
varying vec2 vLensSign;
varying vec4 vLensDir;
varying vec2 vLensP;
// the fisheye: a direction's angle from straight ahead is its distance from the middle of the
// picture, the same number of degrees per pixel everywhere, in the direction it leans
vec2 fishAngles(vec3 d) {
  float r = length(d), s = length(d.xy);
  float a = acos(clamp(-d.z / r, -1.0, 1.0));
  return s < 1e-7 * r ? vec2(0.0) : d.xy * (a / s);
}
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
  vLensDir = vec4(0.0); vLensP = vec2(0.0);
  if (lensOn < 0.5) { vLensDepth = -1.0; vLensSign = vec2(1.0); return projectionMatrix * mv; }
  if (lensSphere.x > 1.5) {
    float r = length(mv.xyz);
    vLensSign = vec2(1.0);
    if (r < lensRange.x) return vec4(0.0, 0.0, 2.0, 1.0);
    vec2 p = fishAngles(mv.xyz);
    vLensDir = vec4(mv.xyz, 0.0); vLensP = p;
    vLensDepth = (r - lensRange.x) / (lensRange.y - lensRange.x);
    return vec4(p.x / lensSphere.y, p.y / lensSphere.z, 2.0 * vLensDepth - 1.0, 1.0);
  }
  if (lensSphere.x > 0.5) {
    // The screen is a latitude-longitude rectangle on a sphere around the eye: across the picture
    // is the direction's longitude (left-right angle), up the picture its latitude (elevation).
    float r = length(mv.xyz);
    vLensSign = vec2(1.0);
    if (r < lensRange.x) return vec4(0.0, 0.0, 2.0, 1.0);
    vec3 d = mv.xyz;
    float lon = atan(d.x, -d.z), lat = asin(clamp(d.y / r, -1.0, 1.0));
    vLensDir = vec4(d, lon);
    vLensDepth = (r - lensRange.x) / (lensRange.y - lensRange.x);
    return vec4(lon / lensSphere.y, lat / lensSphere.z, 2.0 * vLensDepth - 1.0, 1.0);
  }
  float z = -mv.z;
  if (z < lensRange.x) {
    // Behind the eye plane. The card clips a triangle where clip z + w crosses zero, and finds
    // that point by straight-line blending between its corners. With w = g(z) going negative
    // behind the eye, a corner back there passed the test and the cut landed near w = 0, which
    // smeared triangles across the whole screen. So back here w stays at its value on the eye
    // plane, and z + w is negative in proportion to how far behind the corner is.
    vec2 g0 = lensG(lensRange.x);
    float w0 = max(abs(g0.y), 1e-4), s0 = g0.y < 0.0 ? -1.0 : 1.0;
    vLensDepth = 0.0;
    vLensSign = vec2(g0.x < 0.0 ? -1.0 : 1.0, s0);
    return vec4(mv.x / lensHalf.x * (w0 / g0.x), s0 * mv.y / lensHalf.y, -w0 * (1.0 + (lensRange.x - z)), w0);
  }
  vec2 g = lensG(z);
  // Where f goes negative the rays have crossed (converging lenses, past the point where they
  // meet): they keep going, out the other side, so the picture there is upside down and mirrored,
  // like a pinhole camera's. The GPU needs w > 0, so w = |f| and the sign goes on x and y instead.
  float w = abs(g.y), sy = g.y < 0.0 ? -1.0 : 1.0;
  float zl = 2.0 * (z - lensRange.x) / (lensRange.y - lensRange.x) - 1.0;
  vLensDepth = (z - lensRange.x) / (lensRange.y - lensRange.x);
  // Right around a crossing everything is blown up past the edges of the picture (more than 25×
  // the screen), so it's dropped: drawing it would only paint a few huge smeared triangles.
  // A triangle with corners on both sides of the crossing has no picture as one triangle: its
  // edges run out through infinity and back, but the card would draw them straight across the
  // screen. Its corners carry different signs, so the blend between them isn't ±1 inside it, and
  // the fragment shader drops it.
  vLensSign = vec2(g.x < 0.0 ? -1.0 : 1.0, sy);
  if (w < 0.04 || abs(g.x) < 0.04) { vLensSign = vec2(0.0); return vec4(0.0, 0.0, 2.0, 1.0); }
  return vec4(mv.x / lensHalf.x * (w / g.x), sy * mv.y / lensHalf.y, zl * w, w);
}
`;

// Haze: past about 2 km the ground fades into the air, and below the horizon the sky is that same
// air over far-off grass. Both take the color from the direction you look (its sine of elevation),
// so where the ground ends 4 km out it's already the sky's color there and no edge shows, from the
// ground or from high up. The far haze has no texture, so nothing in it can slide as you move.
const linHex = (h) => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const HAZE_NEAR = 2000, HAZE_FAR = 3800;
const HAZE = /* glsl */`
vec3 pvHaze(float e) { // linear color; e = sine of the elevation, 0 at the horizon, -1 straight down
  return mix(${linHex(0xdde8f1)}, ${linHex(0x93b08a)}, smoothstep(0.0, 0.3, -e));
}
float pvHazeAmount(vec3 p, vec3 eye) { return smoothstep(${HAZE_NEAR.toFixed(1)}, ${HAZE_FAR.toFixed(1)}, length(p.xz - eye.xz)); }`;
function lensify(mat, extra, uniforms = lensUniforms) {
  // three.js caches compiled programs by onBeforeCompile's source text, which is the same for
  // every material here, so materials with extra shader code need their own key
  mat.customProgramCacheKey = () => "lens:" + (extra ? extra.toString() : "");
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + LENS_PARS + "varying vec3 vHazeW;")
      .replace("#include <project_vertex>",
        "vec4 pvHw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\npvHw = instanceMatrix * pvHw;\n#endif\nvHazeW = (modelMatrix * pvHw).xyz;\n" +
        THREE.ShaderChunk.project_vertex.replace(
          "gl_Position = projectionMatrix * mvPosition;", "gl_Position = lensProject(mvPosition);"));
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vLensDepth;\nvarying vec2 vLensSign;\nvarying vec4 vLensDir;\nvarying vec2 vLensP;\nuniform vec3 lensSphere;\nvarying vec3 vHazeW;\n" + HAZE)
      .replace("void main() {", "void main() {\nif (min(abs(vLensSign.x), abs(vLensSign.y)) < 0.999) discard;\n"
        // On the sphere a triangle is drawn straight between its corners, which is only right when
        // it covers a small patch of longitude. One straddling the seam straight behind you (its
        // longitudes jump from +180° to -180°) would be drawn across the whole picture, and ones
        // right below or above you wrap around the pole. Where the drawn direction is off from the
        // true one by more than about 3°, drop it: the flat ground painted behind shows instead.
        // The fisheye has one such spot, straight behind you, where every direction around the
        // edge of a 360° picture meets; the same test drops the triangles there.
        + "if (lensSphere.x > 1.5 && vLensDepth > -0.5) { vec3 dd = vLensDir.xyz; float sd = length(dd.xy);"
        + " float ad = acos(clamp(-dd.z / length(dd), -1.0, 1.0));"
        + " vec2 pd = sd < 1e-7 ? vec2(0.0) : dd.xy * (ad / sd);"
        + " if (length(pd - vLensP) > 0.06) discard; }"
        + "else if (lensSphere.x > 0.5 && vLensDepth > -0.5) { vec3 dd = normalize(vLensDir.xyz);"
        + " if (abs(atan(dd.x, -dd.z) - vLensDir.w) * max(length(dd.xz), 0.05) > 0.06) discard; }")
      .replace("#include <dithering_fragment>",
        "#include <dithering_fragment>\n"
        // the far haze (see HAZE), after the color space conversion so it converts too
        + "gl_FragColor.rgb = mix(gl_FragColor.rgb, sRGBTransferOETF(vec4(pvHaze(normalize(vHazeW - cameraPosition).y), 1.0)).rgb, pvHazeAmount(vHazeW, cameraPosition));\n"
        + "gl_FragDepth = vLensDepth < -0.5 ? gl_FragCoord.z : clamp(vLensDepth, 0.0, 1.0);");
    if (extra) extra(sh);
  };
  return mat;
}

const RAIL_H = 0.17;   // how far the rails stand above the ties you walk on
const EYE = 1.65;     // your eye, above whatever you stand on

/* =====================================================================
 * lens state (what the panel edits)
 * ===================================================================== */
const state = {
  // The lens is normalized at a reference distance D, and H is half the view's height there. The
  // panel shows a straight-ray lens as a sensor and a spread instead (sensorSpread); the picture
  // doesn't depend on D. A 2.8 m view (and sensor, for orthographic) centered on your eye ends
  // 8 cm above the rail tops. With D = 2.42 a normal camera sees 60°.
  D: 2.42,
  H: 1.4,
  Hasked: 1.4,    // the size asked for; H is smaller when a lens's sensor would reach the rails (fitScreen)
  split: false,
  active: "x",    // which field the presets and slider apply to when split
  x: { src: "z", s: 0 },   // s is the back-plane size, or null when the lens isn't in that family
  y: { src: "z", s: 0 },
  // the lat-long sphere lens, which isn't a divide-by-f(z) lens: when on, the screen is a patch of
  // a sphere around the eye, aw° wide and ah° tall, R meters out
  // ahFit: the height follows the width so a degree is as tall as it is wide on screen (nothing
  // looks stretched), until you drag the height off that snap
  sphere: false, aw: 160, ah: 90, ahFit: true,
  // fish: with sphere on, the angle lens is a fisheye instead (see fishAngles): fw° across the
  // width, and the height follows at the same degrees per pixel
  fish: false, fw: 240,
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
// Every lens but the normal camera bends straight edges, and the graphics card cuts triangles at
// the eye plane as if edges stayed straight. A long triangle that crosses the eye plane gets cut
// in the wrong place and smears across the screen, so everything is made of pieces about half a
// meter across.
const fine = (geo, edge = 0.5) => new TessellateModifier(edge, 12).modify(geo);

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

// Clouds: one flat see-through layer 600 m up, on the same grid as the ground (fine near you, coarse
// far off, so every lens bends it smoothly). Three octaves of value noise per pixel make the
// puffs; it's one cheap pass, seen from below or, flying higher, from above.
const CLOUD_Y = 600;
const cloudMat = lensify(new THREE.MeshBasicMaterial({
  color: 0xf6f9fd, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }), (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vCloudW;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCloudW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", `#include <common>
      varying vec3 vCloudW;
      float vhash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 q) {
        vec2 i = floor(q), f = fract(q);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(vhash(i), vhash(i + vec2(1, 0)), f.x), mix(vhash(i + vec2(0, 1)), vhash(i + vec2(1, 1)), f.x), f.y);
      }`)
    .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
      vec2 cp = vCloudW.xz / 900.0;
      float cn = 0.55 * vnoise(cp) + 0.3 * vnoise(cp * 2.3 + 7.1) + 0.15 * vnoise(cp * 5.1 + 3.7);
      // thin out toward the far edge of the layer, so it melts into the sky at the horizon
      float far = 1.0 - smoothstep(2200.0, 3800.0, length(vCloudW.xz - cameraPosition.xz));
      float ca = smoothstep(0.5, 0.72, cn) * 0.9 * far;
      if (ca < 0.01) discard;
      vec4 diffuseColor = vec4(diffuse * (0.93 + 0.07 * cn), ca);`);
});
const clouds = new THREE.Mesh(groundGeo, cloudMat);
clouds.renderOrder = 1; // after the solid world, so it's see-through over it
scene.add(clouds);

// the railroad: ballast, ties, two rails, straight to the horizon
const TRACK_START = 30, TRACK_LEN = 3000, GAUGE = 1.435;
// The track near you is drawn a second time, cut ten times finer, and moves with you; the long
// track leaves a gap for it. Very wide lenses (the sphere) bend the rails and ties right under you
// sharply, and 0.5 m pieces showed there as straight segments with kinks.
const TIE_GAP = 0.65, NEAR_TRACK = 30.5 * TIE_GAP; // half its length: its ends fall between ties
const nearTrackUniforms = { nearTrackZ: { value: 1e9 } };
const outsideNearTrack = (sh) => {
  sh.uniforms.nearTrackZ = nearTrackUniforms.nearTrackZ;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying float vTrackZ;")
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      { vec4 pvW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        pvW = instanceMatrix * pvW;
        #endif
        vTrackZ = (modelMatrix * pvW).z; }`);
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vTrackZ;\nuniform float nearTrackZ;")
    .replace("void main() {", `void main() {\nif (abs(vTrackZ - nearTrackZ) < ${NEAR_TRACK.toFixed(4)}) discard;`);
};
// ballast, ties and two rails from z0 back len meters, cut into pieces `step` meters long, with
// `count` ties from tie0 back
function buildTrack(len, z0, step, fine, tie0, count) {
  const group = new THREE.Group(), n = Math.round(len / step);
  const mat = (c) => fine ? lambert(c) : lambert(c, outsideNearTrack);
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, len, fine ? 34 : 8, 1, n), mat(COL.ballast));
  ballast.position.set(0, 0.125, z0 - len / 2); ballast.receiveShadow = true; group.add(ballast);

  const tieGeo = new THREE.BoxGeometry(2.6, 0.16, 0.24, fine ? 26 : 6, fine ? 2 : 1, fine ? 3 : 1);
  const ties = new THREE.InstancedMesh(tieGeo, mat(COL.tie), count);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    mtx.makeTranslation(0, 0.25 + 0.08, tie0 - i * TIE_GAP);
    ties.setMatrixAt(i, mtx);
  }
  ties.castShadow = ties.receiveShadow = true; group.add(ties);

  // rail: a little I-beam profile (head, web, foot), extruded along z
  const prof = new THREE.Shape();
  [[-0.075, 0], [0.075, 0], [0.075, 0.015], [0.015, 0.03], [0.012, 0.12], [0.035, 0.13],
   [0.035, RAIL_H], [-0.035, RAIL_H], [-0.035, 0.13], [-0.012, 0.12], [-0.015, 0.03], [-0.075, 0.015]]
    .forEach(([x, y], i) => (i ? prof.lineTo(x, y) : prof.moveTo(x, y)));
  const railGeo = new THREE.ExtrudeGeometry(prof, { depth: len, steps: n, bevelEnabled: false });
  const railMat = mat(COL.rail);
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.set(sx * GAUGE / 2, 0.41, z0 - len);
    r.castShadow = r.receiveShadow = true; group.add(r);
  }
  for (const o of group.children) o.frustumCulled = false;
  scene.add(group);
  return group;
}
buildTrack(TRACK_LEN, TRACK_START, 0.5, false, TRACK_START - 0.3, Math.floor(TRACK_LEN / TIE_GAP));
// the fine piece, centered on a tie: it runs exactly over the long track's gap, with ties at the
// same places
// (5 cm longer at each end, so its end caps sit inside the long track's rails and bed)
const nearTrack = buildTrack(2 * NEAR_TRACK + 0.1, NEAR_TRACK + 0.05, 0.05, true, 30 * TIE_GAP, 61);
function placeNearTrack(z) {
  // center it on the tie nearest z (tie i sits at TRACK_START - 0.3 - i * TIE_GAP), inside the track
  const iMax = Math.floor(TRACK_LEN / TIE_GAP) - 31;
  const i = Math.min(iMax, Math.max(30, Math.round((TRACK_START - 0.3 - z) / TIE_GAP)));
  const c = TRACK_START - 0.3 - i * TIE_GAP;
  nearTrackUniforms.nearTrackZ.value = c;
  nearTrack.position.z = c;
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

// a signal gantry over the track, 10 m ahead of where you start. Its signal hangs over the middle
// of the track, so even the narrow orthographic window on a phone (under 2 m wide) opens with
// something standing in it. Any distance works for orthographic; 10 m keeps it from looming in
// perspective.
{
  const z = 6, post = 2.6, top = 3.7;
  for (const x of [-post, post]) addBox(0.2, top + 0.3, 0.2, x, 0, z, COL.pole, { collide: true, seg: 0.5 });
  addBox(2 * post + 0.2, 0.3, 0.2, 0, top, z, COL.pole);
  addBox(0.08, 0.3, 0.08, 0, top - 0.3, z, COL.pole);
  addBox(0.46, 1.1, 0.24, 0, top - 1.4, z, 0x1d1f23);
  for (const [y, c] of [[3.08, 0xd8362b], [2.62, 0x2fb45a]])
    addBox(0.24, 0.24, 0.04, 0, y - 0.12, z + 0.13, 0, { mat: lensify(new THREE.MeshBasicMaterial({ color: c })) });
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

// a small city ahead and to the right, past the distance signs: a grid of blocks with office
// towers, taller toward the middle, banded with window rows. Plain boxes with per-face colors,
// merged into one mesh, so it costs nothing to download.
{
  const rnd = mulberry(29);
  const WALLS = [0xb9b4aa, 0x9ea3a8, 0xc7b79a, 0x8d949c, 0xd5d0c6, 0xa89a88];
  const GLASS = [0x55677a, 0x5d7186, 0x626a74]; // soft contrast, so far-off window rows don't shimmer
  const parts = [];
  const wallC = new THREE.Color(), glassC = new THREE.Color(), roofC = new THREE.Color(0x6d6f73);
  // a tower: sides in 1.75 m rows, every other row a band of windows
  function tower(x, z, w, d, h) {
    wallC.setHex(WALLS[Math.floor(rnd() * WALLS.length)]);
    glassC.setHex(GLASS[Math.floor(rnd() * GLASS.length)]);
    const rows = Math.ceil(h / 1.75), rowH = h / rows;
    const g = new THREE.BoxGeometry(w, h, d, Math.ceil(w / 4), rows, Math.ceil(d / 4))
      .toNonIndexed();
    g.translate(x, h / 2, z);
    const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
    const col = new Float32Array(n * 3);
    for (let t = 0; t < n; t += 3) {
      const yc = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const side = Math.abs(nrm.getY(t)) < 0.5;
      const row = Math.floor(yc / rowH); // both triangles of a row's quad share a color
      const c = !side ? roofC : row > 0 && row % 2 === 1 && yc < h - 1 ? glassC : wallC;
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], 3 * (t + k));
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    parts.push(g);
    colliders.push({ min: new THREE.Vector3(x - w / 2, 0, z - d / 2), max: new THREE.Vector3(x + w / 2, h, z + d / 2) });
  }
  const BLOCK = 34, X0 = 70, Z0 = -190;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) {
    const bx = X0 + i * BLOCK, bz = Z0 - j * BLOCK;
    // taller toward the middle of the grid
    const mid = 1 - Math.hypot((i - 2.5) / 3, (j - 4) / 4.5);
    const lots = rnd() < 0.5 ? 1 : 2;
    for (let k = 0; k < lots; k++) {
      const w = lots === 1 ? 16 + rnd() * 8 : 10 + rnd() * 3, d = 16 + rnd() * 8;
      const x = bx + (lots === 1 ? 0 : (k ? 6.5 : -6.5)), z = bz + (rnd() - 0.5) * 4;
      const h = 12 + Math.max(0, mid) * (40 + rnd() * 45) + rnd() * 10;
      tower(x, z, w, d, h);
      if (h > 40 && rnd() < 0.6) { // a smaller box on the roof
        const g = new THREE.BoxGeometry(w * 0.4, 3, d * 0.4, 2, 2, 2).toNonIndexed();
        g.translate(x, h + 1.5, z); g.deleteAttribute("uv");
        const c = new Float32Array(g.attributes.position.count * 3);
        for (let q = 0; q < c.length; q += 3) c.set([roofC.r, roofC.g, roofC.b], q);
        g.setAttribute("color", new THREE.BufferAttribute(c, 3));
        parts.push(g);
      }
    }
  }
  const city = new THREE.Mesh(mergeGeometries(parts), lensify(new THREE.MeshLambertMaterial({ vertexColors: true })));
  city.castShadow = city.receiveShadow = true;
  scene.add(city);
}

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
    part(fine(roofGeo), roof, x, h, z - d / 2 - 0.4);
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
      part(fine(new THREE.IcosahedronGeometry(r, 2)), rnd() < 0.5 ? 0x4f7d3a : 0x3f6d34, tx, th + r * 0.8, tz);
    }
  }
  for (let z = 6; z > -760; z -= 20 + rnd() * 8) house(-14 - rnd() * 1.5, z);
  for (let z = -4; z > -760; z -= 22 + rnd() * 8) house(-33 - rnd() * 3, z);
  const geo = mergeGeometries(parts);
  const suburb = new THREE.Mesh(geo, lensify(new THREE.MeshLambertMaterial({ vertexColors: true })));
  suburb.castShadow = suburb.receiveShadow = true;
  scene.add(suburb);
}

// a jumping course on the right: steps up to a lookout tower (course.mjs)
for (const { x, z, w, top } of COURSE) addBox(w, 0.5, w, x, top - 0.5, z, COL.ochre, { collide: true });
// pillars holding the steps up
for (const { x, z, top } of COURSE) addBox(0.3, top - 0.5, 0.3, x, 0, z, COL.pole, { seg: 1 });
// the tower: a block with a lookout deck on top
addBox(TOWER.w, TOWER.top - 0.5, TOWER.w, TOWER.x, 0, TOWER.z, COL.chalk, { collide: true });
addBox(TOWER.deckW, 0.5, TOWER.deckW, TOWER.x, TOWER.top - 0.5, TOWER.z, COL.ochre, { collide: true });

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
  skySphere: { value: new THREE.Vector3(0, 1, 1) }, // the lat-long sphere lens (see lensSphere)
  horizon: { value: new THREE.Color(0xdde8f1) },
  mid: { value: new THREE.Color(0xa9c8e6) },
  zenith: { value: new THREE.Color(0x5f97cf) },
};
// a pixel's direction in the world for the sphere lens (sky and ground backdrop)
const SPHERE_PIX = /* glsl */`
vec3 spherePix(vec2 ndc, vec3 sph, mat3 rot) {
  if (sph.x > 1.5) { // the fisheye
    vec2 p = ndc * sph.yz;
    float a = length(p);
    vec2 sxy = a < 1e-7 ? vec2(0.0) : p * (sin(a) / a);
    return rot * vec3(sxy, -cos(a));
  }
  float lon = ndc.x * sph.y, lat = ndc.y * sph.z;
  return rot * vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
}`;
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: skyUniforms, depthTest: false, depthWrite: false,
  vertexShader: /* glsl */`
    varying vec2 vNdc;
    void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec2 skyG, skyHalf;
    uniform mat3 skyRot;
    uniform vec3 skySphere;
    uniform vec3 horizon, mid, zenith;
    ${SPHERE_PIX}
    ${HAZE}
    varying vec2 vNdc;
    void main() {
      vec3 c = horizon;
      bool sphere = skySphere.x > 0.5;
      if (sphere || (abs(skyG.x) > 1e-6 && abs(skyG.y) > 1e-6)) { // (crossed rays come in with g < 0: flipped)
        vec3 d = sphere ? spherePix(vNdc, skySphere, skyRot)
          : skyRot * vec3(vNdc.x * skyHalf.x * skyG.x, vNdc.y * skyHalf.y * skyG.y, -${SKY_R.toFixed(1)});
        float e = normalize(d).y; // sine of the elevation
        c = e < 0.0 ? pvHaze(e) : e < 0.25 ? mix(horizon, mid, e / 0.25) : mix(mid, zenith, min(1.0, (e - 0.25) / 0.6));
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
  earthSphere: { value: new THREE.Vector3(0, 1, 1) }, // the lat-long sphere lens (see lensSphere)
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
    uniform vec3 earthSphere;
    ${SPHERE_PIX}
    ${HAZE}
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
      // The sphere lens's rays all start at your eye, above the ground. There the earth is only a
      // backdrop: the ground and track painted flat, behind everything, filling the spots right
      // below you and straight behind you that the sphere can't draw as triangles.
      bool sphere = earthSphere.x > 0.5;
      if (sphere) {
        vec3 sd = spherePix(vNdc, earthSphere, mat3(earthWorld));
        if (sd.y > -1e-4) discard;
        vec4 eye = earthWorld * vec4(0.0, 0.0, 0.0, 1.0);
        // at the heights of the tie tops, then the bed, then the grass, so where it meets the real
        // track the two line up
        vec2 q = eye.xz - sd.xz * ((eye.y - 0.41) / sd.y);
        float tz = mod(${(TRACK_START - 0.3).toFixed(2)} - q.y + 0.12, 0.65);
        bool along = q.y < ${TRACK_START.toFixed(1)} && q.y > ${(TRACK_START - TRACK_LEN).toFixed(1)};
        vec3 k = earthColor;
        if (along && abs(q.x) < 1.3 && tz < 0.24) k = tieColor;
        else {
          q = eye.xz - sd.xz * ((eye.y - 0.25) / sd.y);
          along = q.y < ${TRACK_START.toFixed(1)} && q.y > ${(TRACK_START - TRACK_LEN).toFixed(1)};
          if (along && abs(q.x) < 1.7) k = ballastColor;
          else q = eye.xz - sd.xz * (eye.y / sd.y);
        }
        k = mix(k, pvHaze(normalize(sd).y), pvHazeAmount(vec3(q.x, 0.0, q.y), eye.xyz));
        gl_FragColor = vec4(k, 1.0);
        #include <colorspace_fragment>
        gl_FragDepth = 1.0;
        return;
      }
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
      // painted as one flat plan of the ground and track at y = 0, so ties stay straight bars
      vec2 p = start.xz - dir.xz * (start.y / dir.y);
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

// No body in the main view, and nothing that casts your shadow: you are only an eye. (A body
// shadow on the ground in front of you read as a third-person camera, Mike 2026-11-19.)

/* =====================================================================
 * moving around
 * ===================================================================== */
const { RADIUS, HEIGHT } = PHYS;
const START = { pos: new THREE.Vector3(0, 0.41, 16), yaw: 0, pitch: 0 };
const player = {
  pos: START.pos.clone(), vel: new THREE.Vector3(), onGround: false, air: 0,
  yaw: START.yaw, pitch: START.pitch,
  mode: "walk",
};
const keys = new Set();
let locked = false;

function walkQuat(yaw, pitch, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
}
function setMode(m) {
  if (m === player.mode) return;
  // walking and flying both turn by yaw and pitch only, so up in the world is always up on the
  // screen (Mike, 2026-11-19): switching modes never changes where you look
  player.vel.set(0, 0, 0);
  player.mode = m;
  $("jump").textContent = m === "walk" ? "jump" : "up";
  $("down").hidden = m === "walk";
  $("jump").classList.toggle("pv-raised", m !== "walk"); // up above down
  updateModeButton();
  updateHint();
}
function resetPlayer() {
  player.pos.copy(START.pos); player.vel.set(0, 0, 0);
  player.yaw = START.yaw; player.pitch = START.pitch;
}

function look(dx, dy) {
  const k = 0.0022;
  player.yaw -= dx * k;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * k, -1.55, 1.55);
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
    const speed = fast ? PHYS.RUN : PHYS.WALK;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    let mx = -sy * fwdIn + cy * sideIn, mz = -cy * fwdIn - sy * sideIn;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    player.vel.x = mx * speed; player.vel.z = mz * speed;
    // a jump still counts for a moment after you walk off an edge (coyote time)
    player.air = player.onGround ? 0 : player.air + dt;
    if ((keys.has("Space") || touchJump) && player.air <= PHYS.COYOTE && player.vel.y <= 0) {
      player.vel.y = PHYS.JUMP_V; player.onGround = false; player.air = PHYS.COYOTE + 1;
    }
    player.vel.y -= PHYS.G * dt;

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
    // forward is where you look; sideways and up/down stay level with the world
    const q = walkQuat(player.yaw, player.pitch);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const u = new THREE.Vector3(0, 1, 0);
    const v = f.multiplyScalar(fwdIn).add(r.multiplyScalar(sideIn)).add(u.multiplyScalar(up));
    if (v.lengthSq() > 1) v.normalize();
    player.pos.addScaledVector(v, speed * dt);
    player.pos.y = Math.max(player.pos.y, floorAt(player.pos.x, player.pos.z));
  }

  // camera
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  walkQuat(player.yaw, player.pitch, camera.quaternion);
  camera.updateMatrixWorld();

  // the ground grid follows you in 8 m steps (its lines are drawn in world space)
  ground.position.set(Math.round(player.pos.x / 8) * 8, 0, Math.round(player.pos.z / 8) * 8);
  clouds.position.set(ground.position.x, CLOUD_Y, ground.position.z);
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
    h = `${kbd("WASD")} fly · ${kbd("Space")}/${kbd("Ctrl")} up and down · ${kbd("Shift")} fast · ${kbd("F")} walk`;
  }
  $("hint").innerHTML = h;
}
$("mode").addEventListener("click", () => setMode(player.mode === "walk" ? "fly" : "walk"));
$("reset").addEventListener("click", resetPlayer);

/* =====================================================================
 * the panel
 * ===================================================================== */
const D0 = 2.42; // the reference distance the lens is normalized at; the picture doesn't depend on it
const fmtD = (d) => (d < 9.95 ? d.toFixed(1) : Math.round(d)) + " m";
// the tallest view, and sensor, whose bottom edge clears the rails at your feet (the default)
const CLEAR_H = EYE - RAIL_H - 0.08;
const A_MAX = CLEAR_H;            // the sensor's half height: it stops above the rails
const DEG = Math.PI / 180;
const MIN_HALF = 1 * DEG;         // rays from one point spread at least this much (half angle)
const MIN_CROSS = 0.5;            // rays that come together cross at least this far ahead

const chipsEl = $("chips");
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = p.id; b.title = p.tip;
  // names only, so the chips stay a few rows; the formula is in the field above once picked, and
  // in the tooltip
  b.textContent = p.label;
  b.title = `f(z) = ${p.src}. ${p.tip}`;
  b.addEventListener("click", () => choosePreset(p));
  chipsEl.appendChild(b);
}
// a preset that only makes sense with split axes
{
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = "mixed";
  b.title = "Orthographic side to side, perspective up and down: the rails stay parallel while the poles still shrink.";
  b.textContent = "ortho x, persp y";
  b.addEventListener("click", () => {
    state.sphere = false;
    state.split = true;
    state.x = { src: "1", s: 1 }; state.y = { src: "z", s: 0 };
    state.D = D0; state.Hasked = CLEAR_H;
    fitScreen();
    syncPanel(); applyLens(true);
  });
  chipsEl.appendChild(b);
}
{
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = "sphere";
  b.title = "Latitude-longitude: across the picture is the angle left and right, up is the angle up and down, like a world map. Make it 360° wide to see all the way around.";
  b.textContent = "lat-long";
  b.addEventListener("click", () => { state.sphere = true; state.fish = false; syncPanel(); });
  chipsEl.appendChild(b);
}
{
  const b = document.createElement("button");
  b.className = "pv-chip"; b.dataset.id = "fisheye";
  b.title = "Fisheye: how far something is from the middle of the picture is how many degrees it is from straight ahead. It can see past 180°, all the way around to straight behind you.";
  b.textContent = "fisheye";
  b.addEventListener("click", () => { state.sphere = true; state.fish = true; syncPanel(); });
  chipsEl.appendChild(b);
}

function activeAxis() { return state.split ? state.active : "x"; }
function setAxis(ax, v) {
  state[ax] = v;
  if (!state.split) state.y = { ...v };
}
// Picking a lens re-fits the view to the size asked for, or smaller if that lens's sensor would
// otherwise reach into the ground or the rails.
function fitScreen() {
  const H = fitScreenH(state.Hasked, planeRatio(axisFn(state.split ? "y" : "x"), state.D), CLEAR_H);
  if (Math.abs(H - state.H) < 1e-9) return;
  state.H = H;
}
function choosePreset(p) {
  state.sphere = false;
  state.split = false; // every chip but "ortho x, persp y" is one lens for both directions
  setAxis(activeAxis(), { src: p.src, s: p.s ?? null });
  state.D = D0; state.Hasked = CLEAR_H;
  fitScreen();
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
  $("fxLabel").textContent = state.split ? "horizontal: f(z) =" : "f(z) =";
  $("fxField").classList.toggle("pv-active", state.split && ax === "x");
  $("fyField").classList.toggle("pv-active", state.split && ax === "y");
  for (const id of ["fRow", "pRow"]) $(id).hidden = state.sphere;
  // with two lenses the rays' start is different horizontally and vertically: the caption says how
  $("sRow").hidden = state.sphere || state.split;
  $("sphereRows").hidden = !state.sphere || state.fish;
  $("fishRow").hidden = !state.sphere || !state.fish;
  $("fw").value = state.fw; $("fwVal").textContent = state.fw + "°";
  if (state.ahFit) state.ah = undistortedAh();
  $("aw").value = state.aw; $("awVal").textContent = state.aw + "°";
  $("ah").value = state.ah;
  // (past 180° tall it can't be: the height stops at straight up and down)
  $("ahVal").textContent = Math.round(state.ah) + "°" + (state.ahFit && state.aw / camera.aspect <= 180 ? " · undistorted" : "");
  $("ahTick").value = undistortedAh();
  const mixedOn = state.split && sameLens("x", { src: "1", s: 1 }) && sameLens("y", { src: "z", s: 0 });
  for (const b of chipsEl.children) {
    const id = b.dataset.id;
    if (id === "sphere") { b.classList.toggle("is-on", state.sphere && !state.fish); continue; }
    if (id === "fisheye") { b.classList.toggle("is-on", state.sphere && state.fish); continue; }
    if (state.sphere) { b.classList.remove("is-on"); continue; }
    if (id === "mixed") { b.classList.toggle("is-on", mixedOn); continue; }
    const p = PRESETS.find((q) => q.id === id);
    b.classList.toggle("is-on", !mixedOn && sameLens(ax, { src: p.src, s: p.s ?? null }));
  }
  const ss = sensorSpread();
  $("sRow").classList.toggle("pv-na", !ss);
  if (ss) { $("s").value = 2 * ss.A; $("sVal").textContent = ss.A < 1e-9 ? "a point (your eye)" : fmtD(2 * ss.A); }
  else $("sVal").textContent = "rays are curved";
  $("sNote").textContent = ss && ss.A < 1e-9 ? "A point: your eye, a normal camera." : ss && ss.A > A_MAX - 1e-3 ? "As tall as it gets without reaching the rails." : "";
  const phi = ss ? ss.phi : zoomPhi();
  $("p").value = 2 * phi / DEG;
  $("pVal").textContent = Math.round(2 * phi / DEG) + "°";
  $("pNote").textContent = spreadNote(ss);
  updateCaption();
}
// The active lens as a sensor and a spread, when its rays are straight (null when they curve, or
// with two lenses, where the sliders can only zoom). A is the sensor's half height in meters,
// phi the rays' half angle.
function sensorSpread() {
  if (state.split) return null;
  const s = effS("x");
  if (s == null) return null;
  const { A, tanPhi } = lensToSensorSpread(s, state.H, state.D);
  return { A: Math.max(0, A), phi: Math.atan(tanPhi) };
}
// with curved rays (or two lenses) the spread slider zooms: the half angle the view covers at D
const zoomPhi = () => Math.atan(state.H / state.D);
function spreadNote(ss) {
  if (!ss) return `The rays curve, so this is how far they've spread ${fmtD(state.D)} out. It zooms.`;
  if (Math.abs(ss.phi) < 1e-6) return "Parallel rays: nothing shrinks with distance. Orthographic.";
  if (ss.phi < 0) return `The rays come together and cross ${fmtD(ss.A / -Math.tan(ss.phi))} ahead. Far things look bigger, and past the crossing they're upside down.`;
  if (ss.A < 1e-9) return "The rays fan out from your eye: things shrink with distance.";
  return "The rays fan out from the sensor: far things shrink, less than for an eye.";
}
// Set the lens from a sensor and a spread, keeping each in range: rays from a point must fan out,
// and rays that come together must cross at least MIN_CROSS ahead. `moved` is the slider that
// moved; the other one wins when they disagree.
function setSensorSpread(A, phi, moved) {
  A = Math.min(A_MAX, Math.max(0, A));
  const needA = (ph) => (ph >= MIN_HALF ? 0 : Math.max(0.03, MIN_CROSS * Math.max(0, -Math.tan(ph))));
  if (moved === "A") A = Math.max(A, needA(phi));
  else if (A < needA(phi)) phi = A < 0.03 ? MIN_HALF : -Math.atan(A / MIN_CROSS);
  const { D, H, s } = sensorSpreadToLens(A, Math.tan(phi), D0);
  state.D = D; state.H = state.Hasked = H;
  setAxis("x", { src: "", s });
}

function onField(ax) {
  const inp = $(ax === "x" ? "fx" : "fy");
  const err = $(ax === "x" ? "fxErr" : "fyErr");
  const field = $(ax === "x" ? "fxField" : "fyField");
  const r = compileLens(inp.value, D0);
  if (r.error) { err.textContent = r.error; field.classList.add("pv-bad"); return; }
  err.textContent = ""; field.classList.remove("pv-bad");
  if (state.D !== D0) { state.Hasked = state.H * D0 / state.D; state.D = D0; }
  setAxis(ax, { src: inp.value, s: null });
  fitScreen();
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

$("s").addEventListener("input", (e) => {
  let A = +e.target.value / 2; // the slider shows the full height
  if (A < 0.04) A = 0;
  const ss = sensorSpread() ?? { A: 0, phi: zoomPhi() };
  setSensorSpread(A, ss.phi, "A");
  clearErrors();
  syncPanel();
  applyLens(false);
});
$("p").addEventListener("input", (e) => {
  let full = +e.target.value;
  for (const snap of [0, 60]) if (Math.abs(full - snap) < 3) full = snap;
  const ss = sensorSpread();
  if (ss) setSensorSpread(ss.A, full / 2 * DEG, "phi");
  else { // curved rays: zoom
    state.Hasked = state.D * Math.tan(Math.max(MIN_HALF, full / 2 * DEG));
    fitScreen();
  }
  syncPanel();
  applyLens(false);
});
// the sphere lens: its angular size, and how far out the curved screen is
// the height at which a degree is as tall as it is wide on screen
const undistortedAh = () => Math.min(180, Math.max(10, state.aw / camera.aspect));
// the fisheye's half width and height in radians: the same degrees per pixel both ways
const fishHalf = () => { const h = THREE.MathUtils.degToRad(state.fw / 2); return [h, h / camera.aspect]; };
const snapTo = (v, pts, r) => { for (const p of pts) if (Math.abs(v - p) <= r) return p; return v; };
$("aw").addEventListener("input", (e) => {
  state.aw = snapTo(+e.target.value, [180, 360], 6);
  if (state.ahFit) state.ah = undistortedAh();
  syncPanel();
});
$("fw").addEventListener("input", (e) => {
  state.fw = snapTo(+e.target.value, [180, 360], 6);
  syncPanel();
});
$("ah").addEventListener("input", (e) => {
  const v = +e.target.value, u = undistortedAh();
  state.ahFit = Math.abs(v - u) <= 5;
  state.ah = state.ahFit ? u : snapTo(v, [180], 5);
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
    else if (s < 0) c = "The sensor is flipped, so the rays cross <b>behind</b> you.";
    else if (s < 1) c = `The rays start on a <b>${fmtD(2 * s * state.H)}</b> sensor and fan out, so far things shrink less.`;
    else if (Math.abs(s - 1) < 1e-9) c = "Rays are <b>parallel</b>, so nothing shrinks. Looking level, the ground is edge-on.";
    else c = `The rays start on a <b>${fmtD(2 * s * state.H)}</b> sensor and come together, crossing <b>${fmtD(convergenceDepth(s, state.D))}</b> ahead. Past that the world is upside down.`;
  } else {
    c = `Rays bend to follow <b>f(z) = ${escapeHtml(st.src)}</b>.`;
  }
  if (state.split) {
    const short = (a) => {
      const v = effS(a);
      if (v == null) return `f(z) = ${escapeHtml(state[a].src)}`;
      if (Math.abs(v) < 1e-9) return "rays fan out from your eye, like a camera";
      if (Math.abs(v - 1) < 1e-9) return "rays run parallel, so nothing shrinks";
      return v > 1 ? `rays come together from a ${fmtD(2 * v * state.H)} sensor` : `rays fan out from a ${fmtD(2 * v * state.H)} sensor`;
    };
    c = `<b>Horizontal:</b> ${short("x")}. <b>Vertical:</b> ${short("y")}.`;
  }
  if (state.sphere && state.fish) c = `A <b>${state.fw}°</b> fisheye: how far something is from the middle of the picture is how far it is from straight ahead, in degrees.${state.fw > 180 ? " Past the sides it sees behind you." : ""}`;
  else if (state.sphere) c = `A <b>${state.aw}° × ${Math.round(state.ah)}°</b> latitude-longitude view, like a world map of everything around you: across is the angle left and right, up is the angle up and down.`;
  $("caption").innerHTML = c;
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));


/* =====================================================================
 * about-modal diagrams (the same drawing code, with lenses that animate on their own)
 * ===================================================================== */
// The About's live pictures (the sensor sweep and the sliders) come from this game's own
// renderer: the About's small scene built in three.js with the same lens shader, drawn by a second
// renderer of its own into a hidden canvas, with its own lens table so the game's isn't touched.
// The About's scene has x right, y up and z ahead; three.js looks down -z, so the scene sits in a
// group flipped along z.
const engineDemo = (() => {
  let r = null, sc, cam, lut, uni;
  function build() {
    const cv = document.createElement("canvas");
    r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    lut = new Float32Array(LUT.N * 4);
    const tex = new THREE.DataTexture(lut, LUT.N, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    uni = {
      lensLUT: { value: tex }, lensHalf: { value: new THREE.Vector2(1, 1) },
      lensRange: { value: lensUniforms.lensRange.value.clone() }, lensC: { value: LUT.C },
      lensOn: { value: 1 }, lensSphere: { value: new THREE.Vector3(0, 1, 1) },
    };
    sc = new THREE.Scene();
    const sky = new THREE.Color(`rgb(${SCENE3.sky})`);
    sc.background = sky; sc.fog = new THREE.FogExp2(sky, 0.022);
    const g = new THREE.Group(); g.scale.z = -1; sc.add(g);
    const mat = (o) => lensify(new THREE.MeshLambertMaterial(o), null, uni);
    // the ground: 1 m checks, like the traced pictures
    const ck = document.createElement("canvas"); ck.width = ck.height = 2;
    const cx = ck.getContext("2d"), gr = SCENE3.grass;
    cx.fillStyle = `rgb(${gr})`; cx.fillRect(0, 0, 2, 2);
    cx.fillStyle = `rgb(${gr.map((v) => v * 0.9)})`; cx.fillRect(1, 0, 1, 1); cx.fillRect(0, 1, 1, 1);
    const gt = new THREE.CanvasTexture(ck); gt.colorSpace = THREE.SRGBColorSpace;
    gt.magFilter = THREE.NearestFilter; gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(150, 150);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 120, 120), mat({ map: gt }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = SCENE3.ground; ground.receiveShadow = true;
    g.add(ground);
    for (const b of SCENE3.boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2 * b.half[0], 2 * b.half[1], 2 * b.half[2], 4, 4, 4), mat({ color: b.color }));
      m.position.set(...b.c); m.rotation.y = b.rot; m.castShadow = m.receiveShadow = true; g.add(m);
    }
    for (const [x, y, z, rad, color] of SCENE3.balls) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 48, 32), mat({ color }));
      m.position.set(x, y, z); m.castShadow = true; g.add(m);
    }
    // the sun from the same direction as the traced pictures' (ambient + direct ≈ their 0.5 + 0.55 lit)
    g.add(new THREE.AmbientLight(0xffffff, 0.68));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    const dir = new THREE.Vector3(-0.5, 0.8, -0.35).normalize();
    sun.position.copy(dir.multiplyScalar(30)).add(new THREE.Vector3(0, 0, 5)); sun.target.position.set(0, 0, 5);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 70 });
    g.add(sun, sun.target);
    cam = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
  }
  // the picture `lens` makes, w × w pixels; returns the canvas it's drawn on
  return (lens, w) => {
    if (!r) build();
    if (r.domElement.width !== w) r.setSize(w, w, false);
    const { Ax, tx, Ay, ty } = axes(lens);
    const tmp = new Float32Array(LUT.N * 2);
    sampleLens((z) => Ax + z * tx, (z) => Ay + z * ty, tmp, NEAR);
    for (let i = 0; i < LUT.N; i++) { lut[4 * i] = tmp[2 * i]; lut[4 * i + 1] = tmp[2 * i + 1]; }
    uni.lensLUT.value.needsUpdate = true;
    r.render(sc, cam);
    return r.domElement;
  };
})();
setEngine(engineDemo);

let aboutRAF = 0, aboutOpen = false;
const stores = new WeakMap(); // per canvas, for the 3D demos that keep state
document.addEventListener("cohesion-modal-open", (e) => {
  if (!e.detail.className?.includes("cohesion-about")) return;
  aboutOpen = true; // the world stays still behind the About, and its demos get the time
  const el = e.detail.el;
  const canvases = [...el.querySelectorAll(".pv-about-diagram")];
  const t0 = performance.now();
  const D = 10;
  // the sensor size and spread sliders: their lens, f(z) written out with their numbers
  const play = {};
  const readPlay = () => {
    const S = +el.querySelector("#playS").value, pIn = el.querySelector("#playP");
    if (S < 0.05 && +pIn.value < 5) pIn.value = 5; // an eye needs some spread
    const P = +pIn.value, A = S / 2, tn = Math.tan((P / 2) * Math.PI / 180);
    el.querySelector("#playSv").textContent = `${S.toFixed(2)} m`;
    el.querySelector("#playPv").textContent = `${P}°`;
    const n = (v) => (v < 0 ? "− " : "+ ") + Math.abs(v).toFixed(2);
    play.lens = { A, t: tn };
    play.graph = { label: `f(z) = ${S.toFixed(2)}/2 + z·tan(${P}°/2) = ${A.toFixed(2)} ${n(tn)} z`, f: (z) => A + z * tn };
  };
  if (el.querySelector("#playS")) { readPlay(); el.querySelectorAll(".pv-play input").forEach((i) => i.addEventListener("input", readPlay)); }
  const tick = (now) => {
    const t = Math.max(0, now - t0) / 1000; // the first frame can be stamped before t0
    for (const cv of canvases) {
      const r = cv.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue; // only the ones in view
      const dpr = Math.min(devicePixelRatio, 2);
      if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const demo = cv.dataset.demo;
      const cap = (txt) => { const c = el.querySelector(`[data-caption="${demo}"]`); if (c && txt !== undefined && c.textContent !== txt) c.textContent = txt; };
      if (demo === "render") drawRenderDemo(ctx, r.width, r.height, t, { lens: EYE_LENS });
      else if (demo === "render-ortho") drawRenderDemo(ctx, r.width, r.height, t, { lens: SENSOR_LENS });
      else if (GRAPHS[demo]) drawGraphDemo(ctx, r.width, r.height, demo, t);
      else if (demo === "graph-sliders") drawGraphDemo(ctx, r.width, r.height, demo, t, play.graph);
      else if (demo === "plane") {
        // the 3D sweep's lens, in its meters (its picture is 2 m ahead), drawn here with that 2 m at D
        const lens = sensorSweep(t), k = 2 / D, f3 = (z) => lens.A + lens.t * z;
        const meet = lens.t < -1e-3 ? lens.A / -lens.t : Infinity;
        drawDiagram(ctx, r.width, r.height, { D, h: D * Math.tan(FOV / 2), gy: (z) => f3(z * k) / 1.1, s: lens.A / 1.1, meet: meet / k });
        const spread = Math.round(2 * Math.atan(lens.t) * 180 / Math.PI);
        cap(lens.A < 0.02 ? `An eye, spreading ${spread}°: a normal camera.`
          : Math.abs(lens.t) < 0.003 ? `A ${fmtD(2 * lens.A)} sensor, spread 0°: parallel rays, orthographic.`
          : lens.t < -0.49 ? `A ${fmtD(2 * lens.A)} sensor, spread ${spread}°: the rays cross ${fmtD(meet)} ahead, so past that the world is upside down.`
          : `A ${fmtD(2 * lens.A)} sensor, spread ${spread}°.`);
      } else if (demo === "functions") {
        // hold each function, then morph to the next the way the lens does
        const k = Math.floor(t / FUNCTION_PERIOD) % FUNCTIONS.length, into = (t % FUNCTION_PERIOD) / 0.9;
        const cur = FUNCTIONS[k], prev = FUNCTIONS[(k + FUNCTIONS.length - 1) % FUNCTIONS.length];
        const ga = normalizedLens(prev.f, D), gb = normalizedLens(cur.f, D);
        const u = Math.min(1, into), ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        drawDiagram(ctx, r.width, r.height, { D, h: D * Math.tan(FOV / 2), gy: (z) => ga(z) + (gb(z) - ga(z)) * ease, s: null });
        cap(`f(z) = ${cur.name}.`);
      } else {
        let st = stores.get(cv); if (!st) { st = {}; stores.set(cv, st); }
        if (demo === "sliders3d") st.lens = play.lens;
        cap(drawAbout3D(demo, ctx, r.width, r.height, dpr, t, st));
      }
    }
    aboutRAF = requestAnimationFrame(tick);
  };
  aboutRAF = requestAnimationFrame(tick);
});
document.addEventListener("cohesion-modal-close", (e) => {
  if (e.detail.className?.includes("cohesion-about")) { cancelAnimationFrame(aboutRAF); aboutOpen = false; }
});

/* =====================================================================
 * the side view: an ordinary camera off to your side, showing where your eye (or back plane) and
 * the screen are in the world, and the rays leaving them. Drawn into a corner of the main canvas
 * with the lens switched off, copied into the panel, then the main view is drawn over it.
 * ===================================================================== */
const INSET = 1; // layer for things only the side view sees
const insetCam = new THREE.PerspectiveCamera(40, 2, 0.1, 3000);
// The side view fades the world into haze past the figure, so the eye, screen and rays stand out.
// The main view keeps the same fog with its range pushed out of reach, so both use one shader.
const FOG_COLOR = 0xc9d9e6;
const insetFog = new THREE.Fog(FOG_COLOR, 1e8, 2e8);
const noFog = { near: 1e8, far: 2e8 };
scene.fog = insetFog;
insetCam.layers.enable(INSET);
const helpers = new THREE.Group();
scene.add(helpers);
// outlines and rays are drawn as thick lines (plain GL lines are 1 px, too thin to read at panel size)
const fatMats = [];
const fat = (color, width) => { const m = new LineMaterial({ color, linewidth: width }); fatMats.push(m); return m; };
const rectGeo = new LineSegmentsGeometry().setPositions(
  [-.5, -.5, 0, .5, -.5, 0, .5, -.5, 0, .5, .5, 0, .5, .5, 0, -.5, .5, 0, -.5, .5, 0, -.5, -.5, 0]);
const flat = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
const planeFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(0x5aa9e6, 0.45));
// When the sensor shrinks to a point, you're drawn as a floating eyeball looking where you look.
const eyeball = new THREE.Group();
{
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: 0x3d8fd6 }));
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshBasicMaterial({ color: 0x0d0f12 }));
  iris.position.z = -0.142; iris.rotation.y = Math.PI; pupil.position.z = -0.144; pupil.rotation.y = Math.PI;
  eyeball.add(white, iris, pupil);
}
const planeEdge = new LineSegments2(rectGeo, fat(0x3d9be9, 2.5));
const RAY_U = [-1, 0, 1], RAY_STEPS = 48, N_RAYS = RAY_U.length ** 2;
const rayPos = new Float32Array(N_RAYS * RAY_STEPS * 2 * 3);
const rayGeo = new LineSegmentsGeometry();
const rays = new LineSegments2(rayGeo, fat(0xffd23f, 2));
rays.frustumCulled = false;
// the sphere lens's screen: a curved lat-long patch, rebuilt as its angles change
const SPH_U = 48, SPH_V = 24;
const sphereGeo = new THREE.BufferGeometry();
sphereGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SPH_U + 1) * (SPH_V + 1) * 3), 3));
{
  const idx = [];
  for (let j = 0; j < SPH_V; j++) for (let i = 0; i < SPH_U; i++) {
    const a = j * (SPH_U + 1) + i, b = a + 1, c = a + SPH_U + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  sphereGeo.setIndex(idx);
}
const sphereFill = new THREE.Mesh(sphereGeo, flat(0xe8553d, 0.3));
sphereFill.frustumCulled = false;
const sphereEdgeGeo = new LineSegmentsGeometry();
const sphereEdge = new LineSegments2(sphereEdgeGeo, fat(0xff5a3c, 3));
sphereEdge.frustumCulled = false;
const sphereDir = (lon, lat, out = []) => {
  out[0] = Math.cos(lat) * Math.sin(lon); out[1] = Math.sin(lat); out[2] = -Math.cos(lat) * Math.cos(lon);
  return out;
};
const SIDE_R = 3; // how far out the side view draws the sphere's screen (the picture doesn't depend on it)
// a direction on the patch in the view's frame, u and v from -1 to 1 across and up
function patchDir(u, v, d = []) {
  if (state.fish) { // the fisheye: (u, v) scaled to angles, leaning that way from straight ahead
    const [hw, hh] = fishHalf(), x = u * hw, y = v * hh, a = Math.hypot(x, y), k = a < 1e-9 ? 1 : Math.sin(a) / a;
    d[0] = x * k; d[1] = y * k; d[2] = -Math.cos(a);
    return d;
  }
  const hl = THREE.MathUtils.degToRad(state.aw / 2), hv = THREE.MathUtils.degToRad(state.ah / 2);
  return sphereDir(u * hl, v * hv, d);
}
let sphereKey = "";
function updateSpherePatch() {
  const key = state.fish ? `fish,${state.fw},${camera.aspect}` : `${state.aw},${state.ah}`;
  if (key === sphereKey) return;
  sphereKey = key;
  const d = [];
  const at = (u, v) => patchDir(u, v, d).map((c) => c * SIDE_R);
  const pos = sphereGeo.attributes.position;
  for (let j = 0; j <= SPH_V; j++) for (let i = 0; i <= SPH_U; i++) {
    pos.setXYZ(j * (SPH_U + 1) + i, ...at(-1 + 2 * i / SPH_U, -1 + 2 * j / SPH_V));
  }
  pos.needsUpdate = true;
  const edge = [];
  const run = (n, f) => { for (let i = 0; i < n; i++) edge.push(...f(i / n), ...f((i + 1) / n)); };
  run(SPH_U, (t) => at(-1 + 2 * t, -1)); run(SPH_U, (t) => at(-1 + 2 * t, 1));
  run(SPH_V, (t) => at(-1, -1 + 2 * t)); run(SPH_V, (t) => at(1, -1 + 2 * t));
  sphereEdgeGeo.setPositions(edge);
}
helpers.add(planeFill, planeEdge, eyeball, sphereFill, sphereEdge, rays);
helpers.traverse((o) => o.layers.set(INSET));

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
function updateInset(aspect) {
  const hx = state.H * camera.aspect, hy = state.H;
  const gx = lutFn(shown, 0), gy = lutFn(shown, 1);
  const eye = camera.position, q = camera.quaternion;
  const fwd = _w.set(0, 0, -1).applyQuaternion(q);
  // the back plane: where the rays start, read off the lens at the eye (a point for a camera)
  // (exactly the back-plane size when the lens has one, so a normal camera shows a point)
  const sx = effS("x"), sy = effS(state.split ? "y" : "x");
  const g0x = !morph && sx != null ? sx : Math.max(0, gx(NEAR)), g0y = !morph && sy != null ? sy : Math.max(0, gy(NEAR));
  const px = Math.min(400, 2 * hx * g0x), py = Math.min(400, 2 * hy * g0y);
  const isPlane = px > 0.03 && py > 0.03;
  for (const o of [planeFill, planeEdge]) {
    o.visible = isPlane; o.position.copy(eye); o.quaternion.copy(q); o.scale.set(px || 1, py || 1, 1);
  }
  eyeball.visible = !isPlane || state.sphere; eyeball.position.copy(eye); eyeball.quaternion.copy(q); eyeball.scale.setScalar(2);
  for (const o of [sphereFill, sphereEdge]) { o.visible = state.sphere; o.position.copy(eye); o.quaternion.copy(q); }
  if (state.sphere) return updateInsetSphere(aspect, eye, q, fwd);
  // the rays through the screen's corners, edge middles and center, as far as they go
  // long enough to show converging rays crossing and carrying on
  const sc = effS(state.split ? "y" : "x");
  const zEnd = Math.min(400, Math.max(14, 3.2 * state.D, sc != null && sc > 1 ? 1.8 * convergenceDepth(sc, state.D) : 0));
  let k = 0;
  for (const ux of RAY_U) for (const uy of RAY_U) {
    let prev = null;
    for (let i = 0; i <= RAY_STEPS; i++) {
      const z = NEAR + (zEnd - NEAR) * Math.pow(i / RAY_STEPS, 1.4);
      const a = gx(z), b = gy(z);
      let cur = null;
      // rays keep going after they cross (g < 0); stop only where they shoot off to infinity
      if (isFinite(a) && isFinite(b) && Math.abs(ux * hx * a) < 300 && Math.abs(uy * hy * b) < 300)
        cur = _v.set(ux * hx * a, uy * hy * b, -z).applyMatrix4(camera.matrixWorld).toArray();
      if (i > 0) {
        const p0 = prev && cur ? prev : [0, 0, 0], p1 = prev && cur ? cur : [0, 0, 0];
        if (!(prev && cur)) { // a gap: a zero-length segment at the eye, hidden in the dot
          eye.toArray(p0); eye.toArray(p1);
        }
        rayPos.set(p0, k); rayPos.set(p1, k + 3); k += 6;
      }
      prev = cur;
    }
  }
  rayGeo.setPositions(rayPos);
  // off to your right, a little above and behind, upright, looking at the space in front of you
  const s0 = Math.max(1, py / (2 * hy));
  // far enough back to fit the screen and the back plane (40° lens: height / 0.73, plus margin)
  const dist = 2.2 + 0.9 * state.D + 2.3 * state.H * Math.min(s0, 3);
  _q.setFromEuler(new THREE.Euler(0, player.yaw, 0, "YXZ"));
  insetCam.position.copy(eye).add(_v.set(0.95, 0.42, 0.55).multiplyScalar(dist).applyQuaternion(_q));
  insetCam.lookAt(_v.copy(eye).addScaledVector(fwd, state.D * 0.45));
  insetFog.near = dist * 0.7; insetFog.far = dist * 2.6;
  insetCam.aspect = aspect;
  insetCam.updateProjectionMatrix();
  insetCam.updateMatrixWorld();
}
// the sphere lens: straight rays out from the eye through the patch's corners, edge middles and
// center, and the camera far enough back to see the whole patch
function updateInsetSphere(aspect, eye, q, fwd) {
  updateSpherePatch();
  for (const o of [planeFill, planeEdge]) o.visible = false;
  const len = Math.max(14, 2.5 * SIDE_R), d = [];
  let k = 0;
  for (const ux of RAY_U) for (const uy of RAY_U) {
    patchDir(ux, uy, d);
    _v.set(d[0] * len, d[1] * len, d[2] * len);
    const tip = _v.applyMatrix4(camera.matrixWorld).toArray();
    for (let i = 0; i < RAY_STEPS; i++) { // one real segment, the rest folded into the eye dot
      rayPos.set(i === 0 ? eye.toArray() : tip, k); rayPos.set(tip, k + 3); k += 6;
    }
  }
  rayGeo.setPositions(rayPos);
  const dist = 3.2 + 2.6 * SIDE_R;
  _q.setFromEuler(new THREE.Euler(0, player.yaw, 0, "YXZ"));
  insetCam.position.copy(eye).add(_v.set(0.95, 0.55, 0.55).multiplyScalar(dist).applyQuaternion(_q));
  insetCam.lookAt(_v.copy(eye).addScaledVector(fwd, SIDE_R * 0.3));
  insetFog.near = dist * 0.8; insetFog.far = dist * 3;
  insetCam.aspect = aspect;
  insetCam.updateProjectionMatrix();
  insetCam.updateMatrixWorld();
}
const panelEl = document.querySelector("control-panel");
const dctx = diag.getContext("2d");
const _size = new THREE.Vector2();
function renderInset() {
  if (!panelEl || panelEl.hasAttribute("collapsed") || isBg) return;
  const r = diag.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const w = Math.round(r.width), h = Math.round(r.height), pr = renderer.getPixelRatio();
  const cw = Math.round(w * pr), ch = Math.round(h * pr);
  if (cw > renderer.domElement.width || ch > renderer.domElement.height) return;
  updateInset(w / h);
  for (const m of fatMats) m.resolution.set(w, h);
  lensUniforms.lensOn.value = 0; sky.visible = earth.visible = false;
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
  renderer.setClearColor(FOG_COLOR);
  renderer.render(scene, insetCam);
  if (diag.width !== cw || diag.height !== ch) { diag.width = cw; diag.height = ch; }
  dctx.drawImage(renderer.domElement, 0, renderer.domElement.height - ch, cw, ch, 0, 0, cw, ch);
  // labels, on plates like the rest of the page's text over the scene
  dctx.font = `600 ${12 * pr}px 'JetBrains Mono', monospace`; dctx.textBaseline = "middle";
  // labels already placed: a new one that would overlap one moves clear of it (above, or below
  // when there's no room above)
  const placed = [];
  const tag = (txt, p, color, dy) => {
    _v.copy(p).project(insetCam);
    if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) return;
    const x = (_v.x * 0.5 + 0.5) * cw;
    let y = Math.min(ch - 9 * pr, Math.max(9 * pr, (-_v.y * 0.5 + 0.5) * ch + dy * pr));
    const tw = dctx.measureText(txt).width;
    for (const o of placed) {
      if (Math.abs(x - o.x) < (tw + o.tw) / 2 + 8 * pr && Math.abs(y - o.y) < 18 * pr) {
        y = o.y - 18 * pr >= 9 * pr ? o.y - 18 * pr : o.y + 18 * pr;
      }
    }
    placed.push({ x, y, tw });
    dctx.fillStyle = "rgba(17,19,23,0.88)"; dctx.fillRect(x - tw / 2 - 4 * pr, y - 8 * pr, tw + 8 * pr, 16 * pr);
    dctx.fillStyle = color; dctx.fillText(txt, x - tw / 2, y);
  };
  const top = (o, sy) => _w.set(0, 0.5 * sy, 0).applyQuaternion(o.quaternion).multiplyScalar(o.scale.y).add(o.position);
  if (state.sphere) {
    _w.fromArray(patchDir(0, 1)).multiplyScalar(SIDE_R);
    tag("view", _w.applyMatrix4(camera.matrixWorld), "#ff7a5e", -11);
  }
  tag(planeEdge.visible ? "sensor" : "eye", planeEdge.visible ? top(planeEdge, -1) : camera.position, "#7cc0f2", planeEdge.visible ? 11 : -30);
  insetFog.near = noFog.near; insetFog.far = noFog.far;
  lensUniforms.lensOn.value = 1; sky.visible = earth.visible = true;
  renderer.setScissorTest(false);
  renderer.getSize(_size); renderer.setViewport(0, 0, _size.x, _size.y);
  renderer.setClearColor(0xdde8f1);
}

/* =====================================================================
 * main loop
 * ===================================================================== */
// The view stops above the button bar, so the bottom of the picture (where orthographic shows the
// ground line and the track bed) is never hidden behind it. On phones it also starts below the
// title and hint. The ?background variant keeps the whole window.
function resize() {
  const cv = renderer.domElement, bg = document.body.classList.contains("pv-background");
  const top = !bg && innerWidth <= 700 ? Math.ceil($("hint").getBoundingClientRect().bottom) + 8 : 0;
  const bottom = bg ? 0 : Math.ceil(innerHeight - document.querySelector(".pv-bar").getBoundingClientRect().top) + 8;
  const w = innerWidth, h = Math.max(1, innerHeight - top - bottom);
  cv.style.top = top + "px"; cv.style.height = h + "px";
  document.querySelector(".pv-crosshair").style.top = top + h / 2 + "px";
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
}
addEventListener("resize", resize);
{ const ro = new ResizeObserver(() => resize()); ro.observe($("hint")); ro.observe(document.querySelector(".pv-bar")); }
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (aboutOpen) { requestAnimationFrame(frame); return; }
  update(dt);
  const morphing = stepMorph(now);
  lensUniforms.lensHalf.value.set(state.H * camera.aspect, state.H);
  placeNearTrack(player.pos.z);
  // the window's shape changed: keep an undistorted sphere undistorted
  if (state.sphere && state.ahFit && Math.abs(undistortedAh() - state.ah) > 0.01) syncPanel();
  if (state.sphere && state.fish) lensUniforms.lensSphere.value.set(2, ...fishHalf());
  else lensUniforms.lensSphere.value.set(state.sphere ? 1 : 0, THREE.MathUtils.degToRad(state.aw / 2), THREE.MathUtils.degToRad(state.ah / 2));
  skyUniforms.skySphere.value.copy(lensUniforms.lensSphere.value);
  camera.updateMatrixWorld();
  updateSky();
  renderInset();
  earthUniforms.earthSphere.value.copy(lensUniforms.lensSphere.value);
  renderer.shadowMap.needsUpdate = true; // once a frame, for the main view; the side view reuses it
  renderer.render(scene, camera);
  if (!morphing && morph === null && wasMorphing) syncPanel();
  wasMorphing = morphing;
  requestAnimationFrame(frame);
}
let wasMorphing = false;
const redrawDiagram = () => {}; // the side view redraws every frame
for (const id of ["s", "p", "fx", "fy"]) $(id).addEventListener("input", redrawDiagram);
chipsEl.addEventListener("click", redrawDiagram);
new ResizeObserver(redrawDiagram).observe(diag);

if (matchMedia("(max-width: 700px)").matches) document.querySelector("control-panel")?.setAttribute("collapsed", "");
// on touch screens the open panel covers most of the view, so a tap outside it closes it
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  const panel = document.querySelector("control-panel");
  if (panel && !panel.hasAttribute("collapsed") && !panel.contains(e.target)) panel.setAttribute("collapsed", "");
}, true);
if (isBg) { document.body.classList.add("pv-background"); resize(); }
resetPlayer();
applyLens(false);
syncPanel();
updateModeButton();
updateHint();
requestAnimationFrame(frame);

// for testing from the console / automation
window.pv = { state, player, setMode, applyLens, syncPanel, setSensorSpread, renderer, scene, camera };
