import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, sparkle, boot, card } from "../brush.mjs";
// The watcher: a hooded villager peering out from behind a tree trunk at night, hand shading his eyes,
// keeping an eye on the seers. Facing right.
const { card: bg, ink } = ROLE_COLORS.watcher;
const legs = [brush([[236, 470], [228, 530], [222, 586]], [30, 26, 22]), boot(222, 598, { s: 22 }), brush([[268, 470], [282, 530], [290, 586]], [30, 26, 22]), boot(292, 598, { s: 22 })];
const tunic = blob([[214, 276], [262, 264], [294, 292], [302, 380], [312, 470], [322, 498, "c"], [288, 492], [256, 502], [222, 492], [188, 500, "c"], [196, 430], [200, 350]]);
const hood = blob([[220, 212], [238, 176], [270, 164], [296, 178], [306, 210], [312, 250], [290, 272], [246, 272], [220, 256]]);
const face = blob([[288, 188], [304, 194], [310, 210], [322, 222, "c"], [310, 226], [312, 238], [306, 244], [308, 254], [292, 264], [280, 246]]);
// near arm raised, hand flat over the brow
const arm = [brush([[284, 290], [322, 270], [312, 214]], [28, 22, 18]), blob([[290, 196], [334, 190], [338, 204], [296, 212]])];
// a tree trunk at the right edge he leans out from, with a branch overhead
const tree = [blob([[360, 600, "c"], [370, 480], [376, 300], [372, 90], [440, 90], [436, 300], [442, 480], [456, 600, "c"]]), brush([[380, 160], [320, 130], [270, 126]], [26, 14, 4])];
const stars = [sparkle(110, 140, 14), sparkle(190, 110, 9), sparkle(80, 300, 10), sparkle(130, 470, 8)];
const cuts = [
  brush([[288, 186], [280, 224], [290, 262]], [5, 6, 3]),                     // hood opening
  brush([[298, 214], [310, 214]], [4, 3]),                                     // eye, squinting
  brush([[240, 340], [232, 420], [222, 492]], [3, 5, 2]), brush([[278, 340], [288, 420], [294, 492]], [3, 5, 2]),
  brush([[204, 400], [306, 396]], [5, 5]),
  brush([[404, 200], [400, 340], [408, 520]], [4, 6, 3]),                      // bark
];
export default card({ bg, ink, transform: "translate(-20 0)", layers: [stars, legs, { d: tunic }, { d: hood }, { d: face }, cuts.slice(0, 4).map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[284, 290, 22]] }, { group: tree, halo: 5 }, { d: cuts[4], fill: "bg" }] });
