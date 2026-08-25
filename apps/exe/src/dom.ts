/** The two DOM helpers the whole desktop is built out of. */

export function q<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`missing element: ${sel}`);
  return found;
}

/** Build one element from an HTML string. */
export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

/**
 * Gravity drop, no easing; one frame of overshoot on landing. Positions are
 * local `top` px. `g` is px per 60Hz-frame², scaled by elapsed time (per-frame
 * integration runs 2x fast at 120Hz); step clamped so a backgrounded tab
 * resumes rather than teleports.
 */
export function gravityFall(
  elt: HTMLElement,
  y0: number,
  y1: number,
  done?: () => void,
  g = 2.4,
): void {
  const FRAME = 1000 / 60;
  let y = y0;
  let v = 0;
  let last: number | null = null;
  elt.style.top = `${y}px`;
  function frame(now: number): void {
    const step = last === null ? 1 : Math.min((now - last) / FRAME, 3);
    last = now;
    v += g * step;
    y += v * step;
    if (y >= y1) {
      elt.style.top = `${y1 + 4}px`;
      requestAnimationFrame(() => {
        elt.style.top = `${y1}px`;
        done?.();
      });
      return;
    }
    elt.style.top = `${y}px`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Pointer drag: down on `target`, window-level moves until up/cancel (cancel =
 * touch became a scroll). Touch pointers are implicitly captured by the
 * pointerdown target. `begin` returns the move handler, or null to ignore.
 */
export function onPointerDrag(
  target: HTMLElement,
  begin: (e: PointerEvent) => ((e: PointerEvent) => void) | null,
  end?: (e: PointerEvent, cancelled: boolean) => void,
): void {
  target.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const move = begin(e);
    if (!move) return;
    const id = e.pointerId;
    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId === id) move(ev);
    };
    const finish = (ev: PointerEvent): void => {
      if (ev.pointerId !== id) return;
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", finish);
      removeEventListener("pointercancel", finish);
      end?.(ev, ev.type === "pointercancel");
    };
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", finish);
    addEventListener("pointercancel", finish);
  });
}

/** Deep-link query parameter. */
export const param = (name: string): string | null =>
  new URLSearchParams(location.search).get(name);
