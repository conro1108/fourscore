/**
 * The wire. Everything impure about online play is in this file.
 *
 * A fifth non-React loop, for the same reason as the other four: playing a
 * person is game flow, not rendering, and an effect that owns a realtime
 * channel is an effect that reconnects every time something above it
 * re-renders. `session.ts` holds the decisions; this holds the socket.
 *
 * The shape of it:
 *
 * - **The move list is the state.** Rows in `fourscore.moves` are column
 *   indices, folded into the match store, which is the same store a bot game
 *   fills. Nothing here builds a board and nothing here ships a packed one.
 * - **Play is optimistic.** Your disc drops on the click and the insert goes
 *   out beside it. If the insert is rejected — which essentially only happens
 *   when the two clients disagree about whose turn it is — the database wins
 *   and we refetch.
 * - **Nobody validates legality.** Fourscore is client-authoritative on purpose
 *   (see the repo CLAUDE.md): the database enforces turn order and contiguity,
 *   and an impossible move from the other side surfaces *here*, as a position
 *   that won't accept it. Which is why the last thing this file does is say so
 *   plainly instead of rendering nonsense.
 */

import { variantById } from "@fourscore/engine";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { shellError, useShellStore } from "../chrome/store.js";
import { COPY } from "../chrome/copy.js";
import { useMatchStore } from "../match/store.js";
import {
  creatureFor,
  failureText,
  foldMoves,
  makeCode,
  opponentOf,
  seatOf,
  wireAction,
  type MatchRow,
} from "./session.js";
import { useOnlineStore } from "./store.js";
import { ensureSignedIn, supabase } from "./supabase.js";

let channel: RealtimeChannel | null = null;
/** What the board looked like before you went online, so leaving puts it back. */
let before: { botId: string; humanFirst: boolean } | null = null;
/** The result of this row has been written once. Cleared with the row. */
let reported: string | null = null;

const me = (): string | null => useOnlineStore.getState().me;
const row = (): MatchRow | null => useOnlineStore.getState().row;

/** Anonymous sign-in, on opening the lobby and not before. */
export async function openLobby(): Promise<void> {
  useShellStore.getState().go("online");
  if (me()) return;
  try {
    useOnlineStore.setState({ me: await ensureSignedIn(), error: null });
  } catch (e) {
    useOnlineStore.setState({ error: failureText(e) });
  }
}

export async function hostMatch(): Promise<void> {
  const who = me();
  if (!who) return;
  useOnlineStore.setState({ busy: true, error: null });
  try {
    const variant = useMatchStore.getState().variant;
    const { data, error } = await supabase
      .from("matches")
      .insert({ host: who, variant: variant.id, join_code: makeCode(), host_seat: 1 })
      .select()
      .single();
    if (error) throw error;
    adoptRow(data as MatchRow);
  } catch (e) {
    useOnlineStore.setState({ error: failureText(e) });
  } finally {
    useOnlineStore.setState({ busy: false });
  }
}

export async function joinMatch(code: string): Promise<void> {
  const who = me();
  if (!who || !code.trim()) return;
  useOnlineStore.setState({ busy: true, error: null });
  try {
    const { data, error } = await supabase.rpc("join_match", { p_code: code.trim().toUpperCase() });
    if (error) throw error;
    adoptRow(data as MatchRow);
  } catch (e) {
    useOnlineStore.setState({ error: failureText(e) });
  } finally {
    useOnlineStore.setState({ busy: false });
  }
}

/** Put the lobby, the board and the shell back the way they were. */
export function leaveOnline(): void {
  const r = row();
  // A game nobody joined yet is withdrawn rather than abandoned quietly: the
  // code stops working, so the person you sent it to gets "no game is waiting
  // on that code" instead of a lobby that never starts.
  if (r && r.status === "waiting" && r.host === me()) {
    void supabase
      .from("matches")
      .update({ status: "abandoned", join_code: null, updated_at: new Date().toISOString() })
      .eq("id", r.id);
  }
  closeChannel();
  reported = null;
  useOnlineStore.setState({ row: null, opponentName: null, error: null, busy: false });
  const s = useMatchStore.getState();
  s.newGame({ mode: "bot", live: false, ...(before ?? {}) });
  useMatchStore.setState({ sendMove: null });
  before = null;
}

// -- the row --------------------------------------------------------------

function adoptRow(next: MatchRow): void {
  const previous = row();
  useOnlineStore.setState({ row: next, opponentName: null });
  if (previous?.id !== next.id) {
    reported = null;
    openChannel(next.id);
    void fetchOpponentName();
  }
  // Waiting is still the lobby: there is nobody to play and the board behind
  // the window is scenery. The game starts on the update that fills the guest
  // in, which is either the row we just joined or a realtime event on the row
  // we're hosting.
  if (next.status === "active") startGame(next);
}

/**
 * Deal the board for a row that has two players in it.
 *
 * The seat is the whole of the translation: seat 1 is red and red moves first,
 * so `humanFirst` — which the rest of the app already understands — says
 * everything online needed to say. Your opponent's creature is a hash of their
 * user id, so they arrive with a void variation and a signature clip instead of
 * being a colour on the far side of the board.
 */
function startGame(r: MatchRow): void {
  const who = me();
  if (!who) return;
  const s = useMatchStore.getState();
  if (s.mode === "online" && s.live) return; // already dealt

  const seat = seatOf(r, who) ?? 1;
  before ??= { botId: s.botId, humanFirst: s.humanFirst };
  useMatchStore.setState({ sendMove });
  s.newGame({
    mode: "online",
    variant: variantById(r.variant),
    humanFirst: seat === 1,
    botId: creatureFor(opponentOf(r, who)),
    live: true,
  });
  useShellStore.getState().go("match");
  // A rejoin — a reload mid-game, or the host's second tab — starts from an
  // empty board and the database's move list, not from nothing.
  void refetchMoves(r.id);
}

async function fetchOpponentName(): Promise<void> {
  const r = row();
  const who = me();
  const them = r && who ? opponentOf(r, who) : null;
  if (!them) return;
  const { data } = await supabase
    .schema("app")
    .from("profiles")
    .select("display_name,handle")
    .eq("id", them)
    .maybeSingle();
  const name = (data?.display_name as string) || (data?.handle as string) || null;
  if (name && row()?.id === r?.id) useOnlineStore.setState({ opponentName: name });
}

// -- the channel ----------------------------------------------------------

function openChannel(matchId: string): void {
  closeChannel();
  channel = supabase
    .channel(`fourscore:match:${matchId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "fourscore", table: "moves", filter: `match_id=eq.${matchId}` },
      (payload) => {
        const { ply, col } = payload.new as { ply: number; col: number };
        const action = wireAction(useMatchStore.getState().moves.length, ply);
        if (action === "append") receiveMove(col);
        else if (action === "refetch") void refetchMoves(matchId);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "fourscore", table: "matches", filter: `id=eq.${matchId}` },
      (payload) => adoptRow(payload.new as MatchRow),
    )
    .subscribe();
}

function closeChannel(): void {
  if (channel) void supabase.removeChannel(channel);
  channel = null;
}

/**
 * A move from the other machine.
 *
 * This is the one place a desync can surface. The move is checked against our
 * position before it is committed, because a move that can't be played would
 * otherwise be dropped silently by `commitMove` and the two boards would go on
 * disagreeing for the rest of the game.
 */
function receiveMove(col: number): void {
  const s = useMatchStore.getState();
  if (s.match.status !== "playing" || !s.match.canPlay(col)) return desync();
  s.commitMove(col);
}

function desync(): void {
  // Stop taking input first: the board is no longer a board either of you can
  // trust, and a click that lands on it would make it worse.
  useMatchStore.getState().setLive(false);
  shellError(COPY.desync);
}

async function refetchMoves(matchId: string): Promise<void> {
  const { data } = await supabase.from("moves").select("ply,col").eq("match_id", matchId).order("ply");
  if (!data || row()?.id !== matchId) return;
  const s = useMatchStore.getState();
  const fold = foldMoves(s.moves, data.map((m) => m.col as number));
  if (fold.kind === "same") return;
  // Extending drops the new discs one at a time, same as a move off the wire.
  // Replacing snaps, because a board that re-animates itself from empty to
  // repair a lost packet looks like a bug pretending to be theater — and so
  // does picking a game back up mid-way and watching twenty discs fall.
  const snap = fold.kind === "replace" || s.moves.length === 0;
  s.adoptMoves(fold.moves, snap ? fold.moves.length : s.landed);
}

// -- sending --------------------------------------------------------------

/** Registered on the match store while a wire match is up; see its `sendMove`. */
function sendMove(col: number): void {
  const r = row();
  const who = me();
  if (!r || !who) return;
  const s = useMatchStore.getState();
  const ply = s.moves.length;
  s.commitMove(col);
  void supabase
    .from("moves")
    .insert({ match_id: r.id, ply, col, player: who })
    .then(({ error }) => {
      if (error) void refetchMoves(r.id);
    });
}

/**
 * Whoever notices the game is over writes the result.
 *
 * Both players may race here; the update is the same either way and a lost race
 * costs nothing. The row is bookkeeping — the finished board is what either
 * client actually renders — so nothing waits on it.
 */
function reportResult(): void {
  const s = useMatchStore.getState();
  const r = row();
  const who = me();
  if (s.mode !== "online" || !r || !who) return;
  if (r.status !== "active" || s.match.status === "playing") return;
  const stamp = `${r.id}:${s.moves.length}`;
  if (reported === stamp) return;
  reported = stamp;

  const mine = s.humanFirst ? "red" : "yellow";
  const winner =
    s.match.winner === null ? null : s.match.winner === mine ? who : opponentOf(r, who);
  void supabase
    .from("matches")
    .update({ status: "finished", winner, updated_at: new Date().toISOString() })
    .eq("id", r.id)
    .then(({ error }) => {
      // Nothing on screen depends on this, so it must not raise a dialog — but
      // a result that silently fails to be written is exactly the kind of thing
      // that goes unnoticed for a month.
      if (error) console.error("could not close out the match row:", error.message);
    });
}

/** Call once from the app entry. The preview harness never calls it. */
export function startOnline(): void {
  useMatchStore.subscribe(reportResult);
}
