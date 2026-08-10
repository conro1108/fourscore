/**
 * The post-game review, as a window you can drag off the board.
 *
 * The headline is the point: one shouted verdict and one sentence. A list of
 * forty graded plies is data, and "move 14 lost it, and column 5 held" is an
 * answer — so the answer is the first thing in the window and the list is the
 * working underneath it.
 *
 * Two things about the presentation are load-bearing rather than decorative.
 * The window is docked to the side instead of centred, because selecting a move
 * winds the board behind it back to that position — a review that covers the
 * board it is talking about is a panel, and this game has a stage. And there is
 * exactly one line on the chart with no key under it: which numbers were proven
 * and which were estimated is a fact about how they were obtained, never
 * something the player has to hold (PLAN.md product truth 1). That distinction
 * is carried entirely by how hard the sentences push.
 */

import { useState } from "react";
import type { Player, Review as ReviewData } from "@fourscore/engine";
import { EvalCurve } from "./EvalCurve.js";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

export interface ReviewProps {
  status: "idle" | "running" | "ready" | "failed";
  review: ReviewData | null;
  humanPlayer: Player;
  /** Whether the human actually lost, which changes what "no turning point" means. */
  lost: boolean;
  selected: number | null;
  onSelect: (ply: number | null) => void;
  onAgain: () => void;
  onClose: () => void;
}

export function Review({
  status,
  review,
  humanPlayer,
  lost,
  selected,
  onSelect,
  onAgain,
  onClose,
}: ReviewProps) {
  const [showAll, setShowAll] = useState(false);

  const mine = review ? review.plies.filter((p) => p.player === humanPlayer) : [];
  // The short list is the moves worth looking at. When every move was fine
  // there's nothing to shortlist, so it shows the end of the game instead —
  // an empty list under a headline reads as a broken window.
  const notable = mine.filter((p) => p.grade !== "best" && p.grade !== "good");
  const shown = showAll ? mine : notable.length > 0 ? notable : mine.slice(-6);
  const record = selected === null ? null : (mine.find((p) => p.ply === selected) ?? null);

  const head = review && status === "ready" ? COPY.reviewHeadline(review, lost) : null;
  const detail = record ? COPY.plyLine(record) : COPY.reviewPick;

  return (
    <Window
      title={status === "ready" ? COPY.reviewTitle(mine.length) : COPY.reviewBusyTitle}
      className="win--review"
      label="game review"
      onClose={onClose}
      buttons={
        <>
          <Btn onClick={onClose}>{COPY.back}</Btn>
          <Btn onClick={onAgain}>{COPY.again}</Btn>
        </>
      }
    >
      {status !== "ready" && (
        <div className="review-wait">
          <p>{status === "failed" ? COPY.reviewFailed : COPY.reviewBusy}</p>
          {status === "running" && <p className="review-quiet">{COPY.reviewBusyTail}</p>}
        </div>
      )}

      {review && status === "ready" && (
        <>
          <EvalCurve
            curve={review.curve}
            humanPlayer={humanPlayer}
            marked={selected}
            onSelect={(ply) => onSelect(selected === ply ? null : ply)}
          />
          <p className="review-caption">{COPY.curveCaption}</p>

          {head && (
            <div className="review-head">
              <h2>{head.title}</h2>
              <p>{head.body}</p>
            </div>
          )}

          <div className="review-list">
            {shown.map((rec) => (
              <button
                key={rec.ply}
                type="button"
                className={`review-item ${selected === rec.ply ? "review-item--on" : ""}`}
                onClick={() => onSelect(selected === rec.ply ? null : rec.ply)}
              >
                <b>{COPY.plyMove(rec.ply)}</b>
                <span>{COPY.plyCol(rec.col)}</span>
                <em className={`grade grade--${rec.grade}`}>{COPY.grade(rec.grade)}</em>
              </button>
            ))}
          </div>

          {/* The headline quotes the turning point's own sentence, so selecting
              that move would otherwise print it twice, four lines apart. The
              paragraph stays in the layout either way — a window that changes
              height as you click down a list is a window that moves under you. */}
          <p className="review-detail">{detail === head?.body ? "" : detail}</p>

          {mine.length > shown.length && (
            <div className="row">
              <Btn onClick={() => setShowAll(true)}>{COPY.reviewShowAll(mine.length)}</Btn>
            </div>
          )}
        </>
      )}
    </Window>
  );
}
