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

import { useEffect } from "react";
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
  /**
   * Every move you made, in order. Not a shortlist of the bad ones.
   *
   * The first version showed only the notable moves behind a "show all", which
   * made the list a verdict and the game something you had to unfold. Worse, it
   * fought the keys: arrowing onto an ordinary move highlighted a row that
   * wasn't there. So the list is the whole game and the *grading* is what stands
   * out — an unremarkable move is a quiet grey line you walk straight past, and
   * the ones that cost you something are the only colour in the box.
   */
  const mine = review ? review.plies.filter((p) => p.player === humanPlayer) : [];
  const record = selected === null ? null : (mine.find((p) => p.ply === selected) ?? null);

  const head = review && status === "ready" ? COPY.reviewHeadline(review, lost) : null;
  const detail = record ? COPY.plyLine(record) : COPY.reviewPick;

  /**
   * Step to the next or previous move of yours.
   *
   * Through `mine` rather than through every ply, because that is what the rest
   * of the window counts in: the list, the headline and the word "move" all mean
   * one of yours. It clamps at both ends rather than wrapping — walking off the
   * end of a game and landing back at the opening is the review losing your
   * place, and the board jumping twenty discs to say so.
   *
   * A step from nothing selected enters at the end the key points at.
   */
  const step = (dir: 1 | -1) => {
    if (mine.length === 0) return;
    if (selected === null) return onSelect((dir === 1 ? mine[0]! : mine[mine.length - 1]!).ply);
    const next =
      dir === 1
        ? mine.find((p) => p.ply > selected)
        : [...mine].reverse().find((p) => p.ply < selected);
    if (next) onSelect(next.ply);
  };

  // Window-level, because the thing being scrubbed is the board and there is
  // nothing sensible to focus first. Only while a review is actually on screen:
  // this component unmounts with the window, so the listener goes with it.
  useEffect(() => {
    if (status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Not while somebody is typing — the lobby's join field is the only text
      // input in the game, but a review that eats arrow keys globally is the
      // kind of thing that only shows up later.
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // No dependency list on purpose: the handler closes over the current
    // selection, and rebinding one listener per render is cheaper and clearer
    // than keeping it in a ref.
  });

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
            {mine.map((rec) => (
              <button
                key={rec.ply}
                type="button"
                className={[
                  "review-item",
                  // Quiet unless it cost something. The turning point is the one
                  // row allowed to shout, and only because it is proven.
                  rec.grade === "best" || rec.grade === "good" ? "review-item--quiet" : "",
                  rec.turningPoint ? "review-item--turn" : "",
                  selected === rec.ply ? "review-item--on" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                // Keep the selected row visible: arrow keys walk past the bottom
                // of a scrolling list box, and a highlight you can't see reads
                // as the keys doing nothing. `nearest` so it never scrolls the
                // page behind the window.
                ref={(el) => {
                  if (el && selected === rec.ply) el.scrollIntoView({ block: "nearest" });
                }}
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

          {/* The same walk the arrow keys do, as buttons — a phone has no arrow
              keys, and stepping by tapping rows in a 120px scroll box is not
              stepping. The hint stays for the machines the keys work on and is
              hidden on the ones they don't (see the stylesheet). */}
          {mine.length > 1 && (
            <div className="review-step">
              <Btn onClick={() => step(-1)} disabled={selected === mine[0]!.ply}>
                {COPY.reviewPrev}
              </Btn>
              <Btn onClick={() => step(1)} disabled={selected === mine[mine.length - 1]!.ply}>
                {COPY.reviewNext}
              </Btn>
              <p className="review-keys">{COPY.reviewKeys}</p>
            </div>
          )}
        </>
      )}
    </Window>
  );
}
