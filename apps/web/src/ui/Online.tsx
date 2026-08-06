/**
 * Online play: the lobby, and the match against a person.
 *
 * The board here is the same `BoardScene` the bot games use. What changes is
 * where moves come from, and one consequence of that: discs are animated off
 * the *move list* rather than at click time, so a move arriving over the wire
 * drops exactly like one you made yourself. Rendering therefore lags the
 * authoritative list by however long an animation takes, which is what
 * `rendered` is.
 *
 * That loop is also the only place a desync can show up. Fourscore is
 * client-authoritative — the database enforces turn order but nothing validates
 * legality — so an impossible move from the other side surfaces here, as a
 * position that won't accept it. Saying so plainly beats rendering nonsense.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Match,
  Position,
  ROSTER,
  VARIANTS,
  type Player,
  type Variant,
} from "@fourscore/engine";
import type { OnlineMatch } from "../online/useOnlineMatch.js";
import { BoardScene, type SceneModel } from "../render/boardScene.js";
import { Board } from "./Board.js";

/** A stable creature for a person, so your opponent looks the same all match. */
function creatureFor(id: string | null) {
  const bots = ROSTER.filter((b) => !b.perfect);
  let h = 0;
  for (const ch of id ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return bots[h % bots.length]!;
}

export function Online({ online, onExit }: { online: OnlineMatch; onExit: () => void }) {
  const { phase, row, moves, variant, myPlayer, opponentName, error, busy } = online;

  const sceneRef = useRef<BoardScene | null>(null);
  const [rendered, setRendered] = useState<number[]>([]);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [desync, setDesync] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");

  // Replay whatever the move list has that the board doesn't, one drop at a time.
  useEffect(() => {
    if (moves.length === rendered.length) return;
    if (moves.length < rendered.length || !startsWith(moves, rendered)) {
      setRendered(moves);
      return;
    }

    let cancelled = false;
    void (async () => {
      let cur = rendered;
      for (let i = rendered.length; i < moves.length; i++) {
        const pos = Position.fromMoves(cur, variant);
        const col = moves[i]!;
        if (!pos.canPlay(col)) {
          setDesync(true);
          return;
        }
        await (sceneRef.current?.animateDrop(col, pos.landingRow(col), pos.turn) ??
          Promise.resolve());
        if (cancelled) return;
        cur = [...cur, col];
        setRendered(cur);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [moves, rendered, variant]);

  useEffect(() => {
    setRendered([]);
    setDesync(false);
  }, [row?.id]);

  const match = useMemo(() => Match.fromMoves(rendered, variant), [rendered, variant]);
  const caughtUp = rendered.length === moves.length;
  const myTurn = match.status === "playing" && match.turn === myPlayer && caughtUp;
  const opponent = creatureFor(online.opponentId);

  const model: SceneModel = useMemo(
    () => ({
      variant,
      grid: match.grid(),
      winningCells: match.winningCells,
      hoverCol,
      marks: [],
      botId: opponent.id,
      botColors: opponent.colors,
      mood: match.status !== "playing" ? "idle" : myTurn ? "idle" : "thinking",
      thinking: !myTurn && match.status === "playing",
      humanPlayer: myPlayer ?? "red",
      interactive: myTurn,
      dimmed: false,
    }),
    [variant, match, hoverCol, opponent, myTurn, myPlayer],
  );

  // -- lobby ----------------------------------------------------------------

  if (phase === "idle" || (!row && phase !== "error")) {
    return (
      <div className="screen">
        <header className="masthead">
          <h1>Play a person</h1>
          <p>Host a game and send the link, or type in a code you were given.</p>
        </header>

        <h2 className="section-heading">Host</h2>
        <div className="variant-picker">
          {VARIANTS.map((v: Variant) => (
            <button
              key={v.id}
              className="variant-chip"
              disabled={busy || !online.me}
              onClick={() => void online.host(v)}
            >
              <span className="variant-chip__name">{v.name}</span>
              <span className="variant-chip__size">
                {v.width}×{v.height}, run {v.run}
              </span>
            </button>
          ))}
        </div>

        <h2 className="section-heading">Join</h2>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void online.join(code);
          }}
        >
          <input
            className="join-row__input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={4}
            aria-label="Game code"
          />
          <button className="button button--primary" disabled={busy || !code.trim()}>
            Join
          </button>
        </form>

        {error && <p className="online-error">{error}</p>}

        <button className="link-button" onClick={onExit}>
          ← play a bot instead
        </button>
      </div>
    );
  }

  // -- waiting for an opponent ----------------------------------------------

  if (phase === "waiting" && row) {
    const link = `${location.origin}${location.pathname}?join=${row.join_code}`;
    return (
      <div className="screen">
        <header className="masthead">
          <h1>Waiting for them</h1>
          <p>Send this to whoever you're playing. The game starts the moment they open it.</p>
        </header>

        <div className="join-code">{row.join_code}</div>

        <div className="button-row">
          <button
            className="button button--primary"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <p className="status">{variant.name}. You move first.</p>

        <button className="link-button" onClick={online.leave}>
          ← cancel
        </button>
      </div>
    );
  }

  // -- the match ------------------------------------------------------------

  const over = match.status !== "playing";
  const won = match.winner === myPlayer;

  return (
    <div className="screen screen--match">
      <header className="match-bar">
        <button className="link-button" onClick={onExit}>
          ← roster
        </button>
        <div className="match-bar__bot">
          {opponentName ?? "your opponent"}
          <span className="match-bar__variant">{variant.name}</span>
        </div>
      </header>

      <Board
        model={model}
        onHover={setHoverCol}
        onColumn={(col) => {
          if (myTurn && match.position.canPlay(col)) online.play(col);
        }}
        sceneRef={(s) => (sceneRef.current = s)}
      />

      <div className="say">{over ? "" : myTurn ? "" : "…"}</div>

      {desync && (
        <p className="online-error">
          Your opponent's game got out of step with yours — the move it sent can't be played here.
          Start a fresh game.
        </p>
      )}

      {!over && !desync && (
        <p className="status">{myTurn ? "Your move." : "Waiting for them."}</p>
      )}

      {over && (
        <div className="outcome">
          <h2>{match.winner === null ? "A draw." : won ? "You win." : "They win."}</h2>
          <div className="button-row">
            <button className="button button--primary" onClick={() => void online.host(variant)}>
              Host a rematch
            </button>
            <button className="button" onClick={online.leave}>
              Back to the lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const startsWith = (full: number[], prefix: number[]): boolean =>
  prefix.every((v, i) => full[i] === v);
