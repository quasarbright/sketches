// Everything that names or draws the game lives here, so it can be reskinned in one place.
//
// TITLE: the game's name on the home screen, the top bar and the browser tab.
// NAMES: the name shown for each role. Rules text, night prompts and results all read from here.
// ART:   an image per card, used instead of the built-in line art when set. Put the files in
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
  werewolf: null, packleader: null, prowler: null, lackey: null, scout: null, mason: null,
  seer: null, thief: null, meddler: null, sleepwalker: null, nightowl: null, villager: null,
  hunter: null, jester: null, back: null,
};
