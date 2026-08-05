/**
 * The game as a shape.
 *
 * A list of graded plies tells you which moves were bad. A curve tells you when
 * the game actually turned, which is usually somewhere the list is quiet — the
 * position drifting for eight plies before anything looks like a mistake.
 *
 * Two regions, drawn differently on purpose. Solid is the solver: proven, and
 * the y-value is discs-to-spare over the maximum. Hatched is the evaluator: a
 * hunch, and the y-value is a squashed positional score. They share an axis so
 * the line is continuous and readable, but they do not mean the same thing, and
 * the whole point of this feature is that the difference stays visible rather
 * than being smoothed into one confident stroke.
 *
 * Drawn as SVG rather than into the pixel buffer. The board scene is a fixed
 * low-resolution grid where fractional coordinates wreck the art; a chart is the
 * opposite — it wants the display resolution and smooth diagonals. Keeping it
 * out of the canvas is what lets both stay correct.
 */

import type { CurvePoint, Player } from "@fourscore/engine";

interface Props {
  curve: readonly CurvePoint[];
  /** Which colour the human played, so the curve reads from their side. */
  humanPlayer: Player;
  /** Ply to mark, if the review is pointing at one. */
  marked: number | null;
  onSelect: (ply: number) => void;
}

const W = 320;
const H = 96;
const PAD = 4;

export function EvalCurve({ curve, humanPlayer, marked, onSelect }: Props) {
  if (curve.length < 2) return null;

  const last = curve[curve.length - 1]!.ply || 1;
  // The engine reports advantage from red's side; flip it so up is always good
  // for the person reading the chart.
  const sign = humanPlayer === "red" ? 1 : -1;

  const x = (ply: number) => PAD + (ply / last) * (W - PAD * 2);
  const y = (adv: number) => H / 2 - adv * sign * (H / 2 - PAD);

  // Split into runs of like source, so each can be stroked in its own style.
  // A single path with a changing dash pattern would need the segments anyway,
  // and this keeps the join honest: the boundary is where proof ran out.
  const runs: { source: CurvePoint["source"]; points: CurvePoint[] }[] = [];
  for (const point of curve) {
    const tail = runs[runs.length - 1];
    if (tail && tail.source === point.source) tail.points.push(point);
    else {
      // Repeat the boundary point so consecutive runs visually connect.
      const bridge = tail ? [tail.points[tail.points.length - 1]!, point] : [point];
      runs.push({ source: point.source, points: bridge });
    }
  }

  const path = (points: CurvePoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ply).toFixed(1)},${y(p.advantage).toFixed(1)}`).join(" ");

  const marks = marked === null ? [] : curve.filter((p) => p.ply === marked + 1);

  return (
    <figure className="eval-curve">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="eval-curve__svg"
        role="img"
        aria-label="Advantage over the course of the game"
      >
        <rect x="0" y="0" width={W} height={H / 2} className="eval-curve__half eval-curve__half--you" />
        <rect x="0" y={H / 2} width={W} height={H / 2} className="eval-curve__half eval-curve__half--them" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="eval-curve__axis" />

        {runs.map((run, i) => (
          <path
            key={i}
            d={path(run.points)}
            className={`eval-curve__line eval-curve__line--${run.source}`}
          />
        ))}

        {marks.map((p) => (
          <line
            key={p.ply}
            x1={x(p.ply)}
            y1={PAD}
            x2={x(p.ply)}
            y2={H - PAD}
            className="eval-curve__marker"
          />
        ))}

        {/* Invisible hit targets, so a ply can be picked off the chart. */}
        {curve.slice(1).map((p) => (
          <rect
            key={p.ply}
            x={x(p.ply) - (W - PAD * 2) / last / 2}
            y={0}
            width={Math.max(3, (W - PAD * 2) / last)}
            height={H}
            className="eval-curve__hit"
            onClick={() => onSelect(p.ply - 1)}
          />
        ))}
      </svg>
      <figcaption className="eval-curve__key">
        <span className="eval-curve__swatch eval-curve__swatch--proven" /> proven
        <span className="eval-curve__swatch eval-curve__swatch--estimated" /> estimated
      </figcaption>
    </figure>
  );
}
