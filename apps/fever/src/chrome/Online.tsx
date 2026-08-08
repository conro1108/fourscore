/**
 * Playing a person: the connection dialog, and the one after it.
 *
 * Two states in one window, because they are one thought — host and wait, or
 * join. Period software would have shipped exactly this: a groove around each
 * half, a four-character field with a fat sunken border, and a code rendered
 * big enough to read off a phone across a room.
 *
 * Pure props, like every other file in this directory except the container.
 */

import { useState } from "react";
import { CONNECT4, CONNECT5, type Variant } from "@fourscore/engine";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

export interface OnlineProps {
  variant: Variant;
  /** Null until anonymous sign-in lands; the buttons wait for it. */
  me: string | null;
  /** The code to read out, once you're hosting. Null while choosing. */
  code: string | null;
  /** A request is out. */
  busy: boolean;
  error: string | null;
  onVariant: (v: Variant) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onCopyLink: () => void;
  /** True for a moment after the link goes on the clipboard. */
  copied: boolean;
  onClose: () => void;
}

export function Online({
  variant,
  me,
  code,
  busy,
  error,
  onVariant,
  onHost,
  onJoin,
  onCopyLink,
  copied,
  onClose,
}: OnlineProps) {
  const [typed, setTyped] = useState("");
  const ready = me !== null && !busy;

  if (code) {
    return (
      <Window
        title={COPY.waitingTitle}
        label="waiting for an opponent"
        className="win--online"
        onClose={onClose}
        buttons={
          <>
            <Btn onClick={onClose}>{COPY.cancel}</Btn>
            <Btn onClick={onCopyLink}>{copied ? COPY.copied : COPY.copyLink}</Btn>
          </>
        }
      >
        <p>{COPY.waitingBody}</p>
        <div className="join-code">{code}</div>
        <p className="online-note">
          {variant.name} · {COPY.you}
        </p>
      </Window>
    );
  }

  return (
    <Window
      title={COPY.onlineTitle}
      label="play a person"
      className="win--online"
      onClose={onClose}
      buttons={<Btn onClick={onClose}>{COPY.back}</Btn>}
    >
      <p>{COPY.onlineBody}</p>

      <div className="groove">
        <div className="groove-label">{COPY.onlineHost}</div>
        <div className="row">
          {[CONNECT4, CONNECT5].map((v) => (
            <Btn key={v.id} on={variant.id === v.id} onClick={() => onVariant(v)}>
              {COPY.variant(v.id)}
            </Btn>
          ))}
          <div className="spacer" />
          <Btn disabled={!ready} onClick={onHost}>
            {me ? COPY.onlineHost : COPY.connecting}
          </Btn>
        </div>
      </div>

      <div className="groove">
        <div className="groove-label">{COPY.onlineJoin}</div>
        <div className="row">
          <span className="row-label">{COPY.onlineCode}</span>
          <input
            className="field"
            value={typed}
            maxLength={4}
            aria-label={COPY.onlineCode}
            onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed && ready) onJoin(typed);
            }}
          />
          <div className="spacer" />
          <Btn disabled={!ready || typed.length < 4} onClick={() => onJoin(typed)}>
            {COPY.onlineJoin}
          </Btn>
        </div>
      </div>

      {/* The lobby's failures are lobby-sized: a line under the field, not a
          window on top of a window. The match's failures get the dialog. */}
      {error && <p className="online-error">{error}</p>}
    </Window>
  );
}
