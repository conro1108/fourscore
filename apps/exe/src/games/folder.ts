/**
 * The games folder — a real folder window, because a desktop that suddenly
 * grew five games needs somewhere period to keep them. Double-click
 * launches; drag an icon out onto the desk and it lives there now (the
 * folder keeps its copy — this machine has never deleted anything). The
 * status bar counts objects the way Explorer counted them: proudly.
 */

import { el } from "../dom.js";
import { ICONS, iconCanvas } from "../icons.js";
import { TITLES } from "../copy.js";
import { stageScale, type WM } from "../wm.js";
import { GAME_ICON_MINE } from "./mines.js";
import { SOL_ICON } from "./sol.js";
import { SNAKE_ICON } from "./snake.js";
import { CHECKERS_ICON } from "./checkers.js";
import { CHESS_ICON } from "./chess.js";

export type GameId = "mines" | "sol" | "snake" | "checkers" | "chess";

export type GameLaunchers = Record<GameId, () => void>;

export const GAME_ITEMS: readonly { id: GameId; rows: readonly string[]; label: string }[] = [
  { id: "mines", rows: GAME_ICON_MINE, label: TITLES.mines },
  { id: "sol", rows: SOL_ICON, label: TITLES.sol },
  { id: "snake", rows: SNAKE_ICON, label: TITLES.snake },
  { id: "checkers", rows: CHECKERS_ICON, label: TITLES.checkers },
  { id: "chess", rows: CHESS_ICON, label: TITLES.chess },
];

export function openGamesFolder(
  wm: WM,
  launch: GameLaunchers,
  onDragOut: (id: GameId, x: number, y: number) => void,
): void {
  const existing = wm.get("games");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  const body = el(`<div></div>`);
  const pane = el(`<div class="sunken folderpane"></div>`);
  const ics: HTMLElement[] = [];
  for (const item of GAME_ITEMS) {
    const ic = el(`<div class="fic"></div>`);
    ic.appendChild(iconCanvas(item.rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = item.label;
    ic.appendChild(lbl);
    ic.addEventListener("click", () => {
      ics.forEach((x) => x.classList.remove("sel"));
      ic.classList.add("sel");
    });
    ic.addEventListener("dblclick", () => launch[item.id]());

    // drag out of the folder: past a few pixels a ghost rides the cursor,
    // and dropping it off the folder's own window plants it on the desk
    ic.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let ghost: HTMLElement | null = null;
      const move = (ev: MouseEvent): void => {
        if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!ghost) {
          ghost = el(`<div class="icon dragghost"></div>`);
          ghost.appendChild(iconCanvas(item.rows, 32));
          const gl = el(`<span class="lbl"></span>`);
          gl.textContent = item.label;
          ghost.appendChild(gl);
          wm.stage.appendChild(ghost);
        }
        const k = stageScale();
        const r = wm.stage.getBoundingClientRect();
        ghost.style.left = `${(ev.clientX - r.left) / k - 24}px`;
        ghost.style.top = `${(ev.clientY - r.top) / k - 20}px`;
      };
      const up = (ev: MouseEvent): void => {
        removeEventListener("mousemove", move);
        removeEventListener("mouseup", up);
        if (!ghost) return;
        ghost.remove();
        const winR = win.el.getBoundingClientRect();
        const inFolder =
          ev.clientX >= winR.left && ev.clientX <= winR.right &&
          ev.clientY >= winR.top && ev.clientY <= winR.bottom;
        if (inFolder) return; // put back; the folder does not rearrange
        const k = stageScale();
        const r = wm.stage.getBoundingClientRect();
        onDragOut(item.id, (ev.clientX - r.left) / k - 24, (ev.clientY - r.top) / k - 20);
      };
      addEventListener("mousemove", move);
      addEventListener("mouseup", up);
    });

    pane.appendChild(ic);
    ics.push(ic);
  }
  const status = el(`<div class="statusbar"><div>${GAME_ITEMS.length} object(s)</div></div>`);
  body.append(pane, status);
  const win = wm.open({
    id: "games",
    title: TITLES.games,
    icon: ICONS.folder,
    x: 330,
    y: 470,
    w: 420,
    body,
    buttons: ["min", "close"],
  });
}
