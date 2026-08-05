/**
 * Game orchestration: screen state, the turn loop, and the bridge between the
 * React tree and the imperative board scene.
 *
 * The one subtlety is move sequencing. `Match` is rebuilt from the move history
 * on every render, so game state is immutable and there's no class instance to
 * keep in sync — but the drop animation is imperative and has to start *before*
 * the new disc appears in the grid, or it flashes into place for a frame and
 * then falls. So `playMove` starts the animation first and updates history
 * second; the scene hides the landing cell while a drop is in flight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONNECT4,
  Match,
  Position,
  ROSTER,
  type BotDecision,
  type BotProfile,
  type Mood,
  type Player,
  type Review as ReviewData,
  type Variant,
} from "@fourscore/engine";
import { engineClient } from "./engine/client.js";
import { BoardScene, type ColumnMark, type SceneModel } from "./render/boardScene.js";
import { Board } from "./ui/Board.js";
import { BotSelect } from "./ui/BotSelect.js";
import { Review } from "./ui/Review.js";

/** Even an instant bot pauses, or its move reads as a glitch rather than a move. */
const MIN_THINK_MS = 380;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MOOD_LINE: Record<Mood, string> = {
  idle: "…",
  thinking: "hm.",
  pleased: "oh, good.",
  smug: "I can see the end from here.",
  worried: "hm. that's awkward.",
  alarmed: "wait—",
  resigned: "well. that's that.",
};

type Screen = "select" | "match";

interface Record_ {
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Bumped from v1 because records are now keyed by `bot@variant`. Beating Vane
 * at Connect 4 and beating Vane at Connect 5 are different achievements, and
 * merging them would quietly inflate every existing record the moment someone
 * played a variant game.
 */
const RECORD_KEY = "fourscore.record.v2";

const recordKey = (botId: string, variantId: string): string => `${botId}@${variantId}`;

function loadRecord(): Record<string, Record_> {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record_>) : {};
  } catch {
    return {};
  }
}

export function App() {
  const client = engineClient();

  const [screen, setScreen] = useState<Screen>("select");
  const [bot, setBot] = useState<BotProfile | null>(null);
  const [variant, setVariant] = useState<Variant>(CONNECT4);
  const [history, setHistory] = useState<number[]>([]);
  const [humanFirst, setHumanFirst] = useState(true);

  const [mood, setMood] = useState<Mood>("idle");
  const [thinking, setThinking] = useState(false);
  const [decision, setDecision] = useState<BotDecision | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  const [review, setReview] = useState<ReviewData | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewPly, setReviewPly] = useState<number | null>(null);

  const [record, setRecord] = useState<Record<string, Record_>>(loadRecord);

  const sceneRef = useRef<BoardScene | null>(null);
  const historyRef = useRef<number[]>([]);
  historyRef.current = history;

  const match = useMemo(() => Match.fromMoves(history, variant), [history, variant]);
  const humanPlayer: Player = humanFirst ? "red" : "yellow";
  const botPlayer: Player = humanFirst ? "yellow" : "red";

  // The variant the move sequencer should use. Read from a ref rather than
  // closed over, because `playMove` is deliberately built once.
  const variantRef = useRef<Variant>(variant);
  variantRef.current = variant;

  // -- moves ----------------------------------------------------------------

  const playMove = useCallback(async (col: number) => {
    const pos = Position.fromMoves(historyRef.current, variantRef.current);
    if (!pos.canPlay(col)) return;

    const row = pos.landingRow(col);
    const player = pos.turn;
    const landed = sceneRef.current?.animateDrop(col, row, player) ?? Promise.resolve();

    const next = [...historyRef.current, col];
    historyRef.current = next;
    setHistory(next);
    setLocked(true);
    await landed;
    setLocked(false);
  }, []);

  const startMatch = useCallback(
    (profile: BotProfile, playerFirst: boolean, v: Variant) => {
      // Fire and forget: clearing the bot's table is housekeeping, and making
      // the screen transition wait on a worker round-trip means a hiccup in the
      // worker reads to the player as a dead button.
      void client.reset(profile.id, v.id).catch(() => {});
      setBot(profile);
      setVariant(v);
      variantRef.current = v;
      setHumanFirst(playerFirst);
      historyRef.current = [];
      setHistory([]);
      setMood("idle");
      setDecision(null);
      setThinking(false);
      setLocked(false);
      setReview(null);
      setReviewing(false);
      setReviewPly(null);
      setScreen("match");
    },
    [client],
  );

  // -- the bot's turn -------------------------------------------------------

  useEffect(() => {
    if (screen !== "match" || !bot) return;
    if (match.status !== "playing") return;
    if (match.turn !== botPlayer) return;
    if (locked) return;

    let cancelled = false;
    const at = history.length;
    setThinking(true);

    (async () => {
      try {
        const [d] = await Promise.all([
          client.decide(bot.id, variant.id, historyRef.current),
          sleep(MIN_THINK_MS),
        ]);
        // Bail if anything moved under us — StrictMode double-invokes effects in
        // development, and a stale reply must not get to play a move.
        if (cancelled || historyRef.current.length !== at) return;
        setThinking(false);
        setMood(d.mood);
        setDecision(d);
        await playMove(d.col);
      } catch {
        if (!cancelled) setThinking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    screen,
    bot,
    variant,
    match.status,
    match.turn,
    botPlayer,
    history.length,
    locked,
    client,
    playMove,
  ]);

  // -- record ---------------------------------------------------------------

  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!bot || match.status === "playing") return;
    const stamp = `${bot.id}@${variant.id}:${history.join(",")}`;
    if (recorded.current === stamp) return;
    recorded.current = stamp;

    const key = recordKey(bot.id, variant.id);

    setRecord((prev) => {
      const cur = prev[key] ?? { wins: 0, losses: 0, draws: 0 };
      const next = {
        ...prev,
        [key]: {
          wins: cur.wins + (match.winner === humanPlayer ? 1 : 0),
          losses: cur.losses + (match.winner === botPlayer ? 1 : 0),
          draws: cur.draws + (match.winner === null ? 1 : 0),
        },
      };
      try {
        localStorage.setItem(RECORD_KEY, JSON.stringify(next));
      } catch {
        /* storage disabled; the record just won't persist */
      }
      return next;
    });
  }, [bot, variant, match.status, match.winner, humanPlayer, botPlayer, history]);

  // -- review ---------------------------------------------------------------

  const runReview = useCallback(async () => {
    if (!bot) return;
    setReviewing(true);
    try {
      // Scoped to the human: `reviewMatch` picks the turning point from whatever
      // plies it graded, and grading both sides would let it headline the bot's
      // losing move as though it were yours.
      const r = await client.review(variant.id, historyRef.current, humanPlayer);
      setReview(r);
      setReviewPly(r.turningPoint?.ply ?? null);
    } finally {
      setReviewing(false);
    }
  }, [bot, client, humanPlayer, variant]);

  // -- scene model ----------------------------------------------------------

  const sceneModel: SceneModel = useMemo(() => {
    const showing = reviewPly != null && review != null;
    const shownPosition = showing
      ? Position.fromMoves(history.slice(0, reviewPly), variant)
      : match.position;

    const marks: ColumnMark[] = [];
    if (showing) {
      const rec = review.plies.find((p) => p.ply === reviewPly);
      if (rec) {
        for (const col of rec.bestCols) marks.push({ col, kind: "best" });
        marks.push({ col: rec.col, kind: "played" });
      }
    }

    return {
      variant,
      grid: shownPosition.grid(),
      winningCells: showing ? [] : match.winningCells,
      hoverCol,
      marks,
      botId: bot?.id ?? "pebble",
      botColors: bot?.colors ?? { body: "#9aa5b1", shade: "#6b7684" },
      mood: thinking ? "thinking" : mood,
      thinking,
      humanPlayer,
      interactive: match.status === "playing" && match.turn === humanPlayer && !locked && !thinking,
      dimmed: showing,
    };
  }, [
    match,
    variant,
    history,
    hoverCol,
    bot,
    mood,
    thinking,
    humanPlayer,
    locked,
    reviewPly,
    review,
  ]);

  // -- render ---------------------------------------------------------------

  if (screen === "select" || !bot) {
    return (
      <BotSelect
        record={record}
        variant={variant}
        onVariant={setVariant}
        onPick={(b) => startMatch(b, true, variant)}
      />
    );
  }

  const over = match.status !== "playing";
  const won = match.winner === humanPlayer;

  return (
    <div className="screen screen--match">
      <header className="match-bar">
        <button className="link-button" onClick={() => setScreen("select")}>
          ← roster
        </button>
        <div className="match-bar__bot">
          {bot.name}
          <span className="match-bar__variant">{variant.name}</span>
          {decision?.exact && <span className="badge badge--solved">solving exactly</span>}
        </div>
      </header>

      <Board
        model={sceneModel}
        onHover={setHoverCol}
        onColumn={(col) => {
          if (sceneModel.interactive) void playMove(col);
        }}
        sceneRef={(s) => (sceneRef.current = s)}
      />

      <div className="say">
        {thinking ? "…" : over ? "" : MOOD_LINE[mood]}
      </div>

      {!over && (
        <p className="status">
          {match.turn === humanPlayer ? "Your move." : `${bot.name} is thinking.`}
        </p>
      )}

      {over && !review && (
        <div className="outcome">
          <h2>
            {match.winner === null ? "A draw." : won ? "You win." : `${bot.name} wins.`}
          </h2>
          <div className="button-row">
            <button
              className="button button--primary"
              onClick={() => startMatch(bot, humanFirst, variant)}
            >
              Rematch
            </button>
            <button className="button" onClick={() => startMatch(bot, !humanFirst, variant)}>
              Rematch, {humanFirst ? "they" : "you"} start
            </button>
          </div>
          <button className="link-button" onClick={runReview} disabled={reviewing}>
            {reviewing ? "solving…" : "Where did it go wrong?"}
          </button>
          {reviewing && (
            <p className="review__footnote">
              Reading the game back — solving the end exactly, estimating the rest. This takes a
              few seconds.
            </p>
          )}
        </div>
      )}

      {over && review && (
        <Review
          review={review}
          humanPlayer={humanPlayer}
          lost={match.winner === botPlayer}
          selected={reviewPly}
          onSelect={setReviewPly}
          onBack={() => setScreen("select")}
          onRematch={() => startMatch(bot, humanFirst, variant)}
          variant={variant}
        />
      )}
    </div>
  );
}

/** Exported for the dev console; handy when poking at a specific opponent. */
export const roster = ROSTER;
