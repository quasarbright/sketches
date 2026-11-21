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
  scout: "Scout",
  mason: "Mason",
  seer: "Seer",
  thief: "Thief",
  meddler: "Meddler",
  sleepwalker: "Sleepwalker",
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

// ROLE_COLORS: each card's own color, like the reference's role cards. `card` is the art's flat
// background (use a lighter tint of it for the name band), `ink` is the silhouette. The art in
// art/src reads these, so change a color here and rebuild the art (node art/src/build.mjs).
export const ROLE_COLORS = {
  werewolf: { card: "#d9463b", ink: "#5a1612" },
  packleader: { card: "#b8323f", ink: "#4a0c16" },
  prowler: { card: "#c4553a", ink: "#4b160b" },
  lackey: { card: "#c75274", ink: "#4a1028" },
  scout: { card: "#d8654a", ink: "#4d1a0c" },
  mason: { card: "#2d93a8", ink: "#0c3540" },
  seer: { card: "#7a50c6", ink: "#2b1858" },
  thief: { card: "#3d5b8a", ink: "#0f1d36" },
  meddler: { card: "#a24bbd", ink: "#3a0f4c" },
  sleepwalker: { card: "#5a6ed0", ink: "#18215a" },
  nightowl: { card: "#4453b6", ink: "#141a4d" },
  villager: { card: "#3f84c8", ink: "#122f52" },
  hunter: { card: "#2a8a86", ink: "#0a3432" },
  jester: { card: "#e0963a", ink: "#5a2e04" },
  back: { card: "#1b2350", ink: "#3c4a96" },
};
