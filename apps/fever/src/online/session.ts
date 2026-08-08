/**
 * Online play, minus the network.
 *
 * Everything here is pure and unit tested, and it is deliberately most of the
 * feature: seats, codes, the invite link, and — the part worth the file — what
 * to do with a move that arrived over the wire. `runtime.ts` holds the socket,
 * the inserts and the stores, and is as thin as that leaves it.
 *
 * The one rule the rest of the app inherits: the move list is the whole of
 * game truth, here exactly as it is against a bot. Nothing in this directory
 * ever sees a packed board (`board.ts` stays the only thing that knows the
 * packing) and nothing sends one.
 */

import { ROSTER, type Player } from "@fourscore/engine";

export interface MatchRow {
  id: string;
  join_code: string | null;
  variant: string;
  host: string;
  guest: string | null;
  host_seat: number;
  status: "waiting" | "active" | "finished" | "abandoned";
  winner: string | null;
}

/** Where the lobby is in its short life. The match itself is the match store's. */
export type OnlinePhase = "signed-out" | "idle" | "waiting" | "playing" | "over";

/** No I/L/O/0/1 — the code gets read aloud across a room. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeCode(random: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)])
    .join("");
}

/** Which seat you're in. Seat 1 moves first, and moves first as red. */
export function seatOf(row: MatchRow, me: string): 1 | 2 | null {
  if (row.host === me) return row.host_seat === 1 ? 1 : 2;
  if (row.guest === me) return row.host_seat === 1 ? 2 : 1;
  return null;
}

/**
 * Red always moves first — an engine invariant — so a seat is a colour and the
 * match store's existing `humanFirst` says everything online needs it to.
 */
export const playerOfSeat = (seat: 1 | 2): Player => (seat === 1 ? "red" : "yellow");

/** The other one of the two. Null until somebody joins. */
export function opponentOf(row: MatchRow, me: string): string | null {
  if (row.host === me) return row.guest;
  if (row.guest === me) return row.host;
  return null;
}

/**
 * A stable creature for a person, so your opponent looks the same all match —
 * their void variation, their signature clip, the lot. Ported from the old
 * client, where it existed for the same reason: a bare grid isn't an opponent.
 *
 * The Oracle is excluded because it is outside the ladder and its whole
 * character is that it isn't a person.
 */
export function creatureFor(id: string | null): string {
  const cast = ROSTER.filter((b) => !b.perfect);
  let h = 0;
  for (const ch of id ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return cast[h % cast.length]!.id;
}

/**
 * What to do with an INSERT that just arrived on the channel.
 *
 * The fast path is the next ply in sequence, which is every move of a healthy
 * game. Anything ahead of us means we missed one — realtime is not a guaranteed
 * log — so the repair is to ask the database rather than to guess. Anything
 * behind us we already have: it's the echo of our own optimistic insert.
 */
export function wireAction(localLength: number, ply: number): "append" | "refetch" | "ignore" {
  if (ply === localLength) return "append";
  if (ply > localLength) return "refetch";
  return "ignore";
}

/**
 * How to fold an authoritative move list from the database into the one on
 * screen.
 *
 * `extend` is the ordinary case and the important one: the new moves are
 * appended and the scene drops them one at a time, so a move from the wire
 * lands exactly like one you made. `replace` only happens when the two lists
 * genuinely disagree, and it snaps — a board that re-animates itself from empty
 * to repair a lost packet looks like a bug pretending to be theater.
 */
export function foldMoves(
  local: readonly number[],
  authoritative: readonly number[],
): { kind: "same" } | { kind: "extend"; moves: number[] } | { kind: "replace"; moves: number[] } {
  const prefix = authoritative.length >= local.length && local.every((c, i) => authoritative[i] === c);
  if (prefix && authoritative.length === local.length) return { kind: "same" };
  if (prefix) return { kind: "extend", moves: [...authoritative] };
  return { kind: "replace", moves: [...authoritative] };
}

/** The lobby's phase, from the row and whether the board has finished. */
export function phaseOf(
  me: string | null,
  row: MatchRow | null,
  finished: boolean,
): OnlinePhase {
  if (!me) return "signed-out";
  if (!row) return "idle";
  if (row.status === "waiting") return "waiting";
  if (finished || row.status === "finished" || row.status === "abandoned") return "over";
  return "playing";
}

/** The link you send someone. Opening it joins; see `pendingJoin`. */
export const joinLink = (origin: string, path: string, code: string): string =>
  `${origin}${path}?join=${code}`;

/** A code in the URL, if this page was opened from an invite. */
export function pendingJoin(search: string): string | null {
  const code = new URLSearchParams(search).get("join");
  return code ? code.trim().toUpperCase().slice(0, 4) : null;
}

/**
 * What broke, in a sentence a person can act on.
 *
 * The one online failure with a real cause the player can fix gets a real
 * sentence; everything else passes the database's own words through rather than
 * inventing a friendlier lie (product truth 4 — the styling is possessed, the
 * facts are not).
 */
export function failureText(e: unknown): string {
  const raw =
    e && typeof e === "object" && "message" in e
      ? String((e as { message: string }).message)
      : String(e);
  if (raw.includes("no open match")) return "No game is waiting on that code.";
  return raw;
}
