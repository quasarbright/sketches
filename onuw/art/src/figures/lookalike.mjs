import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The lookalike: a hooded villager walking with their exact double, a paler copy one step behind
// them in the very same pose, as if the copy were peeling off them.
const { card: bg, ink, band } = ROLE_COLORS.lookalike;
const person = () => {
  const legs = [brush([[170, 470], [164, 530], [160, 586]], [30, 26, 22]), boot(160, 598, { s: 20 }), brush([[200, 470], [210, 530], [214, 586]], [30, 26, 22]), boot(216, 598, { s: 20 })];
  const tunic = blob([[150, 280], [196, 268], [222, 296], [230, 380], [240, 470], [248, 496, "c"], [216, 490], [186, 500], [156, 490], [128, 498, "c"], [136, 430], [140, 350]]);
  const hood = blob([[156, 218], [172, 184], [200, 174], [222, 188], [232, 216], [236, 256], [216, 276], [178, 278], [156, 260]]);
  const face = blob([[214, 194], [228, 200], [234, 214], [246, 226, "c"], [234, 230], [236, 242], [230, 248], [232, 258], [218, 266], [208, 248]]);
  const arm = [brush([[208, 300], [222, 370], [228, 426]], [24, 20, 16]), blob([[218, 420], [238, 418], [242, 440], [226, 448], [216, 436]])];
  const cuts = [brush([[214, 192], [206, 230], [216, 266]], [4, 5, 3]), brush([[224, 214], [234, 213]], [3, 2]), brush([[134, 400], [232, 396]], [5, 5]),
    brush([[170, 340], [162, 420], [156, 490]], [3, 5, 2])];
  return { legs, tunic, hood, face, arm, cuts };
};
const draw = (fill, transform) => { const p = person(); return [...p.legs.map((d) => ({ d, fill, transform })), ...[p.tunic, p.hood, p.face].map((d) => ({ d, fill, transform })),
  ...p.cuts.map((d) => ({ d, fill: "bg", transform })), { group: p.arm, fill, halo: 4, roots: [[208, 300, 18]], transform }]; };
export default card({ bg, ink, transform: "translate(0 -10)", layers: [...draw(band, "translate(14 -8)"), ...draw(ink, "translate(98 0)")] });
