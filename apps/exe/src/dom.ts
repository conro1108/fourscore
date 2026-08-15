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
 * A disc falls with real gravity, no easing curve: v += g each frame, one
 * cheap frame of overshoot on landing. Positions are local `top` pixels.
 *
 * `g` is px per 60Hz frame squared, and the step is scaled by the frame time
 * actually elapsed. Integrating per *frame* instead makes the drop twice as
 * fast on a 120Hz laptop as on the 60Hz monitor it's plugged into, which is
 * what "the drop got slow" means when nothing in the code changed. The step
 * is clamped so a backgrounded tab resumes falling rather than teleporting
 * through the board.
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
 * A pointer drag: down on `target`, then window-level moves until the pointer
 * lifts or the browser cancels it (a touch that turned into a scroll). One
 * path for mouse and finger — touch pointers are implicitly captured by the
 * pointerdown target, so moves keep arriving after the finger leaves it.
 * `begin` returns the move handler, or null to let the event go.
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

/** Deep-link parameter, the harness pattern from the proposals. */
export const param = (name: string): string | null =>
  new URLSearchParams(location.search).get(name);
