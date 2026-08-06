/**
 * The online match runtime.
 *
 * State is the move list and nothing else — the same shape `Match.fromMoves`
 * already takes, so every screen that renders a bot game renders an online game
 * unchanged. The database stores columns, never a packed board; `board.ts` stays
 * the only thing that knows the bitboard layout.
 *
 * Play is optimistic: the disc appears the moment you click and the insert goes
 * out in parallel, because a turn-based game that pauses a round trip on every
 * click feels broken even though it isn't. If the insert is rejected — which
 * essentially only happens if the two clients disagree about whose turn it is —
 * we refetch and let the database's version win.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECT4, Match, variantById, type Player, type Variant } from "@fourscore/engine";
import { ensureSignedIn, supabase } from "./supabase.js";

export type OnlinePhase = "idle" | "waiting" | "playing" | "over" | "error";

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

/** No I/L/O/0/1 — the code gets read aloud across a room. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export interface OnlineMatch {
  me: string | null;
  phase: OnlinePhase;
  row: MatchRow | null;
  moves: number[];
  variant: Variant;
  /** Which colour you are, once the match is running. */
  myPlayer: Player | null;
  opponentId: string | null;
  opponentName: string | null;
  error: string | null;
  busy: boolean;
  host: (variant: Variant) => Promise<void>;
  join: (code: string) => Promise<void>;
  play: (col: number) => void;
  leave: () => void;
}

export function useOnlineMatch(): OnlineMatch {
  const [me, setMe] = useState<string | null>(null);
  const [row, setRow] = useState<MatchRow | null>(null);
  const [moves, setMoves] = useState<number[]>([]);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const movesRef = useRef<number[]>([]);
  movesRef.current = moves;

  useEffect(() => {
    ensureSignedIn().then(setMe, (e) => setError(String(e?.message ?? e)));
  }, []);

  const matchId = row?.id ?? null;

  const refetchMoves = useCallback(async (id: string) => {
    const { data } = await supabase.from("moves").select("ply,col").eq("match_id", id).order("ply");
    if (data) setMoves(data.map((m) => m.col as number));
  }, []);

  // -- realtime -------------------------------------------------------------

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`fourscore:match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "fourscore", table: "moves", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const { ply, col } = payload.new as { ply: number; col: number };
          // Fast path for the next move in sequence; anything else means we've
          // missed one, so repair from the database rather than guess.
          if (ply === movesRef.current.length) setMoves((prev) => [...prev, col]);
          else if (ply > movesRef.current.length) void refetchMoves(matchId);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "fourscore", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => setRow(payload.new as MatchRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, refetchMoves]);

  // -- who am I playing -----------------------------------------------------

  const opponentId = row && me ? (row.host === me ? row.guest : row.host) : null;

  useEffect(() => {
    if (!opponentId) {
      setOpponentName(null);
      return;
    }
    void supabase
      .schema("app")
      .from("profiles")
      .select("display_name,handle")
      .eq("id", opponentId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setOpponentName((data.display_name as string) || (data.handle as string));
      });
  }, [opponentId]);

  // -- actions --------------------------------------------------------------

  const host = useCallback(
    async (variant: Variant) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("matches")
          .insert({ host: me, variant: variant.id, join_code: makeCode(), host_seat: 1 })
          .select()
          .single();
        if (err) throw err;
        setMoves([]);
        setRow(data as MatchRow);
      } catch (e) {
        setError(message(e));
      } finally {
        setBusy(false);
      }
    },
    [me],
  );

  const join = useCallback(
    async (code: string) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.rpc("join_match", { p_code: code.trim() });
        if (err) throw err;
        setMoves([]);
        setRow(data as MatchRow);
      } catch (e) {
        setError(
          message(e).includes("no open match")
            ? "No game is waiting on that code. Ask for a fresh one."
            : message(e),
        );
      } finally {
        setBusy(false);
      }
    },
    [me],
  );

  const play = useCallback(
    (col: number) => {
      if (!row || !me) return;
      const ply = movesRef.current.length;
      setMoves((prev) => [...prev, col]);
      void supabase
        .from("moves")
        .insert({ match_id: row.id, ply, col, player: me })
        .then(({ error: err }) => {
          if (err) void refetchMoves(row.id);
        });
    },
    [row, me, refetchMoves],
  );

  const leave = useCallback(() => {
    setRow(null);
    setMoves([]);
    setError(null);
  }, []);

  // -- seats and outcome ----------------------------------------------------

  const variant = row ? variantById(row.variant) : CONNECT4;
  const mySeat = row && me ? (row.host === me ? row.host_seat : 3 - row.host_seat) : null;
  const myPlayer: Player | null = mySeat == null ? null : mySeat === 1 ? "red" : "yellow";

  const match = Match.fromMoves(moves, variant);
  const finished = match.status !== "playing";

  // Whoever notices first writes the result. Both players may race here; the
  // update is the same either way, and a lost race costs nothing.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!row || !me || row.status !== "active" || !finished) return;
    const stamp = `${row.id}:${moves.length}`;
    if (reported.current === stamp) return;
    reported.current = stamp;

    const winner =
      match.winner === null ? null : match.winner === myPlayer ? me : (opponentId ?? null);
    void supabase
      .from("matches")
      .update({ status: "finished", winner, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }, [row, me, finished, match.winner, myPlayer, opponentId, moves.length]);

  const phase: OnlinePhase = error
    ? "error"
    : !row
      ? "idle"
      : row.status === "waiting"
        ? "waiting"
        : finished || row.status === "finished"
          ? "over"
          : "playing";

  return {
    me,
    phase,
    row,
    moves,
    variant,
    myPlayer,
    opponentId,
    opponentName,
    error,
    busy,
    host,
    join,
    play,
    leave,
  };
}

function message(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return String(e);
}
