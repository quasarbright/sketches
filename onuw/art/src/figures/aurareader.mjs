import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, sparkle, card } from "../brush.mjs";
// The aura reader: a robed mystic with eyes closed and both palms raised, sensing the glow left on whoever
// moved or looked at a card. Rings of light ripple out from her hands. Facing right.
const { card: bg, ink } = ROLE_COLORS.aurareader;
const robe = blob([[216, 276], [266, 266], [298, 300], [312, 400], [330, 520], [344, 596, "c"], [300, 588], [260, 600], [216, 590], [170, 598, "c"], [186, 520], [196, 400], [202, 330]]);
const hood = blob([[218, 210], [236, 172], [268, 160], [294, 174], [304, 206], [310, 250], [288, 272], [244, 272], [218, 254]]);
const hoodTip = brush([[240, 172], [204, 180], [182, 210], [172, 250]], [32, 22, 12, 4]);
const face = blob([[286, 184], [300, 190], [306, 204], [318, 216, "c"], [306, 220], [308, 232], [302, 238], [304, 248], [288, 258], [278, 240]]);
// both forearms raised in front, palms up
const arm = [brush([[280, 300], [318, 330], [340, 296]], [26, 22, 18]), blob([[330, 280], [352, 276], [356, 298], [334, 302]])];
const farArm = [brush([[236, 300], [268, 348], [304, 340]], [26, 22, 18]), blob([[296, 328], [318, 324], [322, 346], [300, 350]])];
const ring = (r, w) => brush(Array.from({ length: 13 }, (_, i) => { const a = (-150 + i * 25) * Math.PI / 180; return [346 + Math.cos(a) * r, 290 + Math.sin(a) * r]; }), [1, w, w, w, w, w, w, w, w, w, w, w, 1]);
const rings = [ring(46, 4), ring(70, 3.5), ring(94, 3)];
const stars = [sparkle(120, 150, 14), sparkle(430, 140, 12), sparkle(110, 420, 9)];
const cuts = [
  brush([[288, 182], [280, 220], [290, 258]], [4, 5, 3]),              // hood opening
  brush([[294, 204], [306, 206]], [3, 2]),                             // closed eye
  brush([[230, 380], [222, 480], [210, 580]], [3, 5, 2]), brush([[272, 380], [284, 480], [300, 580]], [3, 5, 2]),
  brush([[200, 410], [312, 406]], [5, 5]),                             // sash
];
export default card({ bg, ink, transform: "translate(-30 10)", layers: [stars, rings, hoodTip, { d: robe }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: farArm, halo: 3, roots: [[236, 300, 18]] }, { group: arm, halo: 4, roots: [[280, 300, 20]] }] });
