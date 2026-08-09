/**
 * The roster's stage contract.
 *
 * Whether Cinder's void reads as smoke is a question for the harness
 * (`bot-cinder` in the preview states). What lives here is everything that
 * rots silently: an opponent with no identity, a signature naming an act that
 * doesn't exist, a variation that quietly reintroduces the heat family, and —
 * the one that actually matters — an opponent whose signature could state a
 * result.
 */

import { describe, expect, it } from "vitest";
import { ROSTER } from "@fourscore/engine";
import { IDENTITIES, NEUTRAL, identityFor, signatureMatches, voidOf } from "./identity.js";
import { PROP_ACTS } from "../props/registry.js";
import { candidatesFor, pickGag } from "../props/gags.js";
import type { SpectacleEvent } from "../director/types.js";

const ids = Object.keys(IDENTITIES);

describe("the roster's identities", () => {
  it("covers every bot the engine ships, and invents none", () => {
    expect(ids.sort()).toEqual(ROSTER.map((b) => b.id).sort());
  });

  it("gives every signature an act that exists, and no act to two of them", () => {
    const acts = Object.values(IDENTITIES).map((i) => i.signature.act);
    for (const act of acts) expect(PROP_ACTS[act], act).toBeDefined();
    expect(new Set(acts).size).toBe(acts.length);
  });

  /**
   * The claims law, at the roster level. Only `win` and `draw` are facts on
   * the bus, and a signature hangs off a grade, a threat, a shift or an idle
   * beat — never either of those — so no signature may name an act that
   * declares a result.
   */
  it("never gives an opponent an act that declares a result", () => {
    for (const identity of Object.values(IDENTITIES)) {
      expect(PROP_ACTS[identity.signature.act]!.declares, identity.id).toBeFalsy();
    }
  });

  it("stays inside one look — no opponent gets the void to themselves", () => {
    for (const identity of Object.values(IDENTITIES)) {
      const v = identity.void;
      // A tint that dominates is a repaint, not a variation.
      expect(v.tintAmount, identity.id).toBeGreaterThan(0);
      expect(v.tintAmount, identity.id).toBeLessThanOrEqual(0.7);
      expect(v.grain, identity.id).toBeGreaterThan(0.2);
      expect(v.drift, identity.id).toBeGreaterThan(0.1);
      expect(Math.abs(v.slick), identity.id).toBeLessThanOrEqual(2);
    }
  });

  /**
   * The palette law: arterial red and hazard orange mean fever, everywhere in
   * the game. A tint that read as heat would make escalation ambiguous, so no
   * variation may be both hot-hued and saturated — Cinder and Bramble are both
   * named after fire and both have to be checked, not trusted.
   */
  it("keeps every variation out of the heat family", () => {
    for (const identity of Object.values(IDENTITIES)) {
      const n = parseInt(identity.void.tint.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const hot = r > g && r > b && r - Math.max(g!, b!) > 40;
      expect(hot, `${identity.id} ${identity.void.tint}`).toBe(false);
    }
  });

  it("falls back to the thesis frame when nobody is on stage", () => {
    expect(identityFor(null)).toBeNull();
    expect(identityFor("nobody")).toBeNull();
    expect(voidOf(null)).toEqual(NEUTRAL);
    expect(NEUTRAL.tintAmount).toBe(0);
    expect(NEUTRAL.grain).toBe(1);
    expect(NEUTRAL.drift).toBe(1);
    expect(NEUTRAL.slick).toBe(1);
  });
});

describe("a signature on the stage", () => {
  const threat: SpectacleEvent = { kind: "threat", player: "red" };
  const idle: SpectacleEvent = { kind: "idle-beat" };

  it("matches a move grade and an event kind alike", () => {
    expect(signatureMatches("threat", threat)).toBe(true);
    expect(signatureMatches("idle-beat", threat)).toBe(false);
    const blunder: SpectacleEvent = { kind: "move", player: "red", col: 3, quality: "blunder" };
    expect(signatureMatches("blunder", blunder)).toBe(true);
    expect(signatureMatches("dubious", blunder)).toBe(false);
  });

  it("adds the opponent's act to their event without removing the library", () => {
    const pebble = IDENTITIES.pebble!;
    const general = candidatesFor(threat)
      .map((c) => c.name)
      .filter((name): name is string => name !== null);
    const drawn = new Set(
      Array.from({ length: 40 }, (_, i) => pickGag(threat, () => i / 40, { bot: pebble })),
    );
    expect(drawn).toContain("slab-drop");
    for (const name of general) expect(drawn, name).toContain(name);
  });

  /**
   * On the menu a signature rides the attract loop, so the opponent under the
   * cursor is already dressing the stage behind the roster window.
   *
   * In a match it does not, because a match has no idle beats at all any more
   * (`director.ts`) — which makes the hook each signature is wired to the only
   * way that opponent reaches the stage. That is the trap this pair of
   * assertions exists to catch: three signatures used to hang off `idle-beat`,
   * and left there they would have gone silent in every game ever played.
   */
  it("rides the menu's idle beat, and never a match's", () => {
    for (const identity of Object.values(IDENTITIES)) {
      const onMenu = new Set(
        Array.from({ length: 60 }, (_, i) =>
          pickGag(idle, () => i / 60, { bot: identity, mode: "attract" }),
        ),
      );
      expect(onMenu, identity.id).toContain(identity.signature.act);
      expect(pickGag(idle, () => 0.5, { bot: identity, mode: "match" }), identity.id).toBeNull();
    }
  });

  /** And every signature hangs off something a match actually emits. */
  it("wires every opponent to an event a game can produce", () => {
    for (const identity of Object.values(IDENTITIES)) {
      expect(identity.signature.on, identity.id).not.toBe("idle-beat");
    }
  });

  it("leaves the ending alone — a signature can never answer a win or a draw", () => {
    const ends: SpectacleEvent[] = [{ kind: "win", player: "red", line: [] }, { kind: "draw" }];
    for (const identity of Object.values(IDENTITIES)) {
      for (const event of ends) {
        const drawn = new Set(
          [0, 0.3, 0.7, 0.999].map((r) => pickGag(event, () => r, { bot: identity })),
        );
        expect(drawn.size, `${identity.id} ${event.kind}`).toBe(1);
        expect(PROP_ACTS[[...drawn][0]!]!.declares, event.kind).toBe(true);
      }
    }
  });

  it("does not change the draw at all when nobody is on stage", () => {
    for (const r of [0, 0.2, 0.5, 0.8, 0.99]) {
      expect(pickGag(idle, () => r, { bot: null })).toBe(pickGag(idle, () => r));
    }
  });
});
