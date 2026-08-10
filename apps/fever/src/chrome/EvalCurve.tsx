/**
 * The game as a shape, in a sunken picture box.
 *
 * **One line.** The points behind it come from two places — the exact end of the
 * game, and the engine's read of everything before it — and the player is never
 * told which is which: no legend, no dashes, no badges (PLAN.md product truth
 * 1). The step where the line jumps into the top band is the game going
 * decisive, which it did. What the distinction actually governs is the copy next
 * to this chart, not the chart.
 *
 * SVG rather than the 3D stage, for the same reason the old client kept it out
 * of its pixel buffer: a chart wants display resolution and smooth diagonals,
 * which is the exact opposite of everything else this game draws. It is also the
 * one surface in the chrome that isn't beige — it's a period charting control,
 * white and ruled, sunk into the window.
 */

import type { CurvePoint, Player } from "@fourscore/engine";

const W = 320;
const H = 92;
const PAD = 5;

export function EvalCurve({
  curve,
  humanPlayer,
  marked,
  onSelect,
}: {
  curve: readonly CurvePoint[];
  /** Which colour the human played, so the curve reads from their side. */
  humanPlayer: Player;
  /** Ply the review is pointing at, if any. */
  marked: number | null;
  onSelect: (ply: number) => void;
}) {
  if (curve.length < 2) return null;

  const last = curve[curve.length - 1]!.ply || 1;
  // The engine reports advantage from red's side; flip it so up is always good
  // for the person reading the chart.
  const sign = humanPlayer === "red" ? 1 : -1;

  const x = (ply: number) => PAD + (ply / last) * (W - PAD * 2);
  const y = (adv: number) => H / 2 - adv * sign * (H / 2 - PAD);
  const path = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ply).toFixed(1)},${y(p.advantage).toFixed(1)}`)
    .join(" ");

  // Points are indexed by plies *played*, so the point after ply n is n + 1.
  const mark = marked === null ? null : curve.find((p) => p.ply === marked + 1);

  return (
    <figure className="curve">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="curve-svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="Your advantage over the course of the game"
      >
        <rect x="0" y="0" width={W} height={H / 2} className="curve-half curve-half--you" />
        <rect x="0" y={H / 2} width={W} height={H / 2} className="curve-half curve-half--them" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="curve-axis" />

        {mark && <line x1={x(mark.ply)} y1="0" x2={x(mark.ply)} y2={H} className="curve-mark" />}
        <path d={path} className="curve-line" />
        {mark && <circle cx={x(mark.ply)} cy={y(mark.advantage)} r="3" className="curve-dot" />}

        {/* Invisible hit targets, so a move can be picked off the chart. */}
        {curve.slice(1).map((p) => (
          <rect
            key={p.ply}
            x={x(p.ply) - (W - PAD * 2) / last / 2}
            y="0"
            width={Math.max(4, (W - PAD * 2) / last)}
            height={H}
            className="curve-hit"
            onClick={() => onSelect(p.ply - 1)}
          />
        ))}
      </svg>
    </figure>
  );
}
