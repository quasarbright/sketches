// Everything that names or draws the game lives here, so it can be reskinned in one place.
//
// TITLE: the game's name on the home screen, the top bar and the browser tab.
// NAMES: the name shown for each role. Rules text, night prompts and results all read from here.
// ART:   an image per card, drawn by art/src (see art/src/brush.mjs). Paths are relative to the page.
//        art/ and give the path, e.g. werewolf: "art/werewolf.png". "back" is the card back.
//        Any card left null keeps its line art from roles.mjs.

export const TITLE = "onuw";

export const NAMES = {
  werewolf: "Werewolf",
  werewolves: "Werewolves",
  packleader: "Pack Leader",
  prowler: "Prowler",
  lackey: "Lackey",
  scout: "Ward",
  mason: "Mason",
  seer: "Seer",
  thief: "Thief",
  meddler: "Meddler",
  sleepwalker: "Alcoholic",
  nightowl: "Night Owl",
  villager: "Villager",
  hunter: "Hunter",
  jester: "Jester",
};

export const ART = {
  werewolf: "art/werewolf.svg",
  packleader: "art/packleader.svg",
  prowler: "art/prowler.svg",
  lackey: "art/lackey.svg",
  scout: "art/scout.svg",
  mason: "art/mason.svg",
  seer: "art/seer.svg",
  thief: "art/thief.svg",
  meddler: "art/meddler.svg",
  sleepwalker: "art/sleepwalker.svg",
  nightowl: "art/nightowl.svg",
  villager: "art/villager.svg",
  hunter: "art/hunter.svg",
  jester: "art/jester.svg",
  back: "art/back.svg",
};

// ROLE_COLORS: each card's own colors, the same as the reference's role cards so players feel at
// home. `card` is the card and the art's flat background, `band` the lighter name band and text
// strip, `ink` the silhouette (the reference draws it as black at 60% over the card color).
// The art in art/src reads these: change a color here, then rebuild with node art/src/build.mjs.
export const ROLE_COLORS = {
  werewolf: { card: "#f44336", band: "#f77066", ink: "#621b16" },
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
};
