import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The lookalike: a hooded villager face to face with their exact double, a paler copy of them, as if
// looking into a mirror that isn't there. Each raises the same hand.
const { card: bg, ink, band } = ROLE_COLORS.lookalike;
const person = () => {
  const legs = [brush([[170, 470], [164, 530], [160, 586]], [30, 26, 22]), boot(160, 598, { s: 20 }), brush([[200, 470], [210, 530], [214, 586]], [30, 26, 22]), boot(216, 598, { s: 20 })];
  const tunic = blob([[150, 280], [196, 268], [222, 296], [230, 380], [240, 470], [248, 496, "c"], [216, 490], [186, 500], [156, 490], [128, 498, "c"], [136, 430], [140, 350]]);
  const hood = blob([[156, 218], [172, 184], [200, 174], [222, 188], [232, 216], [236, 256], [216, 276], [178, 278], [156, 260]]);
  const face = blob([[214, 194], [228, 200], [234, 214], [246, 226, "c"], [234, 230], [236, 242], [230, 248], [232, 258], [218, 266], [208, 248]]);
  const arm = [brush([[212, 300], [240, 330], [244, 290]], [24, 20, 16]), blob([[236, 278], [254, 276], [256, 296], [238, 298]])];
  const cuts = [brush([[214, 192], [206, 230], [216, 266]], [4, 5, 3]), brush([[224, 214], [234, 213]], [3, 2]), brush([[134, 400], [232, 396]], [5, 5]),
    brush([[170, 340], [162, 420], [156, 490]], [3, 5, 2])];
  return { legs, tunic, hood, face, arm, cuts };
};
const draw = (fill, transform) => { const p = person(); return [...p.legs.map((d) => ({ d, fill, transform })), ...[p.tunic, p.hood, p.face].map((d) => ({ d, fill, transform })),
  ...p.cuts.map((d) => ({ d, fill: "bg", transform })), { group: p.arm, fill, halo: 4, roots: [[212, 300, 18]], transform }]; };
export default card({ bg, ink, transform: "translate(0 -10)", layers: [...draw(ink, "translate(-4 0)"), ...draw(band, "translate(504 0) scale(-1 1)")] });
