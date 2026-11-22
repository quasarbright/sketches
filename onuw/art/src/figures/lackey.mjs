import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The lackey: a conniving servant creeping forward bent double, knees bent, head thrust out low under his
// hood with a narrow sidelong eye and a sly grin, rubbing his hands while he dangles a lantern for the wolves.
const { card: bg, ink } = ROLE_COLORS.lackey;
// legs bent in a creeping step, toes pointing left
const legs = [brush([[262, 460], [226, 518], [222, 584]], [34, 28, 24]), boot(222, 598, { s: 24, dir: -1 }),
  brush([[306, 460], [334, 526], [326, 584]], [34, 28, 24]), boot(326, 598, { s: 24, dir: -1 })];
// a knee-length coat on a back bent forward from the hips: the hump is the high point, the hem flares
const coat = blob([[186, 300], [214, 256], [262, 222], [312, 222], [350, 252], [364, 306], [362, 380], [368, 470], [376, 500, "c"], [330, 492], [290, 502], [250, 494], [212, 502, "c"], [222, 440], [212, 370]]);
// the hood thrust forward and low, joining the hump
const hood = blob([[118, 296], [128, 262], [156, 238], [196, 230], [236, 240], [258, 270], [246, 312], [214, 336], [170, 342], [136, 330]]);
const face = blob([[132, 282], [124, 296], [110, 308, "c"], [122, 312], [118, 322], [126, 330], [140, 338], [158, 336], [150, 290]]);
// far hand: hands clasped and wrung together under the chin
const rub = [brush([[210, 330], [186, 360], [168, 368]], [26, 22, 18]), blob([[140, 352], [162, 346], [180, 358], [178, 380], [156, 388], [138, 378]])];
const knuckles = brush([[146, 366], [158, 364], [170, 370]], [2, 3, 1]);   // the crease between the clasped, wringing hands
// near arm reaches out low, the lantern dangling from its ring
const arm = [brush([[236, 330], [190, 400], [130, 418]], [32, 26, 20]), blob([[112, 406], [134, 404], [138, 426], [116, 430]])];
const L = [104, 470];
const R = (x, y, w, h) => `M${L[0] + x - w / 2} ${L[1] + y - h / 2}h${w}v${h}h-${w}z`;
const ring = brush([[L[0] - 12, L[1] - 34], [L[0] - 10, L[1] - 52], [L[0], L[1] - 58], [L[0] + 10, L[1] - 52], [L[0] + 12, L[1] - 34]], [6, 6]);
const lantern = [blob([[L[0] - 24, L[1] - 36, "c"], [L[0] + 24, L[1] - 36, "c"], [L[0] + 28, L[1] - 26], [L[0] - 28, L[1] - 26]]), R(0, 0, 44, 46),
  blob([[L[0] - 28, L[1] + 24, "c"], [L[0] + 28, L[1] + 24, "c"], [L[0] + 20, L[1] + 36], [L[0] - 20, L[1] + 36]])];
const glass = R(0, 0, 30, 34);
const flame = blob([[L[0], L[1] - 14], [L[0] + 8, L[1] + 2], [L[0], L[1] + 14], [L[0] - 8, L[1] + 2]]);
const rays = [[-60, -10], [-52, 26], [-30, 56], [56, 30], [30, 60]].map(([dx, dy]) => brush([[L[0] + dx * .55, L[1] + dy * .55], [L[0] + dx, L[1] + dy]], [6, 0]));
const cuts = [
  brush([[126, 293], [138, 292], [148, 289]], [2, 3, 1]),                 // narrow slit of an eye
  brush([[122, 286], [136, 281], [152, 272]], [3, 3.5, 1]),               // brow pulled down toward the nose: scheming
  brush([[118, 318], [130, 322], [144, 316]], [1, 3, 1]),                 // sly grin curling up at the cheek
  brush([[156, 252], [154, 290], [164, 340]], [3, 5, 3]),                 // hood opening
  brush([[262, 300], [266, 400], [270, 490]], [3, 6, 2]), brush([[322, 270], [334, 380], [344, 488]], [3, 5, 2]), // coat folds
  brush([[220, 420], [358, 412]], [5, 5]),                                 // belt
];
export default card({ bg, ink, transform: "translate(40 -20)", layers: [legs, { d: coat }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: rub, halo: 4, roots: [[210, 330, 20]] }, { d: knuckles, fill: "bg" }, { group: arm, halo: 4, roots: [[236, 330, 24]] }, rays, { d: ring }, { group: lantern, halo: 4 },
  { d: glass, fill: "bg" }, { d: flame }] });
