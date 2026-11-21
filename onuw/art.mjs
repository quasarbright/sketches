import { ART as CUSTOM } from "./skin.mjs";

// Card illustrations: original silhouette scenes, one per role plus the card back.
// Each is drawn on a 100×140 card, full bleed. Colors come from the card's --team color,
// so a card's team shows in its art. The small line emblems in roles.mjs are used for chips.

const S = "var(--sil)";      // silhouette
const L = "var(--glint)";    // small lights: eyes, candles, crystal

// Shared scene pieces ---------------------------------------------------------

const sky = (id, { moon = [70, 34, 15], stars = true } = {}) => { const g = moon || [50, 70]; return `
  <defs>
    <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--sky-top)"/>
      <stop offset="1" style="stop-color:var(--sky-bot)"/>
    </linearGradient>
    <radialGradient id="glow-${id}" cx="${g[0] / 100}" cy="${g[1] / 140}" r=".55" gradientTransform="translate(0 0) scale(1 ${100 / 140})">
      <stop offset="0" style="stop-color:var(--glow);stop-opacity:.75"/>
      <stop offset="1" style="stop-color:var(--glow);stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="140" fill="url(#sky-${id})"/>
  <rect width="100" height="140" fill="url(#glow-${id})"/>
  ${stars ? `<g fill="var(--star)">${[[12, 14, .8], [26, 30, .6], [88, 12, .7], [92, 52, .6], [8, 48, .5], [40, 10, .6], [58, 58, .4], [18, 70, .5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>` : ""}
  ${moon ? `<circle cx="${moon[0]}" cy="${moon[1]}" r="${moon[2]}" fill="var(--moon)"/>
    <circle cx="${moon[0] - moon[2] * .35}" cy="${moon[1] - moon[2] * .2}" r="${moon[2] * .18}" fill="var(--moon-dim)"/>
    <circle cx="${moon[0] + moon[2] * .3}" cy="${moon[1] + moon[2] * .35}" r="${moon[2] * .24}" fill="var(--moon-dim)"/>` : ""}`; };

const hills = (y = 112) => `<path d="M0 ${y}C18 ${y - 8} 34 ${y - 6} 50 ${y - 2}S82 ${y - 10} 100 ${y - 4}V140H0z" fill="var(--far)"/>`;
const ground = (y = 122) => `<path d="M0 ${y}C25 ${y - 4} 70 ${y - 5} 100 ${y - 1}V140H0z" fill="${S}"/>`;
const pines = (xs, base, h = 18) => xs.map((x) => `<path d="M${x} ${base - h}l${h * .3} ${h * .45}h-${h * .14}l${h * .24} ${h * .32}h-${h * .14}l${h * .22} ${h * .23}H${x - h * .36}l${h * .22}-${h * .23}h-${h * .14}l${h * .24}-${h * .32}h-${h * .14}z" fill="var(--far)"/>`).join("");
const cottage = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="var(--far)"><path d="M0 14 12 2l12 12v14H0z"/><rect x="16" y="0" width="3" height="7"/><rect x="5" y="15" width="5" height="5" fill="var(--window)"/></g>`;

// A wolf's head in profile, facing right, with the neck at (0, 18). `eye` adds a lit eye.
const WOLF_HEAD = "M0 18C0 12 2 6 5 4L8-6l4 9c3 1 6 2 8 3l7 2c1.5.5 2 2.5.5 3.5l-6.5 1 5 2c0 1.5-1 2-2 2l-7 1-3 4-3-2-3 4-3-3-4 3zM3 6l1-9 5 7z";
const wolfHead = (x, y, rot = 0, sc = 1, eye = true) =>
  `<g transform="translate(${x} ${y - 18 * sc}) rotate(${rot} 0 ${18 * sc}) scale(${sc})"><path d="${WOLF_HEAD}" fill="${S}"/>${eye ? `<ellipse cx="16.5" cy="7.2" rx="1.3" ry=".8" fill="${L}"/>` : ""}</g>`;

// Figures ---------------------------------------------------------------------

const ART = {
  werewolf: sky("werewolf", { moon: [50, 40, 22] }) + pines([8, 90, 96], 112, 22) + hills(114) + `
    <g fill="${S}">
      <!-- shoulders and hunched torso, ragged fur -->
      <path d="M40 58c4-4 14-6 21-2 6 3 9 9 9 16l-3 3 2 3c-1 7-4 12-9 15l2 4-5-1c-2 4-4 9-4 14H36c1-6 0-12-3-16l-4 1 3-5c-3-6-3-14 0-20l-3-1 4-3c1-4 4-7 7-9z"/>
      <!-- raised clawed arm -->
      <path d="M62 64c5-4 9-10 11-17l-2-4 3 1 1-4 2 4 2-3v5l3 1-4 3c-2 8-6 15-12 20z"/>
      <!-- other arm, down with claws -->
      <path d="M36 66c-5 5-8 12-8 19l-2 4 3-1 1 4 2-4 2 3v-5c1-6 3-11 7-15z"/>
      <!-- digitigrade legs -->
      <path d="M38 104c-2 6-1 10 1 13l-5 9h11l2-8c2-4 2-8 1-13z"/>
      <path d="M52 104c3 5 5 9 5 13l-2 9h11l-4-9c0-5-1-10-3-14z"/>
    </g>
    ${wolfHead(46, 60, -42, 1.15)}` + ground(126),

  packleader: sky("packleader", { moon: [32, 34, 16] }) + hills(116) + `
    <!-- a rock outcrop -->
    <path d="M30 118c4-8 12-12 22-12s20 3 26 10l8 24H22z" fill="var(--far)"/>
    <g fill="${S}">
      <!-- shaggy mane over the shoulders -->
      <path d="M36 52l2-6 4 2 2-6 4 3 3-5 3 4 4-3 2 5 5-1-1 6 4 2-4 3H36z"/>
      <!-- tall torso, broad chest -->
      <path d="M36 54c6-3 22-3 30 0 4 6 4 14 2 22-1 6-4 11-8 14l1 8H42l1-8c-4-3-7-8-8-14-2-8-1-16 1-22z"/>
      <!-- right arm holds the spare card high -->
      <path d="M64 56c6-2 10-8 12-16l-1-6 4 1 2 5-2 1c-1 10-6 19-13 22z"/>
      <!-- left arm at side -->
      <path d="M38 58c-5 6-7 14-7 22l-3 5 4-1 2 3 1-4 2 2c-1-7 1-15 5-21z"/>
      <!-- legs -->
      <path d="M43 96c-2 6-2 12 0 16l-4 6h10l2-8c0-5 0-10-1-14z"/>
      <path d="M52 96c2 5 4 10 4 15l-2 7h10l-3-8c0-5-1-10-3-14z"/>
    </g>
    <!-- the spare card in the raised hand -->
    <g transform="rotate(14 79 30)"><rect x="73" y="20" width="12" height="17" rx="1.6" fill="var(--wolf-card)"/><path d="M76.5 24.5c1.4 2.6 1.8 5.6 1.2 9M80 23.5c1.6 2.9 2 6.2 1.2 10" stroke="var(--sil)" stroke-width="1.1" fill="none" stroke-linecap="round"/></g>
    ${wolfHead(50, 50, -14, 1.05)}`,

  prowler: sky("prowler", { moon: [74, 28, 13] }) + `
    <!-- rooftops of the village -->
    <path d="M0 92l16-12 16 12v48H0z" fill="var(--far)"/>
    <path d="M70 88l16-12 14 10v54H70z" fill="var(--far)"/>
    <rect x="88" y="90" width="5" height="6" fill="var(--window)"/>
    <g fill="${S}">
      <!-- the roof it stalks along -->
      <path d="M8 108h84v32H8z"/><path d="M6 105h88v4H6z"/>
      <rect x="20" y="92" width="7" height="14"/>
      <!-- a wolf stalking, low, head forward -->
      <path d="M30 94c2-8 12-12 24-12 8 0 14 2 18 6l2 6c-4 4-10 5-16 4H42c-6 0-10-1-12-4z"/>
      <circle cx="37" cy="91" r="8"/>
      <path d="M66 94l3 11h5l-3-11zM60 96l1 9h5l-1-9z"/>
      <path d="M32 96l-5 7 1 2h5l5-7zM40 98l-1 7h5l2-7z"/>
      <path d="M30 90c-7-1-13 2-17 7 6-2 12-2 17 0z"/>
    </g>
    ${wolfHead(69, 89, 14, .85)}`,

  lackey: sky("lackey", { moon: [26, 30, 12] }) + hills(116) + `
    <g fill="${S}">
      <!-- hooded head, bowed -->
      <path d="M52 40c7 0 12 5 13 12 1 4 0 8-3 11-4-1-9-1-13 1l-4-4c-2-8 0-17 7-20z"/>
      <!-- bent back in a long cloak, bowing toward the right -->
      <path d="M46 58c6-4 14-5 20-1 4 4 5 10 3 17l-1 22c0 6 2 12 4 19H32c3-9 5-19 6-29 1-10 3-21 8-28z"/>
      <!-- arm holding a lantern out -->
      <path d="M64 66c4 3 8 6 10 10l-2 2c-3-3-7-6-11-8z"/>
      <path d="M72 76v6"/>
      <rect x="71.4" y="76" width="1.2" height="5"/>
    </g>
    <!-- lantern -->
    <g><path d="M68.5 82h8l-1 9h-6z" fill="var(--sil)"/><path d="M70 83.5h5l-.7 6h-3.6z" fill="var(--glint)"/></g>
    <circle cx="72.5" cy="86.5" r="9" fill="var(--glint)" opacity=".18"/>` + ground(124),

  scout: sky("scout", { moon: [20, 26, 11] }) + pines([70, 80, 92], 108, 26) + `
    <!-- a crag -->
    <path d="M0 106c10-6 22-10 34-10 14 0 24 4 32 10l6 34H0z" fill="var(--far)"/>
    <g fill="${S}">
      <!-- figure in a wide-brimmed hat and cloak, looking through a spyglass -->
      <path d="M26 44c4-3 12-3 16 0l6 2-6 1c0 4-2 8-6 9-5 0-8-4-8-9l-6-1z"/>
      <path d="M24 58c4-3 12-4 18-2 3 3 5 8 6 14l2 22c1 6 1 13-1 18H18c1-10 1-20 2-30 0-9 1-17 4-22z"/>
      <!-- arms up to the spyglass -->
      <path d="M38 60c5 0 10-2 14-4l2 3c-5 3-10 5-15 6z"/>
      <path d="M50 52l18-6 1 4-18 6z"/>
      <path d="M67 45.5l5-1.6 1.4 4.4-5 1.6z"/>
      <!-- legs on the rock -->
      <path d="M24 108l-3 12h8l2-12zM36 108l2 12h8l-3-12z"/>
    </g>
    <circle cx="72" cy="47" r="1" fill="var(--glint)"/>`,

  mason: sky("mason", { moon: [50, 26, 12] }) + `
    <!-- a stone wall being built -->
    <g fill="var(--far)">${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => `<rect x="${c * 18 - (r % 2) * 9 + 1}" y="${102 + r * 9.5}" width="16.5" height="8.5" rx="1"/>`).join("")).join("")}</g>
    <g fill="${S}">
      <!-- two builders side by side, clasping hands -->
      <circle cx="33" cy="44" r="7"/>
      <path d="M26 41c2-5 12-5 14 0z"/>
      <path d="M22 54c6-4 16-4 21 0 2 6 2 14 1 22l1 30H22l-1-30c-2-8-1-16 1-22z"/>
      <circle cx="67" cy="44" r="7"/>
      <path d="M58 39h18v3H58z"/>
      <path d="M57 54c5-4 15-4 21 0 2 6 3 14 1 22l-1 30H55l1-30c-1-8-1-16 1-22z"/>
      <!-- the clasp -->
      <path d="M41 60c4 4 6 8 9 10 3-2 5-6 9-10l2 3c-3 4-6 8-11 11-5-3-8-7-11-11z"/>
      <!-- trowel and hammer in the outer hands -->
      <path d="M22 58c-4 6-5 13-4 20l3 0c0-7 1-13 4-18z"/>
      <path d="M15 78l6 0 2 6-9 2z"/>
      <path d="M78 58c4 6 5 13 4 20l-3 0c0-7-1-13-4-18z"/>
      <path d="M79 76h3v12h-3zM76 74h9v4h-9z"/>
    </g>`,

  seer: sky("seer", { moon: false }) + `
    <!-- tent drapes -->
    <path d="M0 0h30C24 30 14 60 0 80z" fill="var(--far)"/>
    <path d="M100 0H70c6 30 16 60 30 80z" fill="var(--far)"/>
    <circle cx="50" cy="86" r="26" fill="var(--glint)" opacity=".16"/>
    <circle cx="50" cy="86" r="14" fill="var(--glint)" opacity=".22"/>
    <g fill="${S}">
      <!-- hooded seer, leaning over the ball -->
      <path d="M50 30c9 0 15 7 15 16 0 4-1 8-3 11-3-3-7-4-12-4s-9 1-12 4c-2-3-3-7-3-11 0-9 6-16 15-16z"/>
      <path d="M33 58c4-4 10-6 17-6s13 2 17 6c4 8 6 18 6 28H27c0-10 2-20 6-28z"/>
      <!-- hands cupping the ball -->
      <path d="M36 82c-3 4-2 9 2 11l6-2c-3-2-5-5-4-9zM64 82c3 4 2 9-2 11l-6-2c3-2 5-5 4-9z"/>
      <!-- table -->
      <path d="M14 98h72l-6 8H20z"/>
      <path d="M24 106h52l4 34H20z"/>
    </g>
    <circle cx="50" cy="86" r="9" fill="var(--glint)"/>
    <path d="M46 82a5 5 0 0 1 5-3" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7" stroke-linecap="round"/>
    <g fill="var(--glint)"><circle cx="45" cy="46" r=".9"/><circle cx="55" cy="46" r=".9"/></g>`,

  thief: sky("thief", { moon: [78, 26, 12] }) + `
    <!-- a window and wall -->
    <rect x="62" y="56" width="26" height="34" fill="var(--far)"/>
    <rect x="65" y="59" width="9" height="13" fill="var(--window)"/><rect x="76" y="59" width="9" height="13" fill="var(--window)"/>
    <rect x="65" y="74" width="9" height="13" fill="var(--window)"/><rect x="76" y="74" width="9" height="13" fill="var(--window)"/>
    <g fill="${S}">
      <!-- tiptoeing figure in a flat cap, sack over the shoulder -->
      <path d="M30 34c6-2 12 0 14 4l4 1-5 1c0 5-3 9-8 9s-8-4-7-9l-4 0z"/>
      <path d="M28 54c5-4 13-4 17 0 3 5 4 11 3 17l-2 16H26l-1-14c0-7 1-14 3-19z"/>
      <!-- sack -->
      <path d="M34 50c-4-6-12-8-18-4-6 6-6 18 2 24 6 3 13 0 16-6z"/>
      <!-- reaching arm -->
      <path d="M44 58c5 2 10 5 13 10l-2 2c-4-3-8-6-12-7z"/>
      <!-- legs mid-step on tiptoe -->
      <path d="M30 86c-3 8-8 14-12 18l-2 3 5 1c5-5 10-12 13-20z"/>
      <path d="M40 86c4 8 6 16 6 24l-1 4h5l1-4c0-9-2-17-5-25z"/>
    </g>
    <!-- mask band with eyes -->
    <rect x="31" y="40" width="13" height="3" rx="1.5" fill="var(--far)"/>
    <circle cx="38.5" cy="41.5" r=".8" fill="var(--glint)"/><circle cx="42" cy="41.5" r=".7" fill="var(--glint)"/>` + ground(122),

  meddler: sky("meddler", { moon: [22, 24, 10] }) + hills(118) + `
    <g fill="${S}">
      <!-- grinning trickster with pointed hood, arms wide, swapping two cards -->
      <path d="M50 26l10 12c2 3 2 8-1 11-2 3-5 4-9 4s-7-1-9-4c-3-3-3-8-1-11z"/>
      <path d="M38 56c6-4 18-4 24 0 3 7 4 15 3 24l-2 12H37l-2-12c-1-9 0-17 3-24z"/>
      <path d="M40 60c-8-2-15-7-20-13l3-3c5 5 11 9 18 10z"/>
      <path d="M60 60c8-2 15-7 20-13l-3-3c-5 5-11 9-18 10z"/>
      <path d="M38 92l-4 26h9l3-26zM54 92l3 26h9l-4-26z"/>
    </g>
    <!-- the two cards mid-swap, with a curved arrow -->
    <g transform="rotate(-18 18 40)"><rect x="12" y="30" width="12" height="17" rx="1.6" fill="var(--card-a)"/></g>
    <g transform="rotate(18 82 40)"><rect x="76" y="30" width="12" height="17" rx="1.6" fill="var(--card-b)"/></g>
    <path d="M24 24C36 12 64 12 76 24" stroke="var(--glint)" stroke-width="1.6" fill="none" stroke-dasharray="2.4 2.4" stroke-linecap="round"/>
    <path d="M73 19.5l4 4.8-6 .8" stroke="var(--glint)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M44.5 46q5.5 4 11 0" stroke="var(--glint)" stroke-width="1.1" fill="none" stroke-linecap="round"/>` + ground(124),

  sleepwalker: sky("sleepwalker", { moon: [72, 26, 13] }) + hills(116) + `
    <g fill="${S}">
      <!-- nightcap and nightgown, arms out in front, eyes shut -->
      <path d="M38 40c0-7 5-12 12-12 6 0 10 3 12 8l8 6 2 6-4-3-6-1c-1 6-6 10-12 10-7 0-12-6-12-14z"/>
      <circle cx="73" cy="49" r="2.6"/>
      <path d="M38 58c5-4 15-5 22-1l3 10c3 12 5 26 7 42H30c2-16 4-30 5-42z"/>
      <!-- both arms straight out -->
      <path d="M55 60c8 0 15 1 22 3l3-1 2 2-2 1 1 2-3 0c-7-1-15-1-22-1z"/>
      <path d="M53 67c8 1 15 2 21 4l3-1 2 2-2 1 1 2-3 0c-7-2-15-3-22-3z"/>
      <!-- bare feet -->
      <path d="M38 110l-3 10h8l2-10zM52 110l2 10h8l-3-10z"/>
    </g>
    <path d="M44 42q2 1.4 4 0M52 42q2 1.4 4 0" stroke="var(--glint)" stroke-width=".9" fill="none" stroke-linecap="round"/>
    <!-- z's -->
    <g fill="none" stroke="var(--glint)" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" opacity=".85"><path d="M20 30h6l-6 6h6"/><path d="M12 18h4l-4 4h4"/></g>` + ground(124),

  nightowl: sky("nightowl", { moon: [78, 22, 11] }) + `
    <!-- bedroom window frame -->
    <rect x="10" y="14" width="80" height="80" rx="3" fill="none" stroke="var(--far)" stroke-width="5"/>
    <path d="M50 14v80M10 54h80" stroke="var(--far)" stroke-width="3"/>
    <g fill="${S}">
      <!-- person sitting up in bed, blanket pulled up, wide awake -->
      <circle cx="40" cy="70" r="9"/>
      <path d="M31 66c2-7 16-8 19 0-6-2-13-2-19 0z"/>
      <path d="M26 84c4-5 22-5 28 0l4 12H22z"/>
      <!-- bed and blanket -->
      <path d="M6 96h88v10H6z"/><path d="M6 88h6v40H6zM88 92h6v36h-6z"/>
      <path d="M12 106h76v22H12z"/>
      <!-- mug -->
      <path d="M58 86h7v8h-7z"/>
      <!-- owl on the sill -->
      <path d="M71 96c-2-8-1-14 3-17l-1-5 4 3h3l4-3-1 5c4 3 5 9 3 17z"/>
      <path d="M73 96l-2 2h18l-2-2z"/>
    </g>
    <g fill="var(--glint)"><circle cx="37" cy="70" r="1.4"/><circle cx="43" cy="70" r="1.4"/><circle cx="75.5" cy="83" r="1.6"/><circle cx="82.5" cy="83" r="1.6"/><path d="M79 85l-1 2h2z"/></g>
    <path d="M60 83c1-2 0-3 1-5M63 83c1-2 0-3 1-5" stroke="var(--glint)" stroke-width=".8" fill="none" opacity=".6"/>`,

  villager: sky("villager", { moon: [74, 26, 12] }) + `
    ${cottage(6, 82, 1.5)}${cottage(74, 86, 1.2)}
    ${hills(118)}
    <g fill="${S}">
      <!-- farmer with a pitchfork, straw hat -->
      <path d="M36 38h26l-3 3H39z"/><path d="M42 38c0-5 3-8 7-8s7 3 7 8z"/>
      <circle cx="49" cy="46" r="6.5"/>
      <path d="M38 56c6-3 16-3 22 0 3 6 3 14 2 22l-1 18H37l-1-18c-1-8-1-16 2-22z"/>
      <path d="M38 60c-4 6-5 13-3 20l3-1c-1-6 0-12 3-17z"/>
      <path d="M60 60c3 4 5 8 6 12l-3 1c-1-4-3-7-5-10z"/>
      <!-- pitchfork -->
      <rect x="66" y="24" width="2" height="94"/>
      <path d="M61 22v-8h1.6v8h3.6v-9h1.6v9h3.6v-8H73v9.6H61z"/>
      <path d="M40 96l-3 24h8l3-24zM52 96l3 24h8l-4-24z"/>
    </g>` + ground(126),

  hunter: sky("hunter", { moon: [78, 24, 11] }) + pines([6, 16, 86, 96], 116, 30) + hills(118) + `
    <g fill="${S}">
      <!-- hunter aiming a crossbow to the right, feathered cap -->
      <path d="M34 36c2-5 12-6 16-1l4 2-4 1v1H34z"/>
      <path d="M32 36c-4-6-3-12 0-16 0 6 2 10 5 13z"/>
      <circle cx="42" cy="43" r="6.5"/>
      <path d="M32 54c5-4 15-4 20 0 2 6 3 13 2 20l-2 22H32l-2-22c-1-7 0-14 2-20z"/>
      <!-- arms forward to the bow -->
      <path d="M48 56c8 0 16 1 22 2l-1 4c-7 0-14-1-21-2z"/>
      <path d="M46 62c8 2 14 3 20 3v4c-7 0-14-1-21-3z"/>
      <!-- crossbow -->
      <path d="M62 58h26v3H62z"/>
      <path d="M82 48c3 4 3 14 0 20l-2-1c2-5 2-13 0-18z"/>
      <!-- legs braced -->
      <path d="M33 96l-6 24h8l5-24zM46 96l6 24h8l-6-24z"/>
    </g>
    <path d="M82 49L72 59.5 82 68" stroke="var(--glint)" stroke-width=".6" fill="none" opacity=".7"/>
    <circle cx="45" cy="42" r=".9" fill="var(--glint)"/>` + ground(126),

  jester: sky("jester", { moon: false }) + `
    <!-- stage curtains and a spotlight -->
    <path d="M38 0h24l26 140H12z" fill="var(--glint)" opacity=".12"/>
    <path d="M0 0h22c-4 24-2 56 4 80-8 10-16 16-26 18z" fill="var(--far)"/>
    <path d="M100 0H78c4 24 2 56-4 80 8 10 16 16 26 18z" fill="var(--far)"/>
    <g fill="${S}">
      <!-- three-pointed belled hat -->
      <path d="M50 34c-4-6-10-10-18-10 5 3 8 8 9 13zM50 34c0-8-3-15-8-20 6 2 11 8 12 16zM50 34c4-6 10-10 18-10-5 3-8 8-9 13z"/>
      <circle cx="32" cy="24" r="2.2"/><circle cx="42" cy="14" r="2.2"/><circle cx="68" cy="24" r="2.2"/>
      <circle cx="50" cy="42" r="7"/>
      <!-- diamond-collared body, one knee up -->
      <path d="M40 50l5 3 5-3 5 3 5-3c3 6 3 14 1 22l-2 14H40l-2-14c-2-8-2-16 2-22z"/>
      <!-- arms up juggling -->
      <path d="M41 54c-6-3-10-8-12-14l3-2c2 5 6 9 11 12z"/>
      <path d="M59 54c6-3 10-8 12-14l-3-2c-2 5-6 9-11 12z"/>
      <!-- legs: standing leg and a raised knee with curled shoe -->
      <path d="M42 86l-2 26-6 3h10l3-29z"/>
      <path d="M54 86c6 2 10 5 12 10l-4 8h-4l3-6c-3-3-7-5-11-6z"/>
      <path d="M14 120h72v20H14z"/>
    </g>
    <g fill="var(--glint)"><circle cx="30" cy="30" r="2.6"/><circle cx="50" cy="8" r="2.6"/><circle cx="70" cy="30" r="2.6"/></g>
    <path d="M45 44q5 4 10 0" stroke="var(--glint)" stroke-width="1" fill="none" stroke-linecap="round"/>`,

  back: `
    <defs>
      <radialGradient id="back-glow" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#2b3566"/><stop offset="1" stop-color="#111733"/></radialGradient>
      <pattern id="back-pat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="none"/><path d="M0 5h10" stroke="#ffffff" stroke-opacity=".035" stroke-width="5"/></pattern>
    </defs>
    <rect width="100" height="140" fill="url(#back-glow)"/>
    <rect width="100" height="140" fill="url(#back-pat)"/>
    <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="var(--moon)" stroke-opacity=".55" stroke-width="1.2"/>
    <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="var(--moon)" stroke-opacity=".25" stroke-width=".8"/>
    <path d="M50 14l2.5 3-2.5 3-2.5-3zM50 120l2.5 3-2.5 3-2.5-3z" fill="var(--moon)" opacity=".6"/>
    <path d="M58 44a24 24 0 1 0 16 40 19 19 0 1 1-16-40z" fill="var(--moon)"/>
    <g fill="var(--moon)"><path d="M30 40l1.2 3.2 3.2 1.2-3.2 1.2L30 48.8l-1.2-3.2-3.2-1.2 3.2-1.2z"/><path d="M76 92l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/><path d="M34 96l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></g>
    <path d="M10 118c8-6 14-6 20-2 6-6 14-7 20-1 6-6 14-6 20 0 6-4 14-4 20 2v13H10z" fill="#0a0e22" opacity=".8"/>`,
};

export function artSvg(id) {
  if (CUSTOM[id]) return `<img class="ms-art" src="${CUSTOM[id]}" alt="" aria-hidden="true">`;
  const body = ART[id] || ART.back;
  return `<svg class="ms-art" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
}

export const ART_IDS = Object.keys(ART);
