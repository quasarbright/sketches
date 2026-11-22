// Everything that names or draws the game lives here, so it can be reskinned in one place.
//
// TITLE: the game's name on the home screen, the top bar and the browser tab.
// NAMES: the name shown for each role. Rules text, night prompts and results all read from here.
// ART:   an image per card. The role art is generated (art/gen, see the image-gen skill); the line-art
//        SVGs drawn by art/src (see art/src/brush.mjs) stay as the originals. Paths are relative to the page.
//        art/ and give the path, e.g. werewolf: "art/werewolf.png". "back" is the card back.
//        Any card left null keeps its line art from roles.mjs.

export const TITLE = "onuw";

export const NAMES = {
  werewolf: "Werewolf",
  werewolves: "Werewolves",
  packleader: "Alpha Wolf",
  prowler: "Mystic Wolf",
  lackey: "Minion",
  scout: "Squire",
  mason: "Mason",
  seer: "Seer",
  thief: "Robber",
  meddler: "Troublemaker",
  sleepwalker: "Drunk",
  nightowl: "Insomniac",
  villager: "Villager",
  hunter: "Hunter",
  jester: "Tanner",
  witch: "Witch",
  bodyguard: "Bodyguard",
  prince: "Prince",
  cursed: "Cursed",
  greatwolf: "Giant Wolf",
  dozingwolf: "Dream Wolf",
  copycat: "Copycat",
  lookalike: "Doppelganger",
  apprentice: "Apprentice Tanner",
  noviceseer: "Apprentice Seer",
  investigator: "Paranormal Investigator",
  aurareader: "Aura Seer",
  imp: "Gremlin",
  watcher: "Beholder",
  unveiler: "Revealer",
};

export const ART = {
  werewolf: "art/gen/werewolf.webp",
  packleader: "art/gen/packleader.webp",
  prowler: "art/gen/prowler.webp",
  lackey: "art/gen/lackey.webp",
  scout: "art/gen/scout.webp",
  mason: "art/gen/mason.webp",
  seer: "art/gen/seer.webp",
  thief: "art/gen/thief.webp",
  meddler: "art/gen/meddler.webp",
  sleepwalker: "art/gen/sleepwalker.webp",
  nightowl: "art/gen/nightowl.webp",
  villager: "art/gen/villager.webp",
  hunter: "art/gen/hunter.webp",
  jester: "art/gen/jester.webp",
  witch: "art/gen/witch.webp",
  bodyguard: "art/gen/bodyguard.webp",
  prince: "art/gen/prince.webp",
  cursed: "art/gen/cursed.webp",
  greatwolf: "art/gen/greatwolf.webp",
  dozingwolf: "art/gen/dozingwolf.webp",
  copycat: "art/gen/copycat.webp",
  lookalike: "art/gen/lookalike.webp",
  apprentice: "art/gen/apprentice.webp",
  noviceseer: "art/gen/noviceseer.webp",
  investigator: "art/gen/investigator.webp",
  aurareader: "art/gen/aurareader.webp",
  imp: "art/gen/imp.webp",
  watcher: "art/gen/watcher.webp",
  unveiler: "art/gen/unveiler.webp",
  back: "art/back.svg",
};

// ROLE_COLORS: each card's own colors, the same as the reference's role cards so players feel at
// home. `card` is the card and the art's flat background, `band` the lighter name band and text
// strip, `ink` the silhouette (the reference draws it as black at 60% over the card color).
// The art in art/src reads these: change a color here, then rebuild with node art/src/build.mjs.
export const ROLE_COLORS = {
  werewolf: { card: "#e53030", band: "#ee5a52", ink: "#5c1313" },
  packleader: { card: "#b30915", band: "#e40b1b", ink: "#480408" },
  prowler: { card: "#be2c4c", band: "#d54867", ink: "#4c121e" },
  lackey: { card: "#ff5722", band: "#ff7e55", ink: "#66230e" },
  scout: { card: "#a63311", band: "#d44116", ink: "#421407" },
  mason: { card: "#0d47a1", band: "#115cd0", ink: "#051c40" },
  seer: { card: "#673ab7", band: "#8259cb", ink: "#291749" },
  thief: { card: "#263238", band: "#3b4d56", ink: "#0f1416" },
  meddler: { card: "#9c27b0", band: "#bc37d3", ink: "#3e1046" },
  sleepwalker: { card: "#4caf50", band: "#6ec071", ink: "#1e4620" },
  nightowl: { card: "#1a237e", band: "#232fa8", ink: "#0a0e32" },
  villager: { card: "#2196f3", band: "#51adf6", ink: "#0d3c61" },
  hunter: { card: "#607d8b", band: "#7b96a3", ink: "#263238" },
  jester: { card: "#ff9800", band: "#ffad33", ink: "#663d00" },
  back: { card: "#1b2350", ink: "#3c4a96" },
  witch: { card: "#457c0e", band: "#5faa13", ink: "#1b3105" },
  bodyguard: { card: "#2d5071", band: "#3c6a95", ink: "#12202d" },
  prince: { card: "#8c842a", band: "#b3a936", ink: "#383410" },
  cursed: { card: "#574747", band: "#735e5e", ink: "#221c1c" },
  greatwolf: { card: "#6a0b0b", band: "#8e1010", ink: "#1c0202" },
  dozingwolf: { card: "#d45c54", band: "#de837d", ink: "#542421" },
  copycat: { card: "#3c4a6b", band: "#52648f", ink: "#181d2a" },
  lookalike: { card: "#4a4a4a", band: "#666666", ink: "#1d1d1d" },
  apprentice: { card: "#ff7f00", band: "#ff9933", ink: "#663200" },
  noviceseer: { card: "#8b3ab6", band: "#a359ca", ink: "#371748" },
  investigator: { card: "#59a68c", band: "#7ab8a3", ink: "#234238" },
  aurareader: { card: "#3f1980", band: "#5421ab", ink: "#190a33" },
  imp: { card: "#5a1666", band: "#7f1f90", ink: "#240828" },
  watcher: { card: "#291980", band: "#3721ab", ink: "#100a33" },
  unveiler: { card: "#1a537e", band: "#236fa8", ink: "#0a2132" },
};
