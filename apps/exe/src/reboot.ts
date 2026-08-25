/**
 * Shut Down box and the restart behind it (also Ctrl+Alt+Del, wired in main.ts).
 * A restart is a real page load: it clears all runtime state and never touches
 * localStorage — the disk and settings survive — except the "forget everything"
 * option, which wipes every `exe.*` key at the navigation itself.
 * `replace()` not `reload()`, so a restart out of `?state=win` lands on a desktop.
 */

import { el } from "./dom.js";
import { play } from "./audio/index.js";
import { REBOOT, SHUTDOWN, DIALOG } from "./copy.js";
import type { WM, Win } from "./wm.js";

/** Where a restart lands: this page, with every deep-link param stripped. */
export const cleanUrl = (href: string): string => new URL(href).pathname;

/* ---- the beat, as data; short by law ---- */
/** When the POST replaces the shutdown line. */
export const POST_AT = 700;
/** Between POST lines. Stepped, never eased. */
export const LINE_GAP = 180;
/** When the machine actually goes. */
export const GO_AT = 1700;
/** If the navigation is refused, the desk comes back this long after. */
const FAILSAFE = 4000;

export interface RestartOpts {
  /** Draw the beat and stop: the `?state=reboot` pose for harnesses. Never set in play. */
  hold?: boolean;
  /** Wipe every `exe.*` localStorage key before the load. */
  forget?: boolean;
}

/**
 * Black screen, POST, then a real page load. Can't get stuck: any key/click
 * skips to the load, the load is scheduled up front, and a refused navigation
 * removes the overlay after FAILSAFE.
 */
export function restart(stage: HTMLElement, opts: RestartOpts = {}): void {
  // On the stage so it scales; z 500 sits above #saver 240, #startmenu 300, FEVER.CTL 400.
  const screen = el(
    `<div id="reboot" style="position:absolute;inset:0;z-index:500;background:#000;` +
      `color:#c0c0c0;font:14px 'Courier New',monospace;line-height:1.45;padding:14px 16px;` +
      `white-space:pre;overflow:hidden"></div>`,
  );
  const line = (text: string): void => {
    const d = el(`<div></div>`);
    d.textContent = text;
    screen.appendChild(d);
  };
  line(REBOOT.wait);
  stage.appendChild(screen);
  // No boot chime here: after the load, `startup` plays at first touch (audio law).
  play("shutdown-chime", 0.7);

  const timers: number[] = [];
  const at = (ms: number, fn: () => void): void => {
    timers.push(setTimeout(fn, ms) as unknown as number);
  };

  at(POST_AT, () => {
    screen.textContent = "";
    REBOOT.post.forEach((text, i) =>
      at(i * LINE_GAP, () => {
        line(text);
        if (text.includes("IDE")) play("drive-seek", 0.5);
      }),
    );
  });

  let gone = false;
  const go = (): void => {
    if (gone) return;
    gone = true;
    timers.forEach(clearTimeout);
    removeEventListener("pointerdown", go, true);
    removeEventListener("keydown", go, true);
    if (opts.hold) return;
    if (opts.forget)
      for (const k of Object.keys(localStorage))
        if (k.startsWith("exe.")) localStorage.removeItem(k);
    // armed before the navigation: a throwing `replace()` must not leave a black screen
    setTimeout(() => screen.remove(), FAILSAFE);
    const url = cleanUrl(location.href);
    if (location.search || location.hash) location.replace(url);
    else location.reload();
  };
  at(GO_AT, go);
  // skip listeners armed late so the Yes click's own pointer doesn't trigger them
  if (!opts.hold)
    at(300, () => {
      addEventListener("pointerdown", go, true);
      addEventListener("keydown", go, true);
    });
}

/* ---- Start ▸ Shut Down ---- */

/** One at a time. */
let chooser: Win | undefined;

/** Shut Down box: radio options, Yes / No / Help. Shutdown is refused, restart is real. */
export function openShutdown(wm: WM, deps: { stage: HTMLElement; help(): void }): void {
  if (chooser?.isOpen()) {
    chooser.focus();
    return;
  }
  let choice = 0;
  const rows = SHUTDOWN.options
    .map(
      (label, i) =>
        `<label class="cbrow" data-opt="${i}"><span class="rad" style="width:12px;height:12px;` +
        `flex:none;border-radius:50%;background:#fff;position:relative;box-shadow:inset 1px 1px #0a0a0a,` +
        `inset -1px -1px #fff,inset 2px 2px #808080,inset -2px -2px #dfdfdf"><i style="position:absolute;` +
        `left:4px;top:4px;width:4px;height:4px;background:#000;border-radius:50%"></i></span>` +
        `<span>${label}</span></label>`,
    )
    .join("");
  const win = wm.dialog({
    title: SHUTDOWN.title,
    body: `${SHUTDOWN.prompt}<div style="margin:8px 0 2px 4px">${rows}</div>`,
    buttons: [SHUTDOWN.yes, SHUTDOWN.no, SHUTDOWN.help],
    x: 450,
    y: 300,
    ax: "center",
    w: 356,
    onButton(i) {
      if (i === 2) {
        deps.help();
        return;
      }
      if (i !== 0) return; // No
      if (choice === 1) restart(deps.stage);
      else if (choice === 2) restart(deps.stage, { forget: true });
      else
        wm.dialog({
          title: DIALOG.shutdown.title,
          body: DIALOG.shutdown.body,
          icon: "!",
          buttons: ["OK", "OK"],
          x: 450,
          y: 310,
          ax: "center",
          w: 360,
          sound: "shutdown-chime",
        });
    },
  });
  chooser = win;
  const dots = [...win.body.querySelectorAll<HTMLElement>("[data-opt] i")];
  const draw = (): void =>
    dots.forEach((d, i) => (d.style.display = i === choice ? "block" : "none"));
  win.body.querySelectorAll<HTMLElement>("[data-opt]").forEach((row, i) =>
    row.addEventListener("click", () => {
      choice = i;
      draw();
    }),
  );
  draw();
}
