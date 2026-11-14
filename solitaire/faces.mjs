// Card artwork as SVG strings: faces with real pip layouts, and one back. Copied from my
// card-table project (card-table/faces.mjs) so the two decks match.
const W = 70, H = 98; // card units (card-table's size); the SVG scales to the card

export const RED = "#b3262b", BLACK = "#1d1c22", IVORY = "#f4efe3", BACK = "#a8322f";

// suit shapes in a 1×1 box
const SUIT_SHAPES = {
  H: `<path d="M.5 .95C.15 .7 0 .5 0 .3 0 .12.13 0 .28 0 .38 0 .46.06.5.15.54.06.62 0 .72 0 .87 0 1 .12 1 .3 1 .5.85.7.5.95Z"/>`,
  D: `<path d="M.5 0 .9 .5 .5 1 .1 .5Z"/>`,
  S: `<path d="M.5 0C.85.28 1 .45 1 .62 1 .78.88.88.73.88.64.88.57.84.53.78.55.88.6.95.68 1H.32C.4.95.45.88.47.78.43.84.36.88.27.88.12.88 0 .78 0 .62 0 .45.15.28.5 0Z"/>`,
  C: `<circle cx=".5" cy=".27" r=".22"/><circle cx=".25" cy=".6" r=".22"/><circle cx=".75" cy=".6" r=".22"/><circle cx=".5" cy=".52" r=".12"/><path d="M.46.55C.46.78.42.9.31 1H.69C.58.9.54.78.54.55Z"/>`,
};
export const suitColor = (suit) => (suit === "H" || suit === "D" ? RED : BLACK);

// one <symbol> per suit, defined once on the page; cards <use> them
export function suitDefs() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>` +
    Object.entries(SUIT_SHAPES).map(([s, d]) => `<symbol id="so-suit-${s}" viewBox="0 0 1 1">${d}</symbol>`).join("") +
    `<pattern id="so-lattice" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="6" height="6" fill="${BACK}"/><path d="M0 0H6M0 0V6" stroke="#c4554b" stroke-width=".9"/></pattern>` +
    `</defs></svg>`;
}

const pip = (suit, x, y, size, flip = false) =>
  `<use href="#so-suit-${suit}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"` +
  (flip ? ` transform="rotate(180 ${x} ${y})"` : "") + `/>`;

// pip positions as (column, row): columns -1/0/1, rows 0 (top) … 1 (bottom)
const L = -1, M = 0, R = 1;
const LAYOUTS = {
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, .5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, .5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, .5], [R, .5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [M, .25], [L, .5], [R, .5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [M, .25], [L, .5], [R, .5], [M, .75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, .5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
};

const INDEX_X = 9;


// ---- court cards: two-ended portraits ----------------------------------------------------------
// A king, queen or jack in a robe patterned with gold suit symbols, a jeweled sash running straight
// through the middle of the card, and the prop they hold (sword, flower, staff), mirrored top and
// bottom like real court cards. Each suit has its own hair and gem colors.
const INK = BLACK, RED_D = "#8e1c21", GOLD = "#f2c14e", GOLD_D = "#b8862a",
  CORAL = "#ff6b5e", LAV = "#b9a3ff", FELT = "#2f7a55", SKIN = "#f2c9a6", SKIN_D = "#e2ac86", STEEL = "#d7dbe2", STEEL_D = "#9aa2ae",
  BEARD = "#ece6d6", INK_L = "#34323c";
const HAIR = { S: "#2b2622", H: "#8a3b22", D: GOLD_D, C: "#7c7f86" };
const GEM = { S: LAV, H: CORAL, D: FELT, C: CORAL };
const cpip = (s, x, y, size, flip, fill) => `<use fill="${fill || suitColor(s)}" href="#so-suit-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ""}/>`;
const ln = (w = 1) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function frame(s, inner, tag) {
  const id = "so-cf-" + tag, lat = "so-lt-" + tag;
  const red = suitColor(s) === RED;
  const bg = red ? "#f6e3d8" : "#e8e6ea", line = red ? "rgba(179,38,43,.10)" : "rgba(29,28,34,.08)";
  return `<defs><pattern id="${lat}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H5M0 0V5" stroke="${line}" stroke-width=".7"/></pattern>` +
    `<clipPath id="${id}"><rect x="17" y="6" width="36" height="86" rx="3.5"/></clipPath></defs>` +
    `<rect x="17" y="6" width="36" height="86" rx="3.5" fill="${bg}"/><rect x="17" y="6" width="36" height="86" rx="3.5" fill="url(#${lat})"/>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    `<rect x="17" y="6" width="36" height="86" rx="3.5" fill="none" stroke="${suitColor(s)}" stroke-width=".9"/>`;
}
const twoEnded = (half) => `<g>${half}</g><g transform="rotate(180 35 49)">${half}</g>`;
// the band across the middle: a gold strip with a row of small suit symbols
const band = (s) => `<rect x="17" y="47.6" width="36" height="2.8" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/>` +
  [22, 28.5, 35, 41.5, 48].map((x) => cpip(s, x, 49, 1.9, false, suitColor(s) === RED ? RED_D : INK)).join("");

function figure(rank, s) {
  const cx = 35, cy = 24.5, r = 7;
  const red = suitColor(s) === RED;
  const robe = red ? RED : INK, robeShade = red ? RED_D : "#0f0e13", gem = GEM[s], hair = HAIR[s];
  let p = "";
  const sh = cy + r + 2.2; // shoulder line
  // the prop, behind the body, held up at the right
  const hx = cx + 10.5, hy = sh + 7; // the hand
  if (rank === "K") p += `<path d="M${hx} ${hy} L${hx + 1.5} 8.5" stroke="${STEEL_D}" stroke-width="3" stroke-linecap="round"/><path d="M${hx} ${hy} L${hx + 1.5} 8.5" stroke="${STEEL}" stroke-width="1.7" stroke-linecap="round"/>` +
    "";
  if (rank === "Q") p += `<path d="M${hx} ${hy} Q${hx + 2} ${hy - 9} ${hx + 1} ${cy - 9}" fill="none" stroke="${FELT}" stroke-width="1.2"/>` +
    `<path d="M${hx + 1.2} ${cy - 1} q3 -2 4 1 q-3 1.5 -4 -1" fill="${FELT}" ${ln(.5)}/>` +
    `<g ${ln(.7)}>${[[0, -2.6], [2.4, -.8], [1.5, 2], [-1.5, 2], [-2.4, -.8]].map(([dx, dy]) => `<circle cx="${hx + 1 + dx}" cy="${cy - 9 + dy}" r="1.9" fill="${CORAL}"/>`).join("")}</g><circle cx="${hx + 1}" cy="${cy - 9}" r="1.3" fill="${GOLD}" ${ln(.5)}/>`;
  if (rank === "J") p += `<path d="M${hx} 50 L${hx} 9" stroke="${INK}" stroke-width="2.4"/><path d="M${hx} 50 L${hx} 9" stroke="${GOLD_D}" stroke-width="1.2"/>` +
    `<path d="M${hx} 6.5 l-3 3.5 l3 3.5 l3 -3.5 z" fill="${gem}" ${ln(.8)}/>`;
  // robe, with the far side a shade darker
  p += `<path d="M15 50 L15 ${sh + 6} Q${cx} ${sh - 4} 55 ${sh + 6} L55 50 Z" fill="${robe}" ${ln()}/>`;
  p += `<path d="M${cx} ${sh} Q48 ${sh} 55 ${sh + 6} L55 50 L${cx} 50 Z" fill="${robeShade}" opacity=".55"/>`;
  // a pattern of small gold suit symbols in rows
  for (const [dx, dy] of [[-15, 6.5], [-8.5, 5], [8.5, 5], [15, 6.5], [-12, 11.5], [-5, 11], [12, 11.5]]) p += cpip(s, cx + dx, sh + dy, 2.8, false, GOLD);
  // ermine trim along the shoulders (king), lace (queen), a plain edge (jack)
  if (rank === "K") {
    p += `<path d="M15 ${sh + 6} Q${cx} ${sh - 4} 55 ${sh + 6} L55 ${sh + 9} Q${cx} ${sh - 1} 15 ${sh + 9} Z" fill="${BEARD}" ${ln(.7)}/>`;
    for (const x of [19, 24, 29, 41, 46, 51]) p += `<path d="M${x} ${sh + 4.4 + Math.abs(x - cx) * .1} v1.6" stroke="${INK}" stroke-width=".9" stroke-linecap="round"/>`;
  }
  if (rank === "Q") p += `<path d="M15 ${sh + 6} Q${cx} ${sh - 4} 55 ${sh + 6}" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="1.2 1"/>`;
  // a jeweled sash across the chest
  p += `<path d="M${cx - 14} ${sh + 2} L${cx - 3} 50.5 L${cx + 3} 50.5 L${cx - 8} ${sh} Z" fill="${GOLD}" ${ln(.8)}/>`;
  p += `<circle cx="${cx - 7.4}" cy="${sh + 6.2}" r="1.3" fill="${gem}" ${ln(.5)}/><circle cx="${cx - 3.5}" cy="${sh + 11.5}" r="1" fill="${gem}" ${ln(.5)}/>`;
  // the hand on the prop
  const arm = `M${cx + 5} ${sh + 1} Q${hx - 3} ${sh + 1} ${hx - 1.4} ${hy + 1.6}`;
  p += `<path d="${arm}" fill="none" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="${arm}" fill="none" stroke="${red ? RED : INK_L}" stroke-width="3.6" stroke-linecap="round"/>`;
  p += `<path d="M${hx - 3.2} ${hy + .6} L${hx + .4} ${hy + 2.6}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M${hx - 3.2} ${hy + .6} L${hx + .4} ${hy + 2.6}" stroke="${GOLD}" stroke-width="1.3" stroke-linecap="round"/>`;
  if (rank === "K") p += `<path d="M${hx - 3.4} ${hy - 2.4} L${hx + 3.8} ${hy - 3.2}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M${hx - 3.4} ${hy - 2.4} L${hx + 3.8} ${hy - 3.2}" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round"/>`;
  p += `<circle cx="${hx}" cy="${hy}" r="2.1" fill="${SKIN}" ${ln(.8)}/>`;
  // collar
  p += `<path d="M${cx - 6.5} ${sh - 1.6} Q${cx} ${sh + 4} ${cx + 6.5} ${sh - 1.6} L${cx + 5.6} ${sh + 1.8} Q${cx} ${sh + 7} ${cx - 5.6} ${sh + 1.8} Z" fill="${rank === "J" ? BEARD : GOLD}" ${ln(.8)}/>`;
  // long hair behind (queen)
  if (rank === "Q") p += `<path d="M${cx - r - 1.8} ${cy + r + 3.4} L${cx - r - 1.8} ${cy} A${r + 1.8} ${r + 1.8} 0 0 1 ${cx + r + 1.8} ${cy} L${cx + r + 1.8} ${cy + r + 3.4} Q${cx} ${cy + r + 5.5} ${cx - r - 1.8} ${cy + r + 3.4} Z" fill="${hair}" ${ln()}/>`;
  // neck and head
  p += `<rect x="${cx - 2.3}" y="${cy + r - 2}" width="4.6" height="4" fill="${SKIN_D}"/>`;
  p += `<ellipse cx="${cx}" cy="${cy}" rx="${r * .95}" ry="${r}" fill="${SKIN}" ${ln()}/>`;
  // face: brows, eyes, nose, cheeks, mouth
  p += `<path d="M${cx - 4} ${cy - 2.2} q1.6 -1 3 0 M${cx + 1} ${cy - 2.2} q1.6 -1 3 0" fill="none" stroke="${rank === "Q" ? hair : INK}" stroke-width=".7" stroke-linecap="round"/>`;
  p += `<circle cx="${cx - 2.5}" cy="${cy - .3}" r=".9" fill="${INK}"/><circle cx="${cx + 2.5}" cy="${cy - .3}" r=".9" fill="${INK}"/>`;
  p += `<circle cx="${cx - 2.2}" cy="${cy - .6}" r=".28" fill="#fff"/><circle cx="${cx + 2.8}" cy="${cy - .6}" r=".28" fill="#fff"/>`;
  p += `<path d="M${cx} ${cy + .3} q.9 1.6 -.5 2" fill="none" stroke="${SKIN_D}" stroke-width=".7" stroke-linecap="round"/>`;
  p += `<circle cx="${cx - 4.2}" cy="${cy + 2}" r="1.1" fill="${CORAL}" opacity=".4"/><circle cx="${cx + 4.2}" cy="${cy + 2}" r="1.1" fill="${CORAL}" opacity=".4"/>`;
  if (rank !== "K") p += `<path d="M${cx - 1.6} ${cy + 3.6} Q${cx} ${cy + 4.7} ${cx + 1.6} ${cy + 3.6}" fill="none" ${ln(.7)}/>`;
  if (rank === "Q") p += `<circle cx="${cx - r * .95}" cy="${cy + 2.2}" r=".9" fill="${gem}" ${ln(.4)}/><circle cx="${cx + r * .95}" cy="${cy + 2.2}" r=".9" fill="${gem}" ${ln(.4)}/>`;
  // jack: short hair and sideburns
  if (rank === "J") p += `<path d="M${cx - r} ${cy + 1} L${cx - r} ${cy - 3} Q${cx} ${cy - 8} ${cx + r} ${cy - 3} L${cx + r} ${cy + 1} L${cx + r - 1.3} ${cy - 1.8} Q${cx} ${cy - 5} ${cx - r + 1.3} ${cy - 1.8} Z" fill="${hair}" ${ln(.7)}/>`;
  // king: beard and mustache
  if (rank === "K") {
    const bc = s === "H" || s === "S" ? BEARD : hair;
    p += `<path d="M${cx - 5.8} ${cy + 1.4} Q${cx - 5.8} ${cy + 9.6} ${cx} ${cy + 10.4} Q${cx + 5.8} ${cy + 9.6} ${cx + 5.8} ${cy + 1.4} Q${cx + 3} ${cy + 4.4} ${cx} ${cy + 4.4} Q${cx - 3} ${cy + 4.4} ${cx - 5.8} ${cy + 1.4} Z" fill="${bc}" ${ln(.9)}/>`;
    p += `<path d="M${cx} ${cy + 3.2} Q${cx - 2.5} ${cy + 2.2} ${cx - 4.3} ${cy + 4} Q${cx - 2} ${cy + 4.2} ${cx} ${cy + 3.6} Q${cx + 2} ${cy + 4.2} ${cx + 4.3} ${cy + 4} Q${cx + 2.5} ${cy + 2.2} ${cx} ${cy + 3.2} Z" fill="${bc}" ${ln(.6)}/>`;
  }
  // headwear
  const t = cy - r * .62;
  if (rank === "K") {
    p += `<path d="M${cx - 7.4} ${t} L${cx - 8} ${t - 7.5} L${cx - 4} ${t - 3.6} L${cx} ${t - 9.5} L${cx + 4} ${t - 3.6} L${cx + 8} ${t - 7.5} L${cx + 7.4} ${t} Z" fill="${GOLD}" ${ln()}/>`;
    p += `<rect x="${cx - 7.6}" y="${t - 2.2}" width="15.2" height="2.6" fill="${GOLD_D}" ${ln(.7)}/>`;
    p += `<circle cx="${cx}" cy="${t - 4.6}" r="1.4" fill="${gem}" ${ln(.6)}/>` + [-4.5, 0, 4.5].map((dx) => `<circle cx="${cx + dx}" cy="${t - .9}" r=".6" fill="${IVORY}"/>`).join("");
    p += [[-8, -7.5], [0, -9.5], [8, -7.5]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${t + dy}" r=".9" fill="${GOLD}" ${ln(.5)}/>`).join("");
  }
  if (rank === "Q") {
    const q = cy - r * 1.02;
    p += `<path d="M${cx - 6.5} ${q + 2.4} L${cx - 6.8} ${q - 2.6} Q${cx - 4.6} ${q - .4} ${cx - 3.2} ${q - 1.2} L${cx} ${q - 5.6} L${cx + 3.2} ${q - 1.2} Q${cx + 4.6} ${q - .4} ${cx + 6.8} ${q - 2.6} L${cx + 6.5} ${q + 2.4} Q${cx} ${q + .6} ${cx - 6.5} ${q + 2.4} Z" fill="${GOLD}" ${ln(.9)}/>`;
    p += `<circle cx="${cx}" cy="${q - 1.4}" r="1.2" fill="${gem}" ${ln(.5)}/><circle cx="${cx}" cy="${q - 5.6}" r=".8" fill="${GOLD}" ${ln(.5)}/>`;
  }
  if (rank === "J") {
    p += `<path d="M${cx - 8.4} ${t + 1.6} Q${cx - 7.6} ${t - 7} ${cx + .8} ${t - 7} Q${cx + 9.2} ${t - 6.6} ${cx + 8.4} ${t + 1.6} Z" fill="${FELT}" ${ln()}/>`;
    p += `<path d="M${cx - 8.8} ${t + 1.2} Q${cx} ${t - 1.2} ${cx + 8.8} ${t + 1.2} L${cx + 8.8} ${t + 3} Q${cx} ${t + .6} ${cx - 8.8} ${t + 3} Z" fill="${GOLD}" ${ln(.7)}/>`;
    p += `<path d="M${cx + 4.5} ${t - 5.5} Q${cx + 11} ${t - 12} ${cx + 9.5} ${t - 17}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/><path d="M${cx + 4.5} ${t - 5.5} Q${cx + 11} ${t - 12} ${cx + 9.5} ${t - 17}" fill="none" stroke="${CORAL}" stroke-width="1.9" stroke-linecap="round"/>`;
  }
  // the suit in the top corner of the frame
  p += cpip(s, 21.5, 11, 5.5);
  return p;
}

export const courtArt = (rank, s) => frame(s, twoEnded(figure(rank, s)) + band(s), rank + s);

export function faceSVG(rank, suit) {
  const color = suitColor(suit);
  // corner index: rank over suit, top left and (turned) bottom right
  const index = (rot) =>
    `<g${rot ? ` transform="rotate(180 ${W / 2} ${H / 2})"` : ""}>` +
    `<text x="${INDEX_X}" y="17.5" class="so-index${rank === "10" ? " so-ten" : ""}" text-anchor="middle">${rank}</text>` +
    pip(suit, INDEX_X, 25, 9) + `</g>`;
  let middle;
  if (rank === "A") {
    middle = pip(suit, W / 2, H / 2, suit === "S" ? 40 : 32);
  } else if (rank === "J" || rank === "Q" || rank === "K") {
    middle = courtArt(rank, suit);
  } else {
    const xs = { [L]: 24.5, [M]: W / 2, [R]: W - 24.5 };
    const top = 19, bottom = H - 19, size = suit === "D" ? 12 : 13;
    middle = LAYOUTS[rank].map(([c, r]) => pip(suit, xs[c], top + r * (bottom - top), size, r > .5)).join("");
  }
  return `<svg class="so-svg" viewBox="0 0 ${W} ${H}" fill="${color}">` +
    `<rect x=".25" y=".25" width="${W - .5}" height="${H - .5}" rx="5" fill="${IVORY}" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>` +
    index(false) + index(true) + middle + `</svg>`;
}

// red lattice inside a double border, ivory all round
export function backSVG() {
  return `<svg class="so-svg" viewBox="0 0 ${W} ${H}">` +
    `<rect x=".25" y=".25" width="${W - .5}" height="${H - .5}" rx="5" fill="${IVORY}" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>` +
    `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="3" fill="${BACK}"/>` +
    `<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="1.5" fill="url(#so-lattice)" stroke="${IVORY}" stroke-width=".8"/>` +
    `</svg>`;
}
