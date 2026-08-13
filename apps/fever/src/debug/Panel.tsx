/**
 * The dev panel — what the software will tell you about itself.
 *
 * It began as a fever slider and eight buttons named after `SpectacleEvent`
 * variants, which is a panel you can only use if you already remember the whole
 * event bus. The fix isn't fewer controls, it's saying what each one *does*:
 * every label here is the plain-English effect with the code's own name in
 * parentheses, so the panel reads without the source open and still greps back
 * into it.
 *
 * Three tabs, because there are three genuinely different questions:
 *
 * - **now** — what is the software doing? A read-only sweep across every store,
 *   polled at a human rate rather than subscribed at 60Hz.
 * - **props** — show me an act. Names the act (`bench.ts`) instead of firing an
 *   event and taking whatever `gags.ts` draws; the event buttons are still here
 *   below it, because exercising the *picker* is a different thing to review
 *   than exercising an act.
 * - **world** — put the game somewhere. Pin fever, jump screens, change the
 *   opponent or the board without playing your way there.
 *
 * `live` is shown next to the fever override so it's obvious when the panel is
 * lying to the rest of the app — a pinned slider left on by accident otherwise
 * reads as a Director that stopped working.
 */

import { useEffect, useReducer, useState } from "react";
import { ROSTER, VARIANTS } from "@fourscore/engine";
import { playSpike } from "../audio/index.js";
import { SOUND_NAMES, type SoundName } from "../audio/library.js";
import { identityFor } from "../bots/identity.js";
import { useShellStore, type Screen } from "../chrome/store.js";
import { useDirectorStore } from "../director/store.js";
import type { SpectacleEvent } from "../director/types.js";
import { useMatchStore } from "../match/store.js";
import { useOnlineStore } from "../online/store.js";
import { requestAct } from "../props/bench.js";
import { PROP_ACTS } from "../props/registry.js";
import { useSettingsStore } from "../settings/store.js";
import { stageFx } from "../stage/fx.js";
import { THEMES, THEME_IDS, useThemeStore } from "../stage/theme.js";

/**
 * One representative payload per event kind. Fixed, not random: the taste law
 * says randomness picks which gag fires, never how it looks, and a review pass
 * needs the same spike twice in a row to judge it.
 */
const SAMPLES: { label: string; hint: string; event: SpectacleEvent }[] = [
  {
    label: "great move",
    hint: "move.quality = brilliant",
    event: { kind: "move", player: "red", col: 3, quality: "brilliant" },
  },
  {
    label: "ordinary move",
    hint: "move.quality = fine — mostly silence, on purpose",
    event: { kind: "move", player: "red", col: 3, quality: "fine" },
  },
  {
    label: "bad move",
    hint: "move.quality = blunder",
    event: { kind: "move", player: "red", col: 3, quality: "blunder" },
  },
  {
    label: "someone can win next turn",
    hint: "threat",
    event: { kind: "threat", player: "yellow" },
  },
  {
    label: "game heating up",
    hint: "tension-shift rising",
    event: { kind: "tension-shift", direction: "rising" },
  },
  {
    label: "false alarm",
    hint: "tension-shift collapsing",
    event: { kind: "tension-shift", direction: "collapsing" },
  },
  { label: "someone won", hint: "win — preempts whatever is on stage", event: { kind: "win", player: "red", line: [] } },
  { label: "drawn game", hint: "draw", event: { kind: "draw" } },
  { label: "nothing happened", hint: "idle-beat — the attract loop's heartbeat", event: { kind: "idle-beat" } },
];

const SCREENS: { screen: Screen; label: string }[] = [
  { screen: "menu", label: "menu" },
  { screen: "roster", label: "pick opponent" },
  { screen: "online", label: "lobby" },
  { screen: "match", label: "playing" },
];

function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

/**
 * Re-render on a timer, so the readout can call `getState()` on six stores
 * without subscribing to any of them. Subscribing would be the reflex and it's
 * wrong here: half these values change every frame, and a panel that re-renders
 * at 60Hz to show a number nobody can read that fast costs frames the thing
 * being measured needs.
 */
function useTick(ms: number): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = window.setInterval(bump, ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug-read">
      <span className="debug-read__k">{label}</span>
      <span className="debug-read__v">{value}</span>
    </div>
  );
}

/** What the software is doing, right now. Read-only by design. */
function NowTab() {
  useTick(250);
  const fps = useFps();

  const shell = useShellStore.getState();
  const director = useDirectorStore.getState();
  const m = useMatchStore.getState();
  const online = useOnlineStore.getState();

  const identity = identityFor(m.botId);
  const inFlight = m.moves.length - m.landed;

  return (
    <div className="debug-readout">
      <Row label="frames per second" value={fps.toFixed(0)} />
      <Row
        label="screen (shell.screen)"
        value={shell.dialog ? `${shell.screen} + ${shell.dialog.kind} dialog` : shell.screen}
      />
      <Row
        label="pacing (frame.mode)"
        value={director.frame.mode === "attract" ? "attract — menu, acts overlap" : "match — one act at a time"}
      />
      <Row
        label="intensity 0–1 (fever)"
        value={
          director.override === null
            ? director.frame.fever.toFixed(2)
            : `${director.override.toFixed(2)} PINNED — real value ${director.live.toFixed(2)}`
        }
      />
      <Row
        label="opponent (match.botId)"
        value={identity ? `${m.botId} — signature ${identity.signature.act}` : m.botId}
      />
      <Row label="last act on stage (stageFx.lastAct)" value={stageFx.lastAct || "none yet"} />
      <Row
        label="board (match.variant)"
        value={`${m.variant.id} — ${m.variant.width}x${m.variant.height} run ${m.variant.run}`}
      />
      <Row
        label="game (match.match)"
        value={`${m.match.status}${m.match.winner ? ` — ${m.match.winner} won` : ""}, ${m.moves.length} discs, ${m.match.turn} to move`}
      />
      <Row
        label="being played? (match.live)"
        value={m.live ? "yes" : "no — the board is scenery"}
      />
      <Row
        label="discs still dropping (moves − landed)"
        value={inFlight === 0 ? "none — input is open" : String(inFlight)}
      />
      <Row label="bot searching? (match.thinking)" value={m.thinking ? "yes" : "no"} />
      <Row
        label="opponent kind (match.mode)"
        value={m.mode === "online" ? "another person over the wire" : "a bot on this machine"}
      />
      <Row
        label="lobby (online store)"
        value={
          online.row
            ? `${online.row.status} · code ${online.row.join_code ?? "—"} · ${online.opponentName ?? "unnamed"}${online.error ? ` · ERROR ${online.error}` : ""}`
            : online.error
              ? `ERROR ${online.error}`
              : online.me
                ? "signed in, no match"
                : "not connected"
        }
      />
    </div>
  );
}

/**
 * Every act in the roster, playable by name.
 *
 * Sorted by berth rather than alphabetically: the berth is the rule that
 * decides which two acts can share the menu, so grouping by it is how you spot
 * a corner with nothing in it.
 */
function PropsTab() {
  const fire = useDirectorStore((s) => s.fire);
  const acts = Object.values(PROP_ACTS).sort(
    (a, b) => a.berth.localeCompare(b.berth) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <p className="debug-note">Plays that exact act — no weighted draw, no waiting for a gap.</p>
      <div className="debug-list">
        {acts.map((a) => (
          <button key={a.name} className="debug-act" onClick={() => requestAct(a.name)} title={`${a.tris} triangles`}>
            <span className="debug-act__name">{a.name}</span>
            <span className="debug-act__meta">
              {a.berth} · {(a.durationMs / 1000).toFixed(1)}s{a.declares ? " · declares" : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="debug-note">
        Or send a real moment down the bus, and let <code>gags.ts</code> draw the answer — this is
        the path a game takes, so the same button twice can give you two acts.
      </p>
      <div className="debug-row debug-events">
        {SAMPLES.map((s) => (
          <button key={s.hint} title={s.hint} onClick={() => fire(s.event)}>
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Put the game somewhere, without playing your way there. */
function WorldTab() {
  // Quantized on purpose: the readout is for a human, and subscribing a DOM
  // component to the raw value re-renders this panel sixty times a second.
  const fever = useDirectorStore((s) => Math.round(s.frame.fever * 100) / 100);
  const live = useDirectorStore((s) => Math.round(s.live * 100) / 100);
  const override = useDirectorStore((s) => s.override);
  const setFever = useDirectorStore((s) => s.setFever);
  // The player-facing settings, not debug copies of them — see settings/store.ts.
  const postEnabled = useSettingsStore((s) => s.effects);
  const setPostEnabled = useSettingsStore((s) => s.setEffects);
  const muted = useSettingsStore((s) => s.muted);
  const setMuted = useSettingsStore((s) => s.setMuted);
  const go = useShellStore((s) => s.go);
  const screen = useShellStore((s) => s.screen);
  const botId = useMatchStore((s) => s.botId);
  const variantId = useMatchStore((s) => s.variant.id);
  const newGame = useMatchStore((s) => s.newGame);
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [sound, setSound] = useState<SoundName>(SOUND_NAMES[0]!);

  return (
    <>
      <p className="debug-note">
        Art direction (stage/theme.ts) — five candidate looks, live-switchable. Persists.
      </p>
      <div className="debug-row debug-events">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            className={themeId === id ? "debug-on" : undefined}
            title={THEMES[id].blurb}
            onClick={() => setTheme(id)}
          >
            {THEMES[id].name}
          </button>
        ))}
      </div>

      <label className="debug-row">
        intensity {fever.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={fever}
          onChange={(e) => setFever(Number(e.target.value))}
        />
      </label>
      <div className="debug-row">
        <span className={override === null ? "debug-on" : undefined}>
          {override === null ? "the game is driving" : `held here — the game says ${live.toFixed(2)}`}
        </span>
        {override !== null && (
          <button className="debug-mini" onClick={() => setFever(null)}>
            release
          </button>
        )}
      </div>
      <label className="debug-row">
        <input
          type="checkbox"
          checked={postEnabled}
          onChange={(e) => setPostEnabled(e.target.checked)}
        />
        bloom, aberration, grain (post stack)
      </label>
      <label className="debug-row">
        <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
        mute everything
      </label>
      {/* Audition any sound on demand. Judging one against the signature spike
          means hearing them back to back, which no game will ever arrange. */}
      <div className="debug-row">
        <select value={sound} onChange={(e) => setSound(e.target.value as SoundName)}>
          {SOUND_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="debug-mini" onClick={() => playSpike(sound)}>
          play sound
        </button>
      </div>

      <p className="debug-note">Jump to a screen (shell.screen).</p>
      <div className="debug-row debug-events">
        {SCREENS.map((s) => (
          <button
            key={s.screen}
            className={screen === s.screen ? "debug-on" : undefined}
            // The match screen with a dead board is a trap: the turn loop stands
            // down on `live: false`, so jumping there without starting a game
            // gives you a board that ignores clicks and no clue why.
            onClick={() => {
              if (s.screen === "match") newGame({ live: true });
              go(s.screen);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="debug-note">Restart against a different opponent or board (match.newGame).</p>
      <div className="debug-row">
        <select
          value={botId}
          onChange={(e) => newGame({ botId: e.target.value, live: screen === "match" })}
        >
          {ROSTER.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
            </option>
          ))}
        </select>
        <select
          value={variantId}
          onChange={(e) => {
            const variant = VARIANTS.find((v) => v.id === e.target.value);
            if (variant) newGame({ variant, live: screen === "match" });
          }}
        >
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

type Tab = "now" | "props" | "world";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "now", label: "now" },
  { tab: "props", label: "props" },
  { tab: "world", label: "world" },
];

export function DebugPanel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("now");
  const pinned = useDirectorStore((s) => s.override !== null);

  if (!open) {
    return (
      <button className="debug-tab" onClick={() => setOpen(true)}>
        dev{pinned ? " · pinned" : ""}
      </button>
    );
  }

  return (
    <div className="debug">
      <div className="debug-row debug-head">
        <span>fourscore dev</span>
        <button onClick={() => setOpen(false)} title="collapse">
          –
        </button>
      </div>
      <div className="debug-row debug-tabs">
        {TABS.map((t) => (
          <button
            key={t.tab}
            className={tab === t.tab ? "debug-tabbtn debug-tabbtn--on" : "debug-tabbtn"}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "now" && <NowTab />}
      {tab === "props" && <PropsTab />}
      {tab === "world" && <WorldTab />}
    </div>
  );
}
