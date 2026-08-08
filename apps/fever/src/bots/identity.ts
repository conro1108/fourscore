/**
 * Who each opponent is on this stage — the client-side half of a bot.
 *
 * The engine owns a bot's *soul*: weights, depth, slip rate, crossover, and the
 * blurb that describes what it's like to play. None of that is here and none of
 * it may move here (`packages/engine` is I/O-free and stays that way). What is
 * here is everything the engine has no business knowing: what their world looks
 * like and which canned clip their screen plays.
 *
 * Two fields, and both are deliberately small.
 *
 * **The void variation is four numbers.** Not a shader per bot — four knobs on
 * the one shader (`stage/VoidBackdrop.tsx`), which is what keeps eight worlds
 * inside one look instead of eight looks. The thesis frame is what the knobs
 * are centred on: every value below is a *deviation* from it, `NEUTRAL` is
 * exactly the phase-2 void, and the harness states that pin no bot render the
 * thesis frame untouched. Extending the look is allowed; replacing it is not.
 *
 * The palette law binds this hardest. Tints come from the bot's own engine
 * colour pulled down into the void, and **none of them may reach the heat
 * family** — arterial red and hazard orange mean fever, everywhere, and a
 * fever-coloured opponent would make escalation unreadable. Cinder is smoke and
 * Bramble is brick for exactly that reason; both are named after fire and
 * neither gets any.
 *
 * **The signature is one act on one event.** VISION.md gives every persona a
 * gag; this is where it is wired. It joins that event's pool at a weight that
 * makes it the likely answer without making it the only one — a lane screen has
 * a library, and an opponent whose every reaction is identical is a status
 * light again (the thing `gags.ts` exists to prevent).
 */

import type { SpectacleEvent } from "../director/types.js";

/** What a signature can hang off: an event kind, or one grade of move. */
export type SignatureHook =
  | "brilliant"
  | "dubious"
  | "blunder"
  | "threat"
  | "tension-shift"
  | "idle-beat";

/**
 * Four knobs on the void shader. `NEUTRAL` is the thesis frame exactly, so a
 * scene with no opponent — the preview harness, and anything that forgets to
 * pass one — renders phase 2's look untouched.
 */
export interface VoidVariation {
  /** Colour mixed into the weather. Never the heat family. */
  tint: string;
  /** How much of it, 0..1. 0 is the thesis frame. */
  tintAmount: number;
  /** Weather noise scale. >1 is fine speckle, <1 is broad soft masses. */
  grain: number;
  /** Multiplier on the void's drift rate. */
  drift: number;
  /** Multiplier on the oil slick's strength. */
  slick: number;
}

export interface BotIdentity {
  id: string;
  void: VoidVariation;
  signature: { act: string; on: SignatureHook };
}

export const NEUTRAL: VoidVariation = {
  tint: "#000000",
  tintAmount: 0,
  grain: 1,
  drift: 1,
  slick: 1,
};

const variation = (over: Partial<VoidVariation>): VoidVariation => ({ ...NEUTRAL, ...over });

/**
 * The roster's stage presence, in ladder order. Read the `tint`/`grain`/`drift`
 * column downward and it is a legible arc: bright and busy at the bottom of the
 * ladder, dull in the middle, still and enormous at the top. That arc is the
 * accept criterion of this phase — a stranger should be able to tell the rungs
 * apart with the evaluation hidden — and it lives in these numbers, not in the
 * gags.
 */
export const IDENTITIES: Record<string, BotIdentity> = {
  acorn: {
    id: "acorn",
    // Warm, fine, bright: the one void that hasn't got round to being ominous.
    void: variation({ tint: "#3a2b0a", tintAmount: 0.4, grain: 1.3, drift: 1.15, slick: 1.2 }),
    signature: { act: "bumpers-up", on: "idle-beat" },
  },
  pebble: {
    id: "pebble",
    // Wet concrete. Heavy, slow, and the slick nearly matte — the dullest
    // world on the ladder, which is the whole of Pebble's character.
    void: variation({ tint: "#1b2028", tintAmount: 0.45, grain: 0.8, drift: 0.6, slick: 0.4 }),
    signature: { act: "slab-drop", on: "threat" },
  },
  moss: {
    id: "moss",
    // Green-black bruises and spores rather than weather (VISION.md's own
    // words for it): the tint is Moss's engine green pulled into the void and
    // the grain is up, which is what turns the weather into specks.
    void: variation({ tint: "#1b3813", tintAmount: 0.5, grain: 1.7, drift: 0.75, slick: 0.75 }),
    signature: { act: "sprinkler", on: "idle-beat" },
  },
  bramble: {
    id: "bramble",
    // Brick and thorn, desaturated on purpose so it cannot be read as fever,
    // and the fastest drift on the ladder — the only void going somewhere.
    void: variation({ tint: "#2b1109", tintAmount: 0.5, grain: 1.15, drift: 1.7, slick: 0.6 }),
    signature: { act: "pin-scatter", on: "threat" },
  },
  cinder: {
    id: "cinder",
    // Smoke: broad masses that hang instead of drifting, and almost no sheen.
    // Named after fire and given none of it.
    void: variation({ tint: "#2a221c", tintAmount: 0.5, grain: 0.55, drift: 0.5, slick: 0.35 }),
    signature: { act: "shell-game", on: "dubious" },
  },
  vane: {
    id: "vane",
    // Nearly the thesis frame, and that is the tell. The one deviation is the
    // slick, which crawls *backwards* here — see `slick < 0` in the shader.
    void: variation({ tint: "#241d47", tintAmount: 0.25, grain: 1, drift: 1, slick: -1.1 }),
    signature: { act: "score-lie", on: "tension-shift" },
  },
  quill: {
    id: "quill",
    // Cold and measured: an even fine grain that reads as a grid ghosting
    // through the noise, drifting slowly and exactly.
    void: variation({ tint: "#0b2733", tintAmount: 0.45, grain: 2.2, drift: 0.55, slick: 0.6 }),
    signature: { act: "lane-solve", on: "threat" },
  },
  oracle: {
    id: "oracle",
    // Still. Broad, slow, one held sheen. Calmest world in the game at fever 0
    // and — because the shader's fever terms are untouched by any of this —
    // the most alarming at 1.
    void: variation({ tint: "#2e2b24", tintAmount: 0.35, grain: 0.4, drift: 0.22, slick: 1.2 }),
    signature: { act: "pinsetter", on: "idle-beat" },
  },
};

/** The identity for a bot id, or null for "no opponent" (menu-less harness). */
export function identityFor(botId: string | null | undefined): BotIdentity | null {
  return botId ? IDENTITIES[botId] ?? null : null;
}

/** The void this scene is composed in. No opponent means the thesis frame. */
export const voidOf = (identity: BotIdentity | null): VoidVariation =>
  identity?.void ?? NEUTRAL;

/** Does this opponent's signature answer this event? */
export function signatureMatches(hook: SignatureHook, event: SpectacleEvent): boolean {
  if (event.kind === "move") return event.quality === hook;
  return event.kind === hook;
}
