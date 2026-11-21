// The jumping course on the right of the track, and the walking physics it's tuned for. Both live
// here so course.test.mjs can run the course with the same numbers the game uses.

// walking: speeds in m/s, jump launch speed, gravity, and the grace time after you walk off an
// edge during which a jump still counts (so a slightly late press isn't punished)
export const PHYS = { RADIUS: 0.3, HEIGHT: 1.8, WALK: 5.5, RUN: 11, JUMP_V: 8.2, G: 24, COYOTE: 0.12 };

// platforms evenly spaced along a winding path, each 0.8 m higher than the last. A jump at walking
// speed peaks 1.4 m up and carries about 3 m, so these 1.5 m gaps work from anywhere on the
// platform: no running and no tight timing (course.test.mjs checks this with randomized timing).
const PATH = [[9, -6], [19, -14], [24, -22], [21, -31], [17, -38], [21, -46], [28.2, -51]];
const STEPS = 14, WIDTH = 2.6, RISE = 0.8;
export const COURSE = (() => {
  const seg = []; let L = 0;
  for (let i = 0; i + 1 < PATH.length; i++) {
    const l = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); seg.push(l); L += l;
  }
  const out = [];
  for (let k = 0; k < STEPS; k++) {
    let s = L * k / (STEPS - 1), i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const t = s / seg[i], [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, w: WIDTH, top: RISE * (k + 1) });
  }
  return out;
})();
// the lookout tower at the end: a 6 m block with a 7 m deck on top, one step above the last platform
export const TOWER = { x: 34, z: -54, w: 6, deckW: 7, top: RISE * (STEPS + 1) };
