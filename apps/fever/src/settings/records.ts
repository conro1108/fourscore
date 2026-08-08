/**
 * Your record against each opponent, on each board.
 *
 * Keyed `bot@variant` because beating Vane at Connect 4 and beating Vane at
 * Connect 5 are different achievements — merging them would quietly inflate
 * every existing record the moment someone played the other board. (Same key
 * and same shape as the old client's, so a player who had one keeps it.)
 *
 * A game is recorded once, by its move list: the roster screen reads this, the
 * match screen writes it, and neither knows the other exists.
 */

import { create } from "zustand";

export interface Record_ {
  wins: number;
  losses: number;
  draws: number;
}

const KEY = "fourscore.record.v2";

export const recordKey = (botId: string, variantId: string): string => `${botId}@${variantId}`;

const EMPTY: Record_ = { wins: 0, losses: 0, draws: 0 };

function load(): Record<string, Record_> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record_>) : {};
  } catch {
    // Private browsing, storage switched off, a corrupt value: none of these
    // are worth failing to start the game over.
    return {};
  }
}

interface RecordStore {
  records: Record<string, Record_>;
  /** `result` is from the player's point of view. Idempotent per `stamp`. */
  record(key: string, result: "win" | "loss" | "draw", stamp: string): void;
}

/**
 * Games already counted, by an id that includes the move list. The match screen
 * re-renders constantly and every one of those renders sees the same finished
 * game; without this the record would climb while you sat looking at it.
 */
const counted = new Set<string>();

export const useRecordStore = create<RecordStore>((set, get) => ({
  records: load(),

  record: (key, result, stamp) => {
    if (counted.has(stamp)) return;
    counted.add(stamp);
    const cur = get().records[key] ?? EMPTY;
    const records = {
      ...get().records,
      [key]: {
        wins: cur.wins + (result === "win" ? 1 : 0),
        losses: cur.losses + (result === "loss" ? 1 : 0),
        draws: cur.draws + (result === "draw" ? 1 : 0),
      },
    };
    set({ records });
    try {
      localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* see load() — the record just won't persist */
    }
  },
}));

export const recordFor = (records: Record<string, Record_>, key: string): Record_ =>
  records[key] ?? EMPTY;
