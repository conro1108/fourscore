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
 */
export function gravityFall(
  elt: HTMLElement,
  y0: number,
  y1: number,
  done?: () => void,
  g = 1.15,
): void {
  let y = y0;
  let v = 0;
  elt.style.top = `${y}px`;
  function frame(): void {
    v += g;
    y += v;
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

/** Deep-link parameter, the harness pattern from the proposals. */
export const param = (name: string): string | null =>
  new URLSearchParams(location.search).get(name);
