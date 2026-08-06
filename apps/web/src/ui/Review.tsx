/**
 * Post-game review.
 *
 * The headline is the turning point: the single move that took the game from
 * won or drawn to lost. That's deliberately the first thing shown, because a
 * list of forty graded plies is data and "you lost it on move 14, and column 5
 * held" is an answer.
 *
 * Every ply is shown and graded. Some scores come from the exact solver and some
 * from the evaluator, but that's plumbing — the player gets one consistent read
 * of their game. The distinction still governs what the review is allowed to
 * *claim*: a turning point is only ever named from a proven ply, and the copy
 * for an estimated one stays hedged without naming the machinery.
 */

import { useState } from "react";
import type { Grade, PlyRecord, Player, Review as ReviewData } from "@fourscore/engine";
import { EvalCurve } from "./EvalCurve.js";

const GRADE_LABEL: Record<Grade, string> = {
  best: "best",
  good: "fine",
  inaccuracy: "loose",
  mistake: "mistake",
  blunder: "blunder",
  unknown: "unreadable",
};

/** Columns are 1-indexed on screen; the engine counts from zero. */
const colName = (col: number): string => String(col + 1);

/**
 * The sentence for a ply.
 *
 * Estimated plies get hedged language — "looks", "stronger here" — because the
 * numbers behind them are a depth-6 opinion, not a result. Proven ones get to be
 * flat and declarative. The hedge is the tell; the reader never has to be told
 * which pass produced the number.
 */
function describe(rec: PlyRecord): string {
  if (rec.grade === "unknown") return "Nothing readable here.";

  const best = rec.bestCols.map(colName).join(" or ");

  if (rec.source === "estimated") {
    if (rec.grade === "best") return `Column ${colName(rec.col)} looks like the pick here.`;
    return `Column ${best} looks stronger here.`;
  }

  if (rec.grade === "best") return `Column ${colName(rec.col)} was the best move available.`;
  if (rec.turningPoint) {
    const was = (rec.bestScore ?? 0) > 0 ? "a won game" : "a drawn game";
    const now = (rec.playedScore ?? 0) < 0 ? "a lost one" : "a drawn one";
    return `This turned ${was} into ${now}. Column ${best} held it.`;
  }
  return `Still fine, but column ${best} was stronger.`;
}

interface Props {
  review: ReviewData;
  humanPlayer: Player;
  /** Whether the human actually lost, which changes what "no turning point" means. */
  lost: boolean;
  selected: number | null;
  onSelect: (ply: number | null) => void;
  onBack: () => void;
  onRematch: () => void;
}

export function Review({
  review,
  humanPlayer,
  lost,
  selected,
  onSelect,
  onBack,
  onRematch,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const mine = review.plies.filter((p) => p.player === humanPlayer);
  const notable = mine.filter((p) => p.grade !== "best" && p.grade !== "good");
  const shown = showAll ? mine : notable.length > 0 ? notable : mine.slice(-6);
  const proven = mine.filter((p) => p.source === "proven");

  /**
   * "No turning point" means two very different things.
   *
   * If every ply was proven, it's a real finding: nothing you played changed the
   * result. But if the opening went unproven and you lost anyway, then by the
   * time the solver could see the board the game was already gone — the losing
   * move is real, it's just behind the horizon. Reporting that as "no single
   * losing move" would be telling you that you played fine when we don't know,
   * so this case gets its own headline about the game slipping early.
   */
  const decidedBeforeHorizon = lost && review.skipped > 0 && proven.length > 0;

  return (
    <div className="review">
      <EvalCurve
        curve={review.curve}
        humanPlayer={humanPlayer}
        marked={selected}
        onSelect={(ply) => onSelect(selected === ply ? null : ply)}
      />

      <div className="review__headline">
        {review.turningPoint ? (
          <>
            <h2>Move {Math.floor(review.turningPoint.ply / 2) + 1} lost it.</h2>
            <p>{describe(review.turningPoint)}</p>
          </>
        ) : review.biggestSwing && proven.length === 0 ? (
          <>
            <h2>Move {Math.floor(review.biggestSwing.ply / 2) + 1} is where it slipped.</h2>
            <p>
              That move gave up more ground than any other you played. Column{" "}
              {review.biggestSwing.bestCols.map(colName).join(" or ")} looks stronger there.
            </p>
          </>
        ) : proven.length === 0 ? (
          <>
            <h2>Nothing much turned on one move.</h2>
            <p>
              The game was short, and no single move gave up meaningful ground. Reviews get
              sharper the longer a game runs.
            </p>
          </>
        ) : decidedBeforeHorizon ? (
          <>
            <h2>It was lost in the opening.</h2>
            <p>
              Nothing you played later changed the result — by the time the game got sharp it was
              already gone.
              {review.biggestSwing
                ? ` Move ${
                    Math.floor(review.biggestSwing.ply / 2) + 1
                  } is where the ground went.`
                : " The loose moves below are the best lead available."}
            </p>
          </>
        ) : (
          <>
            <h2>No single losing move.</h2>
            <p>
              Nothing you played turned a won or drawn game into a lost one — the result came from
              the position, not one mistake.
            </p>
          </>
        )}
      </div>

      <ul className="ply-list">
        {shown.map((rec) => (
          <li key={rec.ply}>
            <button
              className={`ply${selected === rec.ply ? " ply--selected" : ""}${
                rec.turningPoint ? " ply--turning" : ""
              }`}
              onClick={() => onSelect(selected === rec.ply ? null : rec.ply)}
            >
              <span className="ply__num">{Math.floor(rec.ply / 2) + 1}</span>
              <span className="ply__col">col {colName(rec.col)}</span>
              <span className={`ply__grade ply__grade--${rec.grade}`}>
                {GRADE_LABEL[rec.grade]}
              </span>
            </button>
            {selected === rec.ply && <p className="ply__detail">{describe(rec)}</p>}
          </li>
        ))}
      </ul>

      {mine.length > shown.length && (
        <button className="link-button" onClick={() => setShowAll(true)}>
          Show all {mine.length} of your moves
        </button>
      )}

      <div className="button-row">
        <button className="button button--primary" onClick={onRematch}>
          Rematch
        </button>
        <button className="button" onClick={onBack}>
          Pick someone else
        </button>
      </div>
    </div>
  );
}
