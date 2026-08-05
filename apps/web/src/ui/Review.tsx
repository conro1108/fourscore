/**
 * Post-game review.
 *
 * The headline is the turning point: the single move that took the game from
 * won or drawn to lost. That's deliberately the first thing shown, because a
 * list of forty graded plies is data and "you lost it on move 14, and column 5
 * held" is an answer.
 *
 * Plies the solver couldn't prove are shown as unproven rather than hidden. The
 * opening is out of exact reach, and quietly dropping those moves would imply
 * the review had looked at them and found nothing wrong.
 */

import { useState } from "react";
import type { Grade, PlyRecord, Player, Review as ReviewData, Variant } from "@fourscore/engine";

const GRADE_LABEL: Record<Grade, string> = {
  best: "best",
  good: "fine",
  inaccuracy: "loose",
  mistake: "mistake",
  blunder: "blunder",
  unknown: "unproven",
};

/** Columns are 1-indexed on screen; the engine counts from zero. */
const colName = (col: number): string => String(col + 1);

function describe(rec: PlyRecord): string {
  if (rec.grade === "unknown") return "Too early in the game to solve exactly.";
  if (rec.grade === "best") return `Column ${colName(rec.col)} was the best move available.`;

  const best = rec.bestCols.map(colName).join(" or ");
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
  variant: Variant;
}

export function Review({
  review,
  humanPlayer,
  lost,
  selected,
  onSelect,
  onBack,
  onRematch,
  variant,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const mine = review.plies.filter((p) => p.player === humanPlayer);
  const notable = mine.filter((p) => p.grade !== "best" && p.grade !== "good");
  const shown = showAll ? mine : notable.length > 0 ? notable : mine.slice(-6);

  /**
   * "No turning point" means two very different things.
   *
   * If every ply was proven, it's a real finding: nothing you played changed the
   * result. But if the opening went unproven and you lost anyway, then by the
   * time the solver could see the board the game was already gone — the losing
   * move is real, it's just behind the horizon. Reporting that as "no single
   * losing move" would be telling you that you played fine when we don't know.
   */
  const proven = mine.filter((p) => p.grade !== "unknown");
  const decidedBeforeHorizon = lost && review.skipped > 0 && proven.length > 0;

  return (
    <div className="review">
      <div className="review__headline">
        {review.turningPoint ? (
          <>
            <h2>Move {Math.floor(review.turningPoint.ply / 2) + 1} lost it.</h2>
            <p>{describe(review.turningPoint)}</p>
          </>
        ) : proven.length === 0 ? (
          <>
            <h2>Nothing provable here.</h2>
            <p>
              The game ended too early for the solver to reach it. Reviews get sharper the longer
              a game runs.
            </p>
          </>
        ) : decidedBeforeHorizon ? (
          <>
            <h2>It was lost before the solver could see.</h2>
            <p>
              Every move it could prove kept the result you already had — so the game was decided
              in the opening, past the point exact analysis reaches. The loose moves below are the
              best lead available.
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
              <span className={`ply__grade ply__grade--${rec.grade}`}>{GRADE_LABEL[rec.grade]}</span>
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

      {review.skipped > 0 && (
        <p className="review__footnote">
          {review.skipped} early {review.skipped === 1 ? "move" : "moves"} couldn&rsquo;t be solved
          exactly. {variant.name}&rsquo;s opening is out of reach without a precomputed book
          {variant.run > 4
            ? `, and a ${variant.width}×${variant.height} board puts far more of the game behind that horizon than Connect 4 does`
            : ""}
          .
        </p>
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
