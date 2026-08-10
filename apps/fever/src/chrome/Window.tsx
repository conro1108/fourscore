/**
 * The window. Every piece of chrome in the game is one of these.
 *
 * Pillar 3 is "real period software left running too long", and the thing that
 * makes software read as *real* rather than as a retro texture is that its
 * furniture behaves: the title bar drags, the close box closes, the buttons go
 * down when you press them. So this is a working window rather than a picture
 * of one, and the possession is in what it says, not in whether it works.
 *
 * Dragging is deliberately unclamped in one direction only — you can shove a
 * window half off the edge, like you could then, but never so far that its
 * title bar leaves the screen, because that was always a bug and not a period
 * detail.
 */

import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { playSpike } from "../audio/index.js";

export interface WindowProps {
  title: string;
  children: ReactNode;
  /** Rendered in the button strip along the bottom. */
  buttons?: ReactNode;
  /** Omit to lose the close box — a dialog you have to answer. */
  onClose?: () => void;
  /** Extra class for per-window sizing. */
  className?: string;
  /** ARIA label; defaults to the title, which is usually lying. */
  label?: string;
}

export function Window({ title, children, buttons, onClose, className, label }: WindowProps) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Not the close box, and not a second finger arriving mid-drag.
      if (!e.isPrimary || (e.target as HTMLElement).closest("button")) return;
      drag.current = { x: e.clientX, y: e.clientY, from: offset ?? { x: 0, y: 0 } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Whole pixels. A window at x = 41.6 is a window with a soft edge, and the
    // bevel is one pixel wide.
    const x = Math.round(d.from.x + (e.clientX - d.x));
    const y = Math.round(d.from.y + (e.clientY - d.y));
    // The title bar stays reachable: it's what you grab to put the window back.
    const maxY = Math.max(0, window.innerHeight / 2 - 40);
    setOffset({ x, y: Math.min(maxY, y) });
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <div
      className={`win ${className ?? ""}`}
      role="dialog"
      aria-label={label ?? title}
      /* The drag is two custom properties, not a transform, because where a
         window *sits* is the stylesheet's business — the review docks to the
         right rather than centring — and writing a whole transform here would
         yank it back to the middle the first time you took hold of it. */
      style={
        offset ? ({ "--dx": `${offset.x}px`, "--dy": `${offset.y}px` } as CSSProperties) : undefined
      }
    >
      <div
        className="win-title"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="win-title-text">{title}</span>
        {onClose && (
          <button
            type="button"
            className="win-x"
            aria-label="Close"
            onClick={() => {
              playSpike("dialog-close", 0.8);
              onClose();
            }}
          >
            ×
          </button>
        )}
      </div>
      <div className="win-body">{children}</div>
      {buttons && <div className="win-buttons">{buttons}</div>}
    </div>
  );
}

/**
 * The one button in the game. There is no second style: a beige tile on the
 * void is the same object as a beige tile in a dialog, which is what makes the
 * chrome read as one piece of software rather than as a theme.
 */
export function Btn({
  children,
  onClick,
  on = false,
  disabled = false,
  wide = false,
  quiet = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Latched — a toggle showing its state, not a button showing a press. */
  on?: boolean;
  disabled?: boolean;
  wide?: boolean;
  /** Skip the click sound: for controls that make their own noise. */
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn ${on ? "btn--on" : ""} ${wide ? "btn--wide" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!quiet) playSpike("ui-click");
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}
