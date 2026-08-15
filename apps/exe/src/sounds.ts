/**
 * sounds.ctl and the tray speaker — where the scheme is a thing you can open.
 *
 * The second law (DIRECTION.md): nothing is dead. A desktop that makes noises
 * has to have the Control Panel that admits it, and every control in here does
 * what it says — the list is the real library, Play renders and plays the real
 * recipe, the schemes really change how the machine sounds, and the tray
 * speaker is the tray speaker.
 *
 * The one thing that is *not* dead but is deliberately grayed: Play, when the
 * scheme is No Sounds or the machine is muted. A grayed control is period
 * software saying why it can't, which is the opposite of a control that
 * silently doesn't — and `Forfeit` in BOARD.EXE already does exactly this.
 */

import { el, onPointerDrag, q } from "./dom.js";
import { ICONS, iconCanvas } from "./icons.js";
import { SOUND_EVENTS, SOUNDS, TITLES } from "./copy.js";
import { audible, audioSettings, onAudioChange, play, setAudio, type Scheme } from "./audio/index.js";
import type { WM } from "./wm.js";

const SCHEME_ORDER: readonly Scheme[] = ["board95", "possessed", "none"];

export function openSounds(wm: WM): void {
  const existing = wm.get("sounds");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  const body = el(`<div style="padding:8px 10px 10px"></div>`);

  /* ---- the event list ---- */
  body.appendChild(el(`<div style="margin-bottom:3px">${SOUNDS.events}</div>`));
  const list = el(`<div class="listbox" id="soundList"></div>`);
  let selected = 0;
  const rows: HTMLElement[] = [];
  SOUND_EVENTS.forEach((event, i) => {
    const row = el(`<div class="lrow"></div>`);
    row.textContent = event.label;
    row.addEventListener("click", () => select(i));
    row.addEventListener("dblclick", () => preview());
    list.appendChild(row);
    rows.push(row);
  });
  body.appendChild(list);

  const playBtn = el(`<div class="btn" style="min-width:64px">▶ ${SOUNDS.play}</div>`);
  const playRow = el(`<div style="display:flex;justify-content:flex-end;margin:5px 0 8px"></div>`);
  playRow.appendChild(playBtn);
  body.appendChild(playRow);
  playBtn.addEventListener("click", () => preview());

  /* ---- the schemes ---- */
  body.appendChild(el(`<div style="margin-bottom:3px">${SOUNDS.scheme}</div>`));
  // three rows and no more, so it gets the box without the scroll gutter
  const schemeBox = el(`<div class="listbox" style="height:auto;overflow:hidden;margin-bottom:8px"></div>`);
  const schemeRows = new Map<Scheme, HTMLElement>();
  for (const id of SCHEME_ORDER) {
    const row = el(`<div class="lrow"></div>`);
    row.textContent = SOUNDS.schemes[id];
    row.addEventListener("click", () => {
      play("click", 0.5);
      setAudio({ scheme: id });
    });
    schemeBox.appendChild(row);
    schemeRows.set(id, row);
  }
  body.appendChild(schemeBox);

  /* ---- volume and mute ---- */
  const volRow = el(`<div style="display:flex;align-items:center;gap:8px"></div>`);
  volRow.appendChild(el(`<div style="flex:none">${SOUNDS.volume}</div>`));
  const track = el(`<div class="trackbar" style="flex:1;margin:0"><div class="rail"></div><div class="thumb"></div></div>`);
  volRow.appendChild(track);
  body.appendChild(volRow);
  dragTrack(track, (v) => setAudio({ volume: v }));

  const muteRow = el(`<label class="cbrow"><span class="cbox"></span><span></span></label>`);
  (muteRow.children[1] as HTMLElement).textContent = SOUNDS.mute;
  muteRow.addEventListener("click", () => toggleMute());
  body.appendChild(muteRow);

  const note = el(`<div style="color:#404040;margin:8px 0 4px;min-height:15px"></div>`);
  body.appendChild(note);

  const okRow = el(`<div style="display:flex;justify-content:flex-end"></div>`);
  const ok = el(`<div class="btn def">OK</div>`);
  okRow.appendChild(ok);
  body.appendChild(okRow);

  const win = wm.open({
    id: "sounds",
    title: TITLES.sounds,
    x: 300,
    y: 150,
    w: 292,
    body,
    buttons: ["close"],
    onClose: () => stopWatching(),
  });
  ok.addEventListener("click", () => win.close());

  function select(i: number, quiet = false): void {
    selected = i;
    rows.forEach((r, n) => r.classList.toggle("sel", n === i));
    if (!quiet) play("click", 0.4);
  }

  /** Play the selected event's own sound, at the level the panel is set to. */
  function preview(): void {
    if (!audible()) return;
    play(SOUND_EVENTS[selected]!.sound);
  }

  function render(): void {
    const s = audioSettings();
    for (const [id, row] of schemeRows) row.classList.toggle("sel", id === s.scheme);
    q<HTMLElement>(".thumb", track).style.left = `${s.volume * 100}%`;
    q<HTMLElement>(".cbox", muteRow).classList.toggle("on", s.muted);
    playBtn.classList.toggle("gray", !audible());
    note.textContent =
      s.scheme === "none"
        ? SOUNDS.note.none
        : s.muted
          ? SOUNDS.note.muted
          : s.scheme === "possessed"
            ? SOUNDS.note.possessed
            : SOUNDS.note.ok;
  }
  const stopWatching = onAudioChange(render);
  select(0, true);
  render();
}

/**
 * The switch, wherever it is. The click fires before the fade so it is heard on
 * the way out — a mute that silences its own confirmation reads as a control
 * that didn't take.
 */
function toggleMute(): void {
  play("click", 0.5);
  setAudio({ muted: !audioSettings().muted });
}

/**
 * The tray: a real speaker next to the clock. One click is the volume slider,
 * two is the Control Panel — which is what the icon did, and is also the only
 * way to reach the scheme without going through Start.
 */
export function installTray(taskbar: HTMLElement, before: HTMLElement, openPanel: () => void): void {
  const tray = el(`<div id="tray" title="${SOUNDS.tray.on}"></div>`);
  const on = iconCanvas(ICONS.speaker, 16);
  const off = iconCanvas(ICONS.speakerOff, 16);
  off.style.display = "none";
  tray.append(on, off);
  taskbar.insertBefore(tray, before);

  const pop = el(`<div id="volpop" class="bevel">
      <div class="cap">${SOUNDS.tray.on}</div>
      <div class="trackbar vert"><div class="rail"></div><div class="thumb"></div></div>
      <label class="cbrow"><span class="cbox"></span><span>Mute</span></label>
    </div>`);
  taskbar.parentElement!.appendChild(pop);
  const track = q<HTMLElement>(".trackbar", pop);
  dragTrack(track, (v) => setAudio({ volume: v }), "vertical");

  q(".cbrow", pop).addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMute();
  });

  const close = (): void => {
    pop.style.display = "none";
  };
  addEventListener("click", close);
  pop.addEventListener("click", (e) => e.stopPropagation());

  // A double-click is two clicks, so the popup opens and then has to get out of
  // the way again — checked by the timestamp rather than by a `dblclick`
  // handler, which fires *after* the second `click` has already toggled it.
  let lastClick = 0;
  tray.addEventListener("click", (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastClick < 400) {
      lastClick = 0;
      close();
      openPanel();
      return;
    }
    lastClick = now;
    const opening = pop.style.display !== "block";
    pop.style.display = opening ? "block" : "none";
    if (opening) {
      // above the tray, aligned to its right edge — the desk may be any width
      pop.style.right = `${taskbar.offsetWidth - tray.offsetLeft - tray.offsetWidth}px`;
      play("click", 0.5);
    }
  });

  function render(): void {
    const s = audioSettings();
    const quiet = s.muted || s.scheme === "none";
    on.style.display = quiet ? "none" : "block";
    off.style.display = quiet ? "block" : "none";
    tray.title = quiet ? SOUNDS.tray.off : SOUNDS.tray.on;
    q<HTMLElement>(".thumb", track).style.bottom = `${s.volume * 100}%`;
    q<HTMLElement>(".cbox", pop).classList.toggle("on", s.muted);
  }
  onAudioChange(render);
  render();
}

/**
 * Drag a period trackbar and report 0..1. Ratios rather than pixels, so the
 * stage's scale cancels out — the desk is a CSS transform and `clientX` is not
 * in desk units.
 */
function dragTrack(track: HTMLElement, set: (v: number) => void, axis: "horizontal" | "vertical" = "horizontal"): void {
  const from = (e: PointerEvent): void => {
    const r = track.getBoundingClientRect();
    const v = axis === "horizontal" ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
    set(Math.max(0, Math.min(1, v)));
  };
  // listeners for the length of the drag only — sounds.ctl can be opened and
  // closed all evening, and the desktop's icons drag the same way
  onPointerDrag(track, (e) => {
    e.preventDefault();
    e.stopPropagation();
    from(e);
    return from;
  });
}
